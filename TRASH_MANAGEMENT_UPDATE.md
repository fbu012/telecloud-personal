# Trash Management Update

Patch ini menambahkan menu Trash untuk TeleCloud.

## Fitur

- Menu baru: `Trash`
- File yang dihapus dari web tetap masuk Trash lebih dulu.
- Trash menampilkan seluruh file yang status metadata D1-nya `trash`.
- Setiap file di Trash bisa:
  - Restore
  - Delete permanently
- Tombol `Empty trash` untuk hapus permanen semua isi Trash.
- Settings baru:
  - Trash auto-delete disabled
  - Delete permanently after 7 / 14 / 30 / 60 / 90 / 180 days
- Auto-delete berjalan saat Trash API dibuka/refreshed.
- Permanent delete akan:
  - menghapus row metadata file dari D1
  - menghapus share link file terkait
  - mencoba menghapus message Telegram original
  - mencoba menghapus message Telegram preview
  - mencoba menghapus message Telegram thumbnail

## Catatan penting

### Soft delete

Saat user klik delete biasa:

```txt
D1 status → trash
Telegram message → tetap ada
File tidak tampil di My Files/Media/Starred
```

### Restore

Saat user klik restore:

```txt
D1 status → uploaded
deleted_at → null
File muncul kembali di lokasi/folder sebelumnya
```

### Permanent delete

Saat user klik Delete permanently / Empty trash:

```txt
D1 metadata row → dihapus
Telegram message original → dicoba hapus
Telegram message preview → dicoba hapus
Telegram message thumbnail → dicoba hapus
Share links file → dihapus
```

Bot harus menjadi admin channel dan punya izin menghapus message supaya penghapusan Telegram berhasil.

Jika penghapusan Telegram gagal, metadata D1 tetap dihapus supaya database tidak membengkak. UI akan menampilkan jumlah Telegram delete yang sukses/gagal.

## Auto-delete

Auto-delete di Settings bersifat aman:

```txt
Default: Disabled
```

Kalau diaktifkan, contoh 30 hari:

```txt
Trash file deleted_at lebih tua dari 30 hari
→ dihapus permanen saat Trash dibuka/refreshed
```

Untuk deletion yang benar-benar jalan terjadwal tanpa membuka aplikasi, nanti bisa ditambahkan Cloudflare Workers Cron. Patch ini memakai opportunistic cleanup agar tetap sederhana di Cloudflare Pages Functions.

## Migration

Tidak ada migration baru.

Patch ini memakai table `app_settings` dari migration sebelumnya:

```powershell
npx wrangler d1 execute telecloud_personal_db --remote --file=migrations/0005_telegram_variants_settings.sql
```

Kalau migration `0005` sudah dijalankan, tidak perlu menjalankan migration tambahan.


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
