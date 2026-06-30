# Secure Folder Delete Dialog Update

Patch ini memperbaiki kasus delete file di dalam secure folder yang memunculkan error:

```txt
Folder terkunci. Masukkan password folder untuk membuka.
```

## Perbaikan

- Delete file sekarang mengirim `folder_token` ketika file berada di secure folder.
- Jika token folder sudah expired/hilang, aplikasi akan meminta password folder lagi lalu retry delete.
- Bulk delete dari dalam secure folder juga mengirim folder token aktif.
- Dialog delete file sekarang punya 2 pilihan:
  - Delete biasa / Move to Trash
  - Delete permanen sekarang

## Delete biasa

```txt
File → masuk Trash
D1 status → trash
Telegram original/preview/thumbnail → tetap ada
Bisa restore dari menu Trash
```

## Delete permanen sekarang

```txt
File → tidak masuk Trash
Metadata D1 → dihapus
Telegram original → dicoba hapus
Telegram preview → dicoba hapus
Telegram thumbnail → dicoba hapus
Share link terkait → tidak lagi dapat dipakai karena file sudah hilang
```

Bot Telegram harus menjadi admin channel dan punya izin delete message agar penghapusan Telegram berhasil.

## Migration

Tidak ada migration baru.


## Delete progress

Dialog delete file sekarang menampilkan progress bar, persentase, dan stage label saat proses penghapusan berlangsung.

```txt
Checking secure folder access
Moving file to Trash
Deleting permanently from D1 and Telegram
Refreshing file list
Delete complete
```

Lihat juga:

```txt
DELETE_PROGRESS_UPDATE.md
```
