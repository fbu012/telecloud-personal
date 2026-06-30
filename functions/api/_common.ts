export interface Env {
  DB: D1Database;
  ADMIN_PASSWORD: string;
  SESSION_SECRET: string;
  BOT_TOKEN: string;
  TELEGRAM_CHAT_ID: string;
  TELEGRAM_ORIGINAL_CHAT_ID?: string;
  TELEGRAM_PREVIEW_CHAT_ID?: string;
  TELEGRAM_THUMBNAIL_CHAT_ID?: string;
  TELEGRAM_API_BASE?: string;
  MAX_FILE_SIZE_MB?: string;
  APP_NAME?: string;
  DELETE_TELEGRAM_ON_HARD_DELETE?: string;
  LOCAL_AGENT_TOKEN?: string;
}

export type ApiContext = EventContext<Env, string, unknown>;

const SESSION_COOKIE = 'telecloud_session';

export function nowIso(): string {
  return new Date().toISOString();
}

export function json(data: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data, null, 2), {
    ...init,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...(init.headers || {}),
    },
  });
}

export function errorJson(message: string, status = 400, details?: unknown): Response {
  return json({ ok: false, error: message, details }, { status });
}

export function getMaxFileSizeBytes(env: Env): number {
  const mb = Number(env.MAX_FILE_SIZE_MB || '20');
  const safeMb = Number.isFinite(mb) && mb > 0 ? mb : 20;
  return Math.floor(safeMb * 1024 * 1024);
}

export function getTelegramApiBase(env: Env): string {
  return (env.TELEGRAM_API_BASE || 'https://api.telegram.org').replace(/\/$/, '');
}

export function parseCookies(request: Request): Record<string, string> {
  const cookie = request.headers.get('cookie') || '';
  const out: Record<string, string> = {};
  for (const part of cookie.split(';')) {
    const [rawKey, ...rawValue] = part.trim().split('=');
    if (!rawKey) continue;
    out[rawKey] = decodeURIComponent(rawValue.join('='));
  }
  return out;
}

