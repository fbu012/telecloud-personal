# Local Agent Retry Failed Guide

Patch ini menambahkan tombol **Retry failed** di dashboard Local Agent.

## Masalah

Saat multi upload/folder upload, sebagian file bisa gagal karena:

```txt
- koneksi Telegram timeout
- rate limit sementara
- file terlalu besar
- koneksi internet putus
- sync metadata online gagal
```

Sebelumnya user harus memilih ulang file/folder secara manual.

## Fitur baru

Jika ada file gagal, dashboard akan menampilkan:

```txt
Upload gagal
Retry failed
Daftar file gagal + pesan error
```

Klik **Retry failed** untuk upload ulang hanya file yang gagal.

## Cara kerja

- File berhasil tidak diupload ulang.
- File gagal disimpan sementara di memory browser selama halaman Local Agent masih terbuka.
- Retry memakai relative path yang sama, jadi folder/subfolder tetap sesuai.
- Jika halaman direfresh, daftar failed sementara hilang dan perlu pilih file/folder lagi.

## Catatan duplicate / file dengan nama sama

Saat ini TeleCloud tidak melakukan replace otomatis berdasarkan nama file.

Behavior saat upload file dengan nama yang sama:

```txt
Nama sama, isi berbeda
→ dibuat sebagai file baru dengan nama yang sama di folder yang sama.

Isi file sama / checksum sama
→ Online API akan menandai duplicate dan metadata baru tidak dibuat.
```

Jadi saat ini belum ada mode:

```txt
replace existing file
auto rename file (1), file (2)
```

Untuk versi berikutnya bisa ditambahkan setting duplicate behavior:

```txt
Duplicate name behavior:
- Keep both
- Auto rename
- Replace existing
```


## Duplicate Handling

Upload online dan Local Agent sekarang memakai duplicate handling berbasis checksum:

```txt
File sama persis / checksum sama
→ skip sebelum upload Telegram

Nama sama tapi isi beda
→ auto rename: file (1).ext
```

Lihat detail:

```txt
DUPLICATE_HANDLING_UPDATE.md
```
