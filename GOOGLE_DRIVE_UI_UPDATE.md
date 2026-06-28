# Google Drive Style UI Update

Update ini membuat tampilan TeleCloud Personal lebih mirip pengalaman Google Drive, terutama di mobile.

## Fitur UI baru

- Mobile bottom navigation: Home, Starred, Uploads, Files.
- Header search berbentuk pill seperti Google Drive mobile.
- Floating action button `+` untuk upload di mobile.
- Floating folder button di halaman Drive untuk membuat folder baru.
- Drive toolbar dengan:
  - filter tipe file,
  - sort by,
  - toggle list/grid view.
- List view ala Google Drive dengan kolom Name, Type, Size, Uploaded, Actions.
- Grid/thumbnail view untuk melihat file sebagai kartu.
- Preview gambar langsung di list, grid, dan detail file.
- Folder virtual di halaman Drive.
- Upload ke folder aktif.
- Drag & drop file lokal ke folder aktif.
- Drag file yang sudah tersimpan ke folder lain.

## Cara update dari versi sebelumnya

1. Replace file project lama dengan versi ini.
2. Pastikan migration folder sudah dijalankan:

```powershell
npx wrangler d1 execute telecloud_personal_db --remote --file=migrations/0002_folders.sql
```

3. Build:

```powershell
npm install
npm run build
```

4. Deploy:

```powershell
npx wrangler pages deploy dist --project-name=telecloud-personal --branch=main
```

Atau commit dan push kalau kamu memakai build/deploy dari GitHub.

## Catatan

UI ini terinspirasi dari pola Google Drive, tetapi tidak menyalin brand/logo Google. Semua storage tetap memakai Telegram Bot API + Cloudflare D1 seperti arsitektur TeleCloud Personal.
