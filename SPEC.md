# Spec — Arsip23

Dokumen ini adalah **spesifikasi kerja** yang diturunkan dari `instruksi.md`
(kenapa produk ini ada) dan `spesifikasi-teknis-arsip.md` (arsitektur kasarnya).
Kalau ketiganya bertentangan, **SPEC.md yang berlaku** — dua dokumen lain adalah
latar belakang, ini adalah kontraknya.

Setiap keputusan di sini punya nomor CP di `DECISIONS.md`.

---

## 1. Ringkasan

**Apa ini:** arsip dokumentasi berbasis web dengan tampilan file explorer, di mana
setiap warga punya ruang kerjanya sendiri, dan seluruh berkas benar-benar
tersimpan di Google Drive milik pengelola.

**Siapa yang pakai:**
- *Primer* — warga/panitia RT yang punya dokumentasi kegiatan (foto kerja bakti,
  senam, rapat, nota belanja) dan mau mengunggahnya sendiri.
- *Sekunder* — pengunjung/warga yang cuma mau melihat-lihat arsip, tanpa login.
- *Owner* — bendahara, yang tidak memakai aplikasi ini sama sekali untuk
  mengambil berkas; ia membuka Google Drive-nya langsung.

**Pekerjaan inti:** warga bisa mengunggah dokumentasi ke ruangnya sendiri tanpa
minta tolong siapa pun, dan berkas itu langsung mendarat rapi di Drive bendahara.
Kalau ini rusak, produknya tidak ada gunanya.

**Di luar scope v1** (disebut supaya tidak terasa diam-diam dibuang):
berbagi folder antar-user (memberi hak UBAH ke orang lain) · preview/edit dokumen
kompleks di browser · moderasi konten sebelum tampil · integrasi otomatis ke
laporan kas · kuota per user · halaman admin untuk menambah workspace.

*Rename dan bagikan-tautan sudah masuk v1 — lihat DECISIONS.md CP-25.*

## 2. Batasan

| | |
|---|---|
| Hosting frontend | GitHub Pages (branch `main`, folder root) |
| Domain | `arsip23.web.id` — **belum dibeli**. Sementara pakai `<user>.github.io/arsip23` |
| Backend | Cloudflare Workers (1 worker, beberapa route) |
| Metadata store | Cloudflare KV, namespace `ARSIP_KV` |
| File store | My Drive `belvahector69@gmail.com`, folder `Arsip23` dibuat Worker — lihat CP-17 |
| Stack frontend | HTML + CSS + JS ES modules. **Tanpa build step, tanpa dependency, tanpa framework** |
| Stack backend | JavaScript modul Worker (`export default { fetch }`), tanpa framework |
| Desain | tokens.css tema BRUTAL, disalin dari kasmenoreh.my.id (CP-03) |
| Auth | Google Identity Services (ID token). **Wajib untuk membuka situs** sejak CP-24 |
| Mode gelap | **Tidak ada** (CP-06) |
| Bahasa UI | Indonesia |
| Biaya | Rp0 — semua di tier gratis |

## 3. Halaman

Aplikasi ini praktis **satu halaman**. Menambah halaman kedua hanya akan
menduplikasi header, auth, dan state tanpa memberi apa pun ke user.

| Halaman | Route | Auth | Fungsi | Elemen kunci |
|---|---|---|---|---|
| Arsip | `/` | **login wajib** (CP-24) | Seluruh aplikasi: telusuri, unggah, kelola | gerbang + header + breadcrumb + toolbar + grid + modal |
| 404 | `/404.html` | publik | Fallback GitHub Pages | balik ke `/` |

State di dalam satu halaman itu dilacak lewat **hash URL**, bukan halaman baru:
`#/f/<folderId>` — supaya tombol Back peramban bekerja dan folder bisa ditautkan.

**Halaman hero:** halaman Arsip itu sendiri. Seluruh perhatian desain ke sana.

## 4. Alur pengguna utama

1. Pengunjung membuka situs → **gerbang terkunci** muncul: aturan unggah, satu
   kotak centang persetujuan, dan tombol masuk Google. Tidak ada jalan lain
   masuk (CP-24 — ini membalik rencana awal "publik untuk dilihat").
2. Ia mencentang persetujuan → tombol Google aktif → memilih akun.
3. Backend mengecek `user:<ws>:<sub>` di KV → belum ada → dibuatkan folder
   `u_<sub>` di dalam `w_kasmenoreh`, dicatat di KV. Persetujuan aturan langsung
   disimpan (`acceptedNoticeAt`) karena syaratnya sudah dipenuhi di gerbang.
4. Gerbang tertutup, ia mendarat di ruangnya sendiri; toolbar **"+ Folder Baru"**
   dan **"+ Unggah"** muncul.
