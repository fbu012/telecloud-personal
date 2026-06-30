import type { FolderItem, PublicShareData, Settings, ShareLink, StoredFile } from './types';

export class ApiError extends Error {
  status: number;
  details?: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

async function parseJson<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => null) as any;
  if (!response.ok || data?.ok === false) {
    throw new ApiError(data?.error || `Request gagal (${response.status})`, response.status, data?.details || data);
  }
  return data as T;
}

export async function getMe(): Promise<{ authenticated: boolean; app_name: string }> {
  const response = await fetch('/api/auth/me', { credentials: 'include' });
  const data = await parseJson<{ ok: true; authenticated: boolean; app_name: string }>(response);
  return { authenticated: data.authenticated, app_name: data.app_name };
}

export async function login(password: string): Promise<void> {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  await parseJson(response);
}

export async function logout(): Promise<void> {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
}

export async function getSettings(): Promise<Settings> {
  const response = await fetch('/api/settings', { credentials: 'include' });
  const data = await parseJson<{ ok: true } & Settings>(response);
  return data;
}

export async function listTrash(): Promise<{ files: StoredFile[]; auto_deleted_count: number; telegram_failed_count: number; trash_auto_delete_days: number }> {
  const response = await fetch('/api/trash', { credentials: 'include' });
  const data = await parseJson<{ ok: true; files: StoredFile[]; auto_deleted_count: number; telegram_failed_count: number; trash_auto_delete_days: number }>(response);
  return data;
}

export async function restoreTrashFiles(ids: string[]): Promise<{ count: number }> {
  const response = await fetch('/api/trash', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'restore', ids }),
  });
  const data = await parseJson<{ ok: true; count: number }>(response);
  return data;
}

export async function permanentlyDeleteTrashFiles(ids: string[]): Promise<{ count: number; telegram_deleted: number; telegram_failed: number }> {
  const response = await fetch('/api/trash', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'delete_permanently', ids }),
  });
  const data = await parseJson<{ ok: true; count: number; telegram_deleted: number; telegram_failed: number }>(response);
  return data;
}

export async function emptyTrash(): Promise<{ count: number; telegram_deleted: number; telegram_failed: number; limit: number }> {
  const response = await fetch('/api/trash', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'empty' }),
  });
  const data = await parseJson<{ ok: true; count: number; telegram_deleted: number; telegram_failed: number; limit: number }>(response);
  return data;
}

export async function cleanupOldTrash(days: number): Promise<{ count: number; telegram_deleted: number; telegram_failed: number; days: number }> {
  const response = await fetch('/api/trash', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'cleanup_old', days }),
  });
  const data = await parseJson<{ ok: true; count: number; telegram_deleted: number; telegram_failed: number; days: number }>(response);
  return data;
}

export async function listFiles(params: { q?: string; type?: string; favorite?: boolean; folder_id?: string | null; useFolderFilter?: boolean; folder_token?: string | null } = {}): Promise<StoredFile[]> {
  const url = new URL('/api/files', window.location.origin);
  if (params.q) url.searchParams.set('q', params.q);
  if (params.type) url.searchParams.set('type', params.type);
  if (params.favorite) url.searchParams.set('favorite', 'true');
  if (params.useFolderFilter) url.searchParams.set('folder_id', params.folder_id || 'root');
  if (params.folder_token) url.searchParams.set('folder_token', params.folder_token);

  const response = await fetch(url.toString(), { credentials: 'include' });
  const data = await parseJson<{ ok: true; files: StoredFile[] }>(response);
  return data.files;
}

export async function listFolders(): Promise<FolderItem[]> {
  const response = await fetch('/api/folders', { credentials: 'include' });
  const data = await parseJson<{ ok: true; folders: FolderItem[] }>(response);
  return data.folders;
}

export async function createFolder(name: string, parent_id: string | null): Promise<FolderItem> {
  const response = await fetch('/api/folders', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, parent_id }),
  });
  const data = await parseJson<{ ok: true; folder: FolderItem }>(response);
  return data.folder;
}

