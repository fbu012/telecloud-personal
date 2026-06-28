# Deploy ke Cloudflare Pages

Project ini didesain untuk Cloudflare Pages:

- `/src` = frontend React/Vite
- `/functions` = Pages Functions API
- `migrations` = D1 schema
- `dist` = output build

## 1. Buat bot dan private channel Telegram

1. Buat bot dari `@BotFather`.
2. Simpan `BOT_TOKEN`.
3. Buat private channel untuk storage.
4. Tambahkan bot sebagai admin/member channel.
5. Ambil `TELEGRAM_CHAT_ID`, biasanya berbentuk `-100xxxxxxxxxx`.

## 2. Install dependencies

```bash
npm install
```

## 3. Buat D1 database

```bash
npx wrangler login
npx wrangler d1 create telecloud_personal_db
```

Copy `database_id` dari output, lalu masukkan ke `wrangler.toml`.

## 4. Jalankan migration remote

```bash
npx wrangler d1 execute telecloud_personal_db --remote --file=migrations/0001_init.sql
```

## 5. Push ke GitHub

```bash
git init
git add .
git commit -m "init telecloud personal"
git branch -M main
git remote add origin <REPO_URL>
git push -u origin main
```

## 6. Buat Cloudflare Pages project

Di dashboard Cloudflare:

1. Workers & Pages
2. Create application
3. Pages
4. Connect to Git
5. Pilih repo
6. Framework preset: Vite
7. Build command: `npm run build`
8. Build output directory: `dist`

## 7. Tambahkan environment variables

Tambahkan di Cloudflare Pages project > Settings > Environment variables:

```env
ADMIN_PASSWORD=isi_password_admin
SESSION_SECRET=random_string_panjang_minimal_32_karakter
BOT_TOKEN=123456789:AA_your_bot_token
TELEGRAM_CHAT_ID=-1001234567890
TELEGRAM_API_BASE=https://api.telegram.org
MAX_FILE_SIZE_MB=20
APP_NAME=TeleCloud Personal
DELETE_TELEGRAM_ON_HARD_DELETE=false
```

Gunakan password dan secret yang kuat. Jangan commit file `.dev.vars`.

## 8. Tambahkan D1 binding

Cloudflare Pages project > Settings > Bindings:

- Type: D1 database
- Variable name: `DB`
- Database: `telecloud_personal_db`

Nama binding harus `DB` karena API memakai `env.DB`.

## 9. Deploy ulang

Setelah env dan D1 binding dibuat, deploy ulang project.

## 10. Login

Buka domain Cloudflare Pages kamu, lalu login memakai `ADMIN_PASSWORD`.

## Catatan mode awal

Mode Cloudflare ini direkomendasikan untuk file kecil dengan batas default `20 MB/file`.

Untuk file besar seperti video ratusan MB/GB, gunakan rencana migrasi di `MIGRATION.md`.
