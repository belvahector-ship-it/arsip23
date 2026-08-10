# Spesifikasi Teknis — Arsip23 (produk mandiri, domain sendiri)

Dokumen turunan dari `instruksi.md`. Arsip23 adalah produk mandiri berdomain
sendiri (rencana `arsip23.web.id`), dipakai pertama kali oleh kasmenoreh.my.id
(tertaut lewat link navigasi biasa, bukan subdomain/iframe), dan dirancang agar
bisa dipakai ulang untuk konteks lain (mis. proyek tim/kantor) di kemudian hari.
Untuk kasmenoreh.my.id, desain/stack mengikuti SPEC.md situs itu sebagai acuan;
bila SPEC.md dan DECISIONS.md bertentangan, SPEC.md yang berlaku.

---

## 1. Batasan

| | |
|---|---|
| Hosting frontend | GitHub Pages, custom domain sendiri (rencana `arsip23.web.id`, CNAME) |
| Backend | Cloudflare Workers (1 worker, beberapa route) |
| Metadata store | Cloudflare KV |
| File store | Google Drive milik bendahara (service account) |
| Stack frontend | HTML + CSS + JS ES modules, tanpa build, tanpa dependency |
| Desain | Token `tokens.css` situs utama — Neo-Brutalist RT (lihat SPEC.md §5) |
| Auth | Google OAuth2 (Sign In With Google), hanya untuk aksi tulis |

## 2. Struktur folder di Google Drive

Karena Arsip23 dirancang dipakai ulang lintas proyek (kasmenoreh, dan berpotensi
proyek lain seperti tim kantor), ditambahkan satu lapisan **workspace** di atas
folder per-user, supaya data kasmenoreh dan proyek lain tidak pernah tercampur:

```
[Root Arsip23] (folder tunggal di Drive owner, ID-nya disimpan sebagai secret
                di Worker: DRIVE_ROOT_FOLDER_ID)
  ├── w_kasmenoreh/           ← folder workspace, dibuat manual sekali per proyek
  │     ├── u_<google_sub>/   ← folder root per user, dibuat otomatis oleh
  │     │                        Worker saat user pertama kali login DI
  │     │                        workspace ini
  │     │     ├── <folder buatan user>/
  │     │     │     └── file...
  │     │     └── file langsung di root user (opsional)
  │     └── u_<google_sub_lain>/
  │           └── ...
  └── w_<workspace_lain>/     ← misal proyek kolega kantor, terpisah total
        └── u_.../
```

- Setiap workspace punya **kode workspace** pendek (mis. `kasmenoreh`) yang
  dikonfigurasi di frontend (satu baris config, misal `WORKSPACE_ID`) — inilah
  yang membuat satu Worker + satu Drive owner bisa melayani banyak "pelanggan"
  tanpa deploy ulang.
- `<google_sub>` = ID unik akun Google user (`sub` claim dari token OAuth) —
  bukan email, supaya aman kalau user ganti email tapi tetap akun sama.
  Kepemilikan folder **unik per kombinasi** `(workspace, sub)` — user yang sama
  login di workspace berbeda otomatis dapat folder terpisah, tidak nyambung.
- Nama folder user **tidak** memuat nama asli warga secara default (privasi +
  menghindari folder ganda kalau nama sama persis). Nama tampilan (display name)
  disimpan terpisah di KV, dipetakan dari `sub` per workspace.
- Worker **hanya boleh** melakukan operasi Drive di dalam subtree
  `DRIVE_ROOT_FOLDER_ID/w_<workspace>/`— setiap `folderId` yang diminta client
  wajib divalidasi merupakan keturunan folder root milik user yang sedang login
  **di workspace yang sama** (lihat §5).
- Visibilitas publik-untuk-dilihat (§8 `instruksi.md`) adalah pengaturan default
  workspace `kasmenoreh`; workspace lain bisa diatur privat sepenuhnya —
  ditandai sebagai pengembangan lanjutan, bukan scope v1.

## 3. Skema Cloudflare KV

Satu namespace KV, `ARSIP_KV`, dengan beberapa jenis key:

