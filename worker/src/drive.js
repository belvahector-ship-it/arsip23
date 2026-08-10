/* ==========================================================================
   DRIVE — klien Google Drive API v3

   Worker bertindak ATAS NAMA akun pemilik arsip, memakai refresh token OAuth
   miliknya — bukan sebagai service account. Ini pembalikan dari rancangan awal
   (DECISIONS.md CP-08 → CP-17), dan alasannya sederhana: service account tidak
   punya kuota penyimpanan sendiri. Berkas yang ia buat tetap dimilikinya, dan
   Google menolak unggahannya dengan galat kuota — kecuali berkasnya mendarat di
   Drive Bersama, fitur yang tidak ada di akun Google pribadi. Dengan refresh
   token, berkas dimiliki manusia yang punya kuota 5 TB, dan seluruh persoalan
   itu hilang.

   Scope yang diminta sengaja `drive.file`, bukan `drive`:

     - `drive` adalah scope RESTRICTED. Memakainya berarti aplikasi ini harus
       lolos penilaian keamanan Google sebelum boleh dipakai publik — proses
       berbulan-bulan yang jelas tidak sepadan untuk arsip RT.
     - `drive.file` hanya memberi akses ke berkas yang DIBUAT aplikasi ini
       sendiri. Bukan scope sensitif, jadi tanpa verifikasi sama sekali.

   Efek sampingnya justru jadi jaminan keamanan yang nyata: seandainya refresh
   token ini bocor, yang bisa disentuh hanyalah isi arsip — bukan seluruh Drive
   pribadi pemiliknya. Konsekuensinya, folder root arsip WAJIB dibuat oleh
   Worker sendiri (lihat `ensureRootFolder`); folder yang dibuat manual lewat
   drive.google.com tidak akan terlihat oleh scope ini.
   ========================================================================== */

import { err } from './http.js';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';

const FOLDER_MIME = 'application/vnd.google-apps.folder';

/** Nama folder root di My Drive pemilik. */
export const ROOT_FOLDER_NAME = 'Arsip23';

/* Access token di-cache di memori isolate. Isolate Cloudflare hidup beberapa
   menit sampai beberapa jam, jadi ini menghapus sebagian besar penukaran token
   tanpa menyimpan apa pun ke KV — dan token yang tidak pernah disimpan adalah
   token yang tidak bisa bocor dari penyimpanan. */
let tokenCache = { token: null, expiresAt: 0 };

async function getAccessToken(env) {
  // 60 detik bantalan: token yang "masih 3 detik lagi" akan kedaluwarsa di
  // tengah panggilan Drive, dan galatnya muncul di tempat yang membingungkan.
  if (tokenCache.token && Date.now() < tokenCache.expiresAt - 60_000) {
    return tokenCache.token;
  }

  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_REFRESH_TOKEN) {
    throw err.internal('Kredensial Google Drive belum dipasang di Worker.');
  }

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: env.GOOGLE_REFRESH_TOKEN,
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    console.error('[arsip23] penyegaran token OAuth gagal:', detail);

    /* `invalid_grant` berarti refresh token-nya sudah mati — pemilik mencabut
       akses, mengganti sandi, atau consent screen masih berstatus "Testing"
       (yang membuat refresh token kedaluwarsa dalam 7 hari). Ketiganya butuh
       tindakan manusia, jadi pesannya menyebut itu daripada menyuruh user
       "coba lagi" untuk sesuatu yang tidak akan pernah pulih sendiri. */
    if (/invalid_grant/.test(detail)) {
      throw err.upstream(
        'Izin Google Drive untuk arsip ini sudah tidak berlaku. Pengelola perlu ' +
          'menyambungkan ulang akunnya.'
      );
    }
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
 * Satu-satunya pintu ke Drive API. Menambahkan token dan menerjemahkan galat
 * Drive jadi ApiError yang layak ditampilkan ke warga.
 */
async function driveFetch(env, path, { method = 'GET', query = {}, body, headers = {}, base = API } = {}) {
  const token = await getAccessToken(env);

  const url = new URL(base + path);
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
    if (/storageQuotaExceeded|quota/i.test(reason)) {
      // Sekarang ini benar-benar berarti Drive pemiliknya penuh — bukan lagi
      // jebakan service-account-tanpa-kuota seperti pada rancangan lama.
      throw err.upstream(
        'Penyimpanan Google Drive pengelola sudah penuh. Hubungi pengelola arsip.'
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
      },
    });
    return res?.files?.[0] || null;
  },

  /**
   * Cari-atau-buat folder root arsip di My Drive pemilik.
   *
   * Folder ini WAJIB dibuat oleh Worker, bukan oleh manusia lewat
   * drive.google.com: dengan scope `drive.file`, folder yang dibuat manual
   * tidak akan pernah terlihat oleh aplikasi ini. Kalau pemilik telanjur
   * membuatnya sendiri, Worker akan membuat folder kedua dengan nama sama dan
   * memakai yang itu — membingungkan, tapi tidak merusak.
   */
  async ensureRoot(env) {
    const found = await driveFetch(env, '/files', {
      query: {
        q: `name = '${ROOT_FOLDER_NAME}' and 'root' in parents and mimeType = '${FOLDER_MIME}' and trashed = false`,
        fields: `files(${FILE_FIELDS})`,
        pageSize: 1,
      },
    });
    if (found?.files?.[0]) return found.files[0];

    return driveFetch(env, '/files', {
      method: 'POST',
      query: { fields: FILE_FIELDS },
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: ROOT_FOLDER_NAME,
        mimeType: FOLDER_MIME,
        parents: ['root'],
        description:
          'Arsip dokumentasi warga. Folder ini dikelola otomatis oleh Arsip23 — ' +
          'isinya boleh dibaca dan disalin, tapi jangan dipindah atau diganti namanya.',
      }),
    });
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
