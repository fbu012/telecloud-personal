# Lightbox Background Patch

This patch removes the extra white preview frame behind images in the Media lightbox.

## Changes

- Removed the white bordered preview container behind images/videos.
- Preview media now sits directly on the lightbox content background.
- Kept rounded corners on the media itself.
- Kept a subtle shadow on the media for separation.
- No database migration required.

## Files changed

- `src/App.tsx`
