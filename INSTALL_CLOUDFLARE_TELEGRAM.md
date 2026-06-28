# INSTALL_CLOUDFLARE_TELEGRAM.md

Panduan ini menjelaskan langkah lengkap untuk menjalankan **TeleCloud Personal** dari nol: membuat bot Telegram, mengambil `BOT_TOKEN` dan `TELEGRAM_CHAT_ID`, membuat Cloudflare D1, mengisi `wrangler.toml`, deploy ke Cloudflare Pages, lalu melakukan pengecekan akhir.

> Project ini memakai Telegram sebagai storage file dan Cloudflare D1 sebagai database metadata. File asli tersimpan di private channel Telegram, sedangkan nama file, folder, ukuran, `message_id`, dan info lain disimpan di D1.

---

## 0. Ringkasan arsitektur

```txt
Browser
  ↓
Cloudflare Pages Frontend
  ↓
Cloudflare Pages Functions
  ↓
Telegram Bot API
  ↓
Private Telegram Channel

Metadata:
Cloudflare D1
```

Mode awal project ini memakai **Telegram Bot API biasa**, sehingga batas aman default adalah:

```txt
MAX_FILE_SIZE_MB=20
```

Nanti jika sudah migrasi ke VPS + Local Bot API Server, bagian upload backend bisa diubah supaya mendukung file besar.

---

## 1. Prasyarat lokal

Pastikan sudah terpasang:

```txt
Node.js 20+
Git
Akun Cloudflare
Akun Telegram
Repo GitHub project
```

Cek Node dan npm:

```powershell
node -v
npm -v
```

Login Wrangler:

```powershell
npx wrangler login
```

---

## 2. Buat Telegram bot

1. Buka Telegram.
2. Cari bot resmi:

```txt
@BotFather
```

3. Kirim command:

```txt
/newbot
```

4. Ikuti instruksi BotFather:
   - isi nama bot, contoh: `TeleCloud Personal Bot`
   - isi username bot, harus berakhiran `bot`, contoh: `telecloud_personal_bot`

5. BotFather akan memberi token seperti ini:

```txt
123456789:AAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Simpan token itu sebagai:

```env
BOT_TOKEN=123456789:AAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

> Jangan taruh token ini di frontend/browser. Di project ini token hanya disimpan sebagai Cloudflare Secret.

---

## 3. Buat private channel Telegram

1. Buat channel baru di Telegram.
2. Pilih **Private Channel**.
3. Nama contoh:

```txt
TeleCloud Personal Storage
```

4. Tambahkan bot kamu ke channel.
5. Jadikan bot sebagai **Admin**.
6. Minimal beri izin:

```txt
Post Messages
Edit Messages optional
Delete Messages optional
```

Untuk upload saja, yang penting bot bisa post ke channel.

---

## 4. Ambil TELEGRAM_CHAT_ID channel

`TELEGRAM_CHAT_ID` untuk private channel biasanya diawali dengan:

```txt
-100
```

Contoh:

```env
TELEGRAM_CHAT_ID=-1001234567890
```

### Cara aman lewat getUpdates

Setelah bot menjadi admin channel:

1. Kirim satu pesan baru di channel, misalnya:

```txt
init telecloud
```

2. Jalankan di PowerShell lokal:

```powershell
$env:BOT_TOKEN="ISI_TOKEN_BOT_KAMU"
Invoke-RestMethod "https://api.telegram.org/bot$env:BOT_TOKEN/getUpdates" | ConvertTo-Json -Depth 20
```

3. Cari bagian seperti ini:

```json
"channel_post": {
  "chat": {
    "id": -1001234567890,
    "title": "TeleCloud Personal Storage",
    "type": "channel"
  }
}
```

4. Copy angka `id` sebagai:

```env
TELEGRAM_CHAT_ID=-1001234567890
```

Jika hasil `getUpdates` kosong:

```txt
[]
```

Coba ini:

1. Pastikan bot sudah admin channel.
2. Kirim pesan baru lagi di channel setelah bot ditambahkan.
3. Jalankan ulang `getUpdates`.
4. Jangan pakai pesan lama yang dikirim sebelum bot masuk channel.

