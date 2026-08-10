# Decision Log — Arsip23

Bersifat *append-only*. Entri terbaru di paling bawah. Jangan pernah mengedit atau
menghapus entri lama — kalau sebuah keputusan dibatalkan, tulis entri baru yang
**menggantikan** (supersede) entri lama. Urutan pembatalan itu justru sering jadi
bagian paling berguna dari berkas ini.

**Legenda status:** `confirmed` (user sudah setuju) · `assumed` (Claude yang
memutuskan, user belum menimbang) · `superseded by CP-xx` · `debt` (celah yang
sengaja ditinggalkan)

---

## CP-01 · Discovery · 2026-08-11 — Proyek dilanjutkan dari dokumen yang sudah ada, bukan dimulai dari nol

**Keputusan:** `instruksi.md` (revisi ketiga) dan `spesifikasi-teknis-arsip.md`
(draft pertama) diperlakukan sebagai hasil Fase 0 (Discovery) dan sebagian Fase 1
(Blueprint) yang **sudah selesai**. Log keputusan ini dimulai dari titik itu,
bukan mengulang wawancara kebutuhan dari awal.

**Opsi yang dipertimbangkan:** (a) mulai discovery dari nol dan mengabaikan kedua
dokumen; (b) memperlakukan kedua dokumen sebagai sumber kebenaran dan hanya
menanyakan yang benar-benar belum diputuskan.

**Why:** Kedua dokumen sudah menjawab hampir semua pertanyaan discovery skill ini
— siapa penggunanya (warga/panitia RT), pekerjaan intinya (unggah & telusuri
dokumentasi), entitas datanya (workspace → user → folder → file), kebutuhan auth
(Google OAuth, wajib untuk tulis), dan batasan hosting (GitHub Pages + Cloudflare
Workers, biaya Rp0). Mengulang wawancara dari nol akan membuang kerja yang sudah
matang dan berisiko menghasilkan spesifikasi yang berbeda dari yang sudah
disepakati.

**Affects:** SPEC.md (disusun sebagai turunan, bukan pengganti, kedua dokumen),
seluruh fase berikutnya.

**Reversible:** ya.

**Status:** assumed

---

## CP-02 · Discovery · 2026-08-11 — Struktur repo: satu repo berisi frontend + worker

**Keputusan:** Folder `arsip23/` dijadikan satu repo git (`main`) yang memuat
frontend statis di root (agar GitHub Pages bisa menyajikannya langsung dari root
branch) dan kode Cloudflare Worker di subfolder `worker/`.

**Opsi yang dipertimbangkan:** (a) dua repo terpisah (frontend & worker); (b) satu
repo, frontend di root, worker di subfolder; (c) satu repo, frontend di `docs/`.

**Why:** GitHub Pages paling sederhana kalau frontend ada di root branch — tanpa
build step, tanpa workflow Actions, persis seperti kasmenoreh.my.id. Worker
di-deploy lewat `wrangler` yang tidak peduli letak foldernya, jadi menaruhnya di
subfolder repo yang sama tidak mengganggu Pages sama sekali, sekaligus menjaga
frontend dan kontrak API-nya tetap berdampingan dalam satu riwayat commit.

**Affects:** layout repo, konfigurasi GitHub Pages, `worker/wrangler.toml`.

**Reversible:** ya — memisahkan worker ke repo sendiri nanti hanya soal memindah
satu folder.

**Status:** assumed

---

## CP-03 · Discovery · 2026-08-11 — Sistem desain diambil utuh dari kasmenoreh.my.id, bukan sistem baru

**Keputusan:** `assets/css/tokens.css` dan `assets/css/base.css` disalin apa
adanya dari `kas rt/kas-rt-sampangan/assets/css/`, berikut dua berkas font
variabel (`archivo-latin-var.woff2`, `manrope-latin-var.woff2`). Arsip23 memakai
tema **BRUTAL** yang sama, bukan membuat token sendiri.

**Opsi yang dipertimbangkan:** (a) menyalin token; (b) menautkan token lewat CDN
dari domain kasmenoreh; (c) membuat sistem desain sendiri untuk Arsip23.

**Why:** `instruksi.md` §7 mewajibkan modul ini memakai token CSS yang sama agar
terasa satu kesatuan. Menautkan lintas-domain ditolak karena akan membuat Arsip23
— yang justru dirancang mandiri dan dipakai ulang di luar konteks RT — bergantung
pada ketersediaan domain kasmenoreh. Menyalin membuat Arsip23 tetap berdiri
sendiri; harganya adalah token bisa *drift* dari situs induk, dan itu diterima.

