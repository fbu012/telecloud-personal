import { createFolderUnlockToken, errorJson, hashFolderPassword, json, type Env } from '../_common';

interface FolderRow {
  id: string;
  name: string;
  is_secure: number;
  password_hash: string | null;
  password_salt: string | null;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let body: { folder_id?: string; password?: string };

  try {
    body = await request.json();
  } catch {
    return errorJson('Invalid JSON body', 400);
  }

  if (!body.folder_id) return errorJson('folder_id wajib diisi', 400);

  const folder = await env.DB.prepare('SELECT id, name, is_secure, password_hash, password_salt FROM folders WHERE id = ? LIMIT 1')
    .bind(body.folder_id)
    .first<FolderRow>();

  if (!folder) return errorJson('Folder tidak ditemukan', 404);
  if (!folder.is_secure) return json({ ok: true, unlocked: true, token: await createFolderUnlockToken(env, folder.id) });

  if (!body.password || !folder.password_hash || !folder.password_salt) return errorJson('Password folder wajib diisi', 400);

  const attempt = await hashFolderPassword(body.password, folder.password_salt, env);
  if (attempt !== folder.password_hash) return errorJson('Password folder salah', 403);

  const token = await createFolderUnlockToken(env, folder.id);
  return json({ ok: true, unlocked: true, token });
};
