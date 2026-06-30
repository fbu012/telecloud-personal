import {
  errorJson,
  json,
  logEvent,
  nowIso,
  requireLocalAgentAuth,
  sanitizeFileName,
  type Env,
} from '../_common';

interface TelegramVariantPayload {
  chat_id?: string;
  message_id?: number;
  file_id?: string | null;
  file_unique_id?: string | null;
  file_name?: string | null;
  mime_type?: string | null;
  size_bytes?: number | null;
}

interface LocalAgentFilePayload {
  folder_id?: string | null;
  original_name?: string;
  mime_type?: string;
  size_bytes?: number;
  checksum_sha256?: string | null;
  original?: TelegramVariantPayload | null;
  preview?: TelegramVariantPayload | null;
  thumbnail?: TelegramVariantPayload | null;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const unauthorized = requireLocalAgentAuth(env, request);
  if (unauthorized) return unauthorized;

  let body: LocalAgentFilePayload;
  try {
    body = await request.json();
  } catch {
    return errorJson('Invalid JSON body', 400);
  }

  const original = normalizeVariant(body.original);
  if (!original?.chat_id || !original.message_id || !original.file_id) {
    return errorJson('Payload original Telegram wajib berisi chat_id, message_id, dan file_id.', 400);
  }

  const folderId = typeof body.folder_id === 'string' && body.folder_id && body.folder_id !== 'root' ? body.folder_id : null;
  if (folderId) {
    const folder = await env.DB.prepare('SELECT id FROM folders WHERE id = ? LIMIT 1').bind(folderId).first<{ id: string }>();
    if (!folder) return errorJson('Folder tujuan tidak ditemukan', 404);
  }

  const originalName = sanitizeFileName(body.original_name || original.file_name || 'file');
  const mimeType = body.mime_type || original.mime_type || 'application/octet-stream';
  const sizeBytes = Number(body.size_bytes || original.size_bytes || 0);
  const checksum = typeof body.checksum_sha256 === 'string' && body.checksum_sha256 ? body.checksum_sha256 : null;

  if (checksum) {
    const duplicate = await env.DB.prepare(
      'SELECT id, original_name, folder_id, created_at FROM files WHERE checksum_sha256 = ? AND status != ? LIMIT 1',
    )
      .bind(checksum, 'trash')
      .first<{ id: string; original_name: string; folder_id: string | null; created_at: string }>();

    if (duplicate) {
      return json({ ok: true, skipped: true, reason: 'checksum_duplicate', duplicate });
    }
  }

  const finalName = await getUniqueFileName(env, folderId, originalName);
  const preview = normalizeVariant(body.preview);
  const thumbnail = normalizeVariant(body.thumbnail);
  const id = crypto.randomUUID();
  const createdAt = nowIso();

