/* ==========================================================================
   API — pembungkus tipis di atas fetch

   Satu tempat yang tahu bentuk amplop respons (SPEC.md §8), sehingga sisa
   frontend hanya berurusan dengan data atau dengan `ApiError` — tidak pernah
   dengan `res.ok`, status code, atau JSON mentah.
   ========================================================================== */

import { CONFIG } from './config.js';

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

async function request(path, { method = 'GET', body, auth = false, query = {}, isForm = false } = {}) {
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
  }

  let res;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    });
  } catch {
    // fetch hanya melempar untuk kegagalan jaringan, bukan untuk status 4xx/5xx.
    // Membedakan keduanya penting: yang ini layak disarankan "cek koneksi",
    // yang lain tidak.
    throw new ApiError('NETWORK', 'Tidak bisa terhubung ke server. Cek koneksi Anda.', 0);
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
  browse: (folderId, pageToken) => request('/api/browse', { query: { folderId, pageToken } }),

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

  deleteFolder: (id) =>
    request(`/api/folder/${encodeURIComponent(id)}`, { method: 'DELETE', auth: true }),

  deleteFile: (id) =>
    request(`/api/file/${encodeURIComponent(id)}`, { method: 'DELETE', auth: true }),
};