**Affects:** seluruh tampilan; `assets/css/`, `assets/font/`.

**Reversible:** ya.

**Status:** assumed

---

## CP-04 · Discovery · 2026-08-11 — Ditemukan pertentangan: dokumen minta mode gelap & font yang sudah tidak dipakai lagi

**Keputusan:** Belum diputuskan — **diangkat sebagai pertanyaan ke user**, bukan
diputuskan sepihak. Entri ini mencatat pertentangannya supaya tidak hilang.

**Masalahnya:** `instruksi.md` §7 dan `spesifikasi-teknis-arsip.md` §8 menyebut
Arsip23 harus memakai font **Inter** (teks) + **JetBrains Mono** (angka), tema
"Neo-Brutalist RT" dengan border 2–3px, dan **mendukung mode gelap mengikuti
`prefers-color-scheme` seperti situs utama**. Ketika `tokens.css` kasmenoreh
dibaca langsung hari ini, ketiga hal itu ternyata sudah tidak berlaku:

- Tema sudah berganti ke **BRUTAL** (CP-24 di DECISIONS.md kasmenoreh), yang
  menggantikan "Neo-Brutalist RT" (CP-19).
- Font teks/angka sudah **Manrope**, bukan Inter/JetBrains Mono; judul memakai
  **Archivo** (Syne dilepas di CP-25).
- Mode gelap **dimatikan permanen** di kasmenoreh (CP-20, `color-scheme: light`)
  — jadi kalimat "mendukung mode gelap seperti situs utama" sudah tidak akurat:
  situs utama justru tidak punya mode gelap.

**Why penting:** Kalau diikuti mentah-mentah, Arsip23 akan memakai font dan tema
yang sudah ditinggalkan situs induknya — hasilnya justru **tidak** menyatu, kebalikan
dari tujuan §7 itu sendiri.

**Affects:** `assets/css/`, seluruh komponen UI, SPEC.md §5.

**Status:** open — menunggu jawaban user

---

## CP-05 · Discovery · 2026-08-11 — Otomatisasi deploy lewat Chrome user belum bisa dijalankan

**Keputusan:** Rencana memakai Chrome milik user (yang sudah login GitHub,
Cloudflare, Google Cloud Console) untuk mengotomatiskan deploy **ditunda** —
ekstensi Claude for Chrome belum terhubung ke sesi ini.

**Bukti:** `list_connected_browsers` mengembalikan daftar kosong (`[]`), artinya
tidak ada instance Chrome yang ter-pair dengan akun ini.

**Why dicatat:** Ini menentukan siapa yang mengerjakan langkah deploy. Kalau
ekstensi tidak jadi terhubung, seluruh langkah yang butuh dashboard web (buat repo
GitHub, nyalakan Pages, buat KV namespace, isi secret Worker, setel OAuth consent
screen, arahkan DNS domain) harus dijalankan manual oleh user dengan panduan
tertulis. `gh` dan `wrangler` CLI juga belum terpasang di mesin ini — jadi jalur
CLI pun belum tersedia tanpa instalasi lebih dulu.

**Affects:** seluruh Fase 3 (deploy), README.md.

**Reversible:** ya — begitu ekstensi terhubung, otomatisasi bisa dilanjutkan.

**Status:** superseded by CP-07

---

## CP-06 · Discovery · 2026-08-11 — Ikut tokens.css terkini; tanpa mode gelap

**Keputusan:** Menutup CP-04. Arsip23 memakai tema **BRUTAL** apa adanya —
Archivo (judul) + Manrope (teks & angka), border 3px, sudut 0, bayangan keras,
dan **tanpa mode gelap** (`color-scheme: light`). Instruksi "Inter + JetBrains
Mono + mode gelap" di `instruksi.md` §7 dan `spesifikasi-teknis-arsip.md` §8
dinyatakan **kedaluwarsa**.

**Why:** Tujuan asli §7 adalah "terasa satu kesatuan dengan kasmenoreh.my.id".
Mengikuti teks dokumen secara harfiah justru akan melanggar tujuan itu, karena
teks tersebut menggambarkan tema yang sudah ditinggalkan situs induknya. Mengikuti
`tokens.css` yang hidup memenuhi maksudnya, bukan hurufnya.

**Affects:** `assets/css/`, seluruh komponen UI, SPEC.md §5.

