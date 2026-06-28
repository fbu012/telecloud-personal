# Folder & Preview Upgrade

Update ini menambahkan fitur berikut:

- Preview gambar langsung di Photos, Drive, dan File Details.
- Endpoint download mendukung `disposition=inline` untuk preview.
- Folder virtual seperti Google Drive, disimpan di Cloudflare D1.
- Upload ke folder aktif.
- Drag & drop file lokal ke Drive untuk upload ke folder aktif.
- Drag file yang sudah tersimpan ke kartu folder untuk memindahkan file.

## Deploy update

```bash
npm install
npm run build
npx wrangler pages deploy dist --project-name=telecloud-personal --branch=main
```

## Jalankan migration baru

Wajib dijalankan satu kali setelah update kode:

```bash
npx wrangler d1 execute telecloud_personal_db --remote --file=migrations/0002_folders.sql
```

Kalau nama database D1 kamu berbeda, ganti `telecloud_personal_db` dengan nama database yang kamu pakai.

## Catatan penting

File lama tetap aman. Setelah migration, file lama otomatis berada di Root karena `folder_id` bernilai `NULL`.

Folder ini virtual di database. Telegram tetap menyimpan file sebagai pesan di private channel, sedangkan struktur folder dikelola oleh aplikasi.
