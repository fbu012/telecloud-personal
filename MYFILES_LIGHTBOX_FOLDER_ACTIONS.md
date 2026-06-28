# My Files Lightbox and Folder Actions Patch

This patch adds two UX improvements:

## 1. Lightbox preview in My Files

Lightbox preview is no longer limited to the Media tab.

In **My Files**:
- Clicking an image/video thumbnail opens the lightbox gallery.
- Clicking the file name opens the normal file details drawer.
- Non-media files still open the file details drawer.

Supported lightbox preview:
- Images
- Videos

## 2. Folder actions

Folder cards now have a small `⋯` action menu.

Available actions:
- Open
- Rename
- Delete empty folder

Folder delete is intentionally safe:
- A folder cannot be deleted if it contains files.
- A folder cannot be deleted if it contains subfolders.
- Move/delete contents first, then delete the folder.

## Files changed

- `src/App.tsx`

No database migration is required because folder rename/delete endpoints already exist.