  await env.DB.prepare(
    `INSERT INTO files (
      id,
      folder_id,
      original_name,
      mime_type,
      size_bytes,
      checksum_sha256,
      telegram_chat_id,
      telegram_message_id,
      telegram_file_id,
      telegram_file_unique_id,
      preview_telegram_chat_id,
      preview_telegram_message_id,
      preview_telegram_file_id,
      preview_telegram_file_unique_id,
      preview_mime_type,
      preview_size_bytes,
      thumbnail_telegram_chat_id,
      thumbnail_telegram_message_id,
      thumbnail_telegram_file_id,
      thumbnail_telegram_file_unique_id,
      thumbnail_mime_type,
      thumbnail_size_bytes,
      storage_provider,
      upload_mode,
      status,
      is_favorite,
      tags_json,
      notes,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      folderId,
      finalName,
      mimeType,
      sizeBytes,
      checksum,
      original.chat_id,
      original.message_id,
      original.file_id,
      original.file_unique_id,
      preview?.chat_id || null,
      preview?.message_id || null,
      preview?.file_id || null,
      preview?.file_unique_id || null,
      preview?.mime_type || null,
      preview?.size_bytes || null,
      thumbnail?.chat_id || null,
      thumbnail?.message_id || null,
      thumbnail?.file_id || null,
      thumbnail?.file_unique_id || null,
      thumbnail?.mime_type || null,
      thumbnail?.size_bytes || null,
      'telegram_bot_api',
      'local_agent',
      'uploaded',
      0,
      '[]',
      null,
      createdAt,
      createdAt,
    )
    .run();

  const file = {
    id,
    folder_id: folderId,
    original_name: finalName,
    mime_type: mimeType,
    size_bytes: sizeBytes,
    checksum_sha256: checksum,
    telegram_chat_id: original.chat_id,
    telegram_message_id: original.message_id,
    telegram_file_id: original.file_id,
    telegram_file_unique_id: original.file_unique_id,
    preview_telegram_chat_id: preview?.chat_id || null,
    preview_telegram_message_id: preview?.message_id || null,
    preview_telegram_file_id: preview?.file_id || null,
    preview_telegram_file_unique_id: preview?.file_unique_id || null,
    preview_mime_type: preview?.mime_type || null,
    preview_size_bytes: preview?.size_bytes || null,
    thumbnail_telegram_chat_id: thumbnail?.chat_id || null,
    thumbnail_telegram_message_id: thumbnail?.message_id || null,
    thumbnail_telegram_file_id: thumbnail?.file_id || null,
    thumbnail_telegram_file_unique_id: thumbnail?.file_unique_id || null,
    thumbnail_mime_type: thumbnail?.mime_type || null,
    thumbnail_size_bytes: thumbnail?.size_bytes || null,
    storage_provider: 'telegram_bot_api',
    upload_mode: 'local_agent',
    status: 'uploaded',
    is_favorite: false,
    tags: [],
    notes: null,
    created_at: createdAt,
    updated_at: createdAt,
  };

  await logEvent(env, 'local_agent_file_synced', 'Local Agent synced file metadata', {
    id,
    original_name: finalName,
    size_bytes: sizeBytes,
    folder_id: folderId,
  });

  return json({ ok: true, file });
};

async function getUniqueFileName(env: Env, folderId: string | null, fileName: string): Promise<string> {
  const cleanName = sanitizeFileName(fileName || 'file');
  if (!(await fileNameExists(env, folderId, cleanName))) return cleanName;

  const { base, ext } = splitFileName(cleanName);
  for (let index = 1; index <= 500; index += 1) {
    const candidate = `${base} (${index})${ext}`;
    if (!(await fileNameExists(env, folderId, candidate))) return candidate;
  }

  return `${base} (${Date.now()})${ext}`;
}

async function fileNameExists(env: Env, folderId: string | null, fileName: string): Promise<boolean> {
  const row = await env.DB.prepare(
    folderId
      ? 'SELECT id FROM files WHERE folder_id = ? AND original_name = ? AND status != ? LIMIT 1'
      : 'SELECT id FROM files WHERE folder_id IS NULL AND original_name = ? AND status != ? LIMIT 1',
  )
    .bind(...(folderId ? [folderId, fileName, 'trash'] : [fileName, 'trash']))
    .first<{ id: string }>();

  return Boolean(row);
}

function splitFileName(fileName: string): { base: string; ext: string } {
  const dot = fileName.lastIndexOf('.');
  if (dot <= 0 || dot === fileName.length - 1) return { base: fileName, ext: '' };
  return { base: fileName.slice(0, dot), ext: fileName.slice(dot) };
}

function normalizeVariant(value: TelegramVariantPayload | null | undefined) {
  if (!value || typeof value !== 'object') return null;
  return {
    chat_id: typeof value.chat_id === 'string' ? value.chat_id.trim() : '',
    message_id: Number(value.message_id || 0),
    file_id: typeof value.file_id === 'string' ? value.file_id : null,
    file_unique_id: typeof value.file_unique_id === 'string' ? value.file_unique_id : null,
    file_name: typeof value.file_name === 'string' ? value.file_name : null,
    mime_type: typeof value.mime_type === 'string' ? value.mime_type : null,
    size_bytes: typeof value.size_bytes === 'number' ? value.size_bytes : null,
  };
}