**Reversible:** ya, tapi mahal — menambahkan mode gelap belakangan berarti
menyusun ulang seluruh pasangan warna, karena identitas tema ini bertumpu pada
border hitam di atas putih.

**Status:** confirmed (user memilih "Ikut tokens.css terkini")

---

## CP-07 · Discovery · 2026-08-11 — CLI dipasang otomatis; Chrome dipakai untuk yang tidak punya CLI

**Keputusan:** Menggantikan CP-05. `gh` 2.97.0 (via winget) dan `wrangler` 4.120.1
(via npm global) sudah **terpasang** di mesin ini. Chrome user juga sudah
terhubung ke sesi ini. Pembagian tugasnya:

- **CLI** untuk yang bisa di-skrip: buat repo, push, nyalakan Pages, buat KV
  namespace, set secret Worker, deploy Worker.
- **Chrome** untuk yang memang hanya ada di dashboard web: Google Cloud Console
  (OAuth consent screen, Client ID, service account key, aktifkan Drive API),
  pembelian/pengaturan DNS domain, dan pembuatan Drive Bersama.

**Opsi yang dipertimbangkan:** semua lewat Chrome; semua lewat CLI; campuran.

**Why:** Mengklik dashboard tidak bisa diulang dan tidak meninggalkan jejak — kalau
deploy harus diulang enam bulan lagi, perintah CLI di README masih bekerja
sementara ingatan soal urutan klik sudah hilang. Tapi Google Cloud Console dan
registrar domain tidak punya jalur CLI yang praktis di sini, jadi untuk itu Chrome
justru jalur yang benar, bukan jalan pintas.

**Affects:** Fase 3, README.md.

**Status:** confirmed

---

## CP-08 · Blueprint · 2026-08-11 — Berkas disimpan di Drive Bersama, bukan My Drive

**Keputusan:** Storage Arsip23 adalah sebuah **Drive Bersama (Shared Drive)** di
akun `belvafahrozi@unw.ac.id`, dengan service account ditambahkan sebagai *Content
Manager*. Bukan folder biasa di My Drive seperti tersirat di
`spesifikasi-teknis-arsip.md` §2.

**Opsi yang dipertimbangkan:** (a) folder di My Drive bendahara yang di-*share* ke
service account; (b) Drive Bersama + service account sebagai Content Manager;
(c) tanpa service account sama sekali — simpan *refresh token* OAuth milik
bendahara di Worker dan bertindak atas namanya.

**Why:** Opsi (a) adalah rancangan awal di dokumen, dan **akan gagal**. Service
account tidak punya kuota penyimpanan sendiri; berkas yang ia buat di My Drive
orang lain tetap *dimiliki* oleh service account, sehingga unggahan ditolak dengan
galat kuota. Ini jebakan yang sangat umum dan baru ketahuan saat unggahan pertama
— persis titik di mana produk ini kehilangan seluruh gunanya. Opsi (b)
menyelesaikannya di akarnya: berkas di Drive Bersama dimiliki oleh *Drive*-nya,
bukan oleh pembuatnya, dan memakai kuota gabungan organisasi. Kebetulan
`unw.ac.id` adalah Google Workspace kampus, jadi fitur ini tersedia. Opsi (c)
disimpan sebagai cadangan kalau admin kampus melarang Drive Bersama; harganya
adalah menyimpan refresh token jangka panjang milik seorang manusia, yang lebih
berisiko daripada key service account.

**Affects:** `worker/src/drive.js`, seluruh operasi Drive (semua panggilan wajib
membawa `supportsAllDrives=true` & `includeItemsFromAllDrives=true`), langkah
setup di README, secret `DRIVE_ROOT_FOLDER_ID`.

**Reversible:** ya, tapi memindahkan berkas yang sudah telanjur ada antar-jenis
Drive itu merepotkan — lebih baik benar sejak awal.

**Status:** assumed — perlu dipastikan admin `unw.ac.id` mengizinkan Drive Bersama

---

## CP-09 · Blueprint · 2026-08-11 — Batas unggah 20 MB per berkas

**Keputusan:** Maksimal **20 MB per berkas**, ditolak di frontend (sebelum
terkirim) *dan* di Worker (sebagai penjaga sebenarnya).

**Opsi yang dipertimbangkan:** 5 MB · 20 MB · 100 MB lewat *resumable upload* dari
browser langsung ke Drive.