| Key pattern | Value (JSON) | Fungsi |
|---|---|---|
| `workspace:<ws>` | `{ driveFolderId, visibility: 'public'\|'private', createdAt }` | Mapping kode workspace → folder `w_<ws>` di Drive, plus pengaturan visibilitasnya. |
| `user:<ws>:<sub>` | `{ driveFolderId, displayName, email, createdAt }` | Mapping user **dalam satu workspace** → folder root miliknya. Sumber kebenaran utama untuk validasi kepemilikan. |
| `folder:<folderId>` | `{ workspace, ownerSub, parentFolderId, name, createdAt }` | Setiap folder yang dibuat user (termasuk root-nya) dicatat di sini, supaya Worker bisa menelusuri "folder ini turunan siapa, di workspace mana" tanpa memanggil Drive API berulang kali. |
| `session:<token>` *(opsional, jika tidak pakai verifikasi JWT langsung)* | `{ sub, exp }` | Hanya diperlukan bila memilih pola session token sendiri, bukan verifikasi Google ID token per-request. Direkomendasikan: **verifikasi Google ID token langsung di tiap request**, supaya tidak perlu KV session sama sekali. |

Catatan penting: KV bersifat *eventually consistent* — jangan andalkan KV untuk
kunci penguncian race-condition (misal dua request "buat folder root" bersamaan
untuk user baru yang sama). Mitigasi di §6.

## 4. Alur autentikasi

1. Frontend memuat **Google Identity Services** (`accounts.google.com/gsi/client`),
   tombol "Login dengan Google".
2. Setelah login, frontend mendapat **ID token (JWT)** dari Google.
3. **Setiap** request ke Worker yang bersifat mengubah data (buat folder, upload,
   hapus, list isi folder milik sendiri) menyertakan ID token ini di header
   `Authorization: Bearer <id_token>`.
4. Worker memverifikasi ID token dengan endpoint publik Google
   (`https://oauth2.googleapis.com/tokeninfo?id_token=...` atau verifikasi JWKS
   lokal) — memastikan `aud` cocok dengan Client ID proyek, dan token belum
   kedaluwarsa.
5. Dari token yang valid, Worker ambil `sub` → cari `user:<sub>` di KV. Jika belum
   ada, buat folder root baru di Drive + simpan mapping (lihat §6, race condition).
6. **Melihat/menelusuri arsip** (list folder & file, publik) **tidak wajib** bawa
   token — sesuai keputusan "publik untuk dilihat, privat untuk diubah". Endpoint
   baca memakai Drive API dengan cakupan read-only ke seluruh subtree root arsip.

## 5. Validasi kepemilikan (inti keamanan)

Untuk **setiap** operasi tulis (`createFolder`, `uploadFile`, `deleteFolder`,
`deleteFile`, `renameFolder` bila ditambahkan nanti), Worker wajib:

1. Verifikasi ID token → dapatkan `sub`.
2. Ambil `user:<sub>` dari KV → dapatkan `driveFolderId` (folder root user ini).
3. Ambil `targetFolderId` dari body request (folder tempat operasi dilakukan, atau
   folder/file yang mau dihapus).
4. Telusuri `folder:<targetFolderId>` di KV secara rekursif lewat `parentFolderId`
   sampai bertemu folder root — **hanya lanjutkan operasi jika folder root yang
   ditemukan == `driveFolderId` milik `sub` ini**. Jika tidak ketemu / berbeda →
   tolak dengan `403`.
5. Baru jalankan operasi ke Google Drive API.

Ini mencegah user A menebak/mengirim `folderId` milik user B secara langsung ke
endpoint hapus — validasi selalu di server, tidak pernah percaya folder ID yang
dikirim client begitu saja.

## 6. Penanganan race condition (folder root ganda)

KV tidak atomic untuk read-then-write. Mitigasi murah tanpa perlu D1/database
transaksional:

- Gunakan **Drive API sebagai penentu akhir**: sebelum membuat folder root baru,
  Worker cek dulu apakah folder bernama `u_<sub>` sudah ada langsung di
  `DRIVE_ROOT_FOLDER_ID` (query `files.list` dengan `q=name='u_<sub>' and
  '<root>' in parents`). Kalau sudah ada (kemungkinan dibuat oleh request paralel
  sepersekian detik sebelumnya), pakai yang itu, jangan buat baru — lalu perbarui
  KV. Drive API sendiri jadi sumber kebenaran ganda-cek, KV hanya cache/index.

