# Toolbar View Dropdown Patch

This patch makes the toolbar more compact and corporate.

## Changes

- Replaced the List/Grid segmented control with a `View` dropdown.
- Toolbar is now a single compact row when there is enough width:
  - Type
  - Sort
  - View
- On small screens, controls can still wrap naturally.
- No database migration required.

## Files changed

- `src/App.tsx`
