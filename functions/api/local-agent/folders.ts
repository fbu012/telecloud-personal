import { json, requireLocalAgentAuth, type Env } from '../_common';

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
    'SELECT id, name, parent_id, created_at, updated_at, is_secure FROM folders ORDER BY name ASC',
  ).all<FolderRow>();

  const folders = (result.results || []).map((folder) => ({
    ...folder,
    parent_id: folder.parent_id || null,
    is_secure: Boolean(folder.is_secure),
  }));

  return json({ ok: true, folders });
};