## 7. Endpoint Worker (ringkas)

Semua endpoint menerima parameter/header `X-Workspace: <ws>` (atau query
`?workspace=`) supaya satu Worker bisa melayani banyak workspace sekaligus.

| Method & Path | Auth | Fungsi |
|---|---|---|
| `GET /api/browse?workspace=&folderId=` | tidak wajib jika workspace publik | List isi folder (nama, tipe, ukuran, thumbnail bila gambar). Default `folderId` = root workspace. Jika workspace bertanda `private`, tetap wajib token dan hanya boleh browse folder milik sendiri. |
| `POST /api/login` | ID token + `workspace` | Cek/buat folder root user di workspace ini, kembalikan info folder root + display name. |
| `POST /api/folder` | ID token | Body: `{ workspace, parentFolderId, name }`. Buat sub-folder baru di dalam ruang user. |
| `POST /api/upload` | ID token | Multipart: `{ workspace, parentFolderId, file }`. Upload file ke folder milik user. |
| `DELETE /api/folder/:id` | ID token | Hapus folder (dan isinya) milik user. |
| `DELETE /api/file/:id` | ID token | Hapus file milik user. |

Semua path menulis divalidasi lewat alur §5 sebelum menyentuh Drive API.

## 8. Desain UI (mengikuti tokens.css Neo-Brutalist RT)

- **Layout**: mirip file explorer 1 kolom di HP (breakpoint sama seperti situs
  utama: 480/720/960/1200/1440), grid kartu folder/file dengan border 2px tinta,
  bayangan keras offset, sudut tajam.
- **Kartu folder**: ikon folder + nama + jumlah item. Tekan → masuk. Tombol titik
  tiga (⋮) untuk hapus (dengan dialog konfirmasi, sesuai prinsip keamanan di
  `instruksi.md` §6).
- **Kartu file (gambar)**: thumbnail persegi, nama file terpotong, ukuran file
  kecil di bawah dalam JetBrains Mono tabular.
- **Breadcrumb** di atas grid: `Arsip / u_xxxx (nama saya) / Kerja Bakti Agustus`.
- **Tombol "+ Folder Baru"** dan **"+ Upload"**: memakai gaya tombol brutalist
  situs utama (terangkat saat hover, tertekan saat diklik), hanya tampil ketika
  user login dan sedang berada di dalam ruang miliknya sendiri (disembunyikan
  saat menjelajah folder orang lain).
- **Notice awal sebelum upload pertama**: modal/pita peringatan berisi aturan
  norma & privasi (lihat `instruksi.md` §6), wajib ditekan "Saya Mengerti" —
  disimpan statusnya di KV (`user:<sub>.acceptedNoticeAt`) supaya tidak muncul
  berulang.
- **Mode gelap**: ikut `prefers-color-scheme`, token warna sama seperti situs
  utama.

## 9. Yang belum diputuskan (perlu keputusan lanjutan)

- Nama Client ID / setup OAuth consent screen (siapa yang punya akses ke Google
  Cloud Console proyek ini).
- Batas ukuran file per upload (Drive API mendukung besar, tapi Worker punya
  limit body request — perlu ditentukan, misal maks 20MB per file, upload
  langsung dari browser ke Drive lewat resumable upload URL bila perlu lebih besar).
- Apakah preview gambar ditampilkan langsung (thumbnail dari Drive) atau perlu
  proxy lewat Worker (soal privasi URL Drive langsung vs kontrol akses).
- Cara menambah workspace baru (misal untuk proyek kolega kantor nanti): apakah
  cukup entri manual di KV oleh owner, atau perlu halaman admin kecil khusus
  owner. Untuk v1 (hanya kasmenoreh), cukup manual — belum perlu dibangun.

## 10. Status Dokumen

Draft pertama detail teknis. Menunggu review sebelum implementasi kode dimulai.
