/* ==========================================================================
   APP — perekat: router, state, dan aksi

   Aplikasi ini satu halaman dengan routing lewat hash (DECISIONS.md CP-11).
   Satu sumber kebenaran state ada di objek `view` di bawah; setiap aksi yang
   mengubah isi folder diakhiri dengan memuat ulang folder yang sedang dibuka,
   bukan dengan menambal DOM secara manual.

   Alasannya bukan kemalasan: menambal DOM berarti frontend menebak-nebak
   keadaan Drive setelah sebuah aksi. Sekali tebakannya meleset — unggahan
   diam-diam ditolak, folder terhapus di tab lain — tampilan berbohong kepada
   user, dan tidak ada yang memberitahunya. Memuat ulang selalu menampilkan apa
   yang benar-benar ada di sana.
   ========================================================================== */

import { CONFIG } from './config.js?v=10';
import { api, ApiError, setTokenGetter } from './api.js?v=10';
import * as auth from './auth.js?v=10';
import {
  renderCrumbs,
  renderSkeleton,
  renderState,
  folderCard,
  fileCard,
  group,
  toast,
  uploadItem,
  openModal,
  formatSize,
} from './ui.js?v=10';

setTokenGetter(auth.getToken);

const dom = {
  wsLabel: document.getElementById('ws-label'),
  userArea: document.getElementById('user-area'),
  crumbs: document.getElementById('crumbs'),
  count: document.getElementById('count'),
  actions: document.getElementById('actions'),
  explorer: document.getElementById('explorer'),
  fileInput: document.getElementById('file-input'),
  btnNewFolder: document.getElementById('btn-new-folder'),
  btnUpload: document.getElementById('btn-upload'),
  modalGate: document.getElementById('modal-gate'),
  gateBackdrop: document.getElementById('gate-backdrop'),
  gateCheck: document.getElementById('gate-check'),
  gateGoogle: document.getElementById('gate-google'),
  gateLogin: document.querySelector('.gate__login'),
  gateStep: document.getElementById('gate-step'),
  gateBody: document.querySelector('#modal-gate .modal__body'),
  gateScrollCue: document.getElementById('gate-scroll-cue'),
  modalRename: document.getElementById('modal-rename'),
  renameName: document.getElementById('rename-name'),
  renameHint: document.getElementById('rename-hint'),
  modalShare: document.getElementById('modal-share'),
  shareUrl: document.getElementById('share-url'),
  shareDesc: document.getElementById('share-desc'),
  shareCopy: document.getElementById('share-copy'),
  modalFolder: document.getElementById('modal-folder'),
  folderName: document.getElementById('folder-name'),
  folderError: document.getElementById('folder-error'),
  modalDelete: document.getElementById('modal-delete'),
  deleteText: document.getElementById('delete-text'),
  viewer: document.getElementById('viewer'),
  viewerImg: document.getElementById('viewer-img'),
  viewerName: document.getElementById('viewer-name'),
};

const view = {
  folderId: null,      // null = root workspace
  data: null,
  loading: false,
  reqId: 0,            // penangkal balapan antar-permintaan
};

/* --------------------------------------------------------------------------
   Router
   -------------------------------------------------------------------------- */

