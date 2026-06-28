import { errorJson, json, nowIso, sanitizeFileName, type Env } from '../_common';

interface FolderRow {
  id: string;
  name: string;
  parent_id: string | null;
  created_at: string;
  updated_at: string;
}

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const result = await env.DB.prepare('SELECT * FROM folders ORDER BY name COLLATE NOCASE ASC').all<FolderRow>();
  return json({ ok: true, folders: result.results || [] });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let body: { name?: string; parent_id?: string | null };
  try {
    body = await request.json();
  } catch {
    return errorJson('Invalid JSON body', 400);
  }

  const name = sanitizeFolderName(body.name || 'New folder');
  const parentId = body.parent_id || null;

  if (parentId) {
    const parent = await env.DB.prepare('SELECT id FROM folders WHERE id = ? LIMIT 1').bind(parentId).first<{ id: string }>();
    if (!parent) return errorJson('Parent folder tidak ditemukan', 404);
  }

  const duplicate = await env.DB.prepare(
    parentId
      ? 'SELECT id FROM folders WHERE parent_id = ? AND name = ? LIMIT 1'
      : 'SELECT id FROM folders WHERE parent_id IS NULL AND name = ? LIMIT 1',
  )
    .bind(...(parentId ? [parentId, name] : [name]))
    .first<{ id: string }>();
  if (duplicate) return errorJson('Nama folder sudah ada di lokasi ini', 409);

  const id = crypto.randomUUID();
  const now = nowIso();
  await env.DB.prepare('INSERT INTO folders (id, name, parent_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
    .bind(id, name, parentId, now, now)
    .run();

  return json({ ok: true, folder: { id, name, parent_id: parentId, created_at: now, updated_at: now } });
};

function sanitizeFolderName(name: string): string {
  const cleaned = sanitizeFileName(name).replace(/^\.+$/, '').trim().slice(0, 80);
  return cleaned || 'New folder';
}
