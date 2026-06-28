import { getMaxFileSizeBytes, json, type Env } from './_common';

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  return json({
    ok: true,
    app_name: env.APP_NAME || 'TeleCloud Personal',
    storage_provider: 'telegram_bot_api',
    max_file_size_mb: Math.round((getMaxFileSizeBytes(env) / 1024 / 1024) * 100) / 100,
    upload_mode: 'document',
    telegram_api_base: env.TELEGRAM_API_BASE || 'https://api.telegram.org',
    telegram_chat_id_configured: Boolean(env.TELEGRAM_CHAT_ID),
    bot_token_configured: Boolean(env.BOT_TOKEN),
    migration_ready: true,
  });
};
