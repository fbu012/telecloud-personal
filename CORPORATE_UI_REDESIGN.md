# Corporate UI Redesign

TeleCloud is redesigned as a corporate file management console instead of a consumer-style mobile drive clone.

## Design direction

- Style name: **TeleCloud Corporate Console**
- Mood: clean, serious, compact, enterprise-ready
- Default view: Drive list/table
- Border radius: **8px** globally
- Shadow: minimal, mostly border-based surfaces
- Primary action: solid blue upload button
- No large floating `+` button
- No horizontal scrolling filter chips

## Layout

### Desktop

- Fixed left sidebar for navigation
- Sticky top header with title, search, upload, new folder, refresh, logout
- Main content uses white bordered panels
- Drive is table-first, grid is optional

### Mobile

- Compact top header
- Bottom navigation remains for quick switching
- Upload and folder actions stay in toolbar/header, not as large floating buttons
- Filter toolbar wraps naturally instead of using horizontal scrolling

## Toolbar pattern

Filters are dropdown based:

- Type dropdown
- Sort dropdown
- List/Grid segmented switch

This avoids horizontal scroll and keeps the interface more corporate.

## Drive behavior

- Breadcrumb: Root / Folder / Child Folder
- Folder cards at the top of the active folder
- Files below folder cards
- List mode uses table columns: Name, Type, Size, Uploaded, Actions
- Grid mode uses compact preview cards
- Drag stored file into a folder card to move it
- Drop local files into the active Drive panel to upload to that folder

## Visual tokens

```css
--background: #f6f8fb;
--card: #ffffff;
--border: #d9e1ec;
--foreground: #0f172a;
--primary: #1d4ed8;
--primary-hover: #1e40af;
--radius: 8px;
```

## What changed from the Google Drive style version

- Removed large floating plus button
- Removed overly rounded/bubble UI
- Replaced scrollable filter chips with dropdown toolbar
- Reworked desktop sidebar to a corporate navigation panel
- Reworked file list to a stronger table-first layout
- Reduced shadows and softened visual noise
- Standardized all major UI elements around 8px radius
