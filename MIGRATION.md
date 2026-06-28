# Migrasi dari Cloudflare + Telegram Bot API biasa ke VPS + Local Bot API Server

Dokumen ini menjelaskan bagaimana project TeleCloud Personal dimulai dari mode ringan di Cloudflare, lalu nanti bisa di-upgrade ke Local Bot API Server tanpa memindahkan file lama.

## Tujuan desain

Dari awal, database menyimpan metadata Telegram yang netral:

```txt
telegram_chat_id
telegram_message_id
telegram_file_id
telegram_file_unique_id
storage_provider
upload_mode
original_name
mime_type
size_bytes
checksum_sha256
```

Karena itu, file lama tetap bisa dipakai walaupun backend upload nanti pindah ke VPS.

## Mode awal

```txt
Cloudflare Pages
  ├─ React/Vite frontend
  ├─ Pages Functions API
  ├─ D1 metadata DB
  └─ Telegram Bot API biasa
        ↓
     Private Telegram Channel
```

Batas aman:

```txt
20 MB per file
```

## Mode upgrade

```txt
Cloudflare Pages
  └─ Frontend statis
        ↓
VPS Upload API
  ├─ Auth/API gateway
  ├─ Local Bot API Server
  ├─ optional worker queue
  └─ optional local temporary storage
        ↓
Private Telegram Channel
```

D1 metadata bisa tetap di Cloudflare atau dipindah ke PostgreSQL di VPS.

## Yang berubah saat migrasi

### Sebelum

```env
TELEGRAM_API_BASE=https://api.telegram.org
STORAGE_PROVIDER=telegram_bot_api
MAX_FILE_SIZE_MB=20
```

### Sesudah

```env
TELEGRAM_API_BASE=http://127.0.0.1:8081
STORAGE_PROVIDER=telegram_local_bot_api
MAX_FILE_SIZE_MB=2000
```

Namun karena Cloudflare Pages tidak bisa mengakses `127.0.0.1` milik VPS, proses upload besar harus diarahkan ke backend VPS.

## Strategi migrasi bertahap

### Tahap 1 — MVP Cloudflare

- Frontend dan API di Cloudflare Pages.
- Metadata di D1.
- Upload/download kecil lewat Bot API biasa.
- Batas 20 MB/file.

### Tahap 2 — Tambah VPS upload service

- Buat service kecil di VPS, misalnya Node.js/Fastify atau Hono.
- Service ini menerima upload dari frontend.
- Service mengirim file ke `http://127.0.0.1:8081/bot<TOKEN>/sendDocument`.
- Service mengembalikan metadata ke frontend/Cloudflare API.

### Tahap 3 — Pindahkan upload endpoint

Frontend cukup mengganti endpoint upload:

```txt
/api/files/upload
```

menjadi:

```txt
https://upload-domain-kamu.com/api/files/upload
```

atau tetap `/api/files/upload`, tetapi Cloudflare Function meneruskan request kecil/metadata ke VPS.

Untuk file besar, lebih baik browser upload langsung ke VPS agar tidak mentok request body Cloudflare.

### Tahap 4 — Sinkronisasi metadata

Pilihan A:

- VPS upload service menulis metadata ke D1 lewat Cloudflare API.

Pilihan B:

- VPS memakai PostgreSQL.
- Frontend membaca API dari VPS.
- D1 lama diekspor lalu diimpor.

Untuk pribadi, pilihan A cukup dulu.

## Apakah file lama perlu dipindahkan?

Tidak.

File lama tetap ada di private channel Telegram. Selama database menyimpan `chat_id` dan `message_id`, file tetap bisa dilacak.

## Kolom database yang sudah disiapkan

```sql
storage_provider TEXT DEFAULT 'telegram_bot_api'
upload_mode TEXT DEFAULT 'document'
telegram_chat_id TEXT
telegram_message_id INTEGER
telegram_file_id TEXT
telegram_file_unique_id TEXT
```

Saat migrasi, file baru bisa memakai:

```txt
storage_provider = telegram_local_bot_api
```

sedangkan file lama tetap:

```txt
storage_provider = telegram_bot_api
```

## Rekomendasi VPS

Untuk pribadi:

```txt
2 vCPU
2 GB RAM
40 GB SSD
Ubuntu 24.04
Bandwidth 1 TB+
```

Jika sering upload video besar:

```txt
2 vCPU
4 GB RAM
80 GB SSD+
```

## Catatan keamanan

- Jangan expose port Local Bot API Server ke internet publik.
- Jalankan Local Bot API Server di `127.0.0.1:8081`.
- Akses upload service VPS harus memakai HTTPS.
- Gunakan auth yang sama atau token internal antara Cloudflare dan VPS.
- Batasi file size, MIME type, dan concurrency.
