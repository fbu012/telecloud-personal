import {
  errorJson,
  getMaxFileSizeBytes,
  getTelegramApiBase,
  logEvent,
  nowIso,
  sanitizeFileName,
  sha256Hex,
  json,
  requireFolderUnlocked,
  type Env,
} from '../_common';

interface TelegramDocument {
  file_id?: string;
  file_unique_id?: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
}

interface TelegramSendDocumentResponse {
  ok: boolean;
  result?: {
    message_id: number;
    document?: TelegramDocument;
  };
  description?: string;
  error_code?: number;
  parameters?: unknown;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
    return errorJson('BOT_TOKEN atau TELEGRAM_CHAT_ID belum dikonfigurasi', 500);
  }

  const form = await request.formData();
  const incoming = form.get('file');

  if (!(incoming instanceof File)) {
    return errorJson('Field `file` wajib berupa file', 400);
  }

  const maxBytes = getMaxFileSizeBytes(env);
  if (incoming.size > maxBytes) {
    return errorJson(`File terlalu besar. Maksimal ${Math.round(maxBytes / 1024 / 1024)} MB per file.`, 413, {
      max_bytes: maxBytes,
      file_size: incoming.size,
    });
  }

  const originalName = sanitizeFileName(incoming.name || 'file');
  const rawFolderId = form.get('folder_id');
  const folderId = typeof rawFolderId === 'string' && rawFolderId && rawFolderId !== 'root' ? rawFolderId : null;

  if (folderId) {
    const folder = await env.DB.prepare('SELECT id FROM folders WHERE id = ? LIMIT 1').bind(folderId).first<{ id: string }>();
    if (!folder) return errorJson('Folder tujuan tidak ditemukan', 404);
    const locked = await requireFolderUnlocked(env, request, folderId);
    if (locked) return locked;
  }
  const mimeType = incoming.type || 'application/octet-stream';
  const buffer = await incoming.arrayBuffer();
  const checksum = await sha256Hex(buffer);
  const fileForTelegram = new File([buffer], originalName, { type: mimeType });

  const duplicate = await env.DB.prepare(
    'SELECT id, original_name, created_at FROM files WHERE checksum_sha256 = ? AND status != ? LIMIT 1',
  )
    .bind(checksum, 'trash')
    .first<{ id: string; original_name: string; created_at: string }>();

  if (duplicate && form.get('skip_duplicates') === 'true') {
    return json({ ok: true, skipped: true, reason: 'duplicate', duplicate });
  }

  const telegramForm = new FormData();
  telegramForm.append('chat_id', env.TELEGRAM_CHAT_ID);
  telegramForm.append('document', fileForTelegram, originalName);
  telegramForm.append('caption', `TeleCloud Personal · ${originalName}`);
  telegramForm.append('disable_content_type_detection', 'false');

  const telegramUrl = `${getTelegramApiBase(env)}/bot${env.BOT_TOKEN}/sendDocument`;
  const telegramResponse = await fetch(telegramUrl, { method: 'POST', body: telegramForm });
  const telegramJson = (await telegramResponse.json().catch(() => null)) as TelegramSendDocumentResponse | null;

  if (!telegramResponse.ok || !telegramJson?.ok || !telegramJson.result?.message_id) {
    await logEvent(env, 'telegram_upload_failed', 'Upload ke Telegram gagal', {
      status: telegramResponse.status,
      response: telegramJson,
      file: originalName,
    });
    return errorJson('Upload ke Telegram gagal', telegramResponse.status || 502, telegramJson);
  }

  const doc = telegramJson.result.document || {};
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
      storage_provider,
      upload_mode,
      status,
      is_favorite,
      tags_json,
      notes,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      folderId,
      doc.file_name || originalName,
      doc.mime_type || mimeType,
      doc.file_size || incoming.size,
      checksum,
      env.TELEGRAM_CHAT_ID,
      telegramJson.result.message_id,
      doc.file_id || null,
      doc.file_unique_id || null,
      'telegram_bot_api',
      'document',
      'uploaded',
      0,
      '[]',
      null,
      createdAt,
      createdAt,
    )
    .run();

  await logEvent(env, 'file_uploaded', 'File berhasil diupload', {
    id,
    original_name: originalName,
    size_bytes: incoming.size,
  });

  return json({
    ok: true,
    file: {
      id,
      folder_id: folderId,
      original_name: doc.file_name || originalName,
      mime_type: doc.mime_type || mimeType,
      size_bytes: doc.file_size || incoming.size,
      checksum_sha256: checksum,
      telegram_chat_id: env.TELEGRAM_CHAT_ID,
      telegram_message_id: telegramJson.result.message_id,
      telegram_file_id: doc.file_id || null,
      telegram_file_unique_id: doc.file_unique_id || null,
      storage_provider: 'telegram_bot_api',
      upload_mode: 'document',
      status: 'uploaded',
      is_favorite: false,
      tags: [],
      notes: null,
      created_at: createdAt,
      updated_at: createdAt,
    },
  });
};
