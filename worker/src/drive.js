/* ==========================================================================
   DRIVE — klien Google Drive API v3 untuk service account

   Dua hal yang perlu diketahui sebelum membaca berkas ini:

   1) Service account tidak punya sesi. Ia menandatangani sebuah JWT dengan
      private key-nya, menukarnya ke Google dengan access token berumur 1 jam,
      lalu memakai token itu. Semua itu ada di `getAccessToken()`.

   2) SELURUH pemanggilan di sini membawa `supportsAllDrives=true` (dan
      `includeItemsFromAllDrives=true` untuk `files.list`). Ini bukan hiasan.
      Arsip23 menyimpan berkas di Drive Bersama (DECISIONS.md CP-08), dan tanpa
      parameter itu Drive API berpura-pura Drive Bersama tidak ada: `files.list`
      mengembalikan nol hasil dan `files.create` menolak parent-nya — keduanya
      tanpa pesan galat yang menyinggung soal Drive Bersama sama sekali. Gejala
      yang muncul adalah "foldernya kosong padahal jelas ada isinya", dan itu
      bisa menghabiskan sore untuk dilacak. Karena itu setiap fungsi di berkas
      ini melewati satu pintu yang sama, `driveFetch()`, yang menambahkannya.
   ========================================================================== */

import { err } from './http.js';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
const SCOPE = 'https://www.googleapis.com/auth/drive';

const FOLDER_MIME = 'application/vnd.google-apps.folder';

/* Access token di-cache di memori isolate. Isolate Cloudflare hidup beberapa
   menit sampai beberapa jam, jadi ini menghapus sebagian besar penukaran token
   tanpa perlu menyimpan apa pun ke KV — dan token yang tidak pernah disimpan
   adalah token yang tidak bisa bocor dari penyimpanan. */
let tokenCache = { token: null, expiresAt: 0 };

