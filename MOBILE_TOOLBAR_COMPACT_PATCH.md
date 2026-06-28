# Mobile Toolbar Compact Patch

This patch improves the Type / Sort / View controls on mobile.

## Changes

- Mobile toolbar becomes 3 compact columns:
  - Type
  - Sort
  - View
- Mobile labels are hidden to save vertical height.
- Desktop still keeps the clear labels:
  - Type
  - Sort
  - View
- View options are shortened to `List` and `Grid`.
- No database migration required.

## Files changed

- `src/App.tsx`