### Test kirim pesan ke channel

Setelah punya `TELEGRAM_CHAT_ID`, test:

```powershell
$env:BOT_TOKEN="ISI_TOKEN_BOT_KAMU"
$env:TELEGRAM_CHAT_ID="-1001234567890"
Invoke-RestMethod -Method Post "https://api.telegram.org/bot$env:BOT_TOKEN/sendMessage" -Body @{
  chat_id = $env:TELEGRAM_CHAT_ID
  text = "TeleCloud test message"
}
```

Kalau pesan masuk ke channel, berarti `BOT_TOKEN` dan `TELEGRAM_CHAT_ID` benar.

---

## 5. Install project lokal

Di folder project:

```powershell
npm install
npm run build
```

Build berhasil jika muncul kurang lebih:

```txt
✓ built
```

---

## 6. Buat Cloudflare D1 database

Buat database remote:

```powershell
npx wrangler d1 create telecloud_personal_db --location=apac
```

Output akan memberi konfigurasi seperti:

```toml
[[d1_databases]]
binding = "DB"
database_name = "telecloud_personal_db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

Copy `database_id` asli.

Jika database sudah pernah dibuat, cek dengan:

```powershell
npx wrangler d1 list
```

---

## 7. Isi database_id di wrangler.toml

Buka file:

```txt
wrangler.toml
```

Cari:

```toml
[[d1_databases]]
binding = "DB"
database_name = "telecloud_personal_db"
database_id = "REPLACE_WITH_YOUR_D1_DATABASE_ID"
```

Ganti `REPLACE_WITH_YOUR_D1_DATABASE_ID` dengan UUID asli dari Cloudflare.

Contoh:

```toml
[[d1_databases]]
binding = "DB"
database_name = "telecloud_personal_db"
database_id = "a1b2c3d4-1111-2222-3333-abcdefabcdef"
```

Penting:

```txt
binding harus DB
database_name harus telecloud_personal_db
database_id harus UUID asli, bukan placeholder
```

---

## 8. Jalankan migration D1

Jalankan migration pertama:

```powershell
npx wrangler d1 execute telecloud_personal_db --remote --file=migrations/0001_init.sql
```

Jika project kamu sudah memakai fitur folder, jalankan juga:

```powershell
npx wrangler d1 execute telecloud_personal_db --remote --file=migrations/0002_folders.sql
```

Jika muncul error:

```txt
Invalid property: databaseId => Invalid uuid
```

berarti `database_id` di `wrangler.toml` masih placeholder atau salah.

---

## 9. Buat Cloudflare Pages project

Project ini bisa dideploy dengan dua model.

---

### Opsi A — Direct Upload via Wrangler

Ini model yang sedang dipakai jika project Pages kamu tertulis **No Git connection**.

Buat Pages project:

```powershell
npx wrangler pages project create telecloud-personal --production-branch=main
```

Cek daftar Pages project:

```powershell
npx wrangler pages project list
```

Harus muncul:

```txt
telecloud-personal    telecloud-personal.pages.dev
```

Deploy:

```powershell
npm run build
npx wrangler pages deploy dist --project-name=telecloud-personal --branch=main
```

---

### Opsi B — Git-connected Cloudflare Pages

Ini model yang lebih rapi untuk jangka panjang.

Di Cloudflare Dashboard:

```txt
Workers & Pages
→ Create application
→ Pages
→ Import an existing Git repository
```

Pilih repo GitHub kamu.

Build settings:

```txt
Framework preset: Vite
Build command: npm run build
Build output directory: dist
Root directory: /
```

Jika Cloudflare menampilkan field **Deploy command** dan wajib diisi, gunakan:

```bash
npx wrangler pages deploy dist --project-name=telecloud-personal --branch=main
```

Jika field **Deploy command** bisa dikosongkan untuk Git Pages, kosongkan saja.

---

## 10. Tambahkan environment variables dan secrets

Masuk ke Cloudflare:

```txt
Workers & Pages
→ telecloud-personal
→ Settings
→ Variables and Secrets
```

Tambahkan variable berikut.

### Secret

Simpan sebagai **Secret**:

```env
ADMIN_PASSWORD=password_login_kamu
SESSION_SECRET=random_string_panjang_minimal_32_karakter
BOT_TOKEN=123456789:AAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Buat `SESSION_SECRET` dengan PowerShell:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Variable biasa

