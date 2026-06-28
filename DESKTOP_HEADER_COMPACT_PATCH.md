# Desktop Header Compact Patch

This patch aligns the desktop page title with the search input and action buttons.

## Changes

- Desktop header title is now inline with the search bar.
- Search input is limited to a cleaner max width, so it no longer stretches too wide.
- Header uses less vertical space on desktop.
- Mobile header behavior remains unchanged: title/actions on top, search below.
- No database migration required.

## Files changed

- `src/App.tsx`