5. Ia buat folder kegiatan, pilih berkas, unggah; progress per berkas.
6. Di tiap kartu miliknya ada tiga aksi: **bagikan tautan**, **ganti nama**,
   **hapus** (CP-25). Bagikan memasang izin Drive "siapa pun yang punya tautan
   bisa melihat", lalu menampilkan tautannya untuk disalin.
7. Setelah refresh, sesinya pulih dari sessionStorage — gerbang tidak muncul lagi
   dan akunnya tetap sama (CP-21).
8. Bendahara — tanpa menyentuh aplikasi ini — membuka Drive-nya dan mengambil
   berkas yang sudah tertata per warga per kegiatan.

## 5. Design tokens

Diambil utuh dari `assets/css/tokens.css` (tema BRUTAL). **Jangan tulis hex mentah
di berkas lain.** Nilai di bawah dikutip di sini hanya supaya spec ini bisa dibaca
tanpa membuka CSS.

```
Aksen        --brutal-red #FF0000 · --brutal-blue #0000FF · --brutal-yellow #FFFF00
Permukaan    --paper #FFFFFF · --surface-alt #F5F5F5 · --surface-sunk #EBEBEB
Tinta        --ink #000000 · --ink-2 #333333 · --ink-3 #666666
Garis        semua border hitam penuh, tanpa kecuali
Font         judul Archivo 600–800 · teks & angka Manrope 400–800 (+ tabular-nums)
Basis        17px, line-height 1.65
Skala        --fs-2xs .8 → --fs-hero clamp(1.9rem … 6rem)
Spasi        4 8 12 16 24 32 48 64 96 128 (--sp-1 … --sp-10)
Radius       0px DI SEMUA TEMPAT, termasuk --r-pill
Border       --bw-1 2px (pemisah rapat) · --bw-2/--bw-3 3px (standar)
Bayangan     keras ber-offset tanpa blur: 4/6/8px + pasangan "-press"-nya
Gerak        --t-press 100ms · --t-fast 120ms · --t-base 180ms
Target sentuh --touch 48px
Breakpoint   560 · 720 · 960 · 1200 (ikut base.css yang sudah ada)
```

**Arah:** brutalis — tegas, datar, kontras tinggi. **Mode gelap: tidak.**

Interaksi khas yang wajib dipertahankan: elemen bergeser **persis sejauh selisih
offset bayangannya** saat ditekan, sehingga sudut kanan-bawah bayangan tidak
pernah bergerak. Itu tanda tangan temanya; kalau hilang, hasilnya terlihat seperti
brutalisme tempelan.

Warna sebagai kode arti di aplikasi ini:
- **biru** — folder, tautan, fokus
- **kuning** — tombol aksi utama (Unggah), selalu isian dengan teks hitam
- **merah** — hapus, galat, dan judul gerbang aturan

## 6. Wireframe

**Halaman Arsip — lebar ≥960px**
```
[gerbang terkunci: muncul lebih dulu kalau belum masuk — aturan + centang + Google]
[header: logo ARSIP23 kiri · nama workspace · avatar + Ruang Saya + Keluar · sticky]
[breadcrumb: Arsip / Belva Fahrozi / Kerja Bakti Agustus   ← border bawah 3px]
[toolbar: kiri "12 folder · 34 berkas" | kanan (+ Folder Baru) (+ Unggah)]
        ↑ dua tombol kanan HANYA tampil di dalam ruang milik sendiri
[grid 4 kolom: kartu folder dulu, baru kartu berkas]
[empty state: kotak putus-putus, ikon, kalimat, dan satu tombol aksi]
[footer: tautan balik ke kasmenoreh.my.id · garis atas 3px]
```

**≤720px** → grid 2 kolom, toolbar menumpuk, tombol jadi lebar penuh.
**≤560px** → grid 1 kolom, breadcrumb dipotong jadi `… / Kerja Bakti Agustus`.

**Kartu folder**
```
┌─ border 3px, bayangan 4px ───┐
│ [ikon folder biru]   🔗 ✏ 🗑 │   tiga aksi, hanya untuk pemilik
│ Kerja Bakti Agustus          │
│ 8 item                       │   ← Manrope tabular
└──────────────────────────────┘
```

**Kartu berkas (gambar)** — thumbnail persegi 1:1 di atas, nama terpotong satu
baris, ukuran berkas kecil di bawah. **Berkas non-gambar** — blok warna dengan
ekstensi besar (`PDF`, `DOCX`) menggantikan thumbnail.

**Gerbang aturan** — kotak tengah, border 3px, bayangan 8px, judul merah, daftar
larangan, satu checkbox, lalu tombol Google. **Tidak punya tombol tutup sama
sekali** dan tidak bisa ditutup dengan Esc maupun klik luar (tiga lapis kunci,
lihat CP-24).

