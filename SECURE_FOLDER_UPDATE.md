# Secure Folder Update

This patch adds password-protected folders in **My Files**.

## Features

- Set password on a folder from the folder `⋯` menu.
- Folder shows a lock icon when secured.
- Opening a secured folder asks for the folder password.
- Unlock token lasts for the current browser session.
- Backend also enforces the lock for:
  - listing files inside secure folders
  - preview/download files in secure folders
  - upload into secure folders
  - edit/delete/move files from secure folders
  - bulk actions involving secure folders
- Secure folders cannot be shared with public share links.
- Files inside secure folders cannot be shared with public share links.

## Required migration

Run once after deploying this patch:

```powershell
npx wrangler d1 execute telecloud_personal_db --remote --file=migrations/0004_secure_folders.sql
```

If you have not applied the share links migration yet, run it first:

```powershell
npx wrangler d1 execute telecloud_personal_db --remote --file=migrations/0003_share_links.sql
```

## Important note

This is access protection inside TeleCloud, not file encryption. Files are still stored in Telegram as before. For true encryption, files would need to be encrypted before upload and decrypted during download.
