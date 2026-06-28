export interface Env {
  DB: D1Database;
  ADMIN_PASSWORD: string;
  SESSION_SECRET: string;
  BOT_TOKEN: string;
  TELEGRAM_CHAT_ID: string;
  TELEGRAM_API_BASE?: string;
  MAX_FILE_SIZE_MB?: string;
  APP_NAME?: string;
  DELETE_TELEGRAM_ON_HARD_DELETE?: string;
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