```env
TELEGRAM_CHAT_ID=-1001234567890
TELEGRAM_API_BASE=https://api.telegram.org
MAX_FILE_SIZE_MB=20
APP_NAME=TeleCloud Personal
DELETE_TELEGRAM_ON_HARD_DELETE=false
```

Pastikan nama variable persis:

```txt
BOT_TOKEN
TELEGRAM_CHAT_ID
```

Jangan diganti menjadi:

```txt
TELEGRAM_BOT_TOKEN
TG_CHAT_ID
CHAT_ID
BOT_API_TOKEN
```

---

## 11. Tambahkan D1 binding di Cloudflare Pages

Masuk ke:

```txt
Workers & Pages
→ telecloud-personal
→ Settings
→ Bindings
→ Add binding
→ D1 database
```

Isi:

```txt
Variable name: DB
D1 database: telecloud_personal_db
```

Binding harus bernama:

```txt
DB
```

Karena kode project membaca database melalui:

```ts
env.DB
```

---

## 12. Production vs Preview variables

Cloudflare Pages memisahkan environment **Production** dan **Preview**.

Jika kamu membuka URL seperti:

```txt
https://16734958.telecloud-personal.pages.dev
```

itu bisa berupa preview/deployment URL.

Jika kamu membuka:

```txt
https://telecloud-personal.pages.dev
```

itu production domain utama.

Supaya aman, isi variable dan binding di kedua environment:

```txt
Production
Preview
```

Terutama:

```txt
BOT_TOKEN
TELEGRAM_CHAT_ID
DB binding
```

---

## 13. Redeploy setelah set variables/bindings

Setelah variable dan binding diisi, deploy ulang:

```powershell
npm run build
npx wrangler pages deploy dist --project-name=telecloud-personal --branch=main
```

Atau jika pakai Git build:

```powershell
git add .
git commit -m "configure deploy"
git push
```

---

## 14. Test health endpoint

Buka:

```txt
https://telecloud-personal.pages.dev/api/health
```

Hasil yang benar:

```json
{
  "ok": true,
  "app_name": "TeleCloud Personal",
  "storage_provider": "telegram_bot_api",
  "max_file_size_bytes": 20971520,
  "telegram_api_base": "https://api.telegram.org",
  "has_db": true,
  "has_bot_token": true,
  "has_chat_id": true
}
```

Jika:

```json
"has_db": false
```

cek D1 binding `DB`.

Jika:

```json
"has_bot_token": false
```

cek variable `BOT_TOKEN`.

Jika:

```json
"has_chat_id": false
```

cek variable `TELEGRAM_CHAT_ID`.

---

## 15. Test login

Buka:

```txt
https://telecloud-personal.pages.dev
```

Login dengan password dari:

```env
ADMIN_PASSWORD
```

Jika login gagal:

```txt
1. Pastikan ADMIN_PASSWORD benar.
2. Pastikan SESSION_SECRET terisi.
3. Redeploy setelah mengganti variable.
4. Clear cookies browser jika perlu.
```

---

## 16. Test upload

Upload file kecil dulu, misalnya gambar 1–2 MB.

Checklist berhasil:

```txt
[ ] Upload queue hijau / completed
[ ] File masuk ke private channel Telegram
[ ] File muncul di Drive
[ ] File muncul di Photos jika image/video
[ ] Tombol download berfungsi
[ ] Setelah logout-login, file tetap muncul
```

Jika file masuk Telegram tapi tidak muncul di Drive:

```txt
1. Cek D1 binding DB.
2. Cek migration sudah dijalankan.
3. Cek /api/health has_db true.
4. Klik refresh di dashboard.
```

---

## 17. Troubleshooting umum

### Error: Project not found

```txt
Project not found. The specified project name does not match any of your existing projects.
```

Solusi:

```powershell
npx wrangler pages project list
```

