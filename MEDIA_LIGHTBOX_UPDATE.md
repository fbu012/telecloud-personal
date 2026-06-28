# Media Lightbox Gallery Update

This update improves the Media tab with a gallery-focused interaction while keeping the overall Corporate UI direction.

## What changed

- Clicking an image/video in the Media tab now opens a full-screen lightbox.
- The lightbox supports next/previous navigation.
- Keyboard shortcuts are supported:
  - `Esc` closes the lightbox.
  - `ArrowRight` moves to the next media item.
  - `ArrowLeft` moves to the previous media item.
- The lightbox top bar includes quick actions:
  - Star / unstar
  - Download
  - Toggle details panel
  - Close
- The details panel includes metadata and an **Open full details** button.
- The Media grid/list now includes a small **Details** action so users can open the existing file drawer without using the lightbox.

## UX rule

The Media tab is optimized for browsing and previewing media:

- Click media card/row: open gallery lightbox.
- Click Details icon: open metadata/edit drawer.
- Click Download icon: download the file.
- Click Star icon: mark or unmark as starred.

This keeps the grid clean and avoids ambiguous edit buttons.
