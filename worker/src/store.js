/* ==========================================================================
   STORE — index KV + validasi kepemilikan

   KV di sini BUKAN sumber kebenaran berkas. Google Drive yang memegang itu.
   KV hanya index supaya pertanyaan "folder ini turunan siapa?" bisa dijawab
   tanpa memanjat pohon lewat Drive API pada setiap aksi tulis.

   Konsekuensinya, dan ini disengaja: kalau entri KV hilang, tidak ada berkas
   yang hilang — yang hilang hanya kemampuan memverifikasi kepemilikan, dan
   sistem menjawabnya dengan MENOLAK (403), bukan mengizinkan. Kegagalan
   diarahkan ke sisi yang aman.
   ========================================================================== */

import { err } from './http.js';
import { drive } from './drive.js';

/* Batas keras penelusuran ke atas. Tanpa ini, satu entri KV yang rusak dan
   menunjuk ke dirinya sendiri akan membuat Worker memanjat selamanya sampai
   dibunuh CPU limit — dan gejalanya di sisi user cuma "kok lama sekali". */
const MAX_DEPTH = 12;

const k = {
  config: (name) => `config:${name}`,
  workspace: (ws) => `workspace:${ws}`,
  user: (ws, sub) => `user:${ws}:${sub}`,
  folder: (id) => `folder:${id}`,
};

async function getJson(env, key) {
  return env.ARSIP_KV.get(key, 'json');
}
async function putJson(env, key, value) {
  await env.ARSIP_KV.put(key, JSON.stringify(value));
  return value;
}

/* --------------------------------------------------------------------------
   Workspace
   -------------------------------------------------------------------------- */

const WS_PATTERN = /^[a-z0-9][a-z0-9-]{1,31}$/;

export async function getWorkspace(env, ws) {
  if (!ws || !WS_PATTERN.test(ws)) {
    throw err.validation('Kode workspace tidak valid.');
  }

  const existing = await getJson(env, k.workspace(ws));
  if (existing) return existing;

  /* Workspace dibuat otomatis saat pertama kali dipakai, dengan folder
     `w_<ws>` di bawah root. Alternatifnya adalah menuntut owner membuat entri
     KV manual sebelum siapa pun bisa memakai kode workspace — pekerjaan yang
     tidak menghasilkan keputusan apa pun, dan gagalnya (halaman kosong tanpa
     penjelasan) jauh dari jelas. Membuat sendiri lebih ramah dan tidak
     berbahaya: nama folder ditentukan server, bukan client. */
  const rootId = await getRootFolderId(env);

  const name = `w_${ws}`;
  const folder =
    (await drive.findFolderByName(env, rootId, name)) ||
    (await drive.createFolder(env, rootId, name));

  const record = {
    driveFolderId: folder.id,
    visibility: 'public',
    title: ws,
    createdAt: new Date().toISOString(),
  };
  await putJson(env, k.workspace(ws), record);
  await putJson(env, k.folder(folder.id), {
    workspace: ws,
    ownerSub: null, // milik workspace, bukan milik user mana pun
    parentFolderId: rootId,
    name,
    depth: 0,
    createdAt: record.createdAt,
  });
  return record;
}

/**
 * ID folder root arsip, dibuat sendiri oleh Worker saat pertama kali diperlukan
 * dan diingat di KV.
 *
 * Dulu ini sebuah secret (`DRIVE_ROOT_FOLDER_ID`) yang harus ditempel manual
 * dari URL Drive. Itu tidak bisa dipakai lagi: dengan scope `drive.file`,
 * folder yang dibuat manusia tidak terlihat oleh aplikasi ini, jadi ID yang
 * ditempel manual akan selalu menghasilkan 404. Sekarang folder itu dibuat
 * aplikasi, dan satu langkah setup yang paling mudah salah ketik pun hilang.
 */
export async function getRootFolderId(env) {
  const cached = await getJson(env, k.config('driveRoot'));
  if (cached?.id) return cached.id;

  const folder = await drive.ensureRoot(env);
  await putJson(env, k.config('driveRoot'), { id: folder.id, name: folder.name });
  return folder.id;
}

/* --------------------------------------------------------------------------
   User
   -------------------------------------------------------------------------- */

export async function getUser(env, ws, sub) {
  return getJson(env, k.user(ws, sub));
}

/**
 * Cari folder root user; buat kalau belum ada.
 *
 * Race condition (SPEC.md §10): KV tidak atomic, jadi dua tab yang login
 * berbarengan bisa sama-sama membaca "belum ada". Yang mencegah folder ganda
 * bukan KV melainkan Drive — `findFolderByName` dijalankan lebih dulu, dan
 * pemenang balapan sepersekian detik sebelumnya akan ditemukan di sana.
 */
