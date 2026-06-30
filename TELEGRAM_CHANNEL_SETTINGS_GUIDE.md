# Telegram Channel Settings Guide

Panduan singkat untuk setup 3 channel Telegram di TeleCloud.

## Yang dibutuhkan

```txt
BOT_TOKEN
Original Channel ID
Preview Channel ID
Thumbnail Channel ID
```

Satu bot saja cukup untuk semua channel.

## Buat channel

Buat 3 private channel Telegram:

```txt
TeleCloud Original
TeleCloud Preview
TeleCloud Thumbnail
```

Tambahkan bot ke semua channel dan jadikan bot sebagai admin.

## Ambil channel ID

Private channel ID biasanya diawali `-100`.

Cara ambil via PowerShell:

```powershell
$env:BOT_TOKEN="ISI_TOKEN_BOT_KAMU"
Invoke-RestMethod "https://api.telegram.org/bot$env:BOT_TOKEN/getUpdates" | ConvertTo-Json -Depth 20
```

Cari:

```json
"chat": {
  "id": -1001234567890,
  "title": "TeleCloud Original"
}
```

## Isi di aplikasi

Buka:

```txt
Settings
→ Telegram Storage Channels
```

Isi:

```txt
Original Channel ID
Preview Channel ID
Thumbnail Channel ID
```

Lalu klik:

```txt
Save channel settings
Test channels
```

## Fungsi setiap channel

```txt
Original Channel
→ file asli
→ download
→ View original size

Preview Channel
→ image compressed/optimized
→ lightbox awal

Thumbnail Channel
→ image kecil
→ list/grid
```

## Catatan

- `BOT_TOKEN` tetap di Cloudflare Secret.
- Channel ID bisa disimpan dari UI Settings.
- Image lama tidak otomatis punya thumbnail/preview.
- Upload image baru akan membuat 3 versi.
