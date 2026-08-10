/* ==========================================================================
   AUTH — Google Identity Services di sisi peramban

   Yang disimpan aplikasi ini hanyalah ID token dari Google, di memori. Bukan
   di localStorage.

   Kenapa bukan localStorage, padahal itu akan membuat user tetap masuk setelah
   refresh: ID token adalah kunci ke seluruh hak tulis seseorang, dan apa pun
   yang ada di localStorage bisa dibaca oleh skrip mana pun yang berhasil masuk
   ke halaman ini. Halaman ini menampilkan nama berkas yang diketik warga —
   permukaan XSS yang nyata, meski sudah dijaga di ui.js. Menyimpan di memori
   membuat kebocoran token butuh serangan yang jauh lebih sulit. Harganya: user
   perlu menekan tombol masuk lagi setelah refresh. Untuk aplikasi yang dipakai
   sesekali saat mengunggah foto kegiatan, itu pertukaran yang layak.
   ========================================================================== */

import { CONFIG } from './config.js';

const state = {
  token: null,
  expiresAt: 0,
  user: null,
  listeners: new Set(),
};

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
  if (window.google?.accounts?.id) window.google.accounts.id.disableAutoSelect();
  emit();
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
      state.token = response.credential;
      state.expiresAt = expiryOf(response.credential);
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
