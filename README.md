# Arsip23

Arsip dokumentasi berbasis web dengan tampilan file explorer. Setiap warga punya
ruangnya sendiri; berkasnya benar-benar tersimpan di Google Drive pengelola.
Bisa dilihat siapa saja, hanya bisa diubah pemiliknya.

Dipakai pertama kali oleh **kasmenoreh.my.id**, tapi dirancang bisa dipakai ulang
untuk proyek lain lewat satu baris konfigurasi.

- **Kenapa produk ini ada** → [`instruksi.md`](instruksi.md)
- **Kontrak teknisnya** → [`SPEC.md`](SPEC.md) ← ini yang berlaku kalau ada beda
- **Kenapa dibangun begini** → [`DECISIONS.md`](DECISIONS.md)

---

## Bentuknya

```
arsip23/
├── index.html            Seluruh aplikasi (satu halaman, routing lewat #hash)
├── 404.html
├── assets/
│   ├── css/  tokens.css · base.css   ← disalin dari kasmenoreh.my.id, jangan diubah
│   │         app.css                 ← komponen khas Arsip23
│   ├── font/ archivo · manrope (variabel, subset latin)
│   └── js/   config.js · api.js · auth.js · ui.js · app.js
└── worker/
    ├── wrangler.toml
    └── src/  index.js · auth.js · drive.js · store.js · http.js
```

Frontend **tanpa build step dan tanpa dependency** — ES modules murni, sama
seperti situs induknya. Tidak ada `npm install` untuk menjalankannya.

---

## Menjalankan secara lokal

Butuh dua proses: satu menyajikan berkas statis, satu menjalankan Worker.

**1 — Frontend** (dari folder repo):

```bash
npx --yes serve -l 8788 .
```

**2 — Worker** (dari folder `worker/`):

```bash
npx wrangler dev --port 8787
```

**3 — Arahkan frontend ke Worker lokal.** Buka `http://localhost:8788`, lalu di
konsol peramban:

```js
localStorage.setItem('arsip23:apiBase', 'http://127.0.0.1:8787'); location.reload();
```

Cara ini dipilih supaya alamat lokal tidak pernah tidak sengaja ter-commit ke
`config.js`. Untuk mengembalikannya: `localStorage.removeItem('arsip23:apiBase')`.

Untuk `wrangler dev`, secret dibaca dari `worker/.dev.vars` (sudah masuk
`.gitignore`):

```
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_SA_EMAIL=arsip23@proyek.iam.gserviceaccount.com
GOOGLE_SA_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----\n"
DRIVE_ROOT_FOLDER_ID=0AB...
```

---

## Setup dari nol

Empat bagian. Urutannya penting — Cloudflare butuh nilai dari Google.

### 1 · Google Drive

1. Masuk ke Drive dengan akun pengelola (`belvafahrozi@unw.ac.id`).
2. Buat **Drive Bersama** (*Shared Drive*) bernama `Arsip23`.
   **Bukan folder biasa di My Drive.** Ini bukan preferensi — service account
   tidak punya kuota penyimpanan sendiri, jadi unggahan ke My Drive akan ditolak
   Google dengan galat kuota begitu berkas pertama dikirim. Penjelasan panjangnya
   ada di `DECISIONS.md` CP-08.
3. Salin **ID Drive Bersama** dari URL-nya:
   `https://drive.google.com/drive/folders/`**`0AB...`** ← bagian ini.

### 2 · Google Cloud Console

