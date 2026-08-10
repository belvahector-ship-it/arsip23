# Instruksi Proyek: Arsip23 — Produk Arsip Dokumentasi Mandiri (domain sendiri, terhubung dari kasmenoreh.my.id)

## 1. Latar Belakang & Tujuan

**kasmenoreh.my.id** adalah portal transparansi kas RT/RW yang menampilkan laporan keuangan secara terbuka kepada warga — mencakup **pemasukan** (iuran warga, sumbangan, bantuan dana operasional dari Pemkot Semarang, dll) maupun **pengeluaran** (belanja kegiatan, operasional, dsb).

Modul arsip yang semula direncanakan sebagai bagian dari kasmenoreh.my.id, setelah dipertimbangkan lebih lanjut, **dikembangkan sebagai produk mandiri berdomain sendiri** (rencana nama: **Arsip23**, domain seperti `arsip23.web.id`, dibeli terpisah), bukan subdomain dari kasmenoreh.my.id. Alasannya: produk ini dirancang agar bisa dipakai ulang di konteks lain di luar RT/RW — misalnya untuk proyek kolega di kantor yang butuh "tampilan Drive sendiri" untuk timnya, tanpa terikat identitas kasmenoreh. kasmenoreh.my.id tetap **terhubung** ke Arsip23 sebagai salah satu "pengguna"/klien-nya (lewat tautan navigasi keluar), bukan bagian struktural dari situsnya.

Sebagai **bendahara**, pengelola perlu bukti fisik pendukung dari berbagai transaksi (struk/nota, foto barang) yang saat ini kemungkinan masih tercecer/manual. Namun, kebutuhan proyek ini **tidak terbatas pada bukti transaksi saja** — modul ini dimaksudkan sebagai **arsip dokumentasi umum kegiatan RT/RW**, di mana **siapapun warga yang punya dokumentasi** (foto/file apapun) dari kegiatan lingkungan — misalnya senam bersama, kerja bakti, acara warga, rapat, dll — dapat mengunggahnya secara mandiri, bukan hanya untuk keperluan pelaporan kas.

Motivasi utama:
- Warga/panitia dapat mengunggah dokumentasi apapun secara mandiri, kapan saja, tanpa harus kirim manual ke bendahara/pengurus.
- Saat waktunya pelaporan (ke Pemkot Semarang maupun laporan publik ke warga), bendahara tinggal mengambil bukti/dokumentasi langsung dari Drive — sudah terkumpul dan tertata.
- Setiap warga punya **ruang kerja sendiri** yang bebas mereka atur (bukan sekadar form upload sekali kirim) — bisa membuat folder, mengatur, menghapus punya sendiri — untuk **jenis dokumentasi apapun** (bukti transaksi, foto kegiatan, dokumen kegiatan, dll), tidak dibatasi hanya nota.
- Biaya operasional tetap Rp0, dengan memanfaatkan Google Drive milik bendahara sebagai storage pusat (kapasitas besar/tidak terbatas selama masih dalam batas akun Google yang dipakai), serta hosting gratis (GitHub Pages + Cloudflare Workers).

## 2. Konsep Umum

- **Frontend**: halaman web statis berdiri sendiri di **domain sendiri** (rencana `arsip23.web.id`), di-hosting di **GitHub Pages** (custom domain via CNAME), dengan tampilan menyerupai **file explorer sederhana** (mirip mini Google Drive versi sendiri). kasmenoreh.my.id menautkan ke sini lewat tombol/link biasa di navigasinya, bukan iframe atau subdomain.
- **Backend**: **Cloudflare Workers** sebagai perantara aman antara user dan Google Drive.
- **Login wajib**: setiap warga/panitia **wajib login** dengan akun Google pribadi (OAuth2) sebelum bisa mengakses fitur upload/file explorer. Login ini menentukan identitas & ruang folder mana yang boleh diakses/diubah.
- **Penyimpanan file**: seluruh file disimpan di **Google Drive milik bendahara** (owner), menggunakan **service account**. Akun yang dipakai bendahara tidak menampilkan batas kuota (tidak ada indikator "X dari Y GB/TB terpakai" seperti akun Google pada umumnya) — sehingga secara praktis kapasitasnya sangat longgar untuk kebutuhan arsip RT/RW jangka panjang. Meski begitu, dokumen ini tetap menyebutnya sebagai "kapasitas sangat besar/tanpa batas terlihat", bukan klaim mutlak tanpa batas sama sekali — karena layanan cloud umumnya tetap punya batas kewajaran di baliknya meski tidak ditampilkan ke pengguna.
- **Sifat konten arsip — bebas, tidak terbatas kategori**: yang boleh diunggah **tidak dibatasi hanya struk/nota/bukti transaksi**. Termasuk namun tidak terbatas pada: foto/dokumentasi kegiatan RT (senam, kerja bakti, rapat warga, acara peringatan, dll), dokumen pendukung kegiatan, dan bukti transaksi kas.
- **Kebebasan bertindak dalam folder sendiri**: di dalam folder pribadinya, user bebas membuat sub-folder (misal per kegiatan), upload file apapun, menghapus folder/file miliknya sendiri, dan menata ulang sesuai kebutuhan mereka.
- **Sifat arsip: publik untuk dilihat, privat untuk diubah** — karena tujuannya adalah transparansi dan dokumentasi bersama warga (bukan storage pribadi rahasia), maka:
  - **Konten yang diunggah dapat dilihat oleh publik** (selaras dengan semangat transparansi kasmenoreh.my.id) — bukan penyimpanan privat/rahasia.
  - Namun **hak untuk membuat folder baru, mengunggah, mengedit, atau menghapus tetap terbatas hanya untuk pemilik folder tersebut** (isolasi hak akses/modifikasi antar-user tetap berlaku, agar tidak ada yang iseng menghapus punya orang lain).

