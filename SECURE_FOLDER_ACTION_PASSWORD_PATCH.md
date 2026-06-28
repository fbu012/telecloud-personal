# Secure Folder Action Password Patch

This patch tightens secure-folder actions.

## Fix

Previously, some secure-folder menu actions such as **Remove password** could run without asking for the folder password first.

Now every sensitive action for a secure folder asks for the folder password before execution:

- Rename
- Change password
- Remove password
- Delete empty folder

The backend also enforces this. Even if someone bypasses the UI and calls the API directly, secure-folder PATCH/DELETE actions require a valid folder unlock token.

## Notes

- No new database migration is required.
- This patch builds on the secure-folder migration `0004_secure_folders.sql`.
