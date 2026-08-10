/* ==========================================================================
   HTTP — amplop respons, CORS, dan galat yang bisa dilempar

   Satu bentuk respons untuk seluruh API (SPEC.md §8). Alasannya bukan kerapian:
   frontend hanya perlu SATU jalur penanganan galat. Kalau tiap endpoint
   mengarang bentuknya sendiri, tiap pemanggilan di frontend akan menumbuhkan
   cabang `if` sendiri-sendiri, dan cabang yang jarang terpakai adalah cabang
   yang tidak pernah diuji.

   `message` SELALU berbahasa Indonesia dan layak ditampilkan apa adanya ke user.
   Frontend tidak menerjemahkan kode galat menjadi kalimatnya sendiri — kalau ia
   melakukan itu, kita punya dua tempat yang harus sepakat soal arti sebuah kode,
   dan cepat atau lambat keduanya tidak lagi sepakat.
   ========================================================================== */

/** Galat yang sudah "matang": punya status HTTP dan kalimat untuk user. */
export class ApiError extends Error {
  constructor(status, code, message, extra) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

export const err = {
  unauthenticated: (m = 'Anda perlu masuk dengan Google dulu.') =>
    new ApiError(401, 'UNAUTHENTICATED', m),
  forbidden: (m = 'Aksi ini tidak diizinkan.') =>
    new ApiError(403, 'FORBIDDEN', m),
  notFound: (m = 'Yang Anda cari tidak ditemukan.') =>
    new ApiError(404, 'NOT_FOUND', m),
  validation: (m, fields) =>
    new ApiError(422, 'VALIDATION', m, fields ? { fields } : undefined),
  tooLarge: (m) => new ApiError(413, 'TOO_LARGE', m),
  conflict: (m) => new ApiError(409, 'CONFLICT', m),
  upstream: (m = 'Google Drive sedang tidak bisa dihubungi. Coba lagi sebentar lagi.') =>
    new ApiError(502, 'UPSTREAM', m),
  internal: (m = 'Terjadi kesalahan di sisi kami.') =>
    new ApiError(500, 'INTERNAL', m),
};

/* --------------------------------------------------------------------------
   CORS

   Frontend ada di domain lain (GitHub Pages / arsip23.web.id) sementara Worker
   ada di *.workers.dev, jadi SEMUA permintaan di sini lintas-asal. Daftar asal
   yang diizinkan dibaca dari env supaya menambah domain tidak perlu ubah kode.

   Yang sengaja TIDAK dilakukan: `Access-Control-Allow-Origin: *` dipakai hanya
   sebagai jaring pengaman ketika ALLOWED_ORIGINS tidak diisi. API ini tidak
   memakai cookie sama sekali (identitas dibawa lewat header Authorization),
   jadi `*` tidak membocorkan sesi siapa pun — tapi menyebut asal yang tepat
   tetap lebih baik karena membuat salah-konfigurasi terlihat lebih cepat.
   -------------------------------------------------------------------------- */
export function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = (env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const allowOrigin =
    allowed.length === 0 ? '*' : allowed.includes(origin) ? origin : allowed[0];

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization,Content-Type,X-Workspace',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

export function json(data, { status = 200, request, env, meta } = {}) {
  const body = meta ? { success: true, data, meta } : { success: true, data };
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...(request ? corsHeaders(request, env) : {}),
    },
  });
}

export function jsonError(error, { request, env } = {}) {
  const e =
    error instanceof ApiError
      ? error
      : err.internal(
          // Pesan asli galat tak terduga sengaja TIDAK dikirim ke client: isinya
          // bisa memuat potongan respons Google, ID internal, atau jejak stack.
          // Yang detail masuk ke log Worker, yang ke user cukup kalimat wajar.
          'Terjadi kesalahan di sisi kami. Coba lagi sebentar lagi.'
        );

  if (!(error instanceof ApiError)) {
    console.error('[arsip23] galat tak tertangani:', error && error.stack ? error.stack : error);
  }

  return new Response(
    JSON.stringify({
      success: false,
      error: { code: e.code, message: e.message, ...(e.extra || {}) },
    }),
    {
      status: e.status,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        ...(request ? corsHeaders(request, env) : {}),
      },
    }
  );
}

export function preflight(request, env) {
  return new Response(null, { status: 204, headers: corsHeaders(request, env) });
}