export async function ensureUser(env, ws, identity) {
  const workspace = await getWorkspace(env, ws);
  const existing = await getUser(env, ws, identity.sub);

  if (existing?.driveFolderId) {
    // Nama tampilan bisa berubah di sisi Google; ikutkan tanpa ribut.
    if (existing.displayName !== identity.name || existing.email !== identity.email) {
      const updated = { ...existing, displayName: identity.name, email: identity.email };
      await putJson(env, k.user(ws, identity.sub), updated);
      return updated;
    }
    return existing;
  }

  const name = `u_${identity.sub}`;
  const folder =
    (await drive.findFolderByName(env, workspace.driveFolderId, name)) ||
    (await drive.createFolder(env, workspace.driveFolderId, name));

  const now = new Date().toISOString();
  const record = {
    driveFolderId: folder.id,
    displayName: identity.name,
    email: identity.email,
    acceptedNoticeAt: null,
    createdAt: now,
  };

  await putJson(env, k.user(ws, identity.sub), record);
  await putJson(env, k.folder(folder.id), {
    workspace: ws,
    ownerSub: identity.sub,
    parentFolderId: workspace.driveFolderId,
    name,
    depth: 1,
    createdAt: now,
  });

  return record;
}

export async function acceptNotice(env, ws, sub) {
  const user = await getUser(env, ws, sub);
  if (!user) throw err.forbidden('Ruang arsip Anda belum dibuat.');
  const at = new Date().toISOString();
  await putJson(env, k.user(ws, sub), { ...user, acceptedNoticeAt: at });
  return at;
}

/* --------------------------------------------------------------------------
   Folder
   -------------------------------------------------------------------------- */

export async function getFolderRecord(env, folderId) {
  return getJson(env, k.folder(folderId));
}

export async function recordFolder(env, { folderId, workspace, ownerSub, parentFolderId, name, depth }) {
  return putJson(env, k.folder(folderId), {
    workspace,
    ownerSub,
    parentFolderId,
    name,
    depth,
    createdAt: new Date().toISOString(),
  });
}

export async function forgetFolder(env, folderId) {
  await env.ARSIP_KV.delete(k.folder(folderId));
}

/* --------------------------------------------------------------------------
   Validasi kepemilikan — SPEC.md §9

   Ini adalah baris pertahanan utama seluruh produk. Semua endpoint tulis lewat
   sini sebelum menyentuh Drive.
   -------------------------------------------------------------------------- */

/**
 * Pastikan `folderId` berada di dalam ruang milik `sub`, di workspace `ws`.
 * Melempar 403 kalau tidak. Mengembalikan catatan folder-nya kalau iya.
 */
export async function assertOwnedFolder(env, ws, sub, folderId) {
  if (!folderId || typeof folderId !== 'string') {
    throw err.validation('Folder tujuan tidak disebutkan.');
  }

  const user = await getUser(env, ws, sub);
  if (!user?.driveFolderId) {
    throw err.forbidden('Ruang arsip Anda belum dibuat. Coba masuk ulang.');
  }

  // Jalur tercepat sekaligus paling sering: user beraksi di root-nya sendiri.
  if (folderId === user.driveFolderId) {
    return { workspace: ws, ownerSub: sub, depth: 1, isRoot: true, id: folderId };
  }

  /* Panjat ke atas sampai bertemu folder root user. Yang membuktikan
     kepemilikan adalah SAMPAINYA di root itu — bukan nilai `ownerSub` di
     entri mana pun di tengah jalan. Kalau `ownerSub` yang dipercaya, satu
     entri KV yang salah tulis sudah cukup untuk membuka folder orang lain;
     kalau rantai parent yang dipercaya, entri salah paling banter menolak
     pemiliknya sendiri — gagal ke arah yang aman. */
  const target = await getFolderRecord(env, folderId);

  // Folder yang tidak ada di index diperlakukan sebagai BUKAN milik siapa pun.
  // Inilah yang membuat menebak folder ID orang lain tidak ada gunanya: yang
  // tidak bisa dibuktikan milik Anda, ditolak.
  if (!target) throw err.forbidden('Folder ini bukan milik Anda.');

  let current = target;
  for (let hop = 0; hop < MAX_DEPTH; hop++) {
    if (current.workspace !== ws) throw err.forbidden('Folder ini ada di workspace lain.');
    if (!current.parentFolderId) break;

    if (current.parentFolderId === user.driveFolderId) {
      return { ...target, id: folderId, isRoot: false };
    }

    const parent = await getFolderRecord(env, current.parentFolderId);
    if (!parent) break;
    current = parent;
  }

  throw err.forbidden('Folder ini bukan milik Anda.');
}

/**
 * Sama, tapi untuk sebuah BERKAS. Induk berkas diambil dari Drive, bukan dari
 * klaim client — kalau client boleh menyebut sendiri induknya, ia tinggal
 * menyebut folder miliknya sambil menghapus berkas orang lain.
 */
export async function assertOwnedFile(env, ws, sub, fileId) {
  if (!fileId || typeof fileId !== 'string') {
    throw err.validation('Berkas tidak disebutkan.');
  }
  const file = await drive.get(env, fileId);
  const parent = file?.parents?.[0];
  if (!parent) throw err.notFound('Berkas tidak ditemukan.');
  await assertOwnedFolder(env, ws, sub, parent);
  return file;
}
