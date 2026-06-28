import { errorJson, getTelegramApiBase, requireFolderUnlocked, type Env } from '../_common';

interface FileRow {
  id: string;
  original_name: string;
  mime_type: string;
  telegram_file_id: string | null;
  folder_id: string | null;
  size_bytes: number;
  status: string;
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

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  const inline = url.searchParams.get('disposition') === 'inline';
  if (!id) return errorJson('Query `id` wajib diisi', 400);

  const file = await env.DB.prepare(
    'SELECT id, folder_id, original_name, mime_type, telegram_file_id, size_bytes, status FROM files WHERE id = ? LIMIT 1',
  )
    .bind(id)
    .first<FileRow>();

  if (!file || file.status === 'trash') return errorJson('File tidak ditemukan', 404);

  const locked = await requireFolderUnlocked(env, request, file.folder_id);
  if (locked) return locked;

  if (!file.telegram_file_id) return errorJson('telegram_file_id tidak tersedia', 400);

  const apiBase = getTelegramApiBase(env);
  const getFileUrl = `${apiBase}/bot${env.BOT_TOKEN}/getFile?file_id=${encodeURIComponent(file.telegram_file_id)}`;
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
      'content-type': file.mime_type || 'application/octet-stream',
      'content-disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(file.original_name)}`,
      'cache-control': inline ? 'private, max-age=3600' : 'private, no-store',
    },
  });
};
