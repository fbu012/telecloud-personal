# Telegram Image Variants + Channel Settings Update

This patch adds a 3-channel Telegram storage architecture for images.

## Features

- Telegram channel settings in the Settings page:
  - Original Channel ID
  - Preview Channel ID
  - Thumbnail Channel ID
- Test Channels button that sends a small test message to each configured Telegram channel.
- Images are prepared into:
  - Thumbnail: small image for list/grid
  - Optimized preview: compressed image for lightbox
  - Original: untouched original for download and full-size view
- Image upload queue now shows stage labels:
  - Preparing image
  - Creating thumbnail
  - Creating optimized preview
  - Uploading image variants
  - Saving metadata
- List/grid uses Telegram thumbnail when available.
- Lightbox opens optimized preview first.
- Lightbox includes overlay button:
  - View original size
  - Back to optimized preview
- Download always uses original file.
- BOT_TOKEN remains in Cloudflare Environment Secret.
- Channel IDs can be managed from the app UI.

## Required migration

Run once:

```powershell
npx wrangler d1 execute telecloud_personal_db --remote --file=migrations/0005_telegram_variants_settings.sql
```

If your database has not applied earlier migrations, run in this order first:

```powershell
npx wrangler d1 execute telecloud_personal_db --remote --file=migrations/0003_share_links.sql
npx wrangler d1 execute telecloud_personal_db --remote --file=migrations/0004_secure_folders.sql
npx wrangler d1 execute telecloud_personal_db --remote --file=migrations/0005_telegram_variants_settings.sql
```

## Telegram setup

Create 3 private Telegram channels:

- Original channel
- Preview channel
- Thumbnail channel

Add the same bot to all 3 channels and make it admin.

Then open TeleCloud:

```txt
Settings → Telegram Storage Channels
```

Fill:

```txt
Original Channel ID
Preview Channel ID
Thumbnail Channel ID
```

Then click:

```txt
Test channels
```

## Important notes

- Existing old image files will not automatically have thumbnail/preview variants.
- New image uploads after this patch will create thumbnail + preview + original variants.
- If browser-side image optimization fails for a specific format, TeleCloud falls back to uploading the original file only.
- This is not client-side encryption. It is optimized storage/preview handling.


## Detailed Settings Guide

### What you need from Telegram

```txt
1. BOT_TOKEN
2. Original Channel ID
3. Preview Channel ID
4. Thumbnail Channel ID
```

Use **one bot** for all channels. Add the bot as admin to all 3 private channels.

### Where each value should be configured

```txt
BOT_TOKEN
→ Cloudflare Secret / Environment Variable

Original Channel ID
Preview Channel ID
Thumbnail Channel ID
→ Settings page inside TeleCloud
```

Optional env fallback:

```env
TELEGRAM_ORIGINAL_CHAT_ID=-100xxxxxxxxxx
TELEGRAM_PREVIEW_CHAT_ID=-100xxxxxxxxxx
TELEGRAM_THUMBNAIL_CHAT_ID=-100xxxxxxxxxx
```

### Recommended flow after deploy

```txt
1. Open TeleCloud.
2. Go to Settings.
3. Find Telegram Storage Channels.
4. Fill Original Channel ID.
5. Fill Preview Channel ID.
6. Fill Thumbnail Channel ID.
7. Click Save channel settings.
8. Click Test channels.
9. Upload a new image.
10. Check:
   - Original channel receives original file.
   - Preview channel receives optimized preview.
   - Thumbnail channel receives small thumbnail.
```

### Troubleshooting

If Test channels fails:

```txt
- Check BOT_TOKEN is configured in Cloudflare.
- Check bot is admin in each channel.
- Check channel IDs start with -100.
- Send a new message in the channel after adding the bot, then rerun getUpdates if needed.
- Confirm you saved settings before testing.
```

If image upload only stores original:

```txt
- The browser may have failed to optimize that image format.
- Try JPEG/PNG/WebP.
- Existing old files will not automatically get variants.
```