## 3. Tujuan Teknis

1. Warga/panitia login dengan akun Google pribadi, lalu langsung diarahkan ke folder pribadi mereka di dalam Drive bendahara (dibuatkan otomatis saat pertama kali login jika belum ada).
2. Tampilan menyerupai file explorer: bisa lihat daftar folder/file, buat folder baru, upload file jenis apapun (foto/dokumen), hapus folder/file — aksi ubah/hapus terbatas di ruang milik user tersebut, namun hasil unggahan dapat dilihat publik/pengunjung portal.
3. Backend memastikan **setiap request yang bersifat mengubah data (create folder, upload, hapus)** divalidasi agar target folder/file benar-benar milik user yang sedang login — mencegah user lain iseng menghapus/mengubah punya orang lain. Untuk aksi **melihat/menelusuri arsip**, akses bersifat terbuka (publik), selaras dengan tujuan transparansi.
4. Bendahara (sebagai owner Drive) tetap punya akses penuh ke seluruh folder semua user langsung dari Google Drive aslinya, untuk keperluan pelaporan — tanpa perlu app tambahan di sisi bendahara.
5. Tidak ada credential rahasia (service account key Drive bendahara) yang pernah terekspos ke sisi client/browser.
6. Sistem berjalan dengan biaya Rp0, memanfaatkan kapasitas Drive akun yang dipakai bendahara (tanpa batas kuota yang terlihat) sebagai storage tunggal — tanpa perlu storage berbayar terpisah.

## 4. Ruang Lingkup (Scope)

### Termasuk dalam scope:
- Login wajib via Google OAuth sebelum bisa membuat folder/upload/hapus (melihat arsip bisa bersifat terbuka/publik).
- Pembuatan folder pribadi otomatis per user (saat login pertama kali).
- Tampilan file explorer sederhana: list folder/file, navigasi masuk-keluar folder, cocok untuk berbagai jenis dokumentasi (foto kegiatan, bukti transaksi, dokumen lain).
- Aksi dasar file explorer: buat folder, upload file, hapus folder/file — perubahan hanya bisa dilakukan oleh pemilik folder.
- Validasi kepemilikan di backend pada **setiap operasi yang mengubah data** (create/upload/delete), bukan hanya mengandalkan tampilan frontend.
- Pencatatan mapping user ↔ folder root miliknya (agar backend tahu batas hak ubah tiap user).
- **Peringatan/aturan unggah yang wajib ditampilkan ke user**: larangan mengunggah foto/konten yang melanggar norma kesusilaan dan privasi sesuai ketentuan yang berlaku di Indonesia — karena arsip ini **dapat dilihat publik**, bukan penyimpanan privat/rahasia. Perlu ada semacam persetujuan (checkbox/notice) sebelum user pertama kali mengunggah.

