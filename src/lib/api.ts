import type { Settings, StoredFile } from './types';

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

export async function listFiles(params: { q?: string; type?: string; favorite?: boolean } = {}): Promise<StoredFile[]> {
  const url = new URL('/api/files', window.location.origin);
  if (params.q) url.searchParams.set('q', params.q);
  if (params.type) url.searchParams.set('type', params.type);
  if (params.favorite) url.searchParams.set('favorite', 'true');

  const response = await fetch(url.toString(), { credentials: 'include' });
  const data = await parseJson<{ ok: true; files: StoredFile[] }>(response);
  return data.files;
}

export async function uploadFile(file: File, skipDuplicates = false): Promise<{ file?: StoredFile; skipped?: boolean; reason?: string }> {
  const form = new FormData();
  form.append('file', file, file.name);
  form.append('skip_duplicates', skipDuplicates ? 'true' : 'false');

  const response = await fetch('/api/files/upload', {
    method: 'POST',
    credentials: 'include',
    body: form,
  });

  const data = await parseJson<{ ok: true; file?: StoredFile; skipped?: boolean; reason?: string }>(response);
  return data;
}

export async function updateFile(id: string, patch: Partial<Pick<StoredFile, 'original_name' | 'is_favorite' | 'notes'>> & { tags?: string[] }): Promise<StoredFile> {
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