export async function updateFolder(id: string, patch: Partial<Pick<FolderItem, 'name'>> & { secure_password?: string; remove_secure_password?: boolean; folder_token?: string | null }): Promise<FolderItem> {
  const { folder_token, ...body } = patch;
  const url = new URL('/api/folders/item', window.location.origin);
  url.searchParams.set('id', id);
  if (folder_token) url.searchParams.set('folder_token', folder_token);
  const response = await fetch(url.toString(), {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await parseJson<{ ok: true; folder: FolderItem }>(response);
  return data.folder;
}

export async function deleteFolder(id: string, folderToken?: string | null): Promise<void> {
  const url = new URL('/api/folders/item', window.location.origin);
  url.searchParams.set('id', id);
  if (folderToken) url.searchParams.set('folder_token', folderToken);
  const response = await fetch(url.toString(), {
    method: 'DELETE',
    credentials: 'include',
  });
  await parseJson(response);
}

export async function uploadFile(
  file: File,
  skipDuplicates = false,
  folderId: string | null = null,
  folderToken: string | null = null,
  variants: { previewFile?: File | null; thumbnailFile?: File | null } = {},
): Promise<{ file?: StoredFile; skipped?: boolean; reason?: string }> {
  const form = new FormData();
  form.append('file', file, file.name);
  if (variants.previewFile) form.append('preview_file', variants.previewFile, variants.previewFile.name);
  if (variants.thumbnailFile) form.append('thumbnail_file', variants.thumbnailFile, variants.thumbnailFile.name);
  form.append('skip_duplicates', skipDuplicates ? 'true' : 'false');
  if (folderId) form.append('folder_id', folderId);

  const uploadUrl = new URL('/api/files/upload', window.location.origin);
  if (folderToken) uploadUrl.searchParams.set('folder_token', folderToken);

  const response = await fetch(uploadUrl.toString(), {
    method: 'POST',
    credentials: 'include',
    body: form,
  });

  const data = await parseJson<{ ok: true; file?: StoredFile; skipped?: boolean; reason?: string }>(response);
  return data;
}

export async function updateFile(
  id: string,
  patch: Partial<Pick<StoredFile, 'original_name' | 'is_favorite' | 'notes' | 'folder_id'>> & { tags?: string[] },
): Promise<StoredFile> {
  const response = await fetch(`/api/files/item?id=${encodeURIComponent(id)}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  });
  const data = await parseJson<{ ok: true; file: StoredFile }>(response);
  return data.file;
}

export async function deleteFile(
  id: string,
  hard = false,
  folderToken: string | null = null,
  deleteTelegram = false,
): Promise<{ trashed?: boolean; hard_deleted?: boolean; telegram?: { deleted: number; failed: number } }> {
  const url = new URL('/api/files/item', window.location.origin);
  url.searchParams.set('id', id);
  url.searchParams.set('hard', hard ? 'true' : 'false');
  if (folderToken) url.searchParams.set('folder_token', folderToken);
  if (deleteTelegram) url.searchParams.set('delete_telegram', 'true');

  const response = await fetch(`${url.pathname}${url.search}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  const data = await parseJson<{ ok: true; trashed?: boolean; hard_deleted?: boolean; telegram?: { deleted: number; failed: number } }>(response);
  return data;
}

export function getDownloadUrl(id: string, folderToken?: string | null): string {
  return getFileVariantUrl(id, 'original', false, folderToken);
}

export function getPreviewUrl(id: string, folderToken?: string | null, variant: 'preview' | 'original' = 'preview'): string {
  return getFileVariantUrl(id, variant, true, folderToken);
}

export function getThumbnailUrl(id: string, folderToken?: string | null): string {
  return getFileVariantUrl(id, 'thumbnail', true, folderToken);
}

function getFileVariantUrl(id: string, variant: 'thumbnail' | 'preview' | 'original', inline: boolean, folderToken?: string | null): string {
  const token = folderToken || getActiveFolderToken();
  const url = new URL('/api/files/download', window.location.origin);
  url.searchParams.set('id', id);
  url.searchParams.set('variant', variant);
  if (inline) url.searchParams.set('disposition', 'inline');
  if (token) url.searchParams.set('folder_token', token);
  return `${url.pathname}${url.search}`;
}

export async function unlockFolder(folderId: string, password: string): Promise<string> {
  const response = await fetch('/api/folders/unlock', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ folder_id: folderId, password }),
  });
  const data = await parseJson<{ ok: true; token: string }>(response);
  return data.token;
}

