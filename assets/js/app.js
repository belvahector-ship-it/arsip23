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

import { CONFIG } from './config.js';
import { api, ApiError, setTokenGetter } from './api.js';
import * as auth from './auth.js';
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
} from './ui.js';

setTokenGetter(auth.getToken);

const dom = {
  wsLabel: document.getElementById('ws-label'),
  userArea: document.getElementById('user-area'),
  noticeBar: document.getElementById('notice-bar'),
  crumbs: document.getElementById('crumbs'),
  count: document.getElementById('count'),
  actions: document.getElementById('actions'),
  explorer: document.getElementById('explorer'),
  fileInput: document.getElementById('file-input'),
  btnNewFolder: document.getElementById('btn-new-folder'),
  btnUpload: document.getElementById('btn-upload'),
  modalNotice: document.getElementById('modal-notice'),
  noticeCheck: document.getElementById('notice-check'),
  noticeAccept: document.getElementById('notice-accept'),
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
        data.folders.map((f) => folderCard(f, { onDelete: confirmDeleteFolder }))
      )
    );
  }
  if (nk > 0) {
    frag.append(
      group(
        'Berkas',
        data.files.map((f) => fileCard(f, { onDelete: confirmDeleteFile, onPreview: preview }))
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

  if (!user) {
    const mounted = auth.mountGoogleButton(dom.userArea, onSignedIn);
    if (!mounted) {
      const note = document.createElement('span');
      note.className = 'fs-xs dim';
      note.textContent = CONFIG.GOOGLE_CLIENT_ID
        ? 'Tombol masuk Google tidak bisa dimuat.'
        : 'Login belum dikonfigurasi.';
      dom.userArea.replaceChildren(note);
    }
    dom.noticeBar.hidden = true;
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
    toast('Anda sudah keluar.');
    goTo(null);
    load();
  });

  frag.append(name, mine, out);
  dom.userArea.replaceChildren(frag);

  renderNoticeBar();
}

function renderNoticeBar() {
  const user = auth.getUser();
  if (!user || user.acceptedNoticeAt) {
    dom.noticeBar.hidden = true;
    dom.noticeBar.replaceChildren();
    return;
  }

  const inner = document.createElement('div');
  inner.className = 'notice-bar__inner';

  const text = document.createElement('p');
  text.className = 'flex-1';
  text.textContent =
    'Arsip ini bisa dilihat publik. Baca aturan unggah sebelum mengirim berkas pertama Anda.';

  const btn = document.createElement('button');
  btn.className = 'btn';
  btn.type = 'button';
  btn.textContent = 'Baca Aturan';
  btn.addEventListener('click', showNotice);

  inner.append(text, btn);
  dom.noticeBar.className = 'notice-bar';
  dom.noticeBar.replaceChildren(inner);
  dom.noticeBar.hidden = false;
}

async function onSignedIn() {
  try {
    const { user } = await api.login();
    auth.setUser(user);
    toast(`Selamat datang, ${user.displayName}.`, 'ok');
    goTo(user.rootFolderId);
    // Kalau hash-nya kebetulan sudah sama, `hashchange` tidak akan menyala —
    // jadi pemuatan ulang dipanggil sendiri.
    await load();
  } catch (e) {
    handle(e);
  }
}

/* --------------------------------------------------------------------------
   Aturan unggah
   -------------------------------------------------------------------------- */

dom.noticeCheck.addEventListener('change', () => {
  dom.noticeAccept.disabled = !dom.noticeCheck.checked;
});

async function showNotice() {
  dom.noticeCheck.checked = false;
  dom.noticeAccept.disabled = true;

  const result = await openModal(dom.modalNotice);
  if (result !== 'accept') return false;

  try {
    const { acceptedNoticeAt } = await api.acceptNotice();
    auth.setUser({ ...auth.getUser(), acceptedNoticeAt });
    toast('Terima kasih. Anda sudah bisa mengunggah.', 'ok');
    return true;
  } catch (e) {
    handle(e);
    return false;
  }
}

/** Pastikan aturan sudah disetujui; tampilkan modalnya kalau belum. */
async function ensureNoticeAccepted() {
  const user = auth.getUser();
  if (!user) return false;
  if (user.acceptedNoticeAt) return true;
  return showNotice();
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

async function startUpload() {
  if (!(await ensureNoticeAccepted())) return;
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
    try {
      await api.upload(parentId, file);
      item.done();
      uploaded++;
    } catch (e) {
      item.fail(e instanceof ApiError ? e.message : 'Gagal diunggah.');
    }
  }

  if (uploaded > 0) {
    toast(`${uploaded} berkas berhasil diunggah.`, 'ok');
    await load();
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
  // Arsip dimuat lebih dulu dan TIDAK menunggu Google: menelusuri arsip tidak
  // butuh login, jadi skrip Google yang lambat atau diblokir tidak boleh
  // menahan halaman ini kosong.
  load();

  const ready = await auth.whenGoogleReady();
  if (!ready) console.warn('[arsip23] Google Identity Services tidak termuat.');
  renderUserArea();
})();