Di [console.cloud.google.com](https://console.cloud.google.com), dengan akun yang
sama:

1. Buat project baru, mis. `arsip23`.
2. **APIs & Services → Library** → aktifkan **Google Drive API**.
3. **APIs & Services → OAuth consent screen**
   - User type: **External**, publishing status **In production**
     (kalau dibiarkan *Testing*, hanya akun yang didaftarkan manual yang bisa
     masuk — dan warga akan melihat penolakan tanpa penjelasan).
   - Scope cukup `openid`, `email`, `profile`. Aplikasi ini **tidak** meminta
     akses ke Drive pribadi warga sama sekali.
4. **Credentials → Create credentials → OAuth client ID**
   - Type: **Web application**
   - *Authorized JavaScript origins*: `http://localhost:8788`,
     `https://<user>.github.io`, dan nanti `https://arsip23.web.id`
   - Simpan **Client ID**-nya.
5. **Credentials → Create credentials → Service account**
   - Beri nama `arsip23-worker`. Tidak perlu role project apa pun.
   - Buka service account itu → **Keys → Add key → JSON** → unduh.
   - Dari JSON itu Anda butuh dua nilai: `client_email` dan `private_key`.
   - **Jangan taruh berkas JSON ini di dalam repo.** `.gitignore` sudah menjaganya,
     tapi jaring pengaman bukan alasan untuk menaruhnya di sana.
6. Kembali ke Drive Bersama `Arsip23` → **Kelola anggota** → tambahkan
   `client_email` service account tadi sebagai **Pengelola Konten**
   (*Content Manager*).

### 3 · Cloudflare

```bash
cd worker
npx wrangler login
npx wrangler kv namespace create ARSIP_KV
```

Salin `id` yang dikembalikan perintah terakhir ke `worker/wrangler.toml`
(bagian `[[kv_namespaces]]`, field `id` yang masih kosong).

Lalu pasang keempat secret:

```bash
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_SA_EMAIL
npx wrangler secret put GOOGLE_SA_PRIVATE_KEY
npx wrangler secret put DRIVE_ROOT_FOLDER_ID
```

Untuk `GOOGLE_SA_PRIVATE_KEY`, tempelkan isi `private_key` dari JSON **apa
adanya**, termasuk `-----BEGIN PRIVATE KEY-----` dan urutan `\n`-nya. Worker
sudah menangani `\n` harfiah maupun baris baru sungguhan.

Deploy:

```bash
npx wrangler deploy
```

Catat URL yang muncul (`https://arsip23-api.<akun>.workers.dev`).

### 4 · Frontend

Isi [`assets/js/config.js`](assets/js/config.js):

```js
API_BASE: 'https://arsip23-api.<akun>.workers.dev',
GOOGLE_CLIENT_ID: '<client id dari langkah 2>',
```

Lalu tambahkan asal frontend ke `ALLOWED_ORIGINS` di `worker/wrangler.toml` dan
deploy ulang Worker.

Nyalakan GitHub Pages: **Settings → Pages → Source: Deploy from a branch →
`main` / `(root)`**.

---

## Variabel & secret

| Nama | Tempat | Rahasia? |
|---|---|---|
| `WORKSPACE_ID`, `WORKSPACE_TITLE` | `assets/js/config.js` | tidak |
| `API_BASE` | `assets/js/config.js` | tidak |
| `GOOGLE_CLIENT_ID` | `config.js` **dan** secret Worker | tidak (tapi Worker perlu untuk cek `aud`) |
| `ALLOWED_ORIGINS` | `worker/wrangler.toml` | tidak |
| `GOOGLE_SA_EMAIL` | secret Worker | ya |
| `GOOGLE_SA_PRIVATE_KEY` | secret Worker | **ya — akses tulis penuh ke arsip** |
| `DRIVE_ROOT_FOLDER_ID` | secret Worker | ya (bukan kunci, tapi tak perlu diumbar) |

---

## Memakai Arsip23 untuk proyek lain

Ini alasan Arsip23 dipisah dari kasmenoreh.my.id sejak awal.

1. Salin repo ini.
2. Ubah `WORKSPACE_ID` dan `WORKSPACE_TITLE` di `assets/js/config.js`.
3. Tambahkan domain barunya ke `ALLOWED_ORIGINS` dan ke *Authorized JavaScript
   origins* di Google Cloud Console.

Tidak perlu Worker baru, Drive baru, atau deploy ulang backend. Worker membuat
folder `w_<workspace>` sendiri saat kode workspace baru pertama kali dipakai, dan
data antar-workspace tidak pernah bersentuhan — kepemilikan folder unik per
kombinasi `(workspace, akun Google)`.

**Catatan:** default visibilitas adalah **publik untuk dilihat**. Workspace privat
belum bisa dipakai — lihat "Keterbatasan" di bawah.

---

## Keterbatasan yang diketahui

Ditulis apa adanya, bukan disembunyikan. Rinciannya di `DECISIONS.md`.

- **Workspace privat belum jalan.** Endpoint baca terbuka untuk semua, dan
  thumbnail memakai URL Drive langsung tanpa proxy (CP-10). Untuk memakai
  Arsip23 pada data yang tidak untuk konsumsi publik, keduanya harus dikerjakan
  dulu.
- **Maksimal 20 MB per berkas** (CP-09). Video kegiatan yang panjang tidak muat.
- **Jumlah item hanya dihitung untuk 18 folder pertama** per halaman; sisanya
  menampilkan `—`. Ini menghormati batas 50 subrequest tier gratis Cloudflare.
- **Tanpa rename.** Salah ketik nama folder berarti buat baru dan hapus yang lama.
- **Tanpa rate limit.** Warga yang login bisa mengunggah sebanyak-banyaknya.
- **Catatan KV sub-folder tertinggal** setelah folder induknya dihapus. Tidak
  berbahaya (folder Drive-nya sudah tidak ada), tapi KV akan menumpuk perlahan.
- **Sesi tidak bertahan setelah refresh** — ini disengaja, lihat komentar di
  `assets/js/auth.js`.
- **Hapus berarti hapus permanen**, bukan masuk tempat sampah.
