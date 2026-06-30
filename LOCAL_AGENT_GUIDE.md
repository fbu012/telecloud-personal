# TeleCloud Local Agent Guide

Panduan ini menjelaskan **Local Agent dengan dashboard kecil** untuk upload file besar dari komputer lokal dan sinkron metadata ke TeleCloud Online.

## Konsep

TeleCloud tetap memakai 1 webapp utama online:

```txt
https://file.utamadigital.id
```

Local Agent adalah aplikasi pendamping yang berjalan di komputer kamu:

```txt
http://localhost:8788
```

Fungsinya:

```txt
- upload original file langsung dari komputer ke Telegram
- membuat thumbnail dan optimized preview lewat browser lokal
- upload thumbnail/preview/original ke channel Telegram
- sync metadata ke TeleCloud Online API
- file muncul di web online setelah refresh
```

## Arsitektur

```txt
Local Dashboard
http://localhost:8788
        ↓
Local Agent Node.js
        ↓
Telegram Bot API
        ↓
3 Telegram Channels
        ↓
TeleCloud Online API
        ↓
Cloudflare D1 metadata
```

Online D1 tetap menjadi source of truth untuk metadata.

## Yang dibutuhkan

Di Cloudflare Environment Variables / Secret:

```env
LOCAL_AGENT_TOKEN=isi-token-random-panjang
```

Di komputer lokal, file `.env.agent`:

```env
TELECLOUD_BASE_URL=https://file.utamadigital.id
LOCAL_AGENT_TOKEN=harus-sama-dengan-yang-di-cloudflare

BOT_TOKEN=123456789:AA_your_bot_token
TELEGRAM_API_BASE=https://api.telegram.org

TELEGRAM_ORIGINAL_CHAT_ID=-100xxxxxxxxxx
TELEGRAM_PREVIEW_CHAT_ID=-100xxxxxxxxxx
TELEGRAM_THUMBNAIL_CHAT_ID=-100xxxxxxxxxx

LOCAL_AGENT_PORT=8788
LOCAL_AGENT_MAX_FILE_MB=2048
```

> `LOCAL_AGENT_TOKEN` adalah kunci sinkronisasi metadata dari komputer lokal ke API online. Jangan dibagikan.

## Setup Cloudflare

Tambahkan secret/env:

```powershell
npx wrangler pages secret put LOCAL_AGENT_TOKEN --project-name=telecloud-personal
```

Masukkan token random panjang, contoh:

```txt
tc_agent_isi_random_panjang_minimal_32_karakter
```

Redeploy setelah secret ditambahkan.

## Setup lokal

Di folder project:

```powershell
cd C:\Users\User\GITHUBS\telecloud-personal
npm install
copy .env.agent.example .env.agent
```

Edit `.env.agent`, isi:

```txt
TELECLOUD_BASE_URL
LOCAL_AGENT_TOKEN
BOT_TOKEN
TELEGRAM_ORIGINAL_CHAT_ID
TELEGRAM_PREVIEW_CHAT_ID
TELEGRAM_THUMBNAIL_CHAT_ID
```

Jalankan agent:

```powershell
npm run agent
```

Buka dashboard:

```txt
http://localhost:8788
```

## Cara upload

1. Buka `http://localhost:8788`.
2. Pastikan status:
   - Online API Configured
   - Bot token Configured
   - Original channel Configured
3. Klik `Refresh folders`.
4. Pilih folder tujuan.
5. Pilih file.
6. Klik `Start local upload`.
7. Tunggu sampai progress complete.
8. Buka TeleCloud Online dan klik refresh.

## Cara kerja image

Untuk image, browser lokal membuat:

```txt
thumbnail 240px
optimized preview max 1600px
original file tetap asli
```

Lalu Local Agent mengupload:

```txt
Original → Telegram Original Channel
Preview → Telegram Preview Channel
Thumbnail → Telegram Thumbnail Channel
```

Kemudian metadata disinkronkan ke D1 online lewat:

```txt
POST /api/local-agent/files
```

## Secure folder

Local Agent bisa memilih folder tujuan termasuk secure folder, karena sinkronisasi memakai `LOCAL_AGENT_TOKEN`.

Catatan:

```txt
Local Agent tidak membuka isi secure folder dari UI utama.
Local Agent hanya mengirim metadata ke folder_id tujuan.
Pastikan komputer lokal dan token agent aman.
```

## Batasan versi pertama

Versi ini adalah tahap pertama Local Agent:

```txt
✅ Dashboard lokal
✅ Upload dari komputer lokal
✅ Generate thumbnail/preview
✅ Upload ke Telegram
✅ Sync metadata ke online
✅ Recent upload history lokal

Belum termasuk:
- upload trigger langsung dari tombol Upload di web online
- download original lewat local agent
- background folder watcher
- SQLite queue/resume penuh
```

Fitur lanjutan bisa ditambahkan bertahap.

## Troubleshooting

### Dashboard tidak bisa ambil folder

Cek:

```txt
LOCAL_AGENT_TOKEN di .env.agent sama dengan Cloudflare
LOCAL_AGENT_TOKEN sudah dibuat di Cloudflare
TeleCloud online sudah redeploy
TELECLOUD_BASE_URL benar
```

### Upload Telegram gagal

Cek:

```txt
BOT_TOKEN benar
Bot sudah admin di semua channel
Channel ID diawali -100
Bot punya izin Post Messages
```

### File sudah upload ke Telegram tapi tidak muncul online

Cek log dashboard. Biasanya karena:

```txt
LOCAL_AGENT_TOKEN salah
API online belum redeploy
folder_id tujuan tidak ditemukan
migration 0005 belum jalan
```


## Update: auth check dan multi upload

Local Agent dashboard sekarang mendukung:

```txt
- Multi upload
- UI/font lebih selaras dengan TeleCloud Online
- Online Auth status
- Error folder yang lebih jelas jika token salah
```

Jika Status menampilkan:

```txt
Online config: Configured
Online auth: Missing
```

artinya `.env.agent` sudah berisi token, tapi token tersebut **tidak cocok** dengan secret Cloudflare atau online belum redeploy.

Perbaikan:

```powershell
npx wrangler pages secret put LOCAL_AGENT_TOKEN --project-name=telecloud-personal
npm run build
npx wrangler pages deploy dist --project-name=telecloud-personal --branch=main
```

Lalu pastikan `.env.agent` di komputer lokal memakai token yang sama persis:

```env
LOCAL_AGENT_TOKEN=token-yang-sama-persis
```

Restart local agent:

```powershell
Ctrl+C
npm run agent
```

## Multi upload

Dashboard lokal sekarang memakai input multiple files.

Alur:

```txt
1. Klik Choose files
2. Pilih banyak file
3. Klik Start local upload
4. File diproses satu per satu
5. Progress bar menunjukkan total progress semua file
```
