import { errorJson, getTelegramApiBase, requireFolderUnlocked, type Env } from '../_common';

interface FileRow {
  id: string;
  original_name: string;
  mime_type: string;
  telegram_file_id: string | null;
  folder_id: string | null;
  size_bytes: number;
  status: string;
  preview_telegram_file_id?: string | null;
  preview_mime_type?: string | null;
  preview_size_bytes?: number | null;
  thumbnail_telegram_file_id?: string | null;
  thumbnail_mime_type?: string | null;
  thumbnail_size_bytes?: number | null;
}

interface TelegramGetFileResponse {
  ok: boolean;
  result?: {
    file_id: string;
    file_unique_id?: string;
    file_size?: number;
    file_path?: string;
  };
  description?: string;
  error_code?: number;
}

type FileVariant = 'original' | 'preview' | 'thumbnail';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  const inline = url.searchParams.get('disposition') === 'inline';
  const variant = normalizeVariant(url.searchParams.get('variant'));
  if (!id) return errorJson('Query `id` wajib diisi', 400);

  const file = await env.DB.prepare(
    `SELECT id, folder_id, original_name, mime_type, telegram_file_id, size_bytes, status,
            preview_telegram_file_id, preview_mime_type, preview_size_bytes,
            thumbnail_telegram_file_id, thumbnail_mime_type, thumbnail_size_bytes
     FROM files WHERE id = ? LIMIT 1`,
  )
    .bind(id)
    .first<FileRow>();

  if (!file || file.status === 'trash') return errorJson('File tidak ditemukan', 404);

  const locked = await requireFolderUnlocked(env, request, file.folder_id);
  if (locked) return locked;

  const selected = selectVariant(file, variant);
  if (!selected.fileId) return errorJson('telegram_file_id tidak tersedia', 400);

  const apiBase = getTelegramApiBase(env);
  const getFileUrl = `${apiBase}/bot${env.BOT_TOKEN}/getFile?file_id=${encodeURIComponent(selected.fileId)}`;
  const getFileResponse = await fetch(getFileUrl);
  const getFileJson = (await getFileResponse.json().catch(() => null)) as TelegramGetFileResponse | null;

  if (!getFileResponse.ok || !getFileJson?.ok || !getFileJson.result?.file_path) {
    return errorJson('Gagal mengambil file path dari Telegram. Di Bot API biasa, file besar bisa gagal di sini.', getFileResponse.status || 502, getFileJson);
  }

  const telegramFileUrl = `${apiBase}/file/bot${env.BOT_TOKEN}/${getFileJson.result.file_path}`;
  const fileResponse = await fetch(telegramFileUrl);

  if (!fileResponse.ok || !fileResponse.body) {
    return errorJson('Gagal download file dari Telegram', fileResponse.status || 502);
  }

  return new Response(fileResponse.body, {
    status: 200,
    headers: {
      'content-type': selected.mimeType || 'application/octet-stream',
      'content-disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(selected.fileName)}`,
      'cache-control': inline ? 'private, max-age=3600' : 'private, no-store',
      'x-telecloud-variant': selected.variant,
    },
  });
};

function normalizeVariant(value: string | null): FileVariant {
  if (value === 'thumbnail' || value === 'preview' || value === 'original') return value;
  return 'original';
}

function selectVariant(file: FileRow, requested: FileVariant) {
  if (requested === 'thumbnail' && file.thumbnail_telegram_file_id) {
    return {
      variant: 'thumbnail',
      fileId: file.thumbnail_telegram_file_id,
      mimeType: file.thumbnail_mime_type || file.mime_type,
      fileName: makeVariantFileName(file.original_name, 'thumbnail'),
    };
  }

  if ((requested === 'preview' || requested === 'thumbnail') && file.preview_telegram_file_id) {
    return {
      variant: 'preview',
      fileId: file.preview_telegram_file_id,
      mimeType: file.preview_mime_type || file.mime_type,
      fileName: makeVariantFileName(file.original_name, 'preview'),
    };
  }

  return {
    variant: 'original',
    fileId: file.telegram_file_id,
    mimeType: file.mime_type,
    fileName: file.original_name,
  };
}

function makeVariantFileName(name: string, variant: 'preview' | 'thumbnail') {
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return `${name}.${variant}.jpg`;
  return `${name.slice(0, dot)}.${variant}${name.slice(dot)}`;
}
