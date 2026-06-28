# TeleCloud Corporate Style Guide

## Visual direction

TeleCloud uses a corporate dashboard style: compact spacing, clear borders, minimal shadows, and table-first file management.

## Radius

Use `8px` for buttons, inputs, cards, dialogs, dropdowns, and table containers.

Avoid large consumer-style radii such as `24px`, `28px`, `32px`, and `rounded-full` except for tiny status dots or avatars.

## Color palette

| Token | Value |
|---|---:|
| Background | `#F6F8FB` |
| Surface | `#FFFFFF` |
| Border | `#D9E1EC` |
| Text | `#0F172A` |
| Secondary text | `#64748B` |
| Primary | `#1D4ED8` |
| Primary hover | `#1E40AF` |
| Success | `#16A34A` |
| Warning | `#F59E0B` |
| Danger | `#DC2626` |

## Layout rules

- Desktop uses left sidebar + sticky top header.
- Mobile uses compact top header + bottom navigation.
- No large floating action button.
- Filters use dropdowns and wrap; do not use horizontal scrolling chips.
- Default file view is list/table. Grid thumbnail view is optional.

## Components

- Buttons: 8px radius, compact height, clear hierarchy.
- Inputs: 8px radius, subtle border, no heavy shadow.
- Cards: 8px radius, 1px border, minimal shadow.
- Tables: readable rows, subtle hover, action buttons aligned right.
- Upload queue: stable row list with progress bars and status icons.
