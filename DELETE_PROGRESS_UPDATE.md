# Delete Progress Update

Patch ini menambahkan progress bar saat proses penghapusan file.

## Fitur

Saat user klik Delete file, dialog delete sekarang menampilkan:

```txt
Progress bar
Persentase proses
Stage label
Spinner pada pilihan delete yang sedang berjalan
```

## Stage yang ditampilkan

Untuk delete biasa / move to trash:

```txt
Preparing move to Trash
Checking secure folder access
Moving file to Trash
Refreshing file list
Delete complete
```

Untuk delete permanen:

```txt
Preparing permanent delete
Checking secure folder access
Deleting permanently from D1 and Telegram
Refreshing file list
Delete complete
```

## Secure folder

Jika file berada di secure folder:

```txt
- App akan mengecek folder token.
- Jika token expired/hilang, user diminta password folder lagi.
- Setelah password benar, delete otomatis retry.
```

## Catatan

Permanent delete berjalan sebagai satu request ke server. Karena Telegram delete diproses server-side, progress bar menampilkan stage proses dari sisi UI/API, bukan progress per message Telegram secara streaming.

Tetap lebih jelas daripada UI kosong karena user bisa melihat proses sedang berjalan dan tidak menutup halaman sebelum selesai.