## 7. Model data

Tidak ada database relasional. Sumber kebenaran berkas adalah **Google Drive**;
Cloudflare KV hanya index supaya validasi kepemilikan tidak perlu memanggil Drive
berkali-kali.

### Struktur di Drive

```
[Drive Bersama "Arsip23"]              ← ID = secret DRIVE_ROOT_FOLDER_ID
  └── w_kasmenoreh/                    ← workspace, dibuat manual sekali
        ├── u_<google_sub>/            ← root user, dibuat otomatis saat login pertama
        │     └── <folder buatan user>/
        │           └── berkas…
        └── u_<google_sub_lain>/
```

`<google_sub>` = klaim `sub` dari ID token Google — bukan email, supaya user yang
ganti email tetap dikenali sebagai orang yang sama.

### KV — namespace `ARSIP_KV`

| Key | Value (JSON) | Fungsi |
|---|---|---|
| `workspace:<ws>` | `{ driveFolderId, visibility, title, createdAt }` | Kode workspace → folder `w_<ws>` |
| `user:<ws>:<sub>` | `{ driveFolderId, displayName, email, acceptedNoticeAt, createdAt }` | User dalam satu workspace → folder root-nya. **Sumber kebenaran validasi kepemilikan.** |
| `folder:<folderId>` | `{ workspace, ownerSub, parentFolderId, name, depth, createdAt }` | Tiap folder yang dibuat user, supaya asal-usulnya bisa ditelusuri tanpa Drive API |

`depth` disimpan supaya penelusuran ke atas punya batas keras (maks 12 tingkat) —
tanpa itu, entri KV yang rusak/melingkar bisa membuat Worker berputar selamanya.

Kepemilikan **unik per kombinasi `(workspace, sub)`** — orang yang sama di
workspace berbeda dapat folder terpisah dan tidak nyambung.

## 8. Kontrak API

**Dibekukan begitu pembangunan dimulai.** Perubahan lewat pemilik proyek, dicatat
sebagai CP baru.

Base URL: `https://arsip23-api.<akun>.workers.dev` (nanti `api.arsip23.web.id`).
Semua endpoint menerima workspace lewat header `X-Workspace: <ws>` atau query
`?workspace=<ws>`.
Aksi tulis menyertakan `Authorization: Bearer <google_id_token>`.

| Method | Path | Auth | Request | Response | Kode |
|---|---|---|---|---|---|
| GET | `/api/browse` | – (publik) | `?workspace&folderId&pageToken` | `{ folder, breadcrumb[], folders[], files[], nextPageToken }` | 200, 400, 403, 404 |
| POST | `/api/login` | ID token | `{ workspace }` | `{ user: {sub,displayName,email,rootFolderId,acceptedNoticeAt} }` | 200, 401, 403 |
| POST | `/api/accept-notice` | ID token | `{ workspace }` | `{ acceptedNoticeAt }` | 200, 401 |
| POST | `/api/folder` | ID token | `{ workspace, parentFolderId, name }` | `{ folder }` | 201, 401, 403, 409, 422 |
| POST | `/api/upload` | ID token | multipart: `workspace, parentFolderId, file` | `{ file }` | 201, 401, 403, 413, 422 |
| POST | `/api/rename` | ID token | `{ workspace, id, name }` | `{ item }` | 200, 401, 403, 409, 422 |
| POST | `/api/share` | ID token | `{ workspace, id }` | `{ id, name, shareUrl }` | 200, 401, 403, 404 |
| DELETE | `/api/folder/:id` | ID token | `?workspace` | `{ deleted: true }` | 200, 401, 403, 404 |
| DELETE | `/api/file/:id` | ID token | `?workspace` | `{ deleted: true }` | 200, 401, 403, 404 |

**Amplop respons** — seragam, supaya frontend punya satu jalur penanganan galat:

```json
{ "success": true,  "data": { }, "meta": { } }
{ "success": false, "error": { "code": "FORBIDDEN", "message": "Folder ini bukan milik Anda." } }
```

Kode galat yang dipakai: `UNAUTHENTICATED` · `FORBIDDEN` · `NOT_FOUND` ·
`VALIDATION` · `TOO_LARGE` · `CONFLICT` · `UPSTREAM` · `INTERNAL`.
`message` selalu berbahasa Indonesia dan **layak ditampilkan langsung ke user** —
frontend tidak menerjemahkan kode galat menjadi kalimat sendiri.

### Bentuk objek

