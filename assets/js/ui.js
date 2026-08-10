/* ==========================================================================
   UI — membangun DOM, toast, dan antrian unggah

   Aturan keras di berkas ini: nama folder dan nama berkas SELALU masuk lewat
   `textContent`, tidak pernah lewat `innerHTML`. Nama-nama itu diketik oleh
   warga dan ditampilkan ke semua pengunjung — persis definisi XSS tersimpan.
   Satu template literal yang menyisipkan `${name}` ke innerHTML sudah cukup
   untuk membuat satu orang iseng menjalankan skrip di peramban semua orang.
   ========================================================================== */

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

export function formatSize(bytes) {
  if (bytes === null || bytes === undefined) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function extensionOf(name) {
  const m = String(name).match(/\.([a-z0-9]{1,5})$/i);
  return m ? m[1].toUpperCase() : 'FILE';
}

/* --------------------------------------------------------------------------
   Breadcrumb
   -------------------------------------------------------------------------- */

export function renderCrumbs(container, crumbs) {
  container.replaceChildren();
  crumbs.forEach((crumb, i) => {
    const last = i === crumbs.length - 1;
    if (last) {
      const span = el('span', 'crumbs__current', crumb.name);
      span.setAttribute('aria-current', 'page');
      container.append(span);
    } else {
      const a = el('a', 'crumbs__link', crumb.name);
      a.href = `#/f/${encodeURIComponent(crumb.id)}`;
      container.append(a, el('span', 'crumbs__sep', '/'));
    }
  });
}

/* --------------------------------------------------------------------------
   Kartu
   -------------------------------------------------------------------------- */

function svgTrash() {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '18');
  svg.setAttribute('height', '18');
  svg.setAttribute('aria-hidden', 'true');
  for (const d of ['M4 6h16', 'M9 6V4h6v2', 'M6 6l1 14h10l1-14', 'M10 10v7', 'M14 10v7']) {
    const p = document.createElementNS(ns, 'path');
    p.setAttribute('d', d);
    p.setAttribute('fill', 'none');
    p.setAttribute('stroke', 'currentColor');
    p.setAttribute('stroke-width', '2');
    svg.append(p);
  }
  return svg;
}

/* Ikon tong sampah, bukan tanda silang. Satu-satunya aksi di kartu ini adalah
   menghapus, jadi menu titik-tiga berisi satu item cuma menambah satu ketukan
   tanpa memberi pilihan apa pun. Tapi "×" juga salah: di pojok kanan atas
   sebuah kotak, tanda itu dibaca sebagai "tutup/sembunyikan" — jarak antara
   "menyembunyikan kartu" dan "menghapus foto kegiatan selamanya" terlalu jauh
   untuk diserahkan ke tebakan. */
function menuButton(label, onClick) {
  const btn = el('button', 'card__menu');
  btn.type = 'button';
  btn.title = label;
  btn.setAttribute('aria-label', label);
  btn.append(svgTrash());
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    onClick();
  });
  return btn;
}

/** Lapisan tak terlihat yang membuat seluruh kartu bisa ditekan. */
function hitLayer(label, { href, onClick } = {}) {
  const node = el(href ? 'a' : 'button', 'card__hit');
  if (href) {
    node.href = href;
  } else {
    node.type = 'button';
    node.addEventListener('click', onClick);
  }
  // Isinya kosong secara visual, jadi namanya harus datang dari sini —
  // tanpa ini pembaca layar mengumumkan "tautan" tanpa menyebut apa pun.
  node.setAttribute('aria-label', label);
  return node;
}

export function folderCard(folder, { onDelete }) {
  const card = el('article', 'card');

  const icon = el('div', 'card__icon');
  icon.setAttribute('aria-hidden', 'true');
  icon.append(svgFolder());

  const count =
    folder.itemCount === null || folder.itemCount === undefined
      ? '—'
      : `${folder.itemCount} item`;

  const body = el('div', 'card__body');
  body.append(icon, el('h3', 'card__name', folder.name), el('p', 'card__meta', count));

  card.append(
    body,
    hitLayer(`Buka folder ${folder.name}`, { href: `#/f/${encodeURIComponent(folder.id)}` })
  );

  if (folder.isMine && onDelete) {
    card.append(menuButton(`Hapus folder ${folder.name}`, () => onDelete(folder)));
  }
  return card;
}