function folderIdFromHash() {
  const m = location.hash.match(/^#\/f\/(.+)$/);
  return m ? decodeURIComponent(m[1]) : null;
}

function goTo(folderId) {
  location.hash = folderId ? `#/f/${encodeURIComponent(folderId)}` : '#/';
}

/* --------------------------------------------------------------------------
   Memuat & merender
   -------------------------------------------------------------------------- */

async function load() {
  const folderId = folderIdFromHash();
  view.folderId = folderId;
  view.loading = true;

  /* Warga sepuh sering menekan folder dua kali, dan koneksi RT membuat
     permintaan pertama kadang datang BELAKANGAN. Tanpa penanda ini, jawaban
     lama bisa menimpa jawaban baru dan user melihat folder yang bukan ia buka. */
  const myReq = ++view.reqId;

  renderSkeleton(dom.explorer);
  dom.count.textContent = 'Memuat arsip…';
  dom.actions.hidden = true;

  try {
    const data = await api.browse(folderId || undefined);
    if (myReq !== view.reqId) return;
    view.data = data;
    render();
  } catch (e) {
    if (myReq !== view.reqId) return;
    renderError(e);
  } finally {
    if (myReq === view.reqId) view.loading = false;
  }
}

function renderError(e) {
  dom.count.textContent = '';
  const isConfig = !CONFIG.API_BASE || CONFIG.API_BASE.includes('arsip23-api.workers.dev');

  renderState(dom.explorer, {
    title: e.code === 'NETWORK' ? 'Tidak bisa terhubung' : 'Arsip gagal dimuat',
    text: isConfig
      ? 'Alamat API belum diisi di assets/js/config.js — jalankan langkah setup di README.md dulu.'
      : e.message,
    action: { label: 'Coba Lagi', variant: 'error', onClick: load },
  });
}

function render() {
  const { data } = view;
  if (!data) return;

  dom.wsLabel.textContent = CONFIG.WORKSPACE_TITLE || data.workspace.title;
  dom.wsLabel.hidden = false;

  renderCrumbs(dom.crumbs, data.breadcrumb);

  const nf = data.folders.length;
  const nk = data.files.length;
  dom.count.textContent =
    nf + nk === 0 ? 'Kosong' : `${nf} folder · ${nk} berkas`;

  // Tombol tulis hanya muncul di ruang milik sendiri. Ini KENYAMANAN, bukan
  // pengamanan — Worker tetap memvalidasi ulang tiap aksi (SPEC.md §9).
  dom.actions.hidden = !(auth.getUser() && data.folder.isMine);

  dom.explorer.setAttribute('aria-busy', 'false');

  if (nf + nk === 0) {
    const mine = data.folder.isMine && auth.getUser();
    renderState(dom.explorer, {
      title: mine ? 'Ruang Anda masih kosong' : 'Folder ini masih kosong',
      text: mine
        ? 'Buat folder untuk tiap kegiatan — misalnya "Kerja Bakti Agustus 2026" — lalu unggah foto atau dokumennya ke dalam sana.'
        : data.folder.isRoot
          ? 'Belum ada warga yang mengunggah dokumentasi. Masuk dengan akun Google Anda untuk jadi yang pertama.'
          : 'Belum ada isi di folder ini.',
      action: mine ? { label: '+ Folder Baru', onClick: newFolder } : null,
    });
    return;
  }

  const frag = document.createDocumentFragment();

  if (nf > 0) {
    frag.append(
      group(
        data.folder.isRoot ? 'Ruang warga' : 'Folder',
        data.folders.map((f) =>
          folderCard(f, {
            onDelete: confirmDeleteFolder,
            onRename: renameItem,
            onShare: shareItem,
          })
        )
      )
    );
  }
  if (nk > 0) {
    frag.append(
      group(
        'Berkas',
        data.files.map((f) =>
          fileCard(f, {
            onDelete: confirmDeleteFile,
            onPreview: preview,
            onRename: renameItem,
            onShare: shareItem,
          })
        )
      )
    );
  }

  dom.explorer.replaceChildren(frag);
}

/* --------------------------------------------------------------------------
   Header & sesi
   -------------------------------------------------------------------------- */

function renderUserArea() {
  const user = auth.getUser();

  // Tanpa user, header dibiarkan kosong: gerbang sedang menutupi halaman dan
  // tombol masuknya ada di sana. Dua tombol masuk di dua tempat hanya membuat
  // bingung soal mana yang "benar".
  if (!user) {
    dom.userArea.replaceChildren();
    return;
  }

  const frag = document.createDocumentFragment();

  if (user.picture) {
    const img = document.createElement('img');
    img.className = 'app-user__avatar';
    img.src = user.picture;
    img.alt = '';
    img.referrerPolicy = 'no-referrer';
    frag.append(img);
  }

  const name = document.createElement('span');
  name.className = 'app-user__name';
  name.textContent = user.displayName;

  const mine = document.createElement('button');
  mine.className = 'btn btn--ghost';
  mine.type = 'button';
  mine.textContent = 'Ruang Saya';
  mine.addEventListener('click', () => goTo(user.rootFolderId));

  const out = document.createElement('button');
  out.className = 'btn btn--ghost';
  out.type = 'button';
  out.textContent = 'Keluar';
  out.addEventListener('click', () => {
    auth.signOut();
    goTo(null);
    // Keluar berarti kembali ke gerbang: tanpa identitas, arsip memang tidak
    // bisa ditelusuri lagi.
    openGate();
  });

  frag.append(name, mine, out);
  dom.userArea.replaceChildren(frag);
}

/* --------------------------------------------------------------------------
   Gerbang: aturan + login wajib

   Ditampilkan saat pengunjung pertama kali membuka situs, atau setelah cache
   peramban dikosongkan. Selama belum lewat, isi arsip tidak bisa diakses.

   Persetujuannya dicatat di DUA tempat, dan keduanya perlu:
     - `localStorage` → menentukan apakah gerbang muncul lagi di perangkat ini
     - KV di server (`acceptedNoticeAt`) → menentukan apakah unggahan diterima

   Kalau hanya localStorage, membersihkan penyimpanan peramban cukup untuk
   melewati aturan. Kalau hanya server, gerbangnya muncul lagi di setiap
   perangkat baru meski orangnya sudah pernah setuju — dan server tidak bisa
   ditanya sebelum user masuk, padahal masuk justru terjadi DI DALAM gerbang.
   -------------------------------------------------------------------------- */

const GATE_KEY = 'arsip23:gateAccepted';

function gateAcceptedLocally() {
  try {
    return localStorage.getItem(GATE_KEY) === '1';
  } catch {
    return false; // penyimpanan diblokir → gerbang muncul tiap kali, dan itu benar
  }
}

function rememberGate() {
  try {
    localStorage.setItem(GATE_KEY, '1');
  } catch {
    /* diabaikan */
  }
}

/**
 * Kunci sebuah <dialog> supaya tidak bisa ditutup dengan Esc maupun klik luar.
 *
 * `showModal()` selalu memberi user jalan keluar lewat Esc — itu memang perilaku
 * yang benar untuk dialog biasa, tapi salah untuk gerbang yang justru ada agar
 * tidak bisa dilewati. Peristiwa `cancel` adalah satu-satunya tempat Esc bisa
 * dicegat.
 */
function sealDialog(dialog) {
  dialog.addEventListener('cancel', (e) => e.preventDefault());
}
sealDialog(dom.modalGate);

/* Lapisan ketiga: apa pun yang berhasil menutup gerbang — jalur peramban yang
   tak terduga, ekstensi, atau kode kita sendiri yang keliru — akan langsung
   dibuka kembali selama user belum masuk. Satu-satunya penutupan yang sah
   terjadi di `onGatePassed()`, yang saat itu sudah memasang user-nya. */
dom.modalGate.addEventListener('close', () => {
  /* Latar gelap dan kunci gulir dilepas DI SINI, bukan cuma di `closeGate()`.
     Keduanya hidup di luar <dialog> (lihat komentar di index.html), jadi
     kalau dialog tertutup lewat jalur yang tidak melewati `closeGate()` —
     misalnya `onGatePassed()` gagal di tengah jalan setelah user terpasang —
     keduanya akan tertinggal menutupi halaman: arsip tampak tergelapkan dan
     tidak bisa digulir, tanpa ada popup yang kelihatan untuk ditutup. */
  dom.gateBackdrop.hidden = true;
  document.documentElement.classList.remove('has-locked-scroll');

  if (!auth.getUser()) {
    console.warn('[arsip23] gerbang tertutup tanpa login — dibuka kembali.');
    openGate();
  }
});

function syncGateStep() {
  const checked = dom.gateCheck.checked;
  dom.gateLogin.dataset.locked = checked ? 'false' : 'true';
  dom.gateStep.textContent = checked
    ? 'Langkah 2 — masuk dengan akun Google Anda:'
    : 'Centang persetujuan di atas dulu untuk melanjutkan.';
}

dom.gateCheck.addEventListener('change', syncGateStep);

// Ambang 4px, bukan 0, supaya sisa sub-pixel dari rounding tinggi (lazim di
// zoom peramban ganjil) tidak membuat isyarat "gulir" berkedip menyala padahal
// warga sudah benar-benar mentok di dasar.
const GATE_SCROLL_EPSILON = 4;

function syncGateScrollCue() {
  const el = dom.gateBody;
  const hasMore = el.scrollHeight - el.scrollTop - el.clientHeight > GATE_SCROLL_EPSILON;
  dom.gateScrollCue.classList.toggle('is-visible', hasMore);
}

dom.gateBody.addEventListener('scroll', syncGateScrollCue, { passive: true });
window.addEventListener('resize', () => {
  if (dom.modalGate.open) syncGateScrollCue();
});

// Sekali ukur setelah `showModal()` TIDAK CUKUP: tinggi isi gerbang berubah
// belakangan dari beberapa arah sekaligus — swap ke font kustom (Archivo/
// Manrope) yang baru selesai dimuat setelah render pertama, dan iframe
// tombol Google yang di-mount async lalu diberi ukuran sendiri oleh Google.
// ResizeObserver menangkap SEMUA perubahan tinggi badan gerbang itu, dari
// sumber mana pun, tanpa perlu menebak urutan/waktunya satu per satu.
new ResizeObserver(syncGateScrollCue).observe(dom.gateBody);

/**
 * Memasang tombol Google DENGAN status kelihatan di setiap tahap — bukan cuma
 * "berhasil" atau "diam saja". Alasannya ada di komentar panjang
 * `mountGoogleButton()`/`watchButtonRendered()` di auth.js: renderButton()
 * bisa "berhasil" dipanggil di jaringan RT yang lambat tanpa iframe-nya
 * pernah benar-benar tergambar, dan sebelum perbaikan ini itu artinya warga
 * cuma melihat ruang kosong tanpa penjelasan atau jalan keluar selain
 * memuat ulang seluruh halaman.
 */
async function mountGoogleButtonWithFallback() {
  dom.gateGoogle.replaceChildren();
  const loading = document.createElement('p');
  loading.className = 'gate__google-status';
  loading.textContent = 'Memuat tombol masuk Google…';
  dom.gateGoogle.append(loading);

  // Menunggu di sini, bukan sebelum gerbang dibuka: aturan & kotak centang
  // tidak butuh Google sama sekali, jadi tidak ada alasan menahan tampilnya
  // gerbang hanya karena skrip GIS belum selesai dimuat.
  const ready = await auth.whenGoogleReady();
  // Gerbang bisa saja sudah ditutup (user berhasil masuk lewat percobaan
  // lain) selama menunggu di atas — jangan menimpa apa pun kalau begitu.
  if (!dom.modalGate.open) return;

  if (!ready) {
    showGoogleButtonStuck('Tombol masuk Google tidak bisa dimuat. Periksa koneksi Anda.');
    return;
  }

  const frame = auth.mountGoogleButton(dom.gateGoogle, onGatePassed);
  if (!frame) {
    showGoogleButtonStuck('Tombol masuk Google tidak bisa dimuat. Periksa koneksi Anda.');
    return;
  }

  auth.watchButtonRendered(frame, () => {
    if (dom.modalGate.open) {
      showGoogleButtonStuck('Tombol masuk Google belum muncul — koneksi mungkin lambat.');
    }
  });
}

function showGoogleButtonStuck(message) {
  const status = document.createElement('p');
  status.className = 'gate__google-status';
  status.textContent = message;

  const retry = document.createElement('button');
  retry.type = 'button';
  retry.className = 'btn';
  retry.textContent = 'Coba Lagi';
  retry.addEventListener('click', mountGoogleButtonWithFallback);

  dom.gateGoogle.replaceChildren(status, retry);
}

function openGate() {
  syncGateStep();
  if (!dom.modalGate.open) dom.modalGate.showModal();

  // Latar gelap + penguncian gulir dipasang lewat CSS/JS biasa, TIDAK
  // menunggu apakah showModal() di atas benar-benar berhasil menaruh
  // dialog di top layer peramban — lihat komentar panjang di index.html
  // soal kenapa itu tidak bisa diandalkan sendirian di sejumlah peramban HP.
  dom.gateBackdrop.hidden = false;
  document.documentElement.classList.add('has-locked-scroll');

  // Tombol Google dipasang DI DALAM gerbang, bukan di header, supaya tidak ada
  // dua tempat berbeda untuk masuk.
  mountGoogleButtonWithFallback();

  syncGateScrollCue();
}

function closeGate() {
  if (dom.modalGate.open) dom.modalGate.close();
  dom.gateBackdrop.hidden = true;
  document.documentElement.classList.remove('has-locked-scroll');
}

/** Dipanggil setelah user memilih akun Google di dalam gerbang. */
async function onGatePassed() {
  try {
    const { user } = await api.login();
    auth.setUser(user);

    // Persetujuan dikirim ke server sekarang — user sudah punya identitas, dan
    // kotak centangnya syarat untuk sampai ke sini.
    if (!user.acceptedNoticeAt) {
      const { acceptedNoticeAt } = await api.acceptNotice();
      auth.setUser({ ...user, acceptedNoticeAt });
    }
    rememberGate();
    closeGate();

    toast(`Selamat datang, ${user.displayName}.`, 'ok');
    goTo(user.rootFolderId);
    await load();
  } catch (e) {
    handle(e);
  }
}

/* --------------------------------------------------------------------------
   Folder baru
   -------------------------------------------------------------------------- */

async function newFolder() {
  const parentId = currentWritableFolderId();
  if (!parentId) return;

  dom.folderName.value = '';
  dom.folderError.textContent = '';

  const result = await openModal(dom.modalFolder);
  if (result !== 'create') return;

  const name = dom.folderName.value.trim();
  if (!name) {
    toast('Nama folder tidak boleh kosong.', 'error');
    return;
  }

  try {
    await api.createFolder(parentId, name);
    toast(`Folder "${name}" dibuat.`, 'ok');
    await load();
  } catch (e) {
    handle(e);
  }
}

/* --------------------------------------------------------------------------
   Unggah
   -------------------------------------------------------------------------- */

function startUpload() {
  // Persetujuan aturan sudah dijamin oleh gerbang, dan tetap divalidasi ulang
  // di server pada setiap unggahan (SPEC.md §9).
  if (!auth.getUser()) return;
  dom.fileInput.value = '';   // supaya memilih berkas yang sama dua kali tetap memicu `change`
  dom.fileInput.click();
}

dom.fileInput.addEventListener('change', async () => {
  const parentId = currentWritableFolderId();
  const files = Array.from(dom.fileInput.files || []);
  if (!parentId || files.length === 0) return;

  let uploaded = 0;

  /* Berurutan, bukan Promise.all. Koneksi rumahan di RT punya bandwidth unggah
     yang sempit; mengirim 30 foto sekaligus membuat semuanya merangkak dan
     sebagian time out. Satu per satu lebih lambat di atas kertas tapi jauh
     lebih sering berhasil — dan progress-nya jadi bisa dipercaya. */
  for (const file of files) {
    const item = uploadItem(file.name);

    if (file.size > CONFIG.MAX_UPLOAD_BYTES) {
      item.fail(`Terlalu besar (${formatSize(file.size)}, maks ${formatSize(CONFIG.MAX_UPLOAD_BYTES)})`);
      continue;
    }

    item.start();

    /* Satu kali coba ulang, KHUSUS untuk kegagalan di lapisan jaringan.

       Galat lain tidak diulang dengan sengaja: berkas kebesaran, folder bukan
       milik Anda, atau aturan belum disetujui akan gagal dengan cara yang persis
       sama pada percobaan kedua — mengulangnya cuma menunda pesan galat yang
       sudah benar. Yang layak diulang hanya sambungan yang putus, karena itu
       memang sering pulih sendiri di koneksi rumahan. */
    let lastError = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        await api.upload(parentId, file);
        lastError = null;
        break;
      } catch (e) {
        lastError = e;
        const transient =
          e instanceof ApiError && (e.code === 'NETWORK' || e.code === 'ABORTED');
        if (!transient || attempt === 2) break;
        item.retry();
        await new Promise((r) => setTimeout(r, 1500));
        item.start();
      }
    }

    if (lastError) {
      item.fail(lastError instanceof ApiError ? lastError.message : 'Gagal diunggah.');
    } else {
      item.done();
      uploaded++;
    }
  }

  if (uploaded > 0) {
    toast(`${uploaded} berkas berhasil diunggah.`, 'ok');
    await load();
  }
});

