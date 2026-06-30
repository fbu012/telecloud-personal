# TeleCloud Personal

TeleCloud Personal adalah starter project **private cloud pribadi berbasis Telegram**.

Stack awal:

- Frontend: React + Vite + Tailwind CSS
- Hosting: Cloudflare Pages
- API: Cloudflare Pages Functions
- Database metadata: Cloudflare D1
- Storage file: Telegram Private Channel via Telegram Bot API biasa

> Mode awal ini sengaja memakai Telegram Bot API biasa agar murah dan cepat dipush ke Cloudflare. Untuk file besar, lihat `MIGRATION.md` untuk upgrade ke VPS + Local Bot API Server.

## Fitur MVP

- Login admin sederhana via cookie HttpOnly
- Upload single/bulk dengan queue, progress, retry, dan validasi ukuran
- Upload file ke Telegram sebagai `document` agar kualitas asli tidak dikompres
- Metadata tersimpan di Cloudflare D1
- Photos view dan Drive view
- Search, filter tipe file, favorite, rename, soft delete
- Download file melalui API proxy agar bot token tidak bocor ke browser
- Settings page untuk melihat storage mode, batas file, dan mengatur 3 channel Telegram image variants
- Dokumentasi migrasi ke Local Bot API Server
- Image variants: thumbnail untuk list/grid, optimized preview untuk lightbox, original untuk download
- Trash menu dengan restore, permanent delete, empty trash, dan auto-delete retention
- Local Agent dashboard untuk upload file besar/multi upload dari komputer lokal dan sync metadata ke online

## Batas awal

Mode Cloudflare + Telegram Bot API biasa direkomendasikan memakai batas aman:

```txt
20 MB per file
```

Alasannya: upload Bot API biasa bisa lebih besar, tetapi download via `getFile` lebih aman dibatasi untuk file kecil. Untuk file besar, migrasikan upload/download service ke VPS + Local Bot API Server.

## Struktur folder

```txt
telecloud-personal/
├─ src/                      # React frontend
├─ functions/                # Cloudflare Pages Functions API
├─ agent/                    # Local Agent dashboard + uploader
├─ migrations/               # Cloudflare D1 schema
├─ docs/                     # Dokumentasi tambahan
├─ MIGRATION.md              # Rencana upgrade ke Local Bot API Server
├─ UI_UX.md                  # Panduan UI/UX
├─ STYLE_GUIDE.md            # Color palette dan style tokens
├─ SECURITY.md               # Catatan keamanan
├─ DEPLOY_CLOUDFLARE.md      # Langkah deploy Cloudflare
├─ wrangler.toml             # Config Cloudflare Pages + D1 binding
└─ .dev.vars.example         # Contoh env lokal
```

## Setup lokal

```bash
npm install
cp .dev.vars.example .dev.vars
```

Isi `.dev.vars`:

```env
ADMIN_PASSWORD=ubah-password-ini
SESSION_SECRET=ganti-dengan-random-string-panjang
BOT_TOKEN=123456789:AA_your_bot_token
TELEGRAM_CHAT_ID=-1001234567890
# Optional untuk setup 3 channel via env. Bisa juga diisi dari Settings aplikasi.
TELEGRAM_ORIGINAL_CHAT_ID=-1001234567890
TELEGRAM_PREVIEW_CHAT_ID=-1001234567891
TELEGRAM_THUMBNAIL_CHAT_ID=-1001234567892
TELEGRAM_API_BASE=https://api.telegram.org
MAX_FILE_SIZE_MB=20
APP_NAME=TeleCloud Personal
```

Buat D1 database:

```bash
npm run d1:create
```

Update `wrangler.toml`, isi `database_id` dari hasil command di atas.

Jalankan migration lokal:

```bash
npm run d1:migrate:local
```

Build frontend:

```bash
npm run build
```

Jalankan Pages Functions lokal:

```bash
npm run cf:dev
```

Buka URL lokal dari Wrangler, lalu login memakai `ADMIN_PASSWORD`.

## Deploy ke Cloudflare Pages

Lihat detailnya di:

```txt
DEPLOY_CLOUDFLARE.md
```

Ringkasnya:

1. Push repository ke GitHub.
2. Buat Cloudflare Pages project dari repo.
3. Build command: `npm run build`.
4. Output directory: `dist`.
5. Tambahkan D1 binding dengan nama `DB`.
6. Tambahkan environment variables.
7. Jalankan migration remote.
8. Deploy.

## Catatan penting

- Jangan expose `BOT_TOKEN` ke frontend.
- Jangan upload file sebagai `sendPhoto`; project ini memakai `sendDocument`.
- Untuk image baru, aplikasi membuat 3 versi: thumbnail, optimized preview, dan original.
- Channel ID original/preview/thumbnail bisa diatur dari menu Settings aplikasi.
- Untuk bulk upload, frontend mengirim **1 file = 1 request**.
- Untuk mode awal, file besar akan ditolak sebelum dikirim ke Telegram.
- File lama tidak perlu dipindah saat nanti migrasi ke Local Bot API Server; database sudah menyimpan `chat_id`, `message_id`, `file_id`, dan metadata utama.


## Trash behavior

Delete biasa hanya memindahkan file ke Trash:

```txt
D1 status = trash
Telegram message masih ada
```

Dari menu Trash, user bisa:

```txt
Restore
Delete permanently
Empty trash
```

Permanent delete akan menghapus metadata D1 dan mencoba menghapus message Telegram original/preview/thumbnail. Trash auto-delete bisa diatur dari Settings.

Lihat juga:

```txt
TRASH_MANAGEMENT_UPDATE.md
```


## Secure folder delete dialog

File di dalam secure folder sekarang bisa dihapus dengan dialog pilihan:

```txt
Delete biasa / Move to Trash
Delete permanen sekarang
```

Jika folder token expired, aplikasi akan meminta password folder lagi dan retry action. Lihat juga:

```txt
SECURE_DELETE_DIALOG_UPDATE.md
```


## Delete progress

Dialog delete file sekarang menampilkan progress bar, persentase, dan stage label saat proses penghapusan berlangsung.

```txt
Checking secure folder access
Moving file to Trash
Deleting permanently from D1 and Telegram
Refreshing file list
Delete complete
```

Lihat juga:

```txt
DELETE_PROGRESS_UPDATE.md
```


## Local Agent

TeleCloud sekarang punya Local Agent dengan dashboard kecil:

```txt
http://localhost:8788
```

Jalankan:

```powershell
copy .env.agent.example .env.agent
npm run agent
```

Local Agent berguna untuk upload file besar dari komputer lokal:

```txt
Local Agent → Telegram → Online API → D1 metadata
```

Tambahkan secret online:

```powershell
npx wrangler pages secret put LOCAL_AGENT_TOKEN --project-name=telecloud-personal
```

Lihat detail:

```txt
LOCAL_AGENT_GUIDE.md
```


## Local Agent troubleshooting

Jika folder online tidak muncul di Local Agent dan terminal menampilkan `Unauthorized`, cek status:

```txt
Online Auth
```

Jika gagal, berarti `LOCAL_AGENT_TOKEN` di `.env.agent` tidak sama dengan secret Cloudflare, atau online belum redeploy setelah secret dibuat.
