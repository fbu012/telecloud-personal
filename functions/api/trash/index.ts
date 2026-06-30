import { errorJson, getAppSetting, getTelegramApiBase, json, logEvent, nowIso, type Env } from '../_common';

interface FileRow {
  id: string;
  folder_id: string | null;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  checksum_sha256: string | null;
  telegram_chat_id: string;
  telegram_message_id: number;
  telegram_file_id: string | null;
  telegram_file_unique_id: string | null;
  preview_telegram_chat_id?: string | null;
  preview_telegram_message_id?: number | null;
  preview_telegram_file_id?: string | null;
  preview_telegram_file_unique_id?: string | null;
  preview_mime_type?: string | null;
  preview_size_bytes?: number | null;
  thumbnail_telegram_chat_id?: string | null;
  thumbnail_telegram_message_id?: number | null;
  thumbnail_telegram_file_id?: string | null;
  thumbnail_telegram_file_unique_id?: string | null;
  thumbnail_mime_type?: string | null;
  thumbnail_size_bytes?: number | null;
  storage_provider: string;
  upload_mode: string;
  status: string;
  is_favorite: number;
  tags_json: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

type TrashAction = 'restore' | 'delete_permanently' | 'empty' | 'cleanup_old';

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const retentionDays = await getTrashRetentionDays(env);
  const cleanup = retentionDays > 0 ? await deleteOldTrash(env, retentionDays) : { count: 0, telegram_failed: 0 };

  const result = await env.DB.prepare(
    `SELECT * FROM files WHERE status = ? ORDER BY COALESCE(deleted_at, updated_at) DESC LIMIT 500`,
  )
    .bind('trash')
    .all<FileRow>();

  return json({
    ok: true,
    files: normalizeFiles(result.results || []),
    auto_deleted_count: cleanup.count,
    telegram_failed_count: cleanup.telegram_failed,
    trash_auto_delete_days: retentionDays,
  });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let body: { action?: TrashAction; ids?: string[]; days?: number };
  try {
    body = await request.json();
  } catch {
    return errorJson('Invalid JSON body', 400);
  }

  const action = body.action;
  if (!action || !['restore', 'delete_permanently', 'empty', 'cleanup_old'].includes(action)) {
    return errorJson('Invalid trash action', 400);
  }

  if (action === 'restore') {
    const ids = cleanIds(body.ids);
    if (!ids.length) return errorJson('No files selected', 400);

    const now = nowIso();
    const placeholders = ids.map(() => '?').join(',');
    await env.DB.prepare(`UPDATE files SET status = ?, deleted_at = NULL, updated_at = ? WHERE status = ? AND id IN (${placeholders})`)
      .bind('uploaded', now, 'trash', ...ids)
      .run();

    await logEvent(env, 'trash_restored', 'Files restored from trash', { count: ids.length, ids });
    return json({ ok: true, count: ids.length });
  }

  if (action === 'delete_permanently') {
    const ids = cleanIds(body.ids);
    if (!ids.length) return errorJson('No files selected', 400);
    const files = await selectTrashFilesByIds(env, ids);
    const result = await permanentlyDeleteFiles(env, files);
    await logEvent(env, 'trash_permanently_deleted', 'Files permanently deleted from trash', result);
    return json({ ok: true, ...result });
  }

  if (action === 'empty') {
    const rows = await env.DB.prepare('SELECT * FROM files WHERE status = ? ORDER BY COALESCE(deleted_at, updated_at) ASC LIMIT 500')
      .bind('trash')
      .all<FileRow>();
    const result = await permanentlyDeleteFiles(env, rows.results || []);
    await logEvent(env, 'trash_emptied', 'Trash emptied permanently', result);
    return json({ ok: true, ...result, limit: 500 });
  }

  const days = normalizeRetentionDays(body.days);
  if (days <= 0) return errorJson('Cleanup days wajib lebih dari 0', 400);
  const result = await deleteOldTrash(env, days);
  await logEvent(env, 'trash_old_cleanup', 'Old trash cleanup executed', { ...result, days });
  return json({ ok: true, ...result, days });
};

