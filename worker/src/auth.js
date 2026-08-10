/* ==========================================================================
   AUTH — verifikasi ID token Google (RS256, lewat JWKS)

   Setiap aksi tulis membawa ID token dari Google Identity Services. Worker
   memverifikasinya SENDIRI dengan kunci publik Google, bukan dengan memanggil
   endpoint `tokeninfo`.

   Kenapa bukan `tokeninfo` — yang jauh lebih pendek ditulis: endpoint itu
   berarti satu perjalanan jaringan ke Google pada SETIAP aksi tulis. Menghapus
   satu berkas jadi menunggu dua kali (Google lalu Drive), dan kalau
   `tokeninfo` sedang lambat, seluruh aplikasi ikut lambat — padahal kuncinya
   bisa di-cache berjam-jam. Verifikasi lokal menukar ~60 baris kode dengan
   hilangnya satu ketergantungan runtime di jalur terpanas.

   Yang diperiksa, dan kenapa tiap pemeriksaan ada:
     - tanda tangan  → tokennya memang dari Google, bukan karangan
     - `aud`         → tokennya untuk APLIKASI INI. Tanpa ini, ID token yang
                       sah dari aplikasi lain mana pun bisa dipakai masuk ke
                       sini. Ini pemeriksaan paling mudah dilupakan sekaligus
                       paling berbahaya kalau hilang.
     - `iss`         → penerbitnya Google
     - `exp`/`iat`   → tokennya masih hidup
   ========================================================================== */

import { err } from './http.js';

const JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const ISSUERS = new Set(['accounts.google.com', 'https://accounts.google.com']);

/* Toleransi jam. Jam client bisa meleset beberapa detik dari jam Google, dan
   menolak token yang `iat`-nya "dua detik di masa depan" hanya akan membuat
   sebagian user gagal login tanpa sebab yang bisa mereka pahami. */
const CLOCK_SKEW_S = 60;

/* Cache JWKS di memori isolate. Google merotasi kuncinya beberapa hari sekali,
   jadi 1 jam sangat aman sekaligus menghapus hampir semua pengambilan ulang. */
let jwksCache = { keys: null, fetchedAt: 0 };
const JWKS_TTL_MS = 60 * 60 * 1000;

function b64urlToBytes(s) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function b64urlToJson(s) {
  return JSON.parse(new TextDecoder().decode(b64urlToBytes(s)));
}

async function getJwks(force = false) {
  const fresh = jwksCache.keys && Date.now() - jwksCache.fetchedAt < JWKS_TTL_MS;
  if (fresh && !force) return jwksCache.keys;

  const res = await fetch(JWKS_URL);
  if (!res.ok) {
    // Kalau masih punya kunci lama, pakai itu. Kunci kedaluwarsa lebih baik
    // daripada seluruh aplikasi mati hanya karena Google sedang ngadat.
    if (jwksCache.keys) return jwksCache.keys;
    throw err.upstream('Tidak bisa mengambil kunci verifikasi dari Google.');
  }
  const body = await res.json();
  jwksCache = { keys: body.keys, fetchedAt: Date.now() };
  return body.keys;
}

async function importKey(jwk) {
  return crypto.subtle.importKey(
    'jwk',
    { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  );
}

/**
 * Verifikasi ID token Google.
 * @returns {Promise<{sub: string, email: string, name: string, picture: string}>}
 */
export async function verifyIdToken(idToken, env) {
  if (!idToken) throw err.unauthenticated();

  const parts = idToken.split('.');
  if (parts.length !== 3) throw err.unauthenticated('Token masuk tidak valid.');

  const [headerB64, payloadB64, sigB64] = parts;

  let header, payload;
  try {
    header = b64urlToJson(headerB64);
    payload = b64urlToJson(payloadB64);
  } catch {
    throw err.unauthenticated('Token masuk tidak bisa dibaca.');
  }

  if (header.alg !== 'RS256') {
    // Menerima `alg` apa pun dari token adalah lubang klasik (`alg: none`).
    // Algoritmanya dipatok di sini, bukan diambil dari token itu sendiri.
    throw err.unauthenticated('Algoritma token tidak didukung.');
  }

  // Kalau `kid` tidak ketemu, kemungkinan Google baru merotasi kunci —
  // ambil ulang JWKS sekali sebelum menyerah.
  let keys = await getJwks();
  let jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) {
    keys = await getJwks(true);
    jwk = keys.find((k) => k.kid === header.kid);
  }
  if (!jwk) throw err.unauthenticated('Kunci penanda tangan token tidak dikenali.');

  const ok = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    await importKey(jwk),
    b64urlToBytes(sigB64),
    new TextEncoder().encode(`${headerB64}.${payloadB64}`)
  );
  if (!ok) throw err.unauthenticated('Tanda tangan token tidak sah.');

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== 'number' || payload.exp + CLOCK_SKEW_S < now) {
    throw err.unauthenticated('Sesi Anda sudah kedaluwarsa. Silakan masuk lagi.');
  }
  if (typeof payload.iat === 'number' && payload.iat - CLOCK_SKEW_S > now) {
    throw err.unauthenticated('Token masuk belum berlaku.');
  }
  if (!ISSUERS.has(payload.iss)) {
    throw err.unauthenticated('Penerbit token bukan Google.');
  }
  if (!env.GOOGLE_CLIENT_ID || payload.aud !== env.GOOGLE_CLIENT_ID) {
    throw err.unauthenticated('Token ini bukan untuk aplikasi Arsip23.');
  }
  if (!payload.sub) {
    throw err.unauthenticated('Token tidak memuat identitas pengguna.');
  }

  return {
    sub: payload.sub,
    email: payload.email || '',
    name: payload.name || payload.email || 'Warga',
    picture: payload.picture || '',
  };
}

/** Ambil ID token dari header Authorization. Melempar kalau tidak ada. */
export async function requireUser(request, env) {
  const header = request.headers.get('Authorization') || '';
  const m = header.match(/^Bearer\s+(.+)$/i);
  if (!m) throw err.unauthenticated();
  return verifyIdToken(m[1].trim(), env);
}

/** Sama, tapi mengembalikan null kalau tidak ada token — untuk endpoint publik. */
export async function optionalUser(request, env) {
  const header = request.headers.get('Authorization') || '';
  if (!/^Bearer\s+/i.test(header)) return null;
  try {
    return await requireUser(request, env);
  } catch {
    // Di endpoint publik, token busuk tidak boleh membuat halaman gagal dimuat.
    // Efeknya cukup: pengunjung dianggap belum masuk.
    return null;
  }
}