/* --------------------------------------------------------------------------
   Ganti nama
   -------------------------------------------------------------------------- */

async function renameItem(item) {
  const isFolder = item.itemCount !== undefined;

  dom.renameName.value = item.name;
  dom.renameHint.textContent = isFolder
    ? ''
    : 'Ekstensi berkas (.pdf, .jpg) dipertahankan otomatis.';

  const opened = openModal(dom.modalRename);
  // Sorot nama tanpa ekstensinya: yang hampir selalu ingin diganti adalah
  // bagian namanya, bukan ".pdf"-nya.
  const dot = isFolder ? -1 : item.name.lastIndexOf('.');
  dom.renameName.focus();
  dom.renameName.setSelectionRange(0, dot > 0 ? dot : item.name.length);

  if ((await opened) !== 'save') return;

  const name = dom.renameName.value.trim();
  if (!name || name === item.name) return;

  try {
    const res = await api.rename(item.id, name);
    toast(`Nama diubah jadi "${res.item.name}".`, 'ok');
    await load();
  } catch (e) {
    handle(e);
  }
}

/* --------------------------------------------------------------------------
   Bagikan tautan
   -------------------------------------------------------------------------- */

async function shareItem(item) {
  const isFolder = item.itemCount !== undefined;

  dom.shareDesc.textContent = `Membuat tautan untuk ${isFolder ? 'folder' : 'berkas'} "${item.name}"…`;
  dom.shareUrl.value = '';
  dom.shareCopy.disabled = true;

  const opened = openModal(dom.modalShare);

  try {
    const res = await api.share(item.id);
    dom.shareUrl.value = res.shareUrl;
    dom.shareDesc.textContent = `Tautan untuk ${isFolder ? 'folder' : 'berkas'} "${res.name}":`;
    dom.shareCopy.disabled = false;
  } catch (e) {
    dom.shareDesc.textContent = e.message || 'Gagal membuat tautan.';
    handle(e);
  }

  await opened;
}

