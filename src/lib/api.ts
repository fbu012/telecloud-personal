import type { FolderItem, Settings, StoredFile } from './types';

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

export async function listFiles(params: { q?: string; type?: string; favorite?: boolean; folder_id?: string | null; useFolderFilter?: boolean } = {}): Promise<StoredFile[]> {
  const url = new URL('/api/files', window.location.origin);
  if (params.q) url.searchParams.set('q', params.q);
  if (params.type) url.searchParams.set('type', params.type);
  if (params.favorite) url.searchParams.set('favorite', 'true');
  if (params.useFolderFilter) url.searchParams.set('folder_id', params.folder_id || 'root');

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

export async function updateFolder(id: string, patch: Partial<Pick<FolderItem, 'name'>>): Promise<FolderItem> {
  const response = await fetch(`/api/folders/item?id=${encodeURIComponent(id)}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  });
  const data = await parseJson<{ ok: true; folder: FolderItem }>(response);
  return data.folder;
}

export async function deleteFolder(id: string): Promise<void> {
  const response = await fetch(`/api/folders/item?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  await parseJson(response);
}

export async function uploadFile(file: File, skipDuplicates = false, folderId: string | null = null): Promise<{ file?: StoredFile; skipped?: boolean; reason?: string }> {
  const form = new FormData();
  form.append('file', file, file.name);
  form.append('skip_duplicates', skipDuplicates ? 'true' : 'false');
  if (folderId) form.append('folder_id', folderId);

  const response = await fetch('/api/files/upload', {
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

export async function deleteFile(id: string, hard = false): Promise<void> {
  const response = await fetch(`/api/files/item?id=${encodeURIComponent(id)}&hard=${hard ? 'true' : 'false'}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  await parseJson(response);
}

export function getDownloadUrl(id: string): string {
  return `/api/files/download?id=${encodeURIComponent(id)}`;
}

export function getPreviewUrl(id: string): string {
  return `/api/files/download?id=${encodeURIComponent(id)}&disposition=inline`;
}
