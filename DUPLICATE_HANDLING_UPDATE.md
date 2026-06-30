# Duplicate Handling Update

Patch ini menambahkan duplicate handling yang lebih aman untuk upload online dan Local Agent.

## Tujuan

Agar file yang sama persis tidak terupload dobel ke Telegram dan tidak membuat metadata dobel di D1.

## Behavior baru

### Exact duplicate

Jika file sama persis berdasarkan checksum SHA-256:

```txt
checksum sama
→ upload diskip
→ tidak upload ke Telegram
→ tidak membuat metadata D1 baru
→ status: Skipped duplicate
```

Ini berlaku untuk:

```txt
- Upload online biasa
- Local Agent file upload
- Local Agent multi upload
- Local Agent folder upload
- Retry failed
```

### Nama sama tapi isi berbeda

Jika nama file sama tetapi isi file berbeda:

```txt
nama sama
checksum beda
→ tetap diupload
→ nama otomatis direname
```

Contoh:

```txt
foto.jpg
foto (1).jpg
foto (2).jpg
```

Jadi file baru tidak menimpa file lama.

## Local Agent preflight

Local Agent sekarang melakukan preflight sebelum upload ke Telegram:

```txt
1. Local Agent hitung checksum file
2. Local Agent tanya online:
   POST /api/local-agent/preflight
3. Jika checksum sudah ada:
   → skip
   → tidak upload Telegram
4. Jika checksum belum ada:
   → online memberi suggested_name
   → Local Agent upload ke Telegram
   → sync metadata ke D1
```

Endpoint baru:

```txt
POST /api/local-agent/preflight
```

Payload:

```json
{
  "folder_id": "optional-folder-id",
  "original_name": "foto.jpg",
  "checksum_sha256": "..."
}
```

Response duplicate:

```json
{
  "ok": true,
  "exact_duplicate": true,
  "duplicate": { "id": "existing-file-id" },
  "skipped": true,
  "reason": "checksum_duplicate"
}
```

Response aman upload:

```json
{
  "ok": true,
  "exact_duplicate": false,
  "duplicate": null,
  "skipped": false,
  "suggested_name": "foto (1).jpg",
  "name_changed": true
}
```

## Catatan

- Duplicate dicek global di semua folder non-trash berdasarkan checksum.
- Rename otomatis dicek per folder berdasarkan nama file.
- File di Trash tidak menghalangi upload file baru dengan nama yang sama.
- Tidak ada migration baru.
