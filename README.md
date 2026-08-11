# Arsip23

Arsip dokumentasi berbasis web dengan tampilan file explorer. Setiap warga punya
ruangnya sendiri; berkasnya benar-benar tersimpan di Google Drive pengelola.
Bisa dilihat siapa saja, hanya bisa diubah pemiliknya.

Dipakai pertama kali oleh **kasmenoreh.my.id**, tapi dirancang bisa dipakai ulang
untuk proyek lain lewat satu baris konfigurasi.

**Sudah live:**

| | |
|---|---|
| Situs | https://belvahector-ship-it.github.io/arsip23/ |
| API | https://arsip23-api.belvahector.workers.dev |
| Storage | My Drive `belvahector69@gmail.com`, folder `Arsip23` (dibuat otomatis) |
| Domain `arsip23.web.id` | **belum dibeli** — sudah disiapkan di `ALLOWED_ORIGINS` |

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

### ⚠️ Naikkan `?v=` setiap kali mengubah CSS/JS

GitHub Pages mengirim `cache-control: max-age=600` dan tidak bisa diatur. Tanpa
penanda versi, selama 10 menit setelah setiap `git push`, warga tetap
menjalankan kode lama — dan yang paling berbahaya bukan "lama", melainkan
**campuran**: `index.html` baru dengan `app.js` lama. Gejalanya bukan pesan
galat, melainkan fitur yang diam-diam tidak bekerja.

Karena itu setiap berkas CSS/JS dipanggil dengan `?v=N`. Sebelum push, naikkan
`N` **di semua tempat sekaligus**:

```bash
grep -rn "?v=" index.html assets/js/
```

Ada 10 titik: 3 CSS + 1 skrip di `index.html`, dan 6 `import` di `assets/js/`.
Kalau satu tertinggal, modul itu tetap diambil dari cache dan campuran versi
terulang lagi.

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
GOOGLE_CLIENT_SECRET=GOCSPX-...
GOOGLE_REFRESH_TOKEN=1//0g...
```

---

## Setup dari nol

Empat bagian. Urutannya penting — Cloudflare butuh nilai dari Google.

### 1 · Google Drive

**Tidak ada yang perlu dikerjakan di sini.** Worker membuat sendiri folder
`Arsip23` di My Drive akun pengelola saat pertama kali dipakai.

Ini bukan kemalasan — ini keharusan. Aplikasi ini memakai scope `drive.file`,
yang hanya memberinya akses ke berkas yang **ia buat sendiri**. Folder yang Anda
buat manual lewat drive.google.com tidak akan terlihat olehnya sama sekali. Jadi
jangan membuatkan foldernya duluan; biarkan Worker yang membuat.

Yang perlu dipastikan cuma satu: akun pengelola (`belvahector69@gmail.com`) masih
punya sisa kuota Google One.

### 2 · Google Cloud Console

Di [console.cloud.google.com](https://console.cloud.google.com), **pastikan akun
yang aktif adalah akun pengelola** (perhatikan `authuser` di URL):

1. Buat project baru, mis. `arsip23`.
2. **APIs & Services → Library** → aktifkan **Google Drive API**.
3. **APIs & Services → OAuth consent screen**
   - User type: **External**
   - Scope: `openid`, `email`, `profile`, dan
     **`https://www.googleapis.com/auth/drive.file`**
   - Publishing status: **In production**.
     Jangan dibiarkan *Testing*. Dalam mode Testing, Google mematikan refresh
     token setelah **7 hari** — arsip akan berjalan normal seminggu lalu mati
     sendiri, kegagalan yang paling sulit dilacak justru karena sempat bekerja.
   - Karena `drive.file` bukan scope sensitif, **tidak perlu verifikasi Google**.
4. **Credentials → Create credentials → OAuth client ID**
   - Type: **Web application**, nama `arsip23-web`
   - *Authorized JavaScript origins*: `http://localhost:8788`,
     `https://<user>.github.io`, dan nanti `https://arsip23.web.id`
   - *Authorized redirect URIs*: `http://localhost:8788/oauth-callback`
   - Simpan **Client ID** dan **Client secret**-nya.

### 2b · Ambil refresh token pengelola (sekali seumur hidup)

Worker menulis ke Drive atas nama akun pengelola, jadi ia butuh satu refresh
token milik akun itu.

1. Buka URL ini di peramban (ganti `CLIENT_ID`), **saat sedang masuk sebagai akun
   pengelola**:

   ```
   https://accounts.google.com/o/oauth2/v2/auth?client_id=CLIENT_ID&redirect_uri=http://localhost:8788/oauth-callback&response_type=code&scope=https://www.googleapis.com/auth/drive.file&access_type=offline&prompt=consent
   ```

   `access_type=offline` dan `prompt=consent` keduanya wajib — tanpa itu Google
   hanya memberi access token berumur satu jam, tanpa refresh token.

2. Setelah menyetujui, peramban dilempar ke `localhost:8788/oauth-callback` dan
   akan menampilkan halaman "not found". **Itu wajar** — yang dibutuhkan ada di
   bilah alamat: `?code=4/0A...`. Salin nilai `code` itu.

3. Tukarkan jadi refresh token:

   ```bash
   curl -s -X POST https://oauth2.googleapis.com/token -d client_id=CLIENT_ID -d client_secret=CLIENT_SECRET -d code=KODE_TADI -d grant_type=authorization_code -d redirect_uri=http://localhost:8788/oauth-callback
   ```

   Ambil nilai `refresh_token` dari jawabannya. Kode `code` hanya bisa dipakai
   sekali; kalau gagal, ulangi dari langkah 1.

### 3 · Cloudflare

```bash
cd worker
npx wrangler login
npx wrangler kv namespace create ARSIP_KV
```

Salin `id` yang dikembalikan perintah terakhir ke `worker/wrangler.toml`
(bagian `[[kv_namespaces]]`, field `id` yang masih kosong).

Lalu pasang ketiga secret:

```bash
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put GOOGLE_REFRESH_TOKEN
```

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
| `GOOGLE_CLIENT_SECRET` | secret Worker | ya |
| `GOOGLE_REFRESH_TOKEN` | secret Worker | **ya — kunci ke seluruh isi arsip** |

ID folder root tidak lagi jadi secret: Worker membuat foldernya sendiri dan
mengingat ID-nya di KV (`config:driveRoot`).

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

- **Gerbang login hanya lapisan UI.** Sejak CP-24 situs menuntut login untuk
  dibuka, tapi `GET /api/browse` **tetap terbuka di server** — siapa pun yang
  memanggil API langsung masih bisa membaca isi arsip. Kalau yang diinginkan
  benar-benar privat, endpoint bacanya harus diwajibkan token.
- **Tautan berbagi tidak bisa dicabut dari aplikasi ini.** Sekali dibagikan,
  mencabutnya harus lewat Google Drive langsung.
- **Maksimal 20 MB per berkas** (CP-09). Video kegiatan yang panjang tidak muat.
- **Jumlah item hanya dihitung untuk 18 folder pertama** per halaman; sisanya
  menampilkan `—`. Ini menghormati batas 50 subrequest tier gratis Cloudflare.
- **Tanpa rate limit.** Warga yang login bisa mengunggah sebanyak-banyaknya.
- **Catatan KV sub-folder tertinggal** setelah folder induknya dihapus. Tidak
  berbahaya (folder Drive-nya sudah tidak ada), tapi KV akan menumpuk perlahan.
- **Sesi tidak bertahan setelah refresh** — ini disengaja, lihat komentar di
  `assets/js/auth.js`.
- **Hapus berarti hapus permanen**, bukan masuk tempat sampah.
