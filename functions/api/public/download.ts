import { errorJson, getTelegramApiBase, type Env } from '../_common';

interface ShareLinkRow {
  id: string;
  token: string;
  target_type: 'file' | 'folder';
  target_id: string;
  allow_download: number;
  expires_at: string | null;
  revoked_at: string | null;
}

interface FileRow {
  id: string;
  folder_id: string | null;
  original_name: string;
  mime_type: string;
  telegram_file_id: string | null;
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
  const token = url.searchParams.get('token');
  const requestedFileId = url.searchParams.get('file_id');
  const inline = url.searchParams.get('disposition') === 'inline';

  if (!token) return errorJson('Token wajib diisi', 400);

  const share = await getValidShare(env, token);
  if (!share) return errorJson('Share link tidak valid, sudah dicabut, atau sudah expired', 404);
  if (!share.allow_download && !inline) return errorJson('Download tidak diizinkan untuk link ini', 403);

  let fileId = share.target_type === 'file' ? share.target_id : requestedFileId;
  if (!fileId) return errorJson('file_id wajib diisi untuk share folder', 400);

  const file = await env.DB.prepare(
    'SELECT id, folder_id, original_name, mime_type, telegram_file_id, size_bytes, status FROM files WHERE id = ? LIMIT 1',
  )
    .bind(fileId)
    .first<FileRow>();

  if (!file || file.status === 'trash') return errorJson('File tidak ditemukan', 404);
  if (share.target_type === 'folder' && file.folder_id !== share.target_id) return errorJson('File bukan bagian dari folder yang dibagikan', 403);
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
      'cache-control': inline ? 'public, max-age=3600' : 'private, no-store',
    },
  });
};

async function getValidShare(env: Env, token: string) {
  const share = await env.DB.prepare('SELECT * FROM share_links WHERE token = ? LIMIT 1').bind(token).first<ShareLinkRow>();
  if (!share || share.revoked_at) return null;
  if (share.expires_at && new Date(share.expires_at).getTime() <= Date.now()) return null;
  return share;
}
