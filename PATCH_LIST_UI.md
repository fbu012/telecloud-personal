# UI Patch List

Applied patches in this package:

1. **Mobile header actions moved to top row**
   - On mobile, `New Folder`, `Upload`, and `Refresh` are now icon actions beside `Logout`.
   - The action row below the search field is hidden on mobile.

2. **Lightbox details panel scroll fix**
   - Details panel now uses its own scrollable area.
   - Bottom action buttons are pinned inside the panel so `Download` is no longer cut off.

3. **Bulk select in file table**
   - Added row checkbox and header `Select all` checkbox.
   - Added bulk action bar with:
     - Move
     - Copy
     - Delete
     - Clear selection
   - Added target folder selector for move/copy.

4. **Bulk API support**
   - Added `/api/files/bulk` endpoint.
   - Supports bulk `move`, `copy`, and soft `delete`.

## Files changed
- `src/App.tsx`
- `src/lib/api.ts`
- `functions/api/files/bulk.ts`