```jsonc
// folder
{ "id": "1AbC…", "name": "Kerja Bakti Agustus", "itemCount": 8,
  "ownerSub": "1179…", "ownerName": "Belva Fahrozi",
  "isMine": true, "createdAt": "2026-08-11T04:00:00Z" }

// file
{ "id": "1XyZ…", "name": "IMG_2201.jpg", "mimeType": "image/jpeg",
  "size": 2418122, "thumbnailUrl": "https://…", "isImage": true,
  "isMine": true, "createdAt": "2026-08-11T04:02:00Z" }
```

`isMine` dihitung **di server** dari token yang dikirim, bukan ditebak frontend —
frontend hanya memakainya untuk menyembunyikan tombol. Server tetap memvalidasi
ulang setiap aksi tulis (§9); menyembunyikan tombol bukan pengamanan.

## 9. Validasi kepemilikan — inti keamanannya

Untuk **setiap** operasi tulis, tanpa kecuali, Worker menjalankan urutan ini
sebelum menyentuh Drive API:

1. Verifikasi ID token ke JWKS Google (`https://www.googleapis.com/oauth2/v3/certs`,
   di-cache). Cek `aud` == Client ID, `iss` == `accounts.google.com`, `exp` belum
   lewat. → dapat `sub`.
2. Ambil `user:<ws>:<sub>` dari KV → dapat `rootFolderId`. Kalau tidak ada → 403.
3. Ambil `targetId` dari request (folder induk, atau folder/berkas yang dihapus).
4. Telusuri `folder:<targetId>` ke atas lewat `parentFolderId`, maksimal 12
   lompatan, sampai ketemu folder root. **Lanjut hanya jika root yang ditemukan
   == `rootFolderId` milik `sub` ini.** Selain itu → 403.
5. Baru jalankan operasi ke Drive.

Ini mencegah user A menebak folder ID milik user B lalu mengirimnya ke endpoint
hapus. Folder ID dari client **tidak pernah dipercaya begitu saja**.

Untuk hapus berkas (bukan folder), langkah 4 dijalankan atas **folder induk**
berkas itu, yang diambil dari Drive API (`files.get?fields=parents`), bukan dari
klaim client.

## 10. Race condition — folder root ganda

KV tidak atomic untuk read-then-write. Dua tab yang login berbarengan untuk user
baru yang sama bisa sama-sama membaca "belum ada" lalu sama-sama membuat folder.

Mitigasi tanpa perlu D1: **Drive jadi penentu akhir.** Sebelum membuat `u_<sub>`,
Worker menanyakan Drive `files.list?q=name='u_<sub>' and '<w_ws>' in parents and
trashed=false`. Kalau sudah ada, pakai yang itu dan perbarui KV — jangan buat
baru. KV diperlakukan sebagai cache/index, bukan sumber kebenaran penciptaan.

## 11. Secret Worker

Tidak satu pun dari ini boleh masuk ke repo atau ke kode frontend.

| Nama | Isi |
|---|---|
| `GOOGLE_SA_EMAIL` | email service account |
| `GOOGLE_SA_PRIVATE_KEY` | private key PEM service account |
| `DRIVE_ROOT_FOLDER_ID` | ID Drive Bersama / folder root Arsip23 |
| `GOOGLE_CLIENT_ID` | OAuth Client ID (juga dipakai frontend — ini memang publik) |

Worker menukar JWT service account menjadi access token Drive lewat
`https://oauth2.googleapis.com/token`, dan meng-cache token itu di memori sampai
mendekati `exp`.

## 12. Asumsi

Hal-hal yang saya putuskan sendiri karena belum ditanyakan/dijawab. Ini daftar
yang paling mungkin Anda koreksi, jadi sengaja ditaruh terlihat.

- Workspace v1 hanya satu: `kasmenoreh`. Ditulis di satu baris config frontend. → CP-02
- Sistem desain disalin, bukan ditautkan lintas domain. → CP-03
- Tanpa mode gelap, ikut situs induk. → CP-06
- Berkas disimpan di **Drive Bersama**, bukan My Drive, karena service account
  tidak punya kuota penyimpanan sendiri. → CP-08
- Batas ukuran unggah **20 MB per berkas**, dijaga di frontend *dan* Worker. → CP-09
- Thumbnail memakai URL dari Drive API langsung, tanpa proxy Worker. → CP-10
- Nama tampilan diambil dari klaim `name` di ID token Google, tanpa halaman profil.
- Tanpa rate limit di v1 — dicatat sebagai debt, bukan diabaikan diam-diam.

## 13. Serah terima

- [ ] Kode jalan dari clone bersih mengikuti README
- [ ] README: setup, env var, perintah, cara bikin workspace baru
- [ ] SPEC.md, DECISIONS.md terkini
- [ ] Checklist QA lewat, keterbatasan yang diketahui ditulis apa adanya
