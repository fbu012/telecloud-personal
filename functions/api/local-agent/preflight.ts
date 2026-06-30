import { errorJson, json, requireLocalAgentAuth, sanitizeFileName, type Env } from '../_common';

interface PreflightBody {
  checksum_sha256?: string | null;
  original_name?: string;
  folder_id?: string | null;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const unauthorized = requireLocalAgentAuth(env, request);
  if (unauthorized) return unauthorized;

  let body: PreflightBody;
  try {
    body = await request.json();
  } catch {
    return errorJson('Invalid JSON body', 400);
  }

  const checksum = typeof body.checksum_sha256 === 'string' && body.checksum_sha256.trim() ? body.checksum_sha256.trim() : null;
  const folderId = typeof body.folder_id === 'string' && body.folder_id && body.folder_id !== 'root' ? body.folder_id : null;
  const originalName = sanitizeFileName(body.original_name || 'file');

  if (folderId) {
    const folder = await env.DB.prepare('SELECT id FROM folders WHERE id = ? LIMIT 1').bind(folderId).first<{ id: string }>();
    if (!folder) return errorJson('Folder tujuan tidak ditemukan', 404);
  }

  if (checksum) {
    const duplicate = await env.DB.prepare(
      'SELECT id, original_name, folder_id, created_at FROM files WHERE checksum_sha256 = ? AND status != ? LIMIT 1',
    )
      .bind(checksum, 'trash')
      .first<{ id: string; original_name: string; folder_id: string | null; created_at: string }>();

    if (duplicate) {
      return json({
        ok: true,
        exact_duplicate: true,
        skipped: true,
        reason: 'checksum_duplicate',
        duplicate,
        suggested_name: originalName,
        name_changed: false,
      });
    }
  }

  const suggestedName = await getUniqueFileName(env, folderId, originalName);
  return json({
    ok: true,
    exact_duplicate: false,
    duplicate: null,
    skipped: false,
    suggested_name: suggestedName,
    name_changed: suggestedName !== originalName,
  });
};

async function getUniqueFileName(env: Env, folderId: string | null, fileName: string): Promise<string> {
  const cleanName = sanitizeFileName(fileName || 'file');
  if (!(await fileNameExists(env, folderId, cleanName))) return cleanName;

  const { base, ext } = splitFileName(cleanName);
  for (let index = 1; index <= 500; index += 1) {
    const candidate = `${base} (${index})${ext}`;
    if (!(await fileNameExists(env, folderId, candidate))) return candidate;
  }

  return `${base} (${Date.now()})${ext}`;
}

async function fileNameExists(env: Env, folderId: string | null, fileName: string): Promise<boolean> {
  const row = await env.DB.prepare(
    folderId
      ? 'SELECT id FROM files WHERE folder_id = ? AND original_name = ? AND status != ? LIMIT 1'
      : 'SELECT id FROM files WHERE folder_id IS NULL AND original_name = ? AND status != ? LIMIT 1',
  )
    .bind(...(folderId ? [folderId, fileName, 'trash'] : [fileName, 'trash']))
    .first<{ id: string }>();

  return Boolean(row);
}

function splitFileName(fileName: string): { base: string; ext: string } {
  const dot = fileName.lastIndexOf('.');
  if (dot <= 0 || dot === fileName.length - 1) return { base: fileName, ext: '' };
  return { base: fileName.slice(0, dot), ext: fileName.slice(dot) };
}
