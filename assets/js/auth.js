/* ==========================================================================
   AUTH — Google Identity Services di sisi peramban

   ID token disimpan di **sessionStorage**, bukan cuma di memori.

   Versi pertama sengaja menyimpannya di memori saja, dengan alasan keamanan:
   token yang tidak pernah ditulis ke penyimpanan tidak bisa dibaca skrip lain.
   Harganya diperkirakan kecil — "user tinggal menekan tombol masuk lagi setelah
   refresh".

   Perkiraan itu keliru, dan yang menunjukkannya adalah pemakaian nyata: user
   yang punya beberapa akun Google di satu peramban tidak sekadar diminta masuk
   ulang — ia bisa mendarat sebagai akun yang BERBEDA, karena tombol Google
   memakai akun aktif peramban, bukan akun yang ia pakai sebelum refresh. Di
   aplikasi yang seluruh hak ubahnya ditentukan oleh identitas, berganti
   identitas diam-diam berarti ruang kerjanya ikut berganti — folder yang tadi
   ada tiba-tiba bukan miliknya lagi. Itu bukan ketidaknyamanan kecil, itu
   membuat aplikasinya terasa rusak.

   sessionStorage dipilih, bukan localStorage: isinya mati saat tab ditutup dan
   tidak dibagi ke tab lain, jadi sesi tidak menggantung berhari-hari di
   komputer bersama. Token juga tetap berumur ±1 jam dari Google.
   ========================================================================== */

import { CONFIG } from './config.js?v=7';

const STORAGE_KEY = 'arsip23:idToken';

const state = {
  token: null,
  expiresAt: 0,
  user: null,
  listeners: new Set(),
};

/* Penyimpanan bisa diblokir (mode privat sebagian peramban). Kalau itu terjadi,
   aplikasi tetap jalan — cuma kembali ke perilaku lama, harus masuk ulang. */
function safeStore(action, value) {
  try {
    if (action === 'get') return sessionStorage.getItem(STORAGE_KEY);
    if (action === 'set') sessionStorage.setItem(STORAGE_KEY, value);
    if (action === 'del') sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* diabaikan dengan sengaja */
  }
  return null;
}

export function getToken() {
  // Token yang sudah lewat umurnya tidak dikirim sama sekali — lebih baik
  // gagal di sini dengan pesan "silakan masuk lagi" daripada menempuh
  // perjalanan ke Worker hanya untuk ditolak 401.
  if (!state.token || Date.now() >= state.expiresAt) return null;
  return state.token;
}

export function getUser() {
  return state.user;
}

export function onChange(fn) {
  state.listeners.add(fn);
  return () => state.listeners.delete(fn);
}

function emit() {
  state.listeners.forEach((fn) => fn(state.user));
}

export function setUser(user) {
  state.user = user;
  emit();
}

export function signOut() {
  state.token = null;
  state.expiresAt = 0;
  state.user = null;
  safeStore('del');
  if (window.google?.accounts?.id) window.google.accounts.id.disableAutoSelect();
  emit();
}

/** Simpan token baru (dari GIS) ke memori + sessionStorage. */
function keepToken(idToken) {
  state.token = idToken;
  state.expiresAt = expiryOf(idToken);
  safeStore('set', idToken);
}

/**
 * Pulihkan sesi setelah refresh. Mengembalikan true kalau ada token yang masih
 * hidup — pemanggil lalu memanggil `/api/login` untuk mengambil ulang profil
 * dan memvalidasi token itu ke server.
 */
export function restoreSession() {
  const saved = safeStore('get');
  if (!saved) return false;

  const exp = expiryOf(saved);
  if (Date.now() >= exp) {
    safeStore('del');
    return false;
  }
  state.token = saved;
  state.expiresAt = exp;
  return true;
}

/** Umur token dibaca dari klaim `exp` — jangan menebak "satu jam". */
function expiryOf(idToken) {
  try {
    const payload = JSON.parse(
      atob(idToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))
    );
    // 30 detik bantalan supaya token tidak kedaluwarsa persis di tengah unggahan.
    return payload.exp * 1000 - 30_000;
  } catch {
    return Date.now() + 50 * 60 * 1000;
  }
}

/**
 * Pasang tombol Google. `onCredential` dipanggil setelah user memilih akun.
 * Mengembalikan false kalau GIS tidak tersedia — pemanggil yang memutuskan
 * apa yang ditampilkan sebagai gantinya.
 */
export function mountGoogleButton(container, onCredential) {
  if (!CONFIG.GOOGLE_CLIENT_ID) {
    console.warn('[arsip23] GOOGLE_CLIENT_ID belum diisi di assets/js/config.js');
    return false;
  }
  if (!window.google?.accounts?.id) return false;

  window.google.accounts.id.initialize({
    client_id: CONFIG.GOOGLE_CLIENT_ID,
    callback: async (response) => {
      keepToken(response.credential);
      await onCredential();
    },
    auto_select: false,
    cancel_on_tap_outside: true,
  });

  const frame = document.createElement('div');
  frame.className = 'gsi-frame';
  container.replaceChildren(frame);

  window.google.accounts.id.renderButton(frame, {
    type: 'standard',
    theme: 'filled_black',   // paling dekat dengan bahasa visual brutalis
    size: 'large',
    shape: 'square',
    text: 'signin_with',
    locale: 'id',
  });
  return true;
}

/**
 * GIS dimuat dengan `defer`, jadi saat app.js jalan skripnya belum tentu siap.
 * Menunggu dengan polling pendek lebih sederhana daripada memasang callback
 * global, dan menyerah setelah beberapa detik supaya halaman tidak menunggu
 * selamanya kalau skrip Google diblokir.
 */
export function whenGoogleReady(timeoutMs = 8000) {
  return new Promise((resolve) => {
    if (window.google?.accounts?.id) return resolve(true);
    const started = Date.now();
    const timer = setInterval(() => {
      if (window.google?.accounts?.id) {
        clearInterval(timer);
        resolve(true);
      } else if (Date.now() - started > timeoutMs) {
        clearInterval(timer);
        resolve(false);
      }
    }, 120);
  });
}