Pastikan `--project-name` sesuai nama project yang ada.

Jika belum ada:

```powershell
npx wrangler pages project create telecloud-personal --production-branch=main
```

---

### Error: Authentication error code 10000

Biasanya token Wrangler tidak punya permission.

Buat API token dengan permission:

```txt
Account → Cloudflare Pages → Edit
Account → D1 → Edit
Account → Account Settings → Read
User → User Details → Read
```

Jika kamu memakai variable:

```env
CLOUDFLARE_API_TOKEN
```

pastikan token tersebut yang baru dan punya permission di atas.

---

### Error: Invalid uuid

```txt
Invalid property: databaseId => Invalid uuid
```

Solusi:

```powershell
npx wrangler d1 list
```

Copy database ID asli ke `wrangler.toml`.

Jangan biarkan:

```txt
REPLACE_WITH_YOUR_D1_DATABASE_ID
```

---

### Health has_bot_token false / has_chat_id false

Solusi:

```txt
1. Pastikan variable ada di project telecloud-personal.
2. Pastikan environment benar: Production dan/atau Preview.
3. Pastikan nama variable persis BOT_TOKEN dan TELEGRAM_CHAT_ID.
4. Redeploy setelah update variable.
```

---

### Telegram upload failed: chat not found

Solusi:

```txt
1. Pastikan TELEGRAM_CHAT_ID benar dan diawali -100.
2. Pastikan bot sudah masuk private channel.
3. Pastikan bot menjadi admin channel.
4. Test sendMessage manual lewat PowerShell.
```

---

### File terlalu besar

Mode awal memakai Telegram Bot API biasa, jadi default:

```txt
MAX_FILE_SIZE_MB=20
```

Jika ingin file besar seperti video ratusan MB atau 1–2 GB, gunakan rencana migrasi:

```txt
VPS Upload Backend + Local Bot API Server
```

Lihat `MIGRATION.md`.

---

## 18. Deployment checklist final

```txt
[ ] Bot Telegram dibuat via BotFather
[ ] BOT_TOKEN disimpan sebagai Secret
[ ] Private channel dibuat
[ ] Bot ditambahkan sebagai admin channel
[ ] TELEGRAM_CHAT_ID sudah didapat dan diawali -100
[ ] D1 database telecloud_personal_db dibuat
[ ] database_id asli sudah diisi di wrangler.toml
[ ] Migration 0001 sudah dijalankan
[ ] Migration 0002 sudah dijalankan jika pakai folder
[ ] D1 binding DB sudah ditambahkan ke Pages
[ ] Variables/Secrets sudah diisi di Production
[ ] Variables/Secrets sudah diisi di Preview jika memakai preview URL
[ ] Project berhasil deploy
[ ] /api/health semua true
[ ] Login berhasil
[ ] Upload file kecil berhasil
[ ] File masuk Telegram
[ ] File tampil di Drive/Photos
[ ] Download berhasil
```

---

## 19. Catatan keamanan

```txt
Jangan commit BOT_TOKEN ke GitHub.
Jangan simpan ADMIN_PASSWORD di kode.
Jangan share URL /api/health jika berisi info sensitif di masa depan.
Gunakan password admin yang kuat.
Ganti BOT_TOKEN jika pernah bocor.
Private channel Telegram jangan diubah menjadi public jika menyimpan file pribadi.
```

---

## 20. Upgrade ke Local Bot API Server nanti

Saat migrasi ke Local Bot API Server, konsep env-nya berubah dari:

```env
TELEGRAM_API_BASE=https://api.telegram.org
MAX_FILE_SIZE_MB=20
```

menjadi misalnya:

```env
TELEGRAM_API_BASE=http://127.0.0.1:8081
MAX_FILE_SIZE_MB=2000
```

Namun Cloudflare Pages Functions tidak cocok untuk upload file sangat besar. Untuk file besar, arsitektur yang disarankan:

```txt
Cloudflare Pages = frontend
VPS = upload backend + Local Bot API Server
Telegram private channel = storage
D1/PostgreSQL = metadata
```

Lihat detail di:

```txt
MIGRATION.md
```