**Why:** Isi arsip ini didominasi foto HP (2–6 MB) dan PDF nota; 20 MB memberi
ruang lega tanpa mendekati batas request Cloudflare Workers (100 MB di tier gratis,
tapi memori Worker cuma 128 MB dan berkas harus lewat memori). *Resumable upload*
langsung ke Drive akan membolehkan berkas video besar, tapi butuh Worker
menerbitkan URL unggah bertanda tangan — kerumitan yang tidak dibayar oleh
kebutuhan nyata dokumentasi RT.

**Affects:** `worker/src/index.js`, `assets/js/upload.js`, teks galat `TOO_LARGE`.

**Reversible:** ya.

**Status:** assumed

---

## CP-10 · Blueprint · 2026-08-11 — Thumbnail memakai URL Drive langsung, tanpa proxy

**Keputusan:** Kartu berkas gambar memakai `thumbnailLink` dari Drive API apa
adanya, tanpa diproxy lewat Worker.

**Why:** Memproxy setiap thumbnail berarti setiap gulir di halaman arsip membebani
Worker — jalur tercepat menuju habisnya kuota harian tier gratis, untuk keuntungan
privasi yang nihil di sini: arsip ini memang **sengaja publik** (`instruksi.md`
§2). Kalau nanti ada workspace yang privat, thumbnail-nya memang harus diproxy —
dan itu tercatat sebagai konsekuensi yang sudah diketahui, bukan kejutan.

**Affects:** `assets/js/ui.js`, endpoint `/api/browse`.

**Reversible:** ya.

**Status:** assumed · membawa **debt**: workspace privat belum bisa dipakai sampai
proxy thumbnail dibuat.

---

## CP-11 · Blueprint · 2026-08-11 — Aplikasi satu halaman dengan routing lewat hash

**Keputusan:** Seluruh aplikasi adalah satu `index.html`. Navigasi folder memakai
hash `#/f/<folderId>`, bukan halaman baru dan bukan History API.

**Opsi yang dipertimbangkan:** banyak halaman HTML · SPA + History API
(`/f/<id>`) · SPA + hash.

**Why:** Halaman terpisah akan menduplikasi header, state login, dan token di tiap
berkas tanpa memberi apa pun ke user. History API menghasilkan URL yang lebih
bersih, tapi butuh server yang mengembalikan `index.html` untuk semua path — dan
GitHub Pages tidak bisa melakukan itu tanpa trik `404.html` yang merusak tombol
Back. Hash bekerja apa adanya di hosting statis, tetap membuat tombol Back
peramban berfungsi, dan folder tetap bisa ditautkan ke orang lain.

**Affects:** `index.html`, `assets/js/router.js`.

**Reversible:** ya.

**Status:** assumed

---

## CP-12 · Blueprint · 2026-08-11 — Fase 1 selesai: SPEC.md jadi kontrak

**Keputusan:** `SPEC.md` ditulis dan **menggantikan** `instruksi.md` +
`spesifikasi-teknis-arsip.md` sebagai sumber kebenaran. Dua dokumen lama tetap
disimpan sebagai latar belakang (kenapa produk ini ada), tidak dihapus.

**Why:** Tiga dokumen yang sama-sama mengaku sebagai spesifikasi adalah cara
tercepat membuat frontend dan backend melenceng — CP-04 sudah membuktikan
dokumen lama bisa basi tanpa ada yang sadar. Satu berkas yang jelas menang.

**Affects:** semua fase berikutnya.

**Status:** assumed

---

## CP-13 · Build · 2026-08-11 — Urutan build: kontrak dibekukan, frontend & worker sekaligus

**Keputusan:** Kontrak API (SPEC.md §8) dibekukan lebih dulu, lalu Worker dan
frontend ditulis dalam satu rangkaian oleh satu tangan — tanpa memecah ke
sub-agent.

**Why:** User meminta build "lengkap". Produk ini kecil (7 endpoint, 1 halaman),
dan bagian tersulitnya justru sambungan antara keduanya: validasi kepemilikan.
Satu orang yang memegang kedua sisi menghasilkan sambungan yang lebih rapat
daripada dua yang masing-masing hanya melihat separuh.

**Affects:** seluruh `worker/src/` dan `assets/js/`.

**Status:** confirmed

---

## CP-14 · Build · 2026-08-11 — Catatan KV sub-folder dibiarkan yatim saat folder induk dihapus

