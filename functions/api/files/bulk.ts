import { errorJson, json, logEvent, nowIso, sanitizeFileName, type Env } from '../_common';

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

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let body: { action?: 'move' | 'delete' | 'copy'; ids?: string[]; folder_id?: string | null };
  try {
    body = await request.json();
  } catch {
    return errorJson('Invalid JSON body', 400);
  }

  const action = body.action;
  const ids = Array.isArray(body.ids) ? body.ids.filter((id): id is string => typeof id === 'string' && id.trim().length > 0).slice(0, 200) : [];
  const folderId = Object.prototype.hasOwnProperty.call(body, 'folder_id') ? (body.folder_id || null) : null;

  if (!action || !['move', 'delete', 'copy'].includes(action)) return errorJson('Invalid bulk action', 400);
  if (!ids.length) return errorJson('No files selected', 400);

  if ((action === 'move' || action === 'copy') && folderId) {
    const folder = await env.DB.prepare('SELECT id FROM folders WHERE id = ? LIMIT 1').bind(folderId).first<{ id: string }>();
    if (!folder) return errorJson('Folder tujuan tidak ditemukan', 404);
  }

  const placeholders = ids.map(() => '?').join(',');
  const rows = await env.DB.prepare(`SELECT * FROM files WHERE id IN (${placeholders})`).bind(...ids).all<FileRow>();
  const files = rows.results || [];
  if (!files.length) return errorJson('Files not found', 404);

  if (action === 'delete') {
    const deletedAt = nowIso();
    for (const id of ids) {
      await env.DB.prepare('UPDATE files SET status = ?, deleted_at = ?, updated_at = ? WHERE id = ?')
        .bind('trash', deletedAt, deletedAt, id)
        .run();
    }
    await logEvent(env, 'files_bulk_trashed', 'Bulk file delete', { count: ids.length, ids });
    return json({ ok: true, count: ids.length });
  }

  if (action === 'move') {
    const updatedAt = nowIso();
    for (const id of ids) {
      await env.DB.prepare('UPDATE files SET folder_id = ?, updated_at = ? WHERE id = ?')
        .bind(folderId, updatedAt, id)
        .run();
    }
    const updatedRows = await env.DB.prepare(`SELECT * FROM files WHERE id IN (${placeholders})`).bind(...ids).all<FileRow>();
    await logEvent(env, 'files_bulk_moved', 'Bulk file move', { count: ids.length, ids, folder_id: folderId });
    return json({ ok: true, count: ids.length, files: normalizeFiles(updatedRows.results || []) });
  }

  // copy
  const inserted: FileRow[] = [];
  for (const file of files) {
    const id = crypto.randomUUID();
    const ts = nowIso();
    const copyName = makeCopyName(file.original_name);
    await env.DB.prepare(
      `INSERT INTO files (
        id, folder_id, original_name, mime_type, size_bytes, checksum_sha256,
        telegram_chat_id, telegram_message_id, telegram_file_id, telegram_file_unique_id,
        storage_provider, upload_mode, status, is_favorite, tags_json, notes,
        created_at, updated_at, deleted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        id,
        folderId,
        copyName,
        file.mime_type,
        file.size_bytes,
        file.checksum_sha256,
        file.telegram_chat_id,
        file.telegram_message_id,
        file.telegram_file_id,
        file.telegram_file_unique_id,
        file.storage_provider,
        file.upload_mode,
        'uploaded',
        0,
        file.tags_json || '[]',
        file.notes,
        ts,
        ts,
        null,
      )
      .run();
    inserted.push({ ...file, id, folder_id: folderId, original_name: copyName, created_at: ts, updated_at: ts, deleted_at: null, is_favorite: 0 });
  }

  await logEvent(env, 'files_bulk_copied', 'Bulk file copy', { count: inserted.length, ids, folder_id: folderId });
  return json({ ok: true, count: inserted.length, files: normalizeFiles(inserted) });
};

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

function makeCopyName(name: string) {
  const clean = sanitizeFileName(name);
  const dot = clean.lastIndexOf('.');
  if (dot <= 0) return `${clean} (copy)`;
  return `${clean.slice(0, dot)} (copy)${clean.slice(dot)}`;
}