function base64UrlEncode(input: ArrayBuffer | string): string {
  let bytes: Uint8Array;
  if (typeof input === 'string') {
    bytes = new TextEncoder().encode(input);
  } else {
    bytes = new Uint8Array(input);
  }

  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecode(input: string): string {
  const pad = '='.repeat((4 - (input.length % 4)) % 4);
  const normalized = (input + pad).replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

async function hmac(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return base64UrlEncode(sig);
}

export async function createSessionCookie(env: Env, request: Request): Promise<string> {
  const ttl = 60 * 60 * 24 * 7;
  const payload = base64UrlEncode(
    JSON.stringify({ iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + ttl }),
  );
  const signature = await hmac(payload, env.SESSION_SECRET);
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${SESSION_COOKIE}=${encodeURIComponent(`${payload}.${signature}`)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${ttl}${secure}`;
}

export function clearSessionCookie(request: Request): string {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

export async function isAuthenticated(request: Request, env: Env): Promise<boolean> {
  const token = parseCookies(request)[SESSION_COOKIE];
  if (!token) return false;

  const [payload, signature] = token.split('.');
  if (!payload || !signature) return false;

  const expected = await hmac(payload, env.SESSION_SECRET);
  if (expected !== signature) return false;

  try {
    const parsed = JSON.parse(base64UrlDecode(payload)) as { exp?: number };
    return typeof parsed.exp === 'number' && parsed.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

export async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function getTypeGroup(mimeType: string): 'image' | 'video' | 'document' | 'archive' | 'audio' | 'other' {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (['application/zip', 'application/x-zip-compressed', 'application/x-rar-compressed', 'application/x-7z-compressed', 'application/gzip'].includes(mimeType)) {
    return 'archive';
  }
  if (mimeType.includes('pdf') || mimeType.includes('document') || mimeType.includes('text') || mimeType.includes('spreadsheet') || mimeType.includes('presentation')) return 'document';
  return 'other';
}

export function sanitizeFileName(name: string): string {
  return name.replace(/[\u0000-\u001f]/g, '').replace(/[\\/]/g, '_').slice(0, 180) || 'file';
}

export async function logEvent(env: Env, type: string, message: string, meta: Record<string, unknown> = {}): Promise<void> {
  try {
    await env.DB.prepare('INSERT INTO app_events (id, type, message, meta_json, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(crypto.randomUUID(), type, message, JSON.stringify(meta), nowIso())
      .run();
  } catch {
    // Avoid breaking user-facing requests because event logging failed.
  }
}

export interface FolderSecurityRow {
  id: string;
  is_secure: number;
  password_hash: string | null;
  password_salt: string | null;
}

export function getFolderUnlockTokenFromRequest(request: Request): string | null {
  const url = new URL(request.url);
  return request.headers.get('x-folder-unlock') || url.searchParams.get('folder_token');
}

export async function hashFolderPassword(password: string, salt: string, env: Env): Promise<string> {
  const normalized = `${salt}:${password}:${env.SESSION_SECRET}`;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalized));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function createFolderSalt(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const byte of bytes) out += byte.toString(16).padStart(2, '0');
  return out;
}

export async function createFolderUnlockToken(env: Env, folderId: string): Promise<string> {
  const ttl = 60 * 60 * 8;
  const payload = base64UrlEncode(JSON.stringify({ folder_id: folderId, exp: Math.floor(Date.now() / 1000) + ttl }));
  const signature = await hmac(payload, env.SESSION_SECRET);
  return `${payload}.${signature}`;
}

export async function verifyFolderUnlockToken(env: Env, token: string | null, folderId: string): Promise<boolean> {
  if (!token) return false;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return false;
  const expected = await hmac(payload, env.SESSION_SECRET);
  if (expected !== signature) return false;

  try {
    const parsed = JSON.parse(base64UrlDecode(payload)) as { folder_id?: string; exp?: number };
    return parsed.folder_id === folderId && typeof parsed.exp === 'number' && parsed.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

export async function requireFolderUnlocked(env: Env, request: Request, folderId: string | null | undefined): Promise<Response | null> {
  if (!folderId) return null;

  const folder = await env.DB.prepare('SELECT id, is_secure, password_hash, password_salt FROM folders WHERE id = ? LIMIT 1')
    .bind(folderId)
    .first<FolderSecurityRow>();

  if (!folder || !folder.is_secure) return null;

  const token = getFolderUnlockTokenFromRequest(request);
  const ok = await verifyFolderUnlockToken(env, token, folderId);
  if (ok) return null;

  return errorJson('Folder terkunci. Masukkan password folder untuk membuka.', 423, { folder_id: folderId, secure_folder: true });
}

export interface TelegramChannelSettings {
  original_chat_id: string;
  preview_chat_id: string;
  thumbnail_chat_id: string;
}

export async function getAppSetting(env: Env, key: string, fallback = ''): Promise<string> {
  try {
    const row = await env.DB.prepare('SELECT value FROM app_settings WHERE key = ? LIMIT 1').bind(key).first<{ value: string | null }>();
    return row?.value || fallback;
  } catch {
    return fallback;
  }
}

export async function setAppSetting(env: Env, key: string, value: string | null): Promise<void> {
  const now = nowIso();
  await env.DB.prepare(
    `INSERT INTO app_settings (key, value, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  )
    .bind(key, value, now)
    .run();
}

export async function getTelegramChannelSettings(env: Env): Promise<TelegramChannelSettings> {
  const original = await getAppSetting(env, 'telegram_original_chat_id', env.TELEGRAM_ORIGINAL_CHAT_ID || env.TELEGRAM_CHAT_ID || '');
  const preview = await getAppSetting(env, 'telegram_preview_chat_id', env.TELEGRAM_PREVIEW_CHAT_ID || env.TELEGRAM_CHAT_ID || '');
  const thumbnail = await getAppSetting(env, 'telegram_thumbnail_chat_id', env.TELEGRAM_THUMBNAIL_CHAT_ID || env.TELEGRAM_CHAT_ID || '');

  return {
    original_chat_id: original.trim(),
    preview_chat_id: preview.trim(),
    thumbnail_chat_id: thumbnail.trim(),
  };
}

export function isConfiguredChatId(value: string | null | undefined): boolean {
  return Boolean(value && value.trim());
}

export function requireLocalAgentAuth(env: Env, request: Request): Response | null {
  if (!env.LOCAL_AGENT_TOKEN) {
    return errorJson('LOCAL_AGENT_TOKEN belum dikonfigurasi di Cloudflare Environment Variables.', 500);
  }

  const header = request.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : request.headers.get('x-local-agent-token') || '';
  if (!token || token !== env.LOCAL_AGENT_TOKEN) {
    return errorJson('Local agent token tidak valid.', 401);
  }

  return null;
}