dom.shareCopy.addEventListener('click', async () => {
  const url = dom.shareUrl.value;
  if (!url) return;

  try {
    await navigator.clipboard.writeText(url);
    toast('Tautan disalin.', 'ok');
  } catch {
    /* `navigator.clipboard` butuh HTTPS dan izin, dan tidak selalu ada di
       peramban HP yang lebih tua. Menyorot teksnya membuat user tetap bisa
       menyalin manual — lebih baik daripada tombol yang diam saja. */
    dom.shareUrl.focus();
    dom.shareUrl.select();
    toast('Tekan lama lalu pilih "Salin".');
  }
});

/* --------------------------------------------------------------------------
   Hapus
   -------------------------------------------------------------------------- */

async function confirmDeleteFolder(folder) {
  dom.deleteText.textContent =
    `Folder "${folder.name}" beserta SELURUH isinya akan dihapus dari Google Drive.`;
  if ((await openModal(dom.modalDelete)) !== 'delete') return;

  try {
    await api.deleteFolder(folder.id);
    toast(`Folder "${folder.name}" dihapus.`);
    await load();
  } catch (e) {
    handle(e);
  }
}

async function confirmDeleteFile(file) {
  dom.deleteText.textContent = `Berkas "${file.name}" akan dihapus dari Google Drive.`;
  if ((await openModal(dom.modalDelete)) !== 'delete') return;

  try {
    await api.deleteFile(file.id);
    toast(`Berkas "${file.name}" dihapus.`);
    await load();
  } catch (e) {
    handle(e);
  }
}

