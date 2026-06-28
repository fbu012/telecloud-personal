import { errorJson, json, nowIso, sanitizeFileName, type Env } from '../_common';

interface FolderRow {
  id: string;
  name: string;
  parent_id: string | null;
  created_at: string;
  updated_at: string;
}

export const onRequestPatch: PagesFunction<Env> = async ({ request, env }) => {
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return errorJson('Query `id` wajib diisi', 400);

  const existing = await env.DB.prepare('SELECT * FROM folders WHERE id = ? LIMIT 1').bind(id).first<FolderRow>();
  if (!existing) return errorJson('Folder tidak ditemukan', 404);

  let body: { name?: string };
  try {
    body = await request.json();
  } catch {
    return errorJson('Invalid JSON body', 400);
  }

  const name = sanitizeFolderName(body.name || existing.name);
  const now = nowIso();
  await env.DB.prepare('UPDATE folders SET name = ?, updated_at = ? WHERE id = ?').bind(name, now, id).run();
  const updated = await env.DB.prepare('SELECT * FROM folders WHERE id = ? LIMIT 1').bind(id).first<FolderRow>();
  return json({ ok: true, folder: updated });
};

export const onRequestDelete: PagesFunction<Env> = async ({ request, env }) => {
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return errorJson('Query `id` wajib diisi', 400);

  const existing = await env.DB.prepare('SELECT * FROM folders WHERE id = ? LIMIT 1').bind(id).first<FolderRow>();
  if (!existing) return errorJson('Folder tidak ditemukan', 404);

  const child = await env.DB.prepare('SELECT id FROM folders WHERE parent_id = ? LIMIT 1').bind(id).first<{ id: string }>();
  if (child) return errorJson('Folder masih punya subfolder. Kosongkan dulu sebelum dihapus.', 409);

  const file = await env.DB.prepare('SELECT id FROM files WHERE folder_id = ? AND status != ? LIMIT 1').bind(id, 'trash').first<{ id: string }>();
  if (file) return errorJson('Folder masih berisi file. Pindahkan atau hapus file dulu.', 409);

  await env.DB.prepare('DELETE FROM folders WHERE id = ?').bind(id).run();
  return json({ ok: true, deleted: true });
};

function sanitizeFolderName(name: string): string {
  const cleaned = sanitizeFileName(name).replace(/^\.+$/, '').trim().slice(0, 80);
  return cleaned || 'New folder';
}