### Di luar scope (untuk versi awal):
- Fitur berbagi/kolaborasi antar-user (user A memberi akses folder ke user B).
- Preview/edit dokumen kompleks di dalam browser (cukup upload/download/hapus, plus preview gambar sederhana bila memungkinkan).
- Approval/moderasi konten sebelum tampil publik (untuk versi awal mengandalkan aturan/etika unggah + tanggung jawab masing-masing user; moderasi bisa ditambahkan kemudian jika diperlukan).
- Integrasi otomatis penuh antara file yang diunggah dengan entri laporan kas publik (pengambilan bukti untuk laporan tetap dilakukan manual oleh bendahara langsung dari Drive).
- Kuota/limit ukuran otomatis per user.
- Rename file/folder (bisa menyusul; awalnya cukup buat & hapus).

## 5. Alur Kerja Sistem (High-Level)

1. Pengunjung dapat melihat/menelusuri arsip dokumentasi secara terbuka (selaras transparansi portal).
2. Warga/panitia yang ingin **mengunggah/mengelola** dokumentasi → **wajib login** dengan akun Google pribadi.
3. Sistem mengecek: apakah user ini sudah punya folder pribadi di Drive bendahara? Jika belum, backend membuatkannya otomatis via service account.
4. User diarahkan ke tampilan file explorer miliknya — bisa langsung membuat folder (misal per kegiatan: "Kerja Bakti Agustus 2026", "Senam Pagi Minggu") dan mengunggah foto/dokumen apapun terkait.
5. Sebelum upload pertama kali, user diminta menyetujui aturan unggah (larangan konten melanggar norma/privasi, dan pemberitahuan bahwa arsip bersifat publik).
6. Setiap aksi ubah data (buat folder, upload, hapus) dikirim dari frontend ke Cloudflare Worker beserta token identitas user; Worker memverifikasi kepemilikan folder target sebelum menjalankan operasi ke Google Drive API. Jika folder yang diminta bukan miliknya → request ditolak.
7. Saat bendahara butuh menyusun laporan, bendahara membuka Google Drive miliknya secara langsung — semua bukti/dokumentasi dari seluruh user sudah tertata rapi per folder user/kegiatan, tinggal diambil.

## 6. Prinsip Keamanan & Etika Konten

- Service account key Google Drive bendahara **hanya boleh disimpan di Cloudflare Workers (server-side)**, tidak pernah di kode frontend/repo publik GitHub.
- **Isolasi hak ubah antar-user adalah prioritas keamanan utama**: siapapun bisa melihat arsip (publik), tapi hanya pemilik folder yang boleh membuat, mengunggah, atau menghapus isi foldernya. Backend adalah baris pertahanan utama untuk validasi ini — tidak boleh hanya mengandalkan pembatasan tampilan di frontend.
- Operasi hapus (delete) sebaiknya diberi konfirmasi tambahan di sisi frontend untuk mengurangi risiko kehapus tidak sengaja oleh pemiliknya sendiri.
- **Catatan penting mengenai konten**: karena seluruh arsip bersifat dapat dilihat publik (bukan private storage), setiap user **dilarang mengunggah foto/konten yang melanggar norma kesusilaan, privasi, atau ketentuan hukum yang berlaku di Indonesia** (termasuk namun tidak terbatas pada: konten mengandung SARA, kekerasan, ketelanjangan/pornografi, atau foto orang lain tanpa izin yang bersifat privat). Aturan ini wajib ditampilkan dengan jelas ke user sebelum mereka mengunggah, dan tanggung jawab konten yang diunggah berada di masing-masing pengunggah.
- Bendahara sebagai owner Drive tetap punya akses penuh melihat/mengelola semua folder dari sisi Drive asli — ini disengaja agar mudah untuk pelaporan dan moderasi jika suatu saat diperlukan (misal menghapus konten yang melanggar aturan).

## 7. Sinkronisasi dengan kasmenoreh.my.id (sebagai salah satu pengguna Arsip23)

Meski kini berdiri sebagai produk mandiri, kasmenoreh.my.id tetap jadi kasus penggunaan pertama dan acuan desainnya. Situs utama kasmenoreh.my.id (lihat `DECISIONS.md` proyek tersebut) dibangun dengan
keputusan arsitektur berikut, yang menjadi acuan agar modul arsip ini terasa satu
kesatuan, bukan tempelan asing:

- **Stack**: HTML + CSS + JavaScript ES modules murni, **tanpa build step, tanpa
  dependency** (bukan React/Vite/framework lain). Modul arsip ini sebaiknya mengikuti
  pola yang sama agar konsisten dan tetap bisa diuji langsung tanpa Node.js.
