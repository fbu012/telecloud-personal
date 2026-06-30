import {
  errorJson,
  getMaxFileSizeBytes,
  getTelegramApiBase,
  getTelegramChannelSettings,
  isConfiguredChatId,
  json,
  setAppSetting,
  type Env,
} from './_common';

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const channels = await getTelegramChannelSettings(env);

  return json({
    ok: true,
    app_name: env.APP_NAME || 'TeleCloud Personal',
    storage_provider: 'telegram_bot_api',
    max_file_size_mb: Math.round((getMaxFileSizeBytes(env) / 1024 / 1024) * 100) / 100,
    upload_mode: 'document',
    telegram_api_base: getTelegramApiBase(env),
    telegram_chat_id_configured: isConfiguredChatId(channels.original_chat_id),
    telegram_original_chat_id: channels.original_chat_id,
    telegram_preview_chat_id: channels.preview_chat_id,
    telegram_thumbnail_chat_id: channels.thumbnail_chat_id,
    telegram_original_chat_id_configured: isConfiguredChatId(channels.original_chat_id),
    telegram_preview_chat_id_configured: isConfiguredChatId(channels.preview_chat_id),
    telegram_thumbnail_chat_id_configured: isConfiguredChatId(channels.thumbnail_chat_id),
    bot_token_configured: Boolean(env.BOT_TOKEN),
    migration_ready: true,
  });
};

export const onRequestPatch: PagesFunction<Env> = async ({ request, env }) => {
  let body: {
    telegram_original_chat_id?: string;
    telegram_preview_chat_id?: string;
    telegram_thumbnail_chat_id?: string;
  };

  try {
    body = await request.json();
  } catch {
    return errorJson('Invalid JSON body', 400);
  }

  try {
    await setAppSetting(env, 'telegram_original_chat_id', cleanChatId(body.telegram_original_chat_id));
    await setAppSetting(env, 'telegram_preview_chat_id', cleanChatId(body.telegram_preview_chat_id));
    await setAppSetting(env, 'telegram_thumbnail_chat_id', cleanChatId(body.telegram_thumbnail_chat_id));
  } catch (err) {
    return errorJson('Gagal menyimpan settings. Pastikan migration 0005_telegram_variants_settings.sql sudah dijalankan.', 500, String(err));
  }

  const channels = await getTelegramChannelSettings(env);
  return json({
    ok: true,
    telegram_original_chat_id: channels.original_chat_id,
    telegram_preview_chat_id: channels.preview_chat_id,
    telegram_thumbnail_chat_id: channels.thumbnail_chat_id,
    telegram_original_chat_id_configured: isConfiguredChatId(channels.original_chat_id),
    telegram_preview_chat_id_configured: isConfiguredChatId(channels.preview_chat_id),
    telegram_thumbnail_chat_id_configured: isConfiguredChatId(channels.thumbnail_chat_id),
  });
};

function cleanChatId(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}
