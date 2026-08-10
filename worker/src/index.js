/* ==========================================================================
   ARSIP23 — Cloudflare Worker

   Satu worker, beberapa route (SPEC.md §8). Aturan yang berlaku di seluruh
   berkas ini:

     - Endpoint BACA (`/api/browse`) terbuka untuk umum. Arsip ini memang
       sengaja publik untuk dilihat (instruksi.md §2).
     - Endpoint TULIS selalu: verifikasi token → validasi kepemilikan → baru
       menyentuh Drive. Tidak ada jalan pintas, termasuk untuk aksi yang
       "kelihatannya aman".
     - Tidak ada folder ID dari client yang dipercaya sebelum lewat
       `assertOwnedFolder` / `assertOwnedFile`.
   ========================================================================== */

import { json, jsonError, preflight, err } from './http.js';
import { requireUser, optionalUser } from './auth.js';
import { drive, FOLDER_MIME } from './drive.js';
import {
  getWorkspace,
  getUser,
  ensureUser,
  acceptNotice,
  getFolderRecord,
  recordFolder,
  forgetFolder,
  assertOwnedFolder,
  assertOwnedFile,
} from './store.js';

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024; // CP-09

/* Cloudflare tier gratis membatasi 50 subrequest per permintaan. Menghitung isi
   tiap folder butuh satu panggilan Drive masing-masing, jadi jumlahnya dipatok.
   Folder di luar batas ini mengembalikan `itemCount: null`, dan UI menampilkan
   "—" — lebih jujur daripada menampilkan angka 0 yang salah. */
const MAX_COUNT_LOOKUPS = 18;

