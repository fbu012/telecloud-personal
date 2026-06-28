# Lightbox Visual Fix

This update changes the Media lightbox from a full-screen black overlay into a corporate modal style.

## Changes

- Replaced the heavy black full-screen lightbox with a centered white modal panel.
- Backdrop is now a softer `bg-slate-950/45` with `backdrop-blur-sm`.
- Header, actions, navigation arrows, and details panel now use the corporate light theme.
- Image/video preview area uses a bordered white surface on a soft slate background.
- Detail panel is now white with standard border/radius 8px.

## Reason

The previous black overlay made the app content behind it feel duplicated and visually heavy. The new design keeps focus on the media while preserving the cleaner corporate dashboard direction.
