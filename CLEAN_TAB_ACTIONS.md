# Clean Tab Actions

This update removes duplicated action buttons across non-Drive tabs and keeps actions context-aware.

## What changed

- Drive/My Files keeps the main actions in the top toolbar:
  - New Folder
  - Upload
  - Refresh
- Media keeps only Upload and Refresh in the top toolbar.
- Starred hides Upload because it is a filtered view, not an upload destination.
- Upload Queue hides the global Upload button because queue-specific actions already exist in the queue panel:
  - Add files
  - Start upload
  - Retry failed
- Settings hides upload/refresh actions.
- Media and Starred cards no longer include a second Upload button in the card header.

## UI rule

Top toolbar is for page-level actions. Content cards are for content and state only, except Upload Queue, where upload actions are part of the queue workflow.
