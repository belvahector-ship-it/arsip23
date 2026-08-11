/* ==========================================================================
   API — pembungkus tipis di atas fetch

   Satu tempat yang tahu bentuk amplop respons (SPEC.md §8), sehingga sisa
   frontend hanya berurusan dengan data atau dengan `ApiError` — tidak pernah
   dengan `res.ok`, status code, atau JSON mentah.
   ========================================================================== */

import { CONFIG } from './config.js?v=10';

export class ApiError extends Error {
  constructor(code, message, status) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

/* Token diambil lewat fungsi, bukan disimpan sebagai nilai di modul ini.
   Alasannya: ID token Google berumur ±1 jam dan bisa diperbarui di tengah
   sesi. Kalau api.js menyimpan salinannya, salinan itu akan basi tanpa ada
   yang tahu, dan gejalanya muncul sebagai "tiba-tiba semua aksi 401". */
let tokenGetter = () => null;
export function setTokenGetter(fn) {
  tokenGetter = fn;
}

async function request(
  path,
  { method = 'GET', body, auth = false, optionalAuth = false, query = {}, isForm = false } = {}
) {
  const url = new URL(CONFIG.API_BASE.replace(/\/+$/, '') + path);
  url.searchParams.set('workspace', CONFIG.WORKSPACE_ID);
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  }

  const headers = { 'X-Workspace': CONFIG.WORKSPACE_ID };
  if (!isForm && body !== undefined) headers['Content-Type'] = 'application/json';

  if (auth) {
    const token = tokenGetter();
    if (!token) throw new ApiError('UNAUTHENTICATED', 'Anda perlu masuk dengan Google dulu.', 401);
    headers.Authorization = `Bearer ${token}`;
  } else if (optionalAuth) {
    /* Endpoint publik yang TETAP membawa token kalau ada.

       Ini bukan pemanis. `/api/browse` boleh diakses tanpa masuk, dan awalnya
       ia memang dipanggil tanpa token sama sekali — kelihatannya benar, karena
       endpointnya publik. Akibatnya Worker tidak pernah tahu siapa yang sedang
       menelusuri, sehingga `isMine` selalu `false` pada SETIAP folder dan
       berkas. Tombol "+ Unggah", "+ Folder Baru", dan tombol hapus semuanya
       bergantung pada nilai itu — jadi ketiganya tidak akan pernah muncul,
       bahkan untuk pemilik ruangnya sendiri, dan seluruh fitur tulis aplikasi
       ini menjadi tidak bisa dijangkau lewat UI.

       Yang menyesatkan: API-nya sendiri baik-baik saja (sudah terbukti di uji
       CP-18), dan tidak ada satu pun galat yang muncul di layar. Yang hilang
       cuma tombol. */
    const token = tokenGetter();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let res;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    });
  } catch (e) {
    /* `fetch` hanya menolak untuk kegagalan di lapisan jaringan — bukan untuk
       status 4xx/5xx, yang tetap dianggap "berhasil" olehnya.

       Dulu semua kegagalan di sini dilaporkan sebagai "Cek koneksi Anda". Itu
       menuduh hal yang salah: sambungan yang putus di tengah unggahan,
       permintaan yang dibatalkan, dan gangguan sesaat di jalur ke Cloudflare
       semuanya mendarat di cabang yang sama — dan user yang internetnya jelas
       jalan jadi mencari masalah di tempat yang tidak ada masalahnya.

       Sebabnya sekarang dibedakan, dan alasan aslinya dari peramban ikut
       disimpan di `.cause` supaya kejadian berikutnya bisa didiagnosis, bukan
       ditebak. */
    const reason = e && e.message ? e.message : String(e);
    const aborted = e && (e.name === 'AbortError' || /abort/i.test(reason));

    const apiErr = new ApiError(
      aborted ? 'ABORTED' : 'NETWORK',
      aborted
        ? 'Pengiriman terhenti sebelum selesai. Coba lagi.'
        : 'Sambungan ke server terputus. Kalau internet Anda normal, biasanya ini ' +
          'gangguan sesaat — coba lagi sebentar lagi.',
      0
    );
    apiErr.cause = reason;
    console.error('[arsip23] fetch gagal:', method, path, '→', reason);
    throw apiErr;
  }

  let payload = null;
  try {
    payload = await res.json();
  } catch {
    throw new ApiError('INTERNAL', 'Jawaban server tidak bisa dibaca.', res.status);
  }

  if (!res.ok || payload?.success === false) {
    const e = payload?.error || {};
    throw new ApiError(e.code || 'INTERNAL', e.message || 'Terjadi kesalahan.', res.status);
  }

  return payload.data;
}

export const api = {
  browse: (folderId, pageToken) =>
    request('/api/browse', { optionalAuth: true, query: { folderId, pageToken } }),

  login: () => request('/api/login', { method: 'POST', auth: true, body: { workspace: CONFIG.WORKSPACE_ID } }),

  acceptNotice: () =>
    request('/api/accept-notice', { method: 'POST', auth: true, body: { workspace: CONFIG.WORKSPACE_ID } }),

  createFolder: (parentFolderId, name) =>
    request('/api/folder', {
      method: 'POST',
      auth: true,
      body: { workspace: CONFIG.WORKSPACE_ID, parentFolderId, name },
    }),

  upload: (parentFolderId, file) => {
    const form = new FormData();
    form.set('workspace', CONFIG.WORKSPACE_ID);
    form.set('parentFolderId', parentFolderId);
    form.set('file', file, file.name);
    return request('/api/upload', { method: 'POST', auth: true, body: form, isForm: true });
  },

  rename: (id, name) =>
    request('/api/rename', {
      method: 'POST',
      auth: true,
      body: { workspace: CONFIG.WORKSPACE_ID, id, name },
    }),

  share: (id) =>
    request('/api/share', {
      method: 'POST',
      auth: true,
      body: { workspace: CONFIG.WORKSPACE_ID, id },
    }),

  deleteFolder: (id) =>
    request(`/api/folder/${encodeURIComponent(id)}`, { method: 'DELETE', auth: true }),

  deleteFile: (id) =>
    request(`/api/file/${encodeURIComponent(id)}`, { method: 'DELETE', auth: true }),
};
