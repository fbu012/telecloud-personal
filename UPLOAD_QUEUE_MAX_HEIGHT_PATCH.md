# Upload Queue Max Height Patch

This patch keeps the Upload Queue page from growing endlessly when many files are added.

## Changes

- Upload queue list now has a max height.
- The queue area scrolls internally when there are many files.
- Header buttons remain visible.
- Footer actions remain below the scrollable queue.
- No database migration required.

## Files changed

- `src/App.tsx`
