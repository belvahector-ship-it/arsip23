/* ==========================================================================
   CONFIG — satu-satunya berkas yang perlu disentuh saat memakai Arsip23 untuk
   proyek lain.

   Nilai di sini semuanya PUBLIK dan memang boleh terbaca siapa pun yang
   membuka devtools. OAuth Client ID bukan rahasia — rahasianya (client secret,
   key service account) ada di Cloudflare Worker dan tidak pernah menyentuh
   berkas ini. Kalau suatu saat ada yang tergoda menaruh secret di sini karena
   "kan cuma sebentar", jawabannya tidak: berkas ini ikut ter-publish ke
   GitHub Pages apa adanya.
   ========================================================================== */

export const CONFIG = {
  /* Kode workspace. Inilah satu baris yang membuat satu Worker + satu Drive
     bisa melayani banyak proyek tanpa deploy ulang (SPEC.md §7). Untuk proyek
     lain, salin repo ini dan ganti nilai ini saja. */
  WORKSPACE_ID: 'kasmenoreh',

  /* Judul yang tampil di header. */
  WORKSPACE_TITLE: 'RT — Kasmenoreh',

  /* Base URL Worker. Diisi setelah `wrangler deploy` pertama. */
  API_BASE: 'https://arsip23-api.workers.dev',

  /* OAuth Client ID dari Google Cloud Console. */
  GOOGLE_CLIENT_ID: '',

  /* Harus sama dengan MAX_UPLOAD_BYTES di Worker (CP-09). Yang di sini cuma
     demi kenyamanan — menolak berkas 80MB sebelum warga menunggu unggahannya
     berjalan lima menit lalu gagal. Penjaga yang sebenarnya tetap di server. */
  MAX_UPLOAD_BYTES: 20 * 1024 * 1024,
};

/* Penggantian untuk pengembangan lokal, tanpa perlu mengubah berkas ini dan
   tanpa risiko nilai lokal ikut ter-commit:
     localStorage.setItem('arsip23:apiBase', 'http://127.0.0.1:8787') */
const override = (() => {
  try {
    return localStorage.getItem('arsip23:apiBase');
  } catch {
    return null; // localStorage bisa diblokir di mode privat sebagian peramban
  }
})();
if (override) CONFIG.API_BASE = override;