**Keputusan:** `DELETE /api/folder/:id` menghapus folder di Drive dan entri
`folder:<id>`-nya saja. Entri KV milik sub-folder di dalamnya tidak disapu.

**Opsi yang dipertimbangkan:** menelusuri seluruh isi lewat Drive lalu menghapus
tiap entri; menyimpan daftar anak di tiap entri KV; membiarkannya.

**Why:** Menyapu berarti satu panggilan Drive per tingkat kedalaman, padahal
tier gratis Cloudflare membatasi 50 subrequest per permintaan — folder kegiatan
yang dalam bisa membuat aksi hapus gagal di tengah jalan, meninggalkan keadaan
yang jauh lebih buruk daripada sekadar entri menganggur. Entri yatim itu sendiri
tidak berbahaya: folder Drive-nya sudah tidak ada, `assertOwnedFolder` tetap
menolak lebih dulu karena rantai parent-nya putus, dan andai lolos pun Drive
menjawab 404.

**Affects:** `worker/src/index.js`, KV akan menumpuk perlahan.

**Reversible:** ya.

**Status:** assumed · **debt**

---

## CP-15 · QA · 2026-08-11 — Empat cacat ditemukan saat menjalankan, bukan saat membaca

Dicatat karena keempatnya adalah jenis cacat yang tidak akan pernah terlihat
tanpa benar-benar membuka halamannya:

1. **Tombol "+ Unggah" tetap tampil untuk pengunjung yang belum masuk.** JS sudah
   memasang `hidden` dengan benar, tapi `.toolbar__actions { display: flex }`
   mengalahkan `display: none` bawaan atribut `hidden` (kekhususannya lebih
   tinggi). Diperbaiki dengan `[hidden] { display: none !important }`.
2. **Modal mendarat di pojok kiri atas.** `<dialog>` memusatkan diri lewat
   `margin: auto`, dan reset `* { margin: 0 }` di `base.css` warisan situs induk
   menghapusnya. Dikembalikan di `app.css`, bukan dengan mengubah `base.css`
   yang dipakai bersama.
3. **Kartu folder ikut meninggi mengikuti kartu gambar** karena keduanya berbagi
   satu grid. Folder dan berkas dipisah jadi dua kelompok berlabel.
4. **Target sentuh di bawah 44px** — tombol hapus 40px dan tautan breadcrumb
   35px. Keduanya dinaikkan.

**Why dicatat:** Cacat 1 dan 2 sama-sama berupa CSS yang diam-diam membatalkan
JS/perilaku bawaan yang sudah benar. Keduanya tidak akan tertangkap oleh
pembacaan kode, dan cacat 1 secara khusus adalah kebocoran tampilan hak akses.

**Status:** confirmed (sudah diperbaiki)

---

## CP-16 · Deploy · 2026-08-11 — Setup Google terhenti: akun di Chrome bukan akun yang direncanakan

**Keputusan:** Setup Google (Drive Bersama, Cloud project, OAuth client, service
account) **dihentikan sebelum membuat apa pun**, menunggu keputusan user.

**Temuan:** Akun Google yang aktif di Chrome adalah
**`belvahector@gmail.com`** — akun pribadi dengan kuota 15 GB yang **sudah
terpakai 92% (13,92 dari 15 GB)**, menyisakan sekitar 1 GB. Akun
`belvafahrozi@unw.ac.id` yang disebut user tidak sedang masuk di Chrome ini.
Daftar Drive Bersama di akun tersebut juga kosong.

**Kenapa ini menghentikan pekerjaan, bukan sekadar catatan:**

1. **Sisa 1 GB tidak cukup untuk arsip foto kegiatan RT.** Seluruh premis
   "biaya Rp0 dengan kapasitas longgar" di `instruksi.md` §1 bertumpu pada akun
   yang kuotanya tidak terlihat batasnya — ciri akun Workspace/kampus, bukan
   akun gmail pribadi.
2. **Akun gmail pribadi tidak bisa membuat Drive Bersama sama sekali.** Fitur itu
   khusus Google Workspace. Padahal CP-08 menetapkan Drive Bersama sebagai satu-
   satunya cara agar unggahan service account tidak ditolak karena kuota. Dengan
   kata lain, di akun ini rancangan penyimpanannya tidak bisa dijalankan.
3. Membuat project Cloud, OAuth client, dan **key service account** di akun yang
   salah berarti menerbitkan kredensial jangka panjang di tempat yang salah —
   pekerjaan yang harus dibongkar ulang, bukan sekadar dipindah.

