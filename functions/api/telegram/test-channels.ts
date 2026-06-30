import { errorJson, getTelegramApiBase, getTelegramChannelSettings, json, type Env } from '../_common';

interface TelegramSendMessageResponse {
  ok: boolean;
  description?: string;
  error_code?: number;
}

type ChannelKey = 'original' | 'preview' | 'thumbnail';

export const onRequestPost: PagesFunction<Env> = async ({ env }) => {
  if (!env.BOT_TOKEN) return errorJson('BOT_TOKEN belum dikonfigurasi', 500);

  const channels = await getTelegramChannelSettings(env);
  const entries: Array<[ChannelKey, string]> = [
    ['original', channels.original_chat_id],
    ['preview', channels.preview_chat_id],
    ['thumbnail', channels.thumbnail_chat_id],
  ];

  const results = [];
  for (const [key, chatId] of entries) {
    if (!chatId) {
      results.push({ key, ok: false, error: 'Channel ID belum diisi' });
      continue;
    }

    const response = await fetch(`${getTelegramApiBase(env)}/bot${env.BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      body: makeForm({
        chat_id: chatId,
        text: `TeleCloud test: ${key} channel connected`,
        disable_notification: 'true',
      }),
    });
    const data = (await response.json().catch(() => null)) as TelegramSendMessageResponse | null;

    results.push({
      key,
      ok: Boolean(response.ok && data?.ok),
      chat_id: chatId,
      error: response.ok && data?.ok ? null : data?.description || `HTTP ${response.status}`,
    });
  }

  return json({ ok: true, results });
};

function makeForm(values: Record<string, string>) {
  const form = new FormData();
  for (const [key, value] of Object.entries(values)) form.append(key, value);
  return form;
}