/* --------------------------------------------------------------------------
   Pratinjau
   -------------------------------------------------------------------------- */

function preview(file) {
  /* Thumbnail Drive datang dengan sufiks ukuran (`=s220`). Menaikkannya
     memberi gambar yang layak dilihat tanpa perlu endpoint tambahan. */
  dom.viewerImg.src = (file.thumbnailUrl || '').replace(/=s\d+(-c)?$/, '=s1600');
  dom.viewerImg.alt = file.name;
  dom.viewerName.textContent = `${file.name} · ${formatSize(file.size)}`;
  dom.viewer.showModal();
}

/* --------------------------------------------------------------------------
   Bantuan
   -------------------------------------------------------------------------- */

function currentWritableFolderId() {
  if (!auth.getUser()) {
    toast('Masuk dengan Google dulu untuk bisa mengunggah.', 'error');
    return null;
  }
  if (!view.data?.folder?.isMine) {
    toast('Anda hanya bisa menambah isi di dalam ruang milik Anda sendiri.', 'error');
    return null;
  }
  return view.data.folder.id;
}

function handle(e) {
  const message = e instanceof ApiError ? e.message : 'Terjadi kesalahan.';
  toast(message, 'error');

  // Token kedaluwarsa di tengah sesi. Daripada membiarkan tiap aksi berikutnya
  // gagal satu per satu, sesinya dibersihkan sekarang supaya tombol masuk
  // muncul kembali dan user tahu apa yang harus dilakukan.
  if (e instanceof ApiError && e.status === 401) {
    auth.signOut();
  }
  console.error('[arsip23]', e);
}

