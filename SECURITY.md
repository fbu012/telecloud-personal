# Security Notes

TeleCloud Personal dibuat untuk pemakaian pribadi, tetapi tetap perlu dasar keamanan.

## Jangan expose token

`BOT_TOKEN`, `SESSION_SECRET`, dan `ADMIN_PASSWORD` hanya boleh ada di environment variable Cloudflare, bukan di frontend.

## Login

Project memakai cookie HttpOnly bertanda tangan HMAC.

Untuk produksi:

- Gunakan `ADMIN_PASSWORD` kuat.
- Gunakan `SESSION_SECRET` random minimal 32 karakter.
- Aktifkan Cloudflare Access jika ingin lapisan keamanan tambahan.

## File upload

Mode awal membatasi ukuran file lewat `MAX_FILE_SIZE_MB`.

Frontend melakukan validasi, tetapi backend juga tetap memvalidasi.

## Download

Download diproxy lewat API agar URL Telegram yang mengandung bot token tidak dikirim ke browser.

## Robots

`public/robots.txt` memblokir crawler.

Tambahan yang disarankan:

- Pakai domain private.
- Jangan share link Pages ke publik.
- Tambahkan Cloudflare Access jika perlu.
- Backup metadata D1 secara berkala.

## Local Bot API Server nanti

Saat migrasi:

- Jangan buka port `8081` ke publik.
- Jalankan di localhost VPS.
- Letakkan upload API di belakang HTTPS.
- Pakai auth/token internal untuk komunikasi Cloudflare ↔ VPS.


## Local Agent security

Local Agent memakai token khusus:

```env
LOCAL_AGENT_TOKEN
```

Token ini harus:

```txt
- disimpan sebagai Cloudflare Secret
- disimpan lokal di .env.agent
- tidak dipush ke GitHub
- dibuat panjang dan random
```

Local Agent boleh menyimpan `BOT_TOKEN` di komputer lokal, tapi file `.env.agent` sudah masuk `.gitignore` dan tidak boleh dibagikan.
