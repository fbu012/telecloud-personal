import { json, requireFolderUnlocked, type Env } from '../_common';

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

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url);
  const q = (url.searchParams.get('q') || '').trim();
  const type = (url.searchParams.get('type') || 'all').trim();
  const favorite = url.searchParams.get('favorite') === 'true';
  const folderId = url.searchParams.get('folder_id');
  const includeFolderFilter = url.searchParams.has('folder_id');
  const limit = Math.min(Number(url.searchParams.get('limit') || '200') || 200, 500);

  const where: string[] = ['status != ?'];
  const binds: unknown[] = ['trash'];

  if (includeFolderFilter) {
    if (folderId && folderId !== 'root') {
      where.push('folder_id = ?');
      binds.push(folderId);
    } else {
      where.push('folder_id IS NULL');
    }
  }

  if (q) {
    where.push('(original_name LIKE ? OR mime_type LIKE ? OR tags_json LIKE ?)');
    binds.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }

  if (type !== 'all') {
    if (type === 'image') where.push("mime_type LIKE 'image/%'");
    else if (type === 'video') where.push("mime_type LIKE 'video/%'");
    else if (type === 'audio') where.push("mime_type LIKE 'audio/%'");
    else if (type === 'document') where.push("(mime_type LIKE 'application/%' OR mime_type LIKE 'text/%')");
  }

  if (favorite) {
    where.push('is_favorite = 1');
  }

  if (includeFolderFilter && folderId && folderId !== 'root') {
    const locked = await requireFolderUnlocked(env, request, folderId);
    if (locked) return locked;
  }

  const result = await env.DB.prepare(
    `SELECT * FROM files WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT ?`,
  )
    .bind(...binds, limit)
    .all<FileRow>();

  const rows = (result.results || []).map(normalizeFile);

  return json({ ok: true, files: rows });
};

function normalizeFile(row: FileRow) {
  return {
    ...row,
    folder_id: row.folder_id || null,
    is_favorite: Boolean(row.is_favorite),
    tags: safeParseTags(row.tags_json),
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