**Yang dibutuhkan sebelum lanjut:** user masuk ke Chrome dengan
`belvafahrozi@unw.ac.id`, lalu dipastikan apakah admin `unw.ac.id` mengizinkan
(a) pembuatan Drive Bersama dan (b) pembuatan project di Google Cloud Console.
Banyak Workspace kampus mengunci keduanya untuk akun mahasiswa.

**Rencana cadangan kalau kampus mengunci Drive Bersama:** opsi (c) di CP-08 —
menyimpan refresh token OAuth milik pemilik akun di Worker dan bertindak atas
namanya, sehingga berkas dimiliki manusia (punya kuota) bukan service account
(tanpa kuota). Lebih berisiko dan perlu keputusan terpisah.

**Affects:** seluruh langkah deploy, README §Setup, CP-08.

**Status:** superseded by CP-17

---

## CP-17 · Deploy · 2026-08-11 — Akun `belvahector69@gmail.com`; service account diganti OAuth refresh token + scope `drive.file`

**Keputusan:** Menggantikan CP-08 dan menutup CP-16.

1. Storage arsip = My Drive **`belvahector69@gmail.com`** (Google One AI Pro,
   5 TB, baru terpakai 286 GB; Drive-nya sendiri 3,89 GB).
2. **Bukan** `belvafahrozi@unw.ac.id`.
3. Worker bertindak atas nama akun itu lewat **refresh token OAuth**, bukan
   service account.
4. Scope yang diminta **`drive.file`**, bukan `drive`.
5. Folder root arsip **dibuat oleh Worker sendiri** dan ID-nya diingat di KV
   (`config:driveRoot`). Secret `DRIVE_ROOT_FOLDER_ID` dihapus.

**Kenapa bukan unw.ac.id, padahal itu rencana awal user:** halaman akunnya
menampilkan spanduk Google *"Mentransfer konten Anda — transfer email dan file
Google Drive Anda ke Akun Google lain"*, yaitu ajakan yang muncul saat akun
institusi diarahkan untuk ditutup. Arsip ini dimaksudkan menyimpan dokumentasi
RT bertahun-tahun dan jadi sumber bukti pelaporan ke Pemkot; menaruhnya di akun
yang sudah disuruh pindah berarti menjadwalkan kehilangan data, bukan sekadar
menanggung risiko kecil. Ditambah lagi akun kampus dikendalikan admin yang bisa
mengunci Cloud Console, aplikasi OAuth eksternal, dan Drive Bersama sewaktu-waktu.

**Kenapa refresh token, bukan service account:** akun Google pribadi tidak punya
Drive Bersama, dan tanpa Drive Bersama, berkas buatan service account dimiliki
service account itu sendiri — yang kuota penyimpanannya nol. Unggahan akan
ditolak Google. Refresh token membuat berkas dimiliki manusia yang punya 5 TB.

**Kenapa `drive.file`, bukan `drive`:** `drive` adalah scope *restricted* dan
menuntut penilaian keamanan Google sebelum aplikasi boleh dipakai publik —
berbulan-bulan, untuk arsip RT. `drive.file` bukan scope sensitif, jadi tanpa
verifikasi. Bonusnya nyata, bukan sekadar administratif: aplikasi ini secara
teknis **tidak bisa** menyentuh berkas lain di Drive pribadi pemiliknya, jadi
kalau refresh token bocor, yang terpapar hanya isi arsip.

**Harga yang dibayar, dicatat terbuka:**
- Folder root tidak boleh dibuat manual — folder buatan manusia tidak terlihat
  oleh scope ini. Karena itu Worker yang membuatnya.
- Consent screen **wajib berstatus "In production"**. Selama masih "Testing",
  Google mematikan refresh token setelah 7 hari, dan arsip akan mati sendiri
  seminggu setelah dipasang — kegagalan yang paling sulit didiagnosis karena
  semuanya sempat bekerja dengan baik.
- Kapasitas bergantung pada langganan Google One tetap aktif.

**Affects:** `worker/src/drive.js`, `worker/src/store.js`, `worker/wrangler.toml`,
README §Setup. `instruksi.md` §2 dan `spesifikasi-teknis-arsip.md` §1–2 kini
menyebut service account & Drive bendahara — **belum diperbarui** atas permintaan
user (revisi dokumen ditunda).

**Reversible:** ya, tapi memindahkan arsip antar-akun Google itu merepotkan.

**Status:** confirmed

---
