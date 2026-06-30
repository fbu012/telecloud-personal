import {
  errorJson,
  getAppSetting,
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
  const trashAutoDeleteDays = normalizeTrashRetentionDays(await getAppSetting(env, 'trash_auto_delete_days', '0'));

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
    trash_auto_delete_days: trashAutoDeleteDays,
    local_agent_token_configured: Boolean(env.LOCAL_AGENT_TOKEN),
    migration_ready: true,
  });
};

export const onRequestPatch: PagesFunction<Env> = async ({ request, env }) => {
  let body: {
    telegram_original_chat_id?: string;
    telegram_preview_chat_id?: string;
    telegram_thumbnail_chat_id?: string;
    trash_auto_delete_days?: number | string;
  };

  try {
    body = await request.json();
  } catch {
    return errorJson('Invalid JSON body', 400);
  }

  try {
    if (Object.prototype.hasOwnProperty.call(body, 'telegram_original_chat_id')) {
      await setAppSetting(env, 'telegram_original_chat_id', cleanChatId(body.telegram_original_chat_id));
    }
    if (Object.prototype.hasOwnProperty.call(body, 'telegram_preview_chat_id')) {
      await setAppSetting(env, 'telegram_preview_chat_id', cleanChatId(body.telegram_preview_chat_id));
    }
    if (Object.prototype.hasOwnProperty.call(body, 'telegram_thumbnail_chat_id')) {
      await setAppSetting(env, 'telegram_thumbnail_chat_id', cleanChatId(body.telegram_thumbnail_chat_id));
    }
    if (Object.prototype.hasOwnProperty.call(body, 'trash_auto_delete_days')) {
      await setAppSetting(env, 'trash_auto_delete_days', String(normalizeTrashRetentionDays(body.trash_auto_delete_days)));
    }
  } catch (err) {
    return errorJson('Gagal menyimpan settings. Pastikan migration 0005_telegram_variants_settings.sql sudah dijalankan.', 500, String(err));
  }

  const channels = await getTelegramChannelSettings(env);
  const trashAutoDeleteDays = normalizeTrashRetentionDays(await getAppSetting(env, 'trash_auto_delete_days', '0'));
  return json({
    ok: true,
    telegram_original_chat_id: channels.original_chat_id,
    telegram_preview_chat_id: channels.preview_chat_id,
    telegram_thumbnail_chat_id: channels.thumbnail_chat_id,
    telegram_original_chat_id_configured: isConfiguredChatId(channels.original_chat_id),
    telegram_preview_chat_id_configured: isConfiguredChatId(channels.preview_chat_id),
    telegram_thumbnail_chat_id_configured: isConfiguredChatId(channels.thumbnail_chat_id),
    trash_auto_delete_days: trashAutoDeleteDays,
    local_agent_token_configured: Boolean(env.LOCAL_AGENT_TOKEN),
  });
};

function cleanChatId(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeTrashRetentionDays(value: unknown): number {
  const days = typeof value === 'number' ? value : Number(value || 0);
  if (!Number.isFinite(days) || days < 0) return 0;
  const allowed = [0, 7, 14, 30, 60, 90, 180];
  return allowed.includes(days) ? days : 0;
}