/* --------------------------------------------------------------------------
   Pemasangan
   -------------------------------------------------------------------------- */

dom.btnNewFolder.addEventListener('click', newFolder);
dom.btnUpload.addEventListener('click', startUpload);

window.addEventListener('hashchange', load);

auth.onChange(() => {
  renderUserArea();
  render();
});

(async function boot() {
  /* Pulihkan sesi sebelum apa pun yang lain. Kalau token dari sebelum refresh
     masih hidup, `/api/login` memvalidasinya ke server dan mengembalikan
     profilnya — sehingga user tetap jadi orang yang sama, bukan akun Google
     lain yang kebetulan sedang aktif di peramban. */
  let restored = false;
  if (auth.restoreSession()) {
    try {
      const { user } = await api.login();
      auth.setUser(user);
      restored = true;
    } catch (e) {
      // Token busuk/kedaluwarsa: bersihkan diam-diam. Ini bukan kegagalan yang
      // perlu diteriakkan ke user — dari sudut pandangnya ia memang belum masuk.
      auth.signOut();
      console.warn('[arsip23] sesi tersimpan tidak berlaku lagi:', e.message);
    }
  }

  if (restored) {
    load();
    return;
  }

  /* Belum masuk → gerbang. Isi arsip TIDAK dimuat lebih dulu: memuatnya hanya
     untuk langsung ditutupi dialog berarti membocorkan sekilas isi arsip ke
     orang yang belum menyetujui aturan, sekaligus memboroskan permintaan yang
     pasti diulang setelah login.

     Menunggu GIS di sini TIDAK diperlukan lagi — `openGate()` ->
     `mountGoogleButtonWithFallback()` menunggu dan menangani sendiri
     ketiadaan/keterlambatannya, lengkap dengan tombol "Coba Lagi" tanpa
     memaksa muat ulang seluruh halaman. */
  openGate();

  // Belum ada yang perlu ditampilkan di balik gerbang; `load()` dijalankan
  // setelah login di `onGatePassed()`.
  dom.count.textContent = '';
  dom.explorer.replaceChildren();
})();
