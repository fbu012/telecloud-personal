import { errorJson, getTelegramApiBase, json, logEvent, nowIso, requireFolderUnlocked, sanitizeFileName, type Env } from '../_common';

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

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return errorJson('Query `id` wajib diisi', 400);

  const file = await env.DB.prepare('SELECT * FROM files WHERE id = ? LIMIT 1').bind(id).first<FileRow>();
  if (!file) return errorJson('File tidak ditemukan', 404);

  const locked = await requireFolderUnlocked(env, request, file.folder_id);
  if (locked) return locked;

  return json({ ok: true, file: normalizeFile(file) });
};

export const onRequestPatch: PagesFunction<Env> = async ({ request, env }) => {
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return errorJson('Query `id` wajib diisi', 400);

  const existing = await env.DB.prepare('SELECT * FROM files WHERE id = ? LIMIT 1').bind(id).first<FileRow>();
  if (!existing) return errorJson('File tidak ditemukan', 404);

  const currentLocked = await requireFolderUnlocked(env, request, existing.folder_id);
  if (currentLocked) return currentLocked;

  let body: { original_name?: string; is_favorite?: boolean; tags?: string[]; notes?: string | null; folder_id?: string | null };
  try {
    body = await request.json();
  } catch {
    return errorJson('Invalid JSON body', 400);
  }

  const originalName = typeof body.original_name === 'string' ? sanitizeFileName(body.original_name) : existing.original_name;
  const isFavorite = typeof body.is_favorite === 'boolean' ? (body.is_favorite ? 1 : 0) : existing.is_favorite;
  const tags = Array.isArray(body.tags) ? body.tags.filter((tag) => typeof tag === 'string').slice(0, 20) : safeParseTags(existing.tags_json);
  const notes = typeof body.notes === 'string' || body.notes === null ? body.notes : existing.notes;
  const folderId = Object.prototype.hasOwnProperty.call(body, 'folder_id') ? (body.folder_id || null) : existing.folder_id;

  if (folderId) {
    const folder = await env.DB.prepare('SELECT id FROM folders WHERE id = ? LIMIT 1').bind(folderId).first<{ id: string }>();
    if (!folder) return errorJson('Folder tujuan tidak ditemukan', 404);
    const targetLocked = await requireFolderUnlocked(env, request, folderId);
    if (targetLocked) return targetLocked;
  }

  const updatedAt = nowIso();

  await env.DB.prepare(
    'UPDATE files SET original_name = ?, is_favorite = ?, tags_json = ?, notes = ?, folder_id = ?, updated_at = ? WHERE id = ?',
  )
    .bind(originalName, isFavorite, JSON.stringify(tags), notes, folderId, updatedAt, id)
    .run();

  const updated = await env.DB.prepare('SELECT * FROM files WHERE id = ? LIMIT 1').bind(id).first<FileRow>();
  return json({ ok: true, file: normalizeFile(updated!) });
};

export const onRequestDelete: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  const hard = url.searchParams.get('hard') === 'true';
  const deleteTelegram = url.searchParams.get('delete_telegram') === 'true' || env.DELETE_TELEGRAM_ON_HARD_DELETE === 'true';
  if (!id) return errorJson('Query `id` wajib diisi', 400);

  const file = await env.DB.prepare('SELECT * FROM files WHERE id = ? LIMIT 1').bind(id).first<FileRow>();
  if (!file) return errorJson('File tidak ditemukan', 404);

  const locked = await requireFolderUnlocked(env, request, file.folder_id);
  if (locked) return locked;

  if (hard) {
    const telegramResult = deleteTelegram ? await deleteTelegramMessagesForFile(env, file) : { deleted: 0, failed: 0 };

    await env.DB.prepare('DELETE FROM files WHERE id = ?').bind(id).run();
    await logEvent(env, 'file_hard_deleted', 'File hard deleted', { id, original_name: file.original_name, telegram: telegramResult });
    return json({ ok: true, hard_deleted: true, telegram: telegramResult });
  }

  const deletedAt = nowIso();
  await env.DB.prepare('UPDATE files SET status = ?, deleted_at = ?, updated_at = ? WHERE id = ?')
    .bind('trash', deletedAt, deletedAt, id)
    .run();
  await logEvent(env, 'file_trashed', 'File dipindah ke trash', { id, original_name: file.original_name });

  return json({ ok: true, trashed: true });
};


async function deleteTelegramMessagesForFile(env: Env, file: FileRow) {
  if (!env.BOT_TOKEN) return { deleted: 0, failed: 0 };
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

  let deleted = 0;
  let failed = 0;
  for (const target of targets) {
    try {
      const response = await fetch(`${getTelegramApiBase(env)}/bot${env.BOT_TOKEN}/deleteMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(target),
      });
      const data = (await response.json().catch(() => null)) as { ok?: boolean } | null;
      if (response.ok && data?.ok) deleted += 1;
      else failed += 1;
    } catch {
      failed += 1;
    }
  }

  return { deleted, failed };
}

function normalizeFile(file: FileRow) {
  return {
    ...file,
    folder_id: file.folder_id || null,
    is_favorite: Boolean(file.is_favorite),
    tags: safeParseTags(file.tags_json),
  };
}

function safeParseTags(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [];
  } catch {
    return [];
  }
}
