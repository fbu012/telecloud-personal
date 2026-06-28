import { errorJson, json, nowIso, type Env } from '../_common';

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

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url);
  const targetType = url.searchParams.get('target_type');
  const targetId = url.searchParams.get('target_id');

  if (!isTargetType(targetType) || !targetId) return errorJson('target_type dan target_id wajib diisi', 400);

  const result = await env.DB.prepare(
    `SELECT * FROM share_links
     WHERE target_type = ? AND target_id = ? AND revoked_at IS NULL
     ORDER BY created_at DESC
     LIMIT 10`,
  )
    .bind(targetType, targetId)
    .all<ShareLinkRow>();

  return json({ ok: true, share_links: (result.results || []).map(normalizeShareLink) });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let body: {
    target_type?: 'file' | 'folder';
    target_id?: string;
    allow_download?: boolean;
    expires_in_days?: number | null;
  };

  try {
    body = await request.json();
  } catch {
    return errorJson('Invalid JSON body', 400);
  }

  if (!isTargetType(body.target_type) || !body.target_id) return errorJson('target_type dan target_id wajib diisi', 400);

  const exists = body.target_type === 'file'
    ? await env.DB.prepare('SELECT id, folder_id FROM files WHERE id = ? AND status != ? LIMIT 1').bind(body.target_id, 'trash').first<{ id: string; folder_id: string | null }>()
    : await env.DB.prepare('SELECT id, is_secure FROM folders WHERE id = ? LIMIT 1').bind(body.target_id).first<{ id: string; is_secure: number }>();

  if (!exists) return errorJson(body.target_type === 'file' ? 'File tidak ditemukan' : 'Folder tidak ditemukan', 404);

  if (body.target_type === 'folder' && 'is_secure' in exists && exists.is_secure) {
    return errorJson('Secure folder tidak bisa dibuat share link. Lepas password folder dulu jika ingin membagikan.', 403);
  }

  if (body.target_type === 'file' && 'folder_id' in exists && exists.folder_id) {
    const parent = await env.DB.prepare('SELECT is_secure FROM folders WHERE id = ? LIMIT 1').bind(exists.folder_id).first<{ is_secure: number }>();
    if (parent?.is_secure) return errorJson('File di secure folder tidak bisa dibuat share link.', 403);
  }

  const token = await createToken();
  const now = nowIso();
  const expiresAt = calculateExpiresAt(body.expires_in_days);
  const allowDownload = body.allow_download === false ? 0 : 1;

  await env.DB.prepare(
    `INSERT INTO share_links (
      id, token, target_type, target_id, allow_download, expires_at, revoked_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(crypto.randomUUID(), token, body.target_type, body.target_id, allowDownload, expiresAt, null, now, now)
    .run();

  const created = await env.DB.prepare('SELECT * FROM share_links WHERE token = ? LIMIT 1').bind(token).first<ShareLinkRow>();
  return json({ ok: true, share_link: normalizeShareLink(created!) });
};

function isTargetType(value: unknown): value is 'file' | 'folder' {
  return value === 'file' || value === 'folder';
}

async function createToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function calculateExpiresAt(days: number | null | undefined) {
  if (!days || !Number.isFinite(days) || days <= 0) return null;
  const date = new Date();
  date.setDate(date.getDate() + Math.min(Math.round(days), 365));
  return date.toISOString();
}

function normalizeShareLink(row: ShareLinkRow) {
  return {
    ...row,
    allow_download: Boolean(row.allow_download),
  };
}
