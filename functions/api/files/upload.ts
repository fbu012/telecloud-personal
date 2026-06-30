import {
  errorJson,
  getMaxFileSizeBytes,
  getTelegramApiBase,
  getTelegramChannelSettings,
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

interface UploadedTelegramDocument {
  chat_id: string;
  message_id: number;
  file_id: string | null;
  file_unique_id: string | null;
  file_name: string;
  mime_type: string;
  size_bytes: number;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.BOT_TOKEN) {
    return errorJson('BOT_TOKEN belum dikonfigurasi', 500);
  }

  const channels = await getTelegramChannelSettings(env);
  if (!channels.original_chat_id) {
    return errorJson('Original Channel ID belum dikonfigurasi. Isi di Settings atau TELEGRAM_CHAT_ID.', 500);
  }

  const form = await request.formData();
  const incoming = form.get('file');
  const previewInput = form.get('preview_file');
  const thumbnailInput = form.get('thumbnail_file');

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

  const duplicate = await env.DB.prepare(
    'SELECT id, original_name, folder_id, created_at FROM files WHERE checksum_sha256 = ? AND status != ? LIMIT 1',
  )
    .bind(checksum, 'trash')
    .first<{ id: string; original_name: string; folder_id: string | null; created_at: string }>();

  if (duplicate) {
    return json({ ok: true, skipped: true, reason: 'checksum_duplicate', duplicate });
  }

  const finalName = await getUniqueFileName(env, folderId, originalName);
  const fileForTelegram = new File([buffer], finalName, { type: mimeType });

  let originalUpload: UploadedTelegramDocument;
  let previewUpload: UploadedTelegramDocument | null = null;
  let thumbnailUpload: UploadedTelegramDocument | null = null;

  try {
    originalUpload = await uploadDocumentToTelegram(env, channels.original_chat_id, fileForTelegram, finalName, `TeleCloud original · ${finalName}`);

    if (previewInput instanceof File && previewInput.size > 0) {
      const previewName = sanitizeFileName(previewInput.name || makeVariantName(finalName, 'preview'));
      previewUpload = await uploadDocumentToTelegram(
        env,
        channels.preview_chat_id || channels.original_chat_id,
        previewInput,
        previewName,
        `TeleCloud preview · ${finalName}`,
      );
    }

    if (thumbnailInput instanceof File && thumbnailInput.size > 0) {
      const thumbName = sanitizeFileName(thumbnailInput.name || makeVariantName(finalName, 'thumbnail'));
      thumbnailUpload = await uploadDocumentToTelegram(
        env,
        channels.thumbnail_chat_id || channels.original_chat_id,
        thumbnailInput,
        thumbName,
        `TeleCloud thumbnail · ${finalName}`,
      );
    }
  } catch (err) {
    return errorJson(err instanceof Error ? err.message : 'Upload ke Telegram gagal', 502, String(err));
  }

  const id = crypto.randomUUID();
  const createdAt = nowIso();

  try {
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
        originalUpload.mime_type || mimeType,
        originalUpload.size_bytes || incoming.size,
        checksum,
        originalUpload.chat_id,
        originalUpload.message_id,
        originalUpload.file_id,
        originalUpload.file_unique_id,
        previewUpload?.chat_id || null,
        previewUpload?.message_id || null,
        previewUpload?.file_id || null,
        previewUpload?.file_unique_id || null,
        previewUpload?.mime_type || null,
        previewUpload?.size_bytes || null,
        thumbnailUpload?.chat_id || null,
        thumbnailUpload?.message_id || null,
        thumbnailUpload?.file_id || null,
        thumbnailUpload?.file_unique_id || null,
        thumbnailUpload?.mime_type || null,
        thumbnailUpload?.size_bytes || null,
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
  } catch (err) {
    await logEvent(env, 'file_metadata_insert_failed', 'Gagal menyimpan metadata file variant', {
      id,
      original_name: finalName,
      error: String(err),
    });
    return errorJson('Upload Telegram berhasil, tapi gagal menyimpan metadata. Pastikan migration 0005 sudah dijalankan.', 500, String(err));
  }

  await logEvent(env, 'file_uploaded', 'File berhasil diupload', {
    id,
    original_name: finalName,
    size_bytes: incoming.size,
    preview_size_bytes: previewUpload?.size_bytes || null,
    thumbnail_size_bytes: thumbnailUpload?.size_bytes || null,
  });

  return json({
    ok: true,
    file: {
      id,
      folder_id: folderId,
      original_name: finalName,
      mime_type: originalUpload.mime_type || mimeType,
      size_bytes: originalUpload.size_bytes || incoming.size,
      checksum_sha256: checksum,
      telegram_chat_id: originalUpload.chat_id,
      telegram_message_id: originalUpload.message_id,
      telegram_file_id: originalUpload.file_id,
      telegram_file_unique_id: originalUpload.file_unique_id,
      preview_telegram_chat_id: previewUpload?.chat_id || null,
      preview_telegram_message_id: previewUpload?.message_id || null,
      preview_telegram_file_id: previewUpload?.file_id || null,
      preview_telegram_file_unique_id: previewUpload?.file_unique_id || null,
      preview_mime_type: previewUpload?.mime_type || null,
      preview_size_bytes: previewUpload?.size_bytes || null,
      thumbnail_telegram_chat_id: thumbnailUpload?.chat_id || null,
      thumbnail_telegram_message_id: thumbnailUpload?.message_id || null,
      thumbnail_telegram_file_id: thumbnailUpload?.file_id || null,
      thumbnail_telegram_file_unique_id: thumbnailUpload?.file_unique_id || null,
      thumbnail_mime_type: thumbnailUpload?.mime_type || null,
      thumbnail_size_bytes: thumbnailUpload?.size_bytes || null,
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

async function uploadDocumentToTelegram(env: Env, chatId: string, file: File, fileName: string, caption: string): Promise<UploadedTelegramDocument> {
  const telegramForm = new FormData();
  telegramForm.append('chat_id', chatId);
  telegramForm.append('document', file, fileName);
  telegramForm.append('caption', caption);
  telegramForm.append('disable_content_type_detection', 'false');

  const telegramUrl = `${getTelegramApiBase(env)}/bot${env.BOT_TOKEN}/sendDocument`;
  const telegramResponse = await fetch(telegramUrl, { method: 'POST', body: telegramForm });
  const telegramJson = (await telegramResponse.json().catch(() => null)) as TelegramSendDocumentResponse | null;

  if (!telegramResponse.ok || !telegramJson?.ok || !telegramJson.result?.message_id) {
    await logEvent(env, 'telegram_upload_failed', 'Upload ke Telegram gagal', {
      status: telegramResponse.status,
      response: telegramJson,
      file: fileName,
      chat_id: chatId,
    });
    throw new Error(telegramJson?.description || `Upload ke Telegram gagal (HTTP ${telegramResponse.status})`);
  }

  const doc = telegramJson.result.document || {};
  return {
    chat_id: chatId,
    message_id: telegramJson.result.message_id,
    file_id: doc.file_id || null,
    file_unique_id: doc.file_unique_id || null,
    file_name: doc.file_name || fileName,
    mime_type: doc.mime_type || file.type || 'application/octet-stream',
    size_bytes: doc.file_size || file.size,
  };
}

function makeVariantName(name: string, variant: 'preview' | 'thumbnail') {
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return `${name}.${variant}.jpg`;
  return `${name.slice(0, dot)}.${variant}.jpg`;
}