- **Hosting**: GitHub Pages — sudah selaras dengan rencana modul ini.
- **Bahasa visual "Neo-Brutalist RT"** (menggantikan tema lama "Editorial Ledger"):
  latar putih (`#FFFFFF`)/`surface-alt` (`#F5F5F0`), tinta hitam pekat (`#0A0A0A`)
  untuk teks dan border struktural, aksen biru (`#2148F5`) untuk pos Iuran, kuning
  (`#FFD400`) untuk pos IPAL, merah (`#E8353A`) untuk pos Lelayu/kritis. Sudut tajam
  (radius 0px di kartu/tombol/input), border tebal 2–3px warna tinta penuh, bayangan
  keras ber-offset tanpa blur, interaksi tombol "terangkat saat hover, tertekan saat
  diklik". Font **Archivo 700** untuk judul, **Inter** untuk teks isi, angka pakai
  **JetBrains Mono 500/700 tabular** (mengikuti SPEC.md sebagai acuan resmi — bila
  bertentangan dengan DECISIONS.md, SPEC.md yang diikuti). Basis teks tetap
  **17px**/line-height 1.6/target sentuh 44×44px untuk keterbacaan warga sepuh. Modul
  arsip wajib memakai token CSS yang sama (`tokens.css`) dari situs utama — termasuk
  gaya border tebal, sudut tajam, dan bayangan keras — bukan sistem desain baru,
  dan mendukung mode gelap mengikuti `prefers-color-scheme` seperti situs utama.

**Perbedaan arsitektur yang disengaja (perlu dicatat eksplisit, bukan dianggap
pelanggaran prinsip situs utama):**

Situs utama sengaja dibangun **statis tanpa backend dan tanpa login sama sekali**
(lihat CP-01, CP-02), karena sifatnya murni baca data publik dari Google Spreadsheet —
tidak ada operasi tulis, sehingga tidak ada kredensial rahasia yang perlu disimpan di
mana pun. Modul arsip ini **berbeda kelas kebutuhan**: ia melakukan operasi tulis
(upload, buat folder, hapus) ke Google Drive milik bendahara, yang **mustahil aman**
tanpa lapisan backend (Cloudflare Workers) dan tanpa identitas pengunggah (login
Google) — hal yang tidak sesuai dengan prinsip "statis tanpa backend, tanpa login" di
kasmenoreh.my.id. Karena itu Arsip23 sengaja dijadikan **produk terpisah berdomain
sendiri**, bukan bagian dari kasmenoreh.my.id — supaya prinsip situs utama (murni
statis, tanpa backend, tanpa login) tetap utuh. kasmenoreh.my.id hanya menautkan
keluar ke Arsip23 lewat tombol/link navigasi, sementara lima halaman inti (Beranda,
Laporan Kas, Iuran Warga, Kegiatan, Tentang) tetap murni statis seperti sekarang,
tanpa terpengaruh sama sekali oleh keberadaan Arsip23.

Karena Arsip23 dirancang untuk dipakai ulang di luar konteks RT/RW (misalnya proyek
kolega kantor), pengaturan **"publik untuk dilihat"** yang jadi default di §2 adalah
pilihan khusus untuk kasus pemakaian kasmenoreh.my.id (selaras transparansi kas RT).
Bila nanti dipakai pihak lain yang datanya tidak untuk konsumsi publik, visibilitas
ini perlu bisa diatur per pemilik ruang kerja (owner Drive) — dicatat sebagai pengembangan lanjutan, bukan bagian dari scope v1 ini.

## 8. Status Dokumen

Dokumen ini adalah revisi ketiga, meluruskan bahwa:
- Modul ini adalah **arsip dokumentasi umum kegiatan RT/RW**, tidak dibatasi hanya untuk bukti transaksi/nota — mencakup foto kegiatan (senam, kerja bakti, dll) dan dokumentasi lain yang dibagikan siapapun warga.
- Sifat arsip adalah **publik untuk dilihat** (selaras transparansi), namun **hak ubah/hapus tetap privat per folder pemiliknya** — bukan storage privat sepenuhnya, dan bukan pula bebas diedit siapa saja.
- Ditambahkan kebutuhan **notice/aturan unggah** terkait norma & privasi karena sifat publik arsip ini.
- Storage memanfaatkan akun Google Drive bendahara yang tidak menampilkan batas kuota terlihat (secara praktis sangat longgar/"unlimited" untuk skala penggunaan RT/RW), bukan layanan storage berbayar terpisah.

Detail teknis implementasi (struktur folder root per user, skema mapping user↔folder, desain UI file explorer, endpoint API, mekanisme notice persetujuan) akan disusun pada dokumen/tahap terpisah setelah scope ini disepakati.