export function fileCard(file, { onDelete, onPreview }) {
  const card = el('article', 'card');

  if (file.isImage && file.thumbnailUrl) {
    const img = el('img', 'card__thumb');
    img.src = file.thumbnailUrl;
    img.alt = '';           // nama berkas sudah diumumkan oleh lapisan hit
    img.loading = 'lazy';
    img.decoding = 'async';
    img.referrerPolicy = 'no-referrer';
    // Thumbnail Drive sesekali kedaluwarsa. Kalau gagal, jatuhkan ke blok
    // ekstensi daripada meninggalkan kotak rusak di tengah grid.
    img.addEventListener('error', () => img.replaceWith(el('div', 'card__ext', 'IMG')));
    card.append(img);
  } else {
    card.append(el('div', 'card__ext', extensionOf(file.name)));
  }

  const body = el('div', 'card__body');
  body.append(el('h3', 'card__name', file.name), el('p', 'card__meta', formatSize(file.size)));
  card.append(body);

  if (file.isImage) {
    card.append(hitLayer(`Lihat gambar ${file.name}`, { onClick: () => onPreview(file) }));
  } else {
    // Berkas non-gambar dibuka di Drive. `noopener` wajib: tanpa itu halaman
    // yang dibuka bisa menyentuh `window.opener` milik kita.
    const link = hitLayer(`Buka ${file.name} di Google Drive`, {
      href: file.webViewUrl || '#',
    });
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    card.append(link);
  }

  if (file.isMine && onDelete) {
    card.append(menuButton(`Hapus berkas ${file.name}`, () => onDelete(file)));
  }
  return card;
}

function svgFolder() {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '24');
  svg.setAttribute('height', '24');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', 'M3 5h6l2 3h10v11H3z');
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '2.5');
  svg.append(path);
  return svg;
}

/* --------------------------------------------------------------------------
   Keadaan
   -------------------------------------------------------------------------- */

/** Satu kelompok berlabel ("Folder" / "Berkas") berisi grid kartu. */
export function group(title, cards) {
  const section = el('section', 'group');
  section.append(el('h2', 'group__title', title));
  const grid = el('div', 'explorer');
  cards.forEach((c) => grid.append(c));
  section.append(grid);
  return section;
}

export function renderSkeleton(container, n = 8) {
  const grid = el('div', 'explorer');
  for (let i = 0; i < n; i++) grid.append(el('div', 'skeleton'));
  container.replaceChildren(grid);
  container.setAttribute('aria-busy', 'true');
}

export function renderState(container, { title, text, action }) {
  const box = el('div', `state${action?.variant === 'error' ? ' state--error' : ''}`);
  box.append(el('h3', 'state__title', title), el('p', 'state__text', text));
  if (action) {
    const btn = el('button', 'btn btn--primary', action.label);
    btn.type = 'button';
    btn.addEventListener('click', action.onClick);
    box.append(btn);
  }
  container.replaceChildren(box);
  container.setAttribute('aria-busy', 'false');
}

/* --------------------------------------------------------------------------
   Toast
   -------------------------------------------------------------------------- */

export function toast(message, variant = '') {
  const host = document.getElementById('toasts');
  const node = el('div', `toast${variant ? ` toast--${variant}` : ''}`, message);
  host.append(node);
  setTimeout(() => node.remove(), variant === 'error' ? 6500 : 3800);
}

/* --------------------------------------------------------------------------
   Antrian unggah

   Progress-nya jujur dalam tiga langkah: menunggu → mengirim → selesai/gagal.
   Sengaja TIDAK memakai bar yang merayap sendiri sampai 90% lalu berhenti:
   itu bukan informasi, itu hiasan yang berbohong soal kapan selesainya.
   -------------------------------------------------------------------------- */

export function uploadItem(fileName) {
  const host = document.getElementById('uploads');
  const node = el('div', 'upload-item');
  const label = el('p', 'upload-item__name', fileName);
  const status = el('p', 'upload-item__status dim', 'Menunggu…');
  const bar = el('div', 'upload-item__bar');
  const fill = el('div', 'upload-item__fill');
  bar.append(fill);
  node.append(label, bar, status);
  host.append(node);

  return {
    start() {
      fill.style.width = '55%';
      status.textContent = 'Mengirim…';
    },
    done() {
      fill.style.width = '100%';
      status.textContent = 'Selesai';
      node.classList.add('upload-item--done');
      setTimeout(() => node.remove(), 2200);
    },
    fail(message) {
      status.textContent = message;
      node.classList.add('upload-item--error');
      // Kegagalan TIDAK hilang sendiri. Kalau ia ikut memudar seperti pesan
      // sukses, warga yang sedang mengunggah 30 foto tidak akan pernah tahu
      // foto mana yang tidak masuk.
    },
  };
}

/* --------------------------------------------------------------------------
   Modal
   -------------------------------------------------------------------------- */

/** Buka <dialog> dan tunggu sampai ditutup; kembalikan nilai tombolnya. */
export function openModal(dialog) {
  return new Promise((resolve) => {
    dialog.addEventListener('close', () => resolve(dialog.returnValue), { once: true });
    dialog.showModal();
  });
}
