import { errorJson, json, type Env } from '../_common';

interface ShareLinkRow {
  id: string;
  token: string;
  target_type: 'file' | 'folder';
  target_id: string;
  allow_download: number;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
}

interface FileRow {
  id: string;
  folder_id: string | null;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  status: string;
  is_favorite: number;
  created_at: string;
  updated_at: string;
}

interface FolderRow {
  id: string;
  name: string;
  parent_id: string | null;
  created_at: string;
  updated_at: string;
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const token = new URL(request.url).searchParams.get('token');
  if (!token) return errorJson('Token wajib diisi', 400);

  const share = await getValidShare(env, token);
  if (!share) return errorJson('Share link tidak valid, sudah dicabut, atau sudah expired', 404);

  if (share.target_type === 'file') {
    const file = await env.DB.prepare(
      'SELECT id, folder_id, original_name, mime_type, size_bytes, status, is_favorite, created_at, updated_at FROM files WHERE id = ? AND status != ? LIMIT 1',
    )
      .bind(share.target_id, 'trash')
      .first<FileRow>();

    if (!file) return errorJson('File tidak ditemukan', 404);

    return json({
      ok: true,
      target_type: 'file',
      allow_download: Boolean(share.allow_download),
      file: normalizePublicFile(file),
      files: [normalizePublicFile(file)],
    });
  }

  const folder = await env.DB.prepare('SELECT * FROM folders WHERE id = ? LIMIT 1').bind(share.target_id).first<FolderRow>();
  if (!folder) return errorJson('Folder tidak ditemukan', 404);

  const files = await env.DB.prepare(
    `SELECT id, folder_id, original_name, mime_type, size_bytes, status, is_favorite, created_at, updated_at
     FROM files
     WHERE folder_id = ? AND status != ?
     ORDER BY created_at DESC
     LIMIT 500`,
  )
    .bind(folder.id, 'trash')
    .all<FileRow>();

  return json({
    ok: true,
    target_type: 'folder',
    allow_download: Boolean(share.allow_download),
    folder,
    files: (files.results || []).map(normalizePublicFile),
  });
};

async function getValidShare(env: Env, token: string) {
  const share = await env.DB.prepare('SELECT * FROM share_links WHERE token = ? LIMIT 1').bind(token).first<ShareLinkRow>();
  if (!share || share.revoked_at) return null;
  if (share.expires_at && new Date(share.expires_at).getTime() <= Date.now()) return null;
  return share;
}

function normalizePublicFile(file: FileRow) {
  return {
    id: file.id,
    original_name: file.original_name,
    mime_type: file.mime_type,
    size_bytes: file.size_bytes,
    created_at: file.created_at,
    updated_at: file.updated_at,
  };
}