function pemToPkcs8Bytes(pem) {
  const body = pem
    .replace(/\\n/g, '\n')                  // wrangler secret sering menyimpan \n harfiah
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '');
  const bin = atob(body);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function b64url(bytes) {
  let bin = '';
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlText(text) {
  return b64url(new TextEncoder().encode(text));
}

async function getAccessToken(env) {
  // 60 detik bantalan: token yang "masih 3 detik lagi" akan kedaluwarsa di
  // tengah panggilan Drive, dan galatnya muncul di tempat yang membingungkan.
  if (tokenCache.token && Date.now() < tokenCache.expiresAt - 60_000) {
    return tokenCache.token;
  }

  if (!env.GOOGLE_SA_EMAIL || !env.GOOGLE_SA_PRIVATE_KEY) {
    throw err.internal('Kredensial Google Drive belum dipasang di Worker.');
  }

  const now = Math.floor(Date.now() / 1000);
  const header = b64urlText(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64urlText(
    JSON.stringify({
      iss: env.GOOGLE_SA_EMAIL,
      scope: SCOPE,
      aud: TOKEN_URL,
      iat: now,
      exp: now + 3600,
    })
  );

  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToPkcs8Bytes(env.GOOGLE_SA_PRIVATE_KEY),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(`${header}.${claims}`)
  );

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${header}.${claims}.${b64url(sig)}`,
    }),
  });

  if (!res.ok) {
    console.error('[arsip23] penukaran token service account gagal:', await res.text());
    throw err.upstream('Tidak bisa terhubung ke Google Drive.');
  }

  const body = await res.json();
  tokenCache = {
    token: body.access_token,
    expiresAt: Date.now() + (body.expires_in || 3600) * 1000,
  };
  return tokenCache.token;
}

/**
 * Satu-satunya pintu ke Drive API. Menambahkan token, `supportsAllDrives`, dan
 * menerjemahkan galat Drive jadi ApiError yang layak ditampilkan.
 */
async function driveFetch(env, path, { method = 'GET', query = {}, body, headers = {}, base = API } = {}) {
  const token = await getAccessToken(env);

  const url = new URL(base + path);
  url.searchParams.set('supportsAllDrives', 'true');
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  }

  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...headers },
    body,
  });

  if (res.status === 204) return null;

  const text = await res.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    /* Drive sesekali mengembalikan HTML saat sedang bermasalah. */
  }

  if (!res.ok) {
    const reason = parsed?.error?.message || text || res.statusText;
    console.error(`[arsip23] Drive ${method} ${path} → ${res.status}: ${reason}`);

    if (res.status === 404) throw err.notFound('Folder atau berkas tidak ada di Drive.');
    if (res.status === 403 && /quota/i.test(reason)) {
      // Justru galat yang dicegah oleh CP-08. Kalau ini muncul, penyebab paling
      // mungkin adalah DRIVE_ROOT_FOLDER_ID menunjuk ke My Drive, bukan ke
      // Drive Bersama — jadi pesannya menyebut itu langsung.
      throw err.upstream(
        'Google Drive menolak karena kuota penyimpanan. Pastikan folder root Arsip23 ' +
          'berada di Drive Bersama, bukan My Drive.'
      );
    }
    throw err.upstream();
  }

  return parsed;
}

const FILE_FIELDS =
  'id,name,mimeType,size,thumbnailLink,webViewLink,createdTime,parents,driveId';

export const drive = {
  FOLDER_MIME,

  /** Cari satu folder dengan nama persis di dalam satu induk. */
  async findFolderByName(env, parentId, name) {
    const escaped = name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const res = await driveFetch(env, '/files', {
      query: {
        q: `name = '${escaped}' and '${parentId}' in parents and mimeType = '${FOLDER_MIME}' and trashed = false`,
        fields: `files(${FILE_FIELDS})`,
        pageSize: 1,
        includeItemsFromAllDrives: 'true',
        corpora: 'allDrives',
      },
    });
    return res?.files?.[0] || null;
  },

  async createFolder(env, parentId, name) {
    return driveFetch(env, '/files', {
      method: 'POST',
      query: { fields: FILE_FIELDS },
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parentId] }),
    });
  },

  async get(env, fileId) {
    return driveFetch(env, `/files/${encodeURIComponent(fileId)}`, {
      query: { fields: FILE_FIELDS },
    });
  },

  /** Daftar isi satu folder, folder dulu baru berkas, keduanya menurut nama. */
  async list(env, folderId, pageToken) {
    return driveFetch(env, '/files', {
      query: {
        q: `'${folderId}' in parents and trashed = false`,
        fields: `nextPageToken, files(${FILE_FIELDS})`,
        orderBy: 'folder,name_natural',
        pageSize: 200,
        pageToken,
        includeItemsFromAllDrives: 'true',
        corpora: 'allDrives',
      },
    });
  },

  /** Jumlah item langsung di dalam sebuah folder (untuk teks "8 item"). */
  async countChildren(env, folderId) {
    const res = await driveFetch(env, '/files', {
      query: {
        q: `'${folderId}' in parents and trashed = false`,
        fields: 'files(id)',
        pageSize: 100,
        includeItemsFromAllDrives: 'true',
        corpora: 'allDrives',
      },
    });
    return res?.files?.length || 0;
  },

  /**
   * Unggah berkas lewat multipart. Berkas dibatasi 20MB (CP-09), jadi memuat
   * seluruhnya di memori Worker masih aman — batas memorinya 128MB.
   */
  async uploadFile(env, parentId, file) {
    const boundary = `arsip23-${crypto.randomUUID()}`;
    const meta = JSON.stringify({ name: file.name, parents: [parentId] });
    const bytes = new Uint8Array(await file.arrayBuffer());
    const enc = new TextEncoder();

    const head = enc.encode(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n` +
        `--${boundary}\r\nContent-Type: ${file.type || 'application/octet-stream'}\r\n\r\n`
    );
    const tail = enc.encode(`\r\n--${boundary}--\r\n`);

    const body = new Uint8Array(head.length + bytes.length + tail.length);
    body.set(head, 0);
    body.set(bytes, head.length);
    body.set(tail, head.length + bytes.length);

    return driveFetch(env, '/files', {
      base: UPLOAD_API,
      method: 'POST',
      query: { uploadType: 'multipart', fields: FILE_FIELDS },
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    });
  },

  /**
   * Hapus permanen. Sengaja BUKAN "buang ke sampah": di Drive Bersama, sampah
   * dikelola per-Drive dan bendahara belum tentu punya akses membersihkannya,
   * sehingga "hapus" versi user akan terasa tidak benar-benar menghapus.
   */
  async remove(env, fileId) {
    await driveFetch(env, `/files/${encodeURIComponent(fileId)}`, { method: 'DELETE' });
    return true;
  },
};

export { FOLDER_MIME };