const FOLDER_NAME_MAX = 100;
const ILLEGAL_NAME = /[\\/:*?"<>|]/;

function workspaceOf(request, url) {
  return (
    request.headers.get('X-Workspace') ||
    url.searchParams.get('workspace') ||
    ''
  ).trim().toLowerCase();
}

async function bodyJson(request) {
  try {
    return await request.json();
  } catch {
    throw err.validation('Isi permintaan tidak bisa dibaca.');
  }
}

function cleanFolderName(raw) {
  const name = String(raw ?? '').trim().replace(/\s+/g, ' ');
  if (!name) throw err.validation('Nama folder tidak boleh kosong.', { name: 'Wajib diisi.' });
  if (name.length > FOLDER_NAME_MAX) {
    throw err.validation(`Nama folder maksimal ${FOLDER_NAME_MAX} karakter.`, {
      name: 'Terlalu panjang.',
    });
  }
  if (ILLEGAL_NAME.test(name)) {
    throw err.validation('Nama folder tidak boleh memuat karakter \\ / : * ? " < > |', {
      name: 'Ada karakter yang tidak diizinkan.',
    });
  }
  if (name === '.' || name === '..') {
    throw err.validation('Nama folder tidak valid.', { name: 'Tidak valid.' });
  }
  return name;
}

/* --------------------------------------------------------------------------
   Pemetaan objek Drive → bentuk yang dijanjikan SPEC.md §8
   -------------------------------------------------------------------------- */

function isImage(item) {
  return typeof item.mimeType === 'string' && item.mimeType.startsWith('image/');
}

function mapFile(item, { isMine }) {
  return {
    id: item.id,
    name: item.name,
    mimeType: item.mimeType,
    size: item.size ? Number(item.size) : null,
    thumbnailUrl: item.thumbnailLink || null, // CP-10: URL Drive langsung
    webViewUrl: item.webViewLink || null,
    isImage: isImage(item),
    isMine,
    createdAt: item.createdTime || null,
  };
}

/**
 * Nama folder root user (`u_<sub>`) diganti nama tampilan aslinya. Tanpa ini,
 * halaman depan arsip cuma menampilkan deretan angka panjang yang tidak berarti
 * apa-apa bagi warga.
 */
async function displayNameForFolder(env, ws, item, rec) {
  if (!rec?.ownerSub || !/^u_/.test(item.name)) return item.name;
  const owner = await getUser(env, ws, rec.ownerSub);
  return owner?.displayName || 'Warga';
}

/* --------------------------------------------------------------------------
   GET /api/browse — publik
   -------------------------------------------------------------------------- */

async function handleBrowse(request, env, url) {
  const ws = workspaceOf(request, url);
  const workspace = await getWorkspace(env, ws);
  const identity = await optionalUser(request, env);

  const folderId = url.searchParams.get('folderId') || workspace.driveFolderId;
  const pageToken = url.searchParams.get('pageToken') || undefined;

  /* Folder yang boleh ditelusuri harus berada di dalam workspace ini. Root
     workspace selalu boleh; selain itu wajib punya catatan KV dengan workspace
     yang cocok. Tanpa pemeriksaan ini, `folderId` sembarang akan membuat Worker
     dengan senang hati membacakan isi Drive Bersama mana pun yang bisa diakses
     service account — termasuk workspace pelanggan lain. */
  let record = null;
  if (folderId !== workspace.driveFolderId) {
    record = await getFolderRecord(env, folderId);
    if (!record || record.workspace !== ws) {
      throw err.notFound('Folder ini tidak ada di arsip.');
    }
  }

  const myRootId = identity ? (await getUser(env, ws, identity.sub))?.driveFolderId : null;

  const listed = await drive.list(env, folderId, pageToken);
  const items = listed?.files || [];

  const rawFolders = items.filter((i) => i.mimeType === FOLDER_MIME);
  const rawFiles = items.filter((i) => i.mimeType !== FOLDER_MIME);

  /* Apakah isi folder ini milik user yang sedang masuk? Untuk isi folder root
     workspace, tiap folder dinilai sendiri-sendiri (folder root milik orang).
     Untuk folder lebih dalam, seluruh isinya mewarisi kepemilikan induknya. */
  const parentIsMine = Boolean(
    myRootId && (folderId === myRootId || record?.ownerSub === identity?.sub)
  );

  const folderRecords = await Promise.all(
    rawFolders.map((f) => getFolderRecord(env, f.id))
  );

  const folders = [];
  let counted = 0;
  for (let i = 0; i < rawFolders.length; i++) {
    const item = rawFolders[i];
    const rec = folderRecords[i];
    const mine = parentIsMine || (identity && rec?.ownerSub === identity.sub) || false;

    let itemCount = null;
    if (counted < MAX_COUNT_LOOKUPS) {
      itemCount = await drive.countChildren(env, item.id);
      counted++;
    }

    folders.push({
      id: item.id,
      name: await displayNameForFolder(env, ws, item, rec),
      itemCount,
      ownerSub: rec?.ownerSub || null,
      isMine: mine,
      createdAt: item.createdTime || null,
    });
  }

  const files = rawFiles.map((f) => mapFile(f, { isMine: parentIsMine }));

  /* Breadcrumb dibangun dari index KV, bukan dari Drive: memanjat lewat Drive
     berarti satu subrequest per tingkat, dan jatah subrequest lebih baik
     dipakai untuk menghitung isi folder yang benar-benar terlihat user. */
  const breadcrumb = [{ id: workspace.driveFolderId, name: 'Arsip' }];
  if (record) {
    const chain = [];
    let cur = record;
    let curId = folderId;
    for (let hop = 0; hop < 12 && cur && curId !== workspace.driveFolderId; hop++) {
      chain.unshift({
        id: curId,
        name: /^u_/.test(cur.name)
          ? (await getUser(env, ws, cur.ownerSub))?.displayName || 'Warga'
          : cur.name,
      });
      if (!cur.parentFolderId || cur.parentFolderId === workspace.driveFolderId) break;
      curId = cur.parentFolderId;
      cur = await getFolderRecord(env, curId);
    }
    breadcrumb.push(...chain);
  }

  return json(
    {
      workspace: { id: ws, title: workspace.title, visibility: workspace.visibility },
      folder: {
        id: folderId,
        isRoot: folderId === workspace.driveFolderId,
        isMine: parentIsMine,
      },
      breadcrumb,
      folders,
      files,
      nextPageToken: listed?.nextPageToken || null,
    },
    { request, env }
  );
}

/* --------------------------------------------------------------------------
   POST /api/login
   -------------------------------------------------------------------------- */

async function handleLogin(request, env, url) {
  const identity = await requireUser(request, env);
  const body = await bodyJson(request);
  const ws = (body.workspace || workspaceOf(request, url) || '').trim().toLowerCase();

  const user = await ensureUser(env, ws, identity);

  return json(
    {
      user: {
        sub: identity.sub,
        displayName: user.displayName,
        email: user.email,
        picture: identity.picture,
        rootFolderId: user.driveFolderId,
        acceptedNoticeAt: user.acceptedNoticeAt,
      },
    },
    { request, env }
  );
}

/* --------------------------------------------------------------------------
   POST /api/accept-notice
   -------------------------------------------------------------------------- */

async function handleAcceptNotice(request, env, url) {
  const identity = await requireUser(request, env);
  const body = await bodyJson(request);
  const ws = (body.workspace || workspaceOf(request, url) || '').trim().toLowerCase();
  await getWorkspace(env, ws);

  const at = await acceptNotice(env, ws, identity.sub);
  return json({ acceptedNoticeAt: at }, { request, env });
}

/* --------------------------------------------------------------------------
   POST /api/folder
   -------------------------------------------------------------------------- */

async function handleCreateFolder(request, env, url) {
  const identity = await requireUser(request, env);
  const body = await bodyJson(request);
  const ws = (body.workspace || workspaceOf(request, url) || '').trim().toLowerCase();
  await getWorkspace(env, ws);

  const name = cleanFolderName(body.name);
  const parentId = body.parentFolderId;

  const parentRec = await assertOwnedFolder(env, ws, identity.sub, parentId);

  const existing = await drive.findFolderByName(env, parentId, name);
  if (existing) {
    throw err.conflict('Sudah ada folder dengan nama itu di sini.');
  }

  const created = await drive.createFolder(env, parentId, name);
  await recordFolder(env, {
    folderId: created.id,
    workspace: ws,
    ownerSub: identity.sub,
    parentFolderId: parentId,
    name,
    depth: (parentRec.depth ?? 1) + 1,
  });

  return json(
    {
      folder: {
        id: created.id,
        name,
        itemCount: 0,
        ownerSub: identity.sub,
        isMine: true,
        createdAt: created.createdTime || new Date().toISOString(),
      },
    },
    { status: 201, request, env }
  );
}

/* --------------------------------------------------------------------------
   POST /api/upload
   -------------------------------------------------------------------------- */

async function handleUpload(request, env, url) {
  const identity = await requireUser(request, env);

  let form;
  try {
    form = await request.formData();
  } catch {
    throw err.validation('Berkas tidak terkirim dengan benar.');
  }

  const ws = (form.get('workspace') || workspaceOf(request, url) || '')
    .toString()
    .trim()
    .toLowerCase();
  await getWorkspace(env, ws);

  const parentId = form.get('parentFolderId');
  const file = form.get('file');

  if (!file || typeof file === 'string') {
    throw err.validation('Tidak ada berkas yang dipilih.');
  }
  if (file.size === 0) {
    throw err.validation('Berkas kosong, tidak bisa diunggah.');
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw err.tooLarge(
      `Berkas terlalu besar (maks ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB per berkas).`
    );
  }

  const user = await getUser(env, ws, identity.sub);
  if (!user?.acceptedNoticeAt) {
    // Persetujuan aturan unggah dijaga di server, bukan cuma di modal frontend.
    // Modal yang bisa dilewati dengan devtools bukan persetujuan.
    throw err.forbidden('Anda perlu menyetujui aturan unggah terlebih dahulu.');
  }

  await assertOwnedFolder(env, ws, identity.sub, parentId.toString());

  const uploaded = await drive.uploadFile(env, parentId.toString(), file);

  return json({ file: mapFile(uploaded, { isMine: true }) }, { status: 201, request, env });
}

/* --------------------------------------------------------------------------
   DELETE /api/folder/:id · DELETE /api/file/:id
   -------------------------------------------------------------------------- */

async function handleDeleteFolder(request, env, url, folderId) {
  const identity = await requireUser(request, env);
  const ws = workspaceOf(request, url);
  await getWorkspace(env, ws);

  const rec = await assertOwnedFolder(env, ws, identity.sub, folderId);
  if (rec.isRoot) {
    throw err.forbidden('Folder utama Anda tidak bisa dihapus.');
  }

  await drive.remove(env, folderId);
  await forgetFolder(env, folderId);

  /* Catatan KV untuk sub-folder di dalamnya sengaja dibiarkan menggantung.
     Menyapunya berarti menelusuri seluruh isi folder lewat Drive — mahal, dan
     jatah subrequest terbatas. Entri yatim itu tidak berbahaya: folder Drive-nya
     sudah tidak ada, jadi setiap aksi yang menyebutnya akan gagal di Drive
     dengan 404, dan validasi kepemilikan tetap menolak lebih dulu. Dicatat
     sebagai debt di DECISIONS.md CP-14. */

  return json({ deleted: true }, { request, env });
}

async function handleDeleteFile(request, env, url, fileId) {
  const identity = await requireUser(request, env);
  const ws = workspaceOf(request, url);
  await getWorkspace(env, ws);

  await assertOwnedFile(env, ws, identity.sub, fileId);
  await drive.remove(env, fileId);

  return json({ deleted: true }, { request, env });
}

/* --------------------------------------------------------------------------
   Router
   -------------------------------------------------------------------------- */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    if (request.method === 'OPTIONS') return preflight(request, env);

    try {
      if (path === '/' || path === '/api') {
        return json({ name: 'arsip23-api', ok: true }, { request, env });
      }

      if (path === '/api/browse' && request.method === 'GET') {
        return await handleBrowse(request, env, url);
      }
      if (path === '/api/login' && request.method === 'POST') {
        return await handleLogin(request, env, url);
      }
      if (path === '/api/accept-notice' && request.method === 'POST') {
        return await handleAcceptNotice(request, env, url);
      }
      if (path === '/api/folder' && request.method === 'POST') {
        return await handleCreateFolder(request, env, url);
      }
      if (path === '/api/upload' && request.method === 'POST') {
        return await handleUpload(request, env, url);
      }

      const delFolder = path.match(/^\/api\/folder\/([^/]+)$/);
      if (delFolder && request.method === 'DELETE') {
        return await handleDeleteFolder(request, env, url, decodeURIComponent(delFolder[1]));
      }

      const delFile = path.match(/^\/api\/file\/([^/]+)$/);
      if (delFile && request.method === 'DELETE') {
        return await handleDeleteFile(request, env, url, decodeURIComponent(delFile[1]));
      }

      throw err.notFound('Endpoint tidak dikenal.');
    } catch (error) {
      return jsonError(error, { request, env });
    }
  },
};
