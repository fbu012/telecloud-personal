# Share Links Update

This patch adds Google Drive-style share links for files and folders.

## Features

- File share link
- Folder share link
- Public share page at `/s/<token>`
- Public preview page without admin login
- Download button on public file/folder share page
- Revoke share link
- Optional expiration: never, 1 day, 7 days, 30 days
- Allow download on/off
- Telegram bot token remains hidden server-side

## Required migration

Run once:

```powershell
npx wrangler d1 execute telecloud_personal_db --remote --file=migrations/0003_share_links.sql
```

## Deploy

```powershell
npm install
npm run build
git add .
git commit -m "add share links"
git push
npx wrangler pages deploy dist --project-name=telecloud-personal --branch=main
```

## Notes

Share links are bearer links. Anyone with the link can view the shared page until the link expires or is revoked.
