# Local Agent Folder Upload Guide

Patch ini menambahkan mode **upload folder** di TeleCloud Local Agent.

## Fitur

Di dashboard lokal `http://localhost:8788` sekarang ada dua pilihan:

```txt
Choose files
Choose folder
```

Jika memilih `Choose folder`, browser akan mengambil seluruh isi folder termasuk subfolder.

Contoh struktur lokal:

```txt
Project A/
├─ image-1.jpg
├─ docs/
│  └─ proposal.pdf
└─ assets/
   └─ logo.png
```

Jika diupload ke Root online, TeleCloud otomatis membuat:

```txt
Root/
└─ Project A/
   ├─ image-1.jpg
   ├─ docs/
   │  └─ proposal.pdf
   └─ assets/
      └─ logo.png
```

Jika folder tujuan online dipilih, misalnya `Client`, maka struktur dibuat di dalam folder itu:

```txt
Client/
└─ Project A/
   ├─ image-1.jpg
   └─ docs/
      └─ proposal.pdf
```

## Cara kerja

1. Dashboard lokal membaca `webkitRelativePath` dari browser.
2. Local Agent mengirim path relatif ke server lokal.
3. Server lokal meminta Online API membuat folder/subfolder yang belum ada.
4. File diupload ke Telegram.
5. Metadata file disimpan ke D1 online dengan `folder_id` subfolder yang sesuai.

## Endpoint baru

Local Agent memakai endpoint online:

```txt
POST /api/local-agent/folders
```

Payload:

```json
{
  "parent_id": "folder-online-opsional",
  "path": ["Project A", "docs"]
}
```

Response:

```json
{
  "ok": true,
  "folder_id": "folder-terakhir",
  "created_count": 2
}
```

## Catatan

- Folder yang sudah ada tidak dibuat ulang.
- File tetap diproses satu per satu.
- Progress bar menunjukkan total progress semua file.
- History lokal tetap maksimal 100 item.
- Hapus history tidak berpengaruh ke file online, D1, atau Telegram.

## Batasan

Browser support untuk folder picker memakai atribut:

```txt
webkitdirectory
```

Ini berjalan baik di Chrome/Edge desktop. Firefox mungkin tidak mendukung folder picker penuh.


## Local Agent retry failed

Jika multi upload/folder upload menghasilkan sebagian file gagal, dashboard akan menampilkan tombol:

```txt
Retry failed
```

Tombol ini akan mencoba upload ulang hanya file yang gagal. File yang sudah sukses tidak diupload ulang.

Lihat:

```txt
LOCAL_AGENT_RETRY_FAILED_GUIDE.md
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
