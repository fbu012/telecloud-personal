import { createFolderSalt, errorJson, getFolderUnlockTokenFromRequest, hashFolderPassword, json, nowIso, sanitizeFileName, verifyFolderUnlockToken, type Env } from '../_common';

interface FolderRow {
  id: string;
  name: string;
  parent_id: string | null;
  created_at: string;
  updated_at: string;
  is_secure: number;
  password_hash: string | null;
  password_salt: string | null;
  password_updated_at: string | null;
}

export const onRequestPatch: PagesFunction<Env> = async ({ request, env }) => {
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return errorJson('Query `id` wajib diisi', 400);

  const existing = await env.DB.prepare('SELECT * FROM folders WHERE id = ? LIMIT 1').bind(id).first<FolderRow>();
  if (!existing) return errorJson('Folder tidak ditemukan', 404);

  let body: { name?: string; secure_password?: string; remove_secure_password?: boolean };
  try {
    body = await request.json();
  } catch {
    return errorJson('Invalid JSON body', 400);
  }

  if (existing.is_secure) {
    const unlocked = await verifyFolderUnlockToken(env, getFolderUnlockTokenFromRequest(request), existing.id);
    if (!unlocked) {
      return errorJson('Folder terkunci. Masukkan password folder sebelum menjalankan action ini.', 423, { folder_id: existing.id, secure_folder: true });
    }
  }

  const name = sanitizeFolderName(body.name || existing.name);
  const now = nowIso();

  let isSecure = existing.is_secure;
  let passwordHash = existing.password_hash;
  let passwordSalt = existing.password_salt;
  let passwordUpdatedAt = existing.password_updated_at;

  if (typeof body.secure_password === 'string' && body.secure_password.trim().length > 0) {
    if (body.secure_password.length < 4) return errorJson('Password folder minimal 4 karakter', 400);
    passwordSalt = createFolderSalt();
    passwordHash = await hashFolderPassword(body.secure_password, passwordSalt, env);
    passwordUpdatedAt = now;
    isSecure = 1;
  }

  if (body.remove_secure_password === true) {
    passwordSalt = null;
    passwordHash = null;
    passwordUpdatedAt = null;
    isSecure = 0;
  }

  await env.DB.prepare(
    'UPDATE folders SET name = ?, is_secure = ?, password_hash = ?, password_salt = ?, password_updated_at = ?, updated_at = ? WHERE id = ?',
  )
    .bind(name, isSecure, passwordHash, passwordSalt, passwordUpdatedAt, now, id)
    .run();

  const updated = await env.DB.prepare('SELECT * FROM folders WHERE id = ? LIMIT 1').bind(id).first<FolderRow>();
  return json({ ok: true, folder: normalizeFolder(updated!) });
};

export const onRequestDelete: PagesFunction<Env> = async ({ request, env }) => {
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return errorJson('Query `id` wajib diisi', 400);

  const existing = await env.DB.prepare('SELECT * FROM folders WHERE id = ? LIMIT 1').bind(id).first<FolderRow>();
  if (!existing) return errorJson('Folder tidak ditemukan', 404);

  if (existing.is_secure) {
    const unlocked = await verifyFolderUnlockToken(env, getFolderUnlockTokenFromRequest(request), existing.id);
    if (!unlocked) {
      return errorJson('Folder terkunci. Masukkan password folder sebelum menjalankan action ini.', 423, { folder_id: existing.id, secure_folder: true });
    }
  }

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