async function getTrashRetentionDays(env: Env): Promise<number> {
  return normalizeRetentionDays(await getAppSetting(env, 'trash_auto_delete_days', '0'));
}

function normalizeRetentionDays(value: unknown): number {
  const days = typeof value === 'number' ? value : Number(value || 0);
  if (!Number.isFinite(days) || days < 0) return 0;
  const allowed = [0, 7, 14, 30, 60, 90, 180];
  return allowed.includes(days) ? days : 0;
}

async function deleteOldTrash(env: Env, days: number) {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const rows = await env.DB.prepare(
    'SELECT * FROM files WHERE status = ? AND deleted_at IS NOT NULL AND deleted_at <= ? ORDER BY deleted_at ASC LIMIT 200',
  )
    .bind('trash', cutoff)
    .all<FileRow>();

  return permanentlyDeleteFiles(env, rows.results || []);
}

async function selectTrashFilesByIds(env: Env, ids: string[]) {
  const placeholders = ids.map(() => '?').join(',');
  const rows = await env.DB.prepare(`SELECT * FROM files WHERE status = ? AND id IN (${placeholders})`)
    .bind('trash', ...ids)
    .all<FileRow>();
  return rows.results || [];
}

async function permanentlyDeleteFiles(env: Env, files: FileRow[]) {
  let telegramDeleted = 0;
  let telegramFailed = 0;
  const ids: string[] = [];

  for (const file of files) {
    ids.push(file.id);
    const targets = getTelegramMessageTargets(file);
    for (const target of targets) {
      const deleted = await deleteTelegramMessage(env, target.chat_id, target.message_id);
      if (deleted) telegramDeleted += 1;
      else telegramFailed += 1;
    }

    await safeDeleteShareLinks(env, file.id);
    await env.DB.prepare('DELETE FROM files WHERE id = ?').bind(file.id).run();
  }

  return {
    count: files.length,
    ids,
    telegram_deleted: telegramDeleted,
    telegram_failed: telegramFailed,
  };
}

function getTelegramMessageTargets(file: FileRow) {
  const seen = new Set<string>();
  const targets: Array<{ chat_id: string; message_id: number }> = [];

  function add(chatId: string | null | undefined, messageId: number | null | undefined) {
    if (!chatId || !messageId) return;
    const key = `${chatId}:${messageId}`;
    if (seen.has(key)) return;
    seen.add(key);
    targets.push({ chat_id: chatId, message_id: messageId });
  }

  add(file.telegram_chat_id, file.telegram_message_id);
  add(file.preview_telegram_chat_id, file.preview_telegram_message_id);
  add(file.thumbnail_telegram_chat_id, file.thumbnail_telegram_message_id);

  return targets;
}

async function deleteTelegramMessage(env: Env, chatId: string, messageId: number): Promise<boolean> {
  if (!env.BOT_TOKEN) return false;
  try {
    const response = await fetch(`${getTelegramApiBase(env)}/bot${env.BOT_TOKEN}/deleteMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, message_id: messageId }),
    });
    const data = (await response.json().catch(() => null)) as { ok?: boolean } | null;
    return Boolean(response.ok && data?.ok);
  } catch {
    return false;
  }
}

async function safeDeleteShareLinks(env: Env, fileId: string) {
  try {
    await env.DB.prepare('DELETE FROM share_links WHERE target_type = ? AND target_id = ?').bind('file', fileId).run();
  } catch {
    // share_links table may not exist on partially migrated installs.
  }
}

function cleanIds(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((id): id is string => typeof id === 'string' && id.trim().length > 0).slice(0, 200)
    : [];
}

function normalizeFiles(files: FileRow[]) {
  return files.map((file) => ({
    ...file,
    folder_id: file.folder_id || null,
    is_favorite: Boolean(file.is_favorite),
    tags: safeParseTags(file.tags_json),
  }));
}

function safeParseTags(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [];
  } catch {
    return [];
  }
}