function getActiveFolderToken(): string | null {
  try {
    return window.sessionStorage.getItem('telecloud_active_folder_token');
  } catch {
    return null;
  }
}
export async function bulkFileAction(
  action: 'move' | 'delete' | 'copy',
  ids: string[],
  options: { folder_id?: string | null; folder_token?: string | null } = {},
): Promise<{ files?: StoredFile[]; count: number }> {
  const url = new URL('/api/files/bulk', window.location.origin);
  if (options.folder_token) url.searchParams.set('folder_token', options.folder_token);

  const response = await fetch(`${url.pathname}${url.search}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action, ids, folder_id: options.folder_id ?? null }),
  });
  const data = await parseJson<{ ok: true; files?: StoredFile[]; count: number }>(response);
  return data;
}

export async function listShareLinks(targetType: 'file' | 'folder', targetId: string): Promise<ShareLink[]> {
  const url = new URL('/api/share-links', window.location.origin);
  url.searchParams.set('target_type', targetType);
  url.searchParams.set('target_id', targetId);
  const response = await fetch(url.toString(), { credentials: 'include' });
  const data = await parseJson<{ ok: true; share_links: ShareLink[] }>(response);
  return data.share_links;
}

export async function createShareLink(params: {
  target_type: 'file' | 'folder';
  target_id: string;
  allow_download: boolean;
  expires_in_days?: number | null;
}): Promise<ShareLink> {
  const response = await fetch('/api/share-links', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(params),
  });
  const data = await parseJson<{ ok: true; share_link: ShareLink }>(response);
  return data.share_link;
}

export async function revokeShareLink(id: string): Promise<void> {
  const response = await fetch(`/api/share-links/item?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  await parseJson(response);
}

export async function getPublicShare(token: string): Promise<PublicShareData> {
  const url = new URL('/api/public/share', window.location.origin);
  url.searchParams.set('token', token);
  const response = await fetch(url.toString());
  const data = await parseJson<PublicShareData>(response);
  return data;
}

export function getPublicDownloadUrl(token: string, fileId?: string, inline = false): string {
  const url = new URL('/api/public/download', window.location.origin);
  url.searchParams.set('token', token);
  if (fileId) url.searchParams.set('file_id', fileId);
  if (inline) url.searchParams.set('disposition', 'inline');
  return `${url.pathname}${url.search}`;
}

export async function saveTelegramChannels(channels: {
  telegram_original_chat_id?: string;
  telegram_preview_chat_id?: string;
  telegram_thumbnail_chat_id?: string;
  trash_auto_delete_days?: number;
}): Promise<Settings> {
  const response = await fetch('/api/settings', {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(channels),
  });
  const data = await parseJson<{ ok: true } & Settings>(response);
  return data;
}

export async function testTelegramChannels(): Promise<Array<{ key: 'original' | 'preview' | 'thumbnail'; ok: boolean; chat_id?: string; error?: string | null }>> {
  const response = await fetch('/api/telegram/test-channels', {
    method: 'POST',
    credentials: 'include',
  });
  const data = await parseJson<{ ok: true; results: Array<{ key: 'original' | 'preview' | 'thumbnail'; ok: boolean; chat_id?: string; error?: string | null }> }>(response);
  return data.results;
}
