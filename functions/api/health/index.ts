import { getMaxFileSizeBytes, json, type Env } from '../_common';

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  return json({
    ok: true,
    app_name: env.APP_NAME || 'TeleCloud Personal',
    storage_provider: 'telegram_bot_api',
    max_file_size_bytes: getMaxFileSizeBytes(env),
    telegram_api_base: env.TELEGRAM_API_BASE || 'https://api.telegram.org',
    has_db: Boolean(env.DB),
    has_bot_token: Boolean(env.BOT_TOKEN),
    has_chat_id: Boolean(env.TELEGRAM_CHAT_ID),
  });
};
