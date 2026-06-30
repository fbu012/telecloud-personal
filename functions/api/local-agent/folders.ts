import { errorJson, json, nowIso, requireLocalAgentAuth, sanitizeFileName, type Env } from '../_common';

interface FolderRow {
  id: string;
  name: string;
  parent_id: string | null;
  created_at: string;
  updated_at: string;
  is_secure?: number;
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const unauthorized = requireLocalAgentAuth(env, request);
  if (unauthorized) return unauthorized;

  const result = await env.DB.prepare(
    'SELECT id, name, parent_id, created_at, updated_at, is_secure FROM folders ORDER BY name COLLATE NOCASE ASC',
  ).all<FolderRow>();

  const folders = (result.results || []).map(normalizeFolder);

  return json({ ok: true, folders });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const unauthorized = requireLocalAgentAuth(env, request);
  if (unauthorized) return unauthorized;

  let body: { parent_id?: string | null; path?: string[] | string };
  try {
    body = await request.json();
  } catch {
    return errorJson('Invalid JSON body', 400);
  }

  const baseParentId = typeof body.parent_id === 'string' && body.parent_id && body.parent_id !== 'root' ? body.parent_id : null;
  if (baseParentId) {
    const parent = await env.DB.prepare('SELECT id FROM folders WHERE id = ? LIMIT 1').bind(baseParentId).first<{ id: string }>();
    if (!parent) return errorJson('Parent folder tidak ditemukan', 404);
  }

  const parts = normalizePathParts(body.path);
  let parentId = baseParentId;
  const folders: Array<ReturnType<typeof normalizeFolder> & { created?: boolean }> = [];

  for (const part of parts) {
    const folder = await getOrCreateFolder(env, part, parentId);
    folders.push({ ...normalizeFolder(folder), created: folder.created });
    parentId = folder.id;
  }

  return json({
    ok: true,
    folder_id: parentId,
    folders,
    created_count: folders.filter((folder) => folder.created).length,
  });
};

function normalizePathParts(value: string[] | string | undefined): string[] {
  const raw = Array.isArray(value) ? value : typeof value === 'string' ? value.split('/') : [];
  return raw
    .map((part) => sanitizeFolderName(part))
    .filter((part) => part.length > 0 && part !== '.' && part !== '..')
    .slice(0, 32);
}

async function getOrCreateFolder(env: Env, name: string, parentId: string | null): Promise<FolderRow & { created: boolean }> {
  const existing = await env.DB.prepare(
    parentId
      ? 'SELECT id, name, parent_id, created_at, updated_at, is_secure FROM folders WHERE parent_id = ? AND name = ? LIMIT 1'
      : 'SELECT id, name, parent_id, created_at, updated_at, is_secure FROM folders WHERE parent_id IS NULL AND name = ? LIMIT 1',
  )
    .bind(...(parentId ? [parentId, name] : [name]))
    .first<FolderRow>();

  if (existing) return { ...existing, created: false };

  const id = crypto.randomUUID();
  const now = nowIso();
  await env.DB.prepare(
    'INSERT INTO folders (id, name, parent_id, is_secure, password_hash, password_salt, password_updated_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  )
    .bind(id, name, parentId, 0, null, null, null, now, now)
    .run();

  return {
    id,
    name,
    parent_id: parentId,
    created_at: now,
    updated_at: now,
    is_secure: 0,
    created: true,
  };
}

function sanitizeFolderName(name: string): string {
  const cleaned = sanitizeFileName(name).replace(/^\.+$/, '').trim().slice(0, 80);
  return cleaned || 'Folder';
}

function normalizeFolder(folder: FolderRow) {
  return {
    id: folder.id,
    name: folder.name,
    parent_id: folder.parent_id || null,
    is_secure: Boolean(folder.is_secure),
    created_at: folder.created_at,
    updated_at: folder.updated_at,
  };
}
