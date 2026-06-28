# Mobile Lightbox Details Sheet Patch

This patch improves file Details inside the media lightbox on mobile.

## Changes

- Mobile Details is no longer rendered inline under the preview.
- The Info button now opens a bottom sheet-style Details panel on mobile.
- The preview area stays focused on the image/video.
- The Details panel has its own scroll area and action buttons.
- Desktop still uses a right-side Details panel.
- No database migration required.

## Files changed

- `src/App.tsx`
