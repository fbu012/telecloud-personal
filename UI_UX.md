# UI/UX TeleCloud Personal

## Prinsip

```txt
Mudah upload banyak file
Mudah mencari file lama
Status upload harus jelas
Tampilan bersih dan tenang
Mobile-friendly
```

## Navigasi utama

- Dashboard
- Photos
- Drive
- Uploads
- Favorites
- Settings

MVP saat ini fokus pada:

- Photos
- Drive
- Upload queue
- Settings

## Photos View

Dipakai untuk foto dan video.

Layout:

```txt
Today
[card] [card] [card]

Yesterday
[card] [card] [card]
```

MVP memakai grid sederhana dengan placeholder icon. Thumbnail asli bisa ditambahkan nanti.

## Drive View

Dipakai untuk semua file.

Kolom:

- Name
- Type
- Size
- Uploaded
- Actions

## Bulk Upload UX

Bulk upload tidak mengirim banyak file dalam satu request besar.

Prinsip:

```txt
1 file = 1 request = 1 Telegram message = 1 database row
```

Status queue:

- queued
- uploading
- uploaded
- failed
- retrying
- skipped

Action:

- Retry failed
- Clear completed
- Cancel waiting

## Empty states

Photos kosong:

```txt
Belum ada foto atau video. Upload file pertamamu.
```

Drive kosong:

```txt
Belum ada file. Mulai upload dokumen, foto, atau arsip.
```

Upload queue kosong:

```txt
Pilih beberapa file untuk memulai bulk upload.
```

## Error states

File terlalu besar:

```txt
File terlalu besar untuk mode saat ini. Maksimal 20 MB/file.
```

Telegram gagal:

```txt
Upload ke Telegram gagal. Coba retry file ini.
```

Database gagal:

```txt
File mungkin sudah terkirim ke Telegram, tetapi metadata gagal disimpan. Cek event log.
```

## Detail Drawer

Saat klik file:

- Preview placeholder
- Nama file
- Ukuran
- MIME type
- Tanggal upload
- Favorite toggle
- Rename
- Download
- Delete
- Advanced metadata
