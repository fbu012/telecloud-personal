import { errorJson, json, nowIso, type Env } from '../_common';

export const onRequestDelete: PagesFunction<Env> = async ({ request, env }) => {
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return errorJson('Query `id` wajib diisi', 400);

  const existing = await env.DB.prepare('SELECT id FROM share_links WHERE id = ? LIMIT 1').bind(id).first<{ id: string }>();
  if (!existing) return errorJson('Share link tidak ditemukan', 404);

  const now = nowIso();
  await env.DB.prepare('UPDATE share_links SET revoked_at = ?, updated_at = ? WHERE id = ?').bind(now, now, id).run();

  return json({ ok: true, revoked: true });
};
