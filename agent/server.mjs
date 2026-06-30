import dotenv from 'dotenv';
import Busboy from 'busboy';
import FormData from 'form-data';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import http from 'node:http';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';

dotenv.config({ path: '.env.agent', override: true, quiet: true });

const PORT = Number(process.env.LOCAL_AGENT_PORT || 8788);
const TELECLOUD_BASE_URL = (process.env.TELECLOUD_BASE_URL || '').trim().replace(/\/$/, '');
const LOCAL_AGENT_TOKEN = (process.env.LOCAL_AGENT_TOKEN || '').trim();
const BOT_TOKEN = (process.env.BOT_TOKEN || '').trim();
const TELEGRAM_API_BASE = (process.env.TELEGRAM_API_BASE || 'https://api.telegram.org').trim().replace(/\/$/, '');
const ORIGINAL_CHAT_ID = (process.env.TELEGRAM_ORIGINAL_CHAT_ID || process.env.TELEGRAM_CHAT_ID || '').trim();
const PREVIEW_CHAT_ID = (process.env.TELEGRAM_PREVIEW_CHAT_ID || ORIGINAL_CHAT_ID).trim();
const THUMBNAIL_CHAT_ID = (process.env.TELEGRAM_THUMBNAIL_CHAT_ID || ORIGINAL_CHAT_ID).trim();
const MAX_FILE_MB = Number(process.env.LOCAL_AGENT_MAX_FILE_MB || 2048);
const ROOT_DIR = process.cwd();
const DATA_DIR = path.join(ROOT_DIR, 'agent', '.data');
const TMP_DIR = path.join(DATA_DIR, 'tmp');
const HISTORY_FILE = path.join(DATA_DIR, 'uploads.json');

await mkdir(TMP_DIR, { recursive: true });

const server = http.createServer(async (req, res) => {
  try {
    if (!req.url) return sendJson(res, 400, { ok: false, error: 'Missing URL' });
    const url = new URL(req.url, `http://localhost:${PORT}`);

    if (req.method === 'GET' && url.pathname === '/') {
      return sendHtml(res, dashboardHtml());
    }

    if (req.method === 'GET' && url.pathname === '/api/status') {
      const onlineCheck = await checkOnlineAuth();
      return sendJson(res, 200, {
        ok: true,
        port: PORT,
        telecloud_base_url: TELECLOUD_BASE_URL,
        online_configured: Boolean(TELECLOUD_BASE_URL && LOCAL_AGENT_TOKEN),
        online_auth_ok: onlineCheck.ok,
        online_auth_error: onlineCheck.error,
        online_auth_audit: onlineCheck.audit || null,
        local_agent_token_hint: tokenHint(LOCAL_AGENT_TOKEN),
        local_agent_token_fingerprint: localFingerprint(LOCAL_AGENT_TOKEN),
        bot_token_configured: Boolean(BOT_TOKEN),
        original_channel_configured: Boolean(ORIGINAL_CHAT_ID),
        preview_channel_configured: Boolean(PREVIEW_CHAT_ID),
        thumbnail_channel_configured: Boolean(THUMBNAIL_CHAT_ID),
        max_file_mb: MAX_FILE_MB,
      });
    }

    if (req.method === 'GET' && url.pathname === '/api/folders') {
      const data = await callOnlineJson('/api/local-agent/folders');
      return sendJson(res, 200, data);
    }

    if (req.method === 'GET' && url.pathname === '/api/history') {
      return sendJson(res, 200, { ok: true, uploads: await readHistory() });
    }

    if (req.method === 'POST' && url.pathname === '/api/upload') {
      const result = await handleUpload(req);
      return sendJson(res, 200, result);
    }

    return sendJson(res, 404, { ok: false, error: 'Not found' });
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    return sendJson(res, 500, {
      ok: false,
      error: err instanceof Error ? err.message : 'Local agent error',
    });
  }
});

server.listen(PORT, () => {
  console.log(`TeleCloud Local Agent running at http://localhost:${PORT}`);
});

async function handleUpload(req) {
  ensureConfigured();

  const parsed = await parseMultipart(req);
  const original = parsed.files.file?.[0];
  if (!original) throw new Error('Field `file` wajib diisi.');

  const originalStats = await stat(original.path);
  if (originalStats.size > MAX_FILE_MB * 1024 * 1024) {
    throw new Error(`File terlalu besar untuk local agent limit (${MAX_FILE_MB} MB).`);
  }

  const baseFolderId = normalizeFolderId(parsed.fields.folder_id);
  const relativePath = normalizeRelativePath(parsed.fields.relative_path || original.filename || 'file');
  const folderId = await resolveFolderIdForRelativePath(baseFolderId, relativePath);
  const checksum = await sha256File(original.path);
  const requestedName = sanitizeFileName(original.filename || getFileNameFromRelativePath(relativePath) || 'file');

  const preflight = await callOnlineJson('/api/local-agent/preflight', {
    method: 'POST',
    body: JSON.stringify({
      folder_id: folderId,
      original_name: requestedName,
      checksum_sha256: checksum,
    }),
  });

  if (preflight.skipped || preflight.duplicate) {
    const historyItem = {
      id: randomUUID(),
      original_name: requestedName,
      folder_id: folderId,
      relative_path: relativePath,
      size_bytes: originalStats.size,
      checksum_sha256: checksum,
      online_file_id: preflight.duplicate?.id || null,
      skipped: true,
      skip_reason: preflight.reason || 'checksum_duplicate',
      created_at: new Date().toISOString(),
    };
    await addHistory(historyItem);
    await cleanupFiles(parsed.files);

    return {
      ok: true,
      skipped: true,
      reason: preflight.reason || 'checksum_duplicate',
      duplicate: preflight.duplicate || null,
      preflight,
      telegram: null,
    };
  }

  const finalName = sanitizeFileName(preflight.suggested_name || requestedName);

  const originalUpload = await uploadDocumentToTelegram({
    chatId: ORIGINAL_CHAT_ID,
    filePath: original.path,
    fileName: finalName,
    contentType: original.mimeType || 'application/octet-stream',
    caption: `TeleCloud local original · ${finalName}`,
  });

  let previewUpload = null;
  const preview = parsed.files.preview_file?.[0];
  if (preview) {
    previewUpload = await uploadDocumentToTelegram({
      chatId: PREVIEW_CHAT_ID,
      filePath: preview.path,
      fileName: sanitizeFileName(makeVariantName(finalName, 'preview')),
      contentType: preview.mimeType || 'image/jpeg',
      caption: `TeleCloud local preview · ${finalName}`,
    });
  }

  let thumbnailUpload = null;
  const thumbnail = parsed.files.thumbnail_file?.[0];
  if (thumbnail) {
    thumbnailUpload = await uploadDocumentToTelegram({
      chatId: THUMBNAIL_CHAT_ID,
      filePath: thumbnail.path,
      fileName: sanitizeFileName(makeVariantName(finalName, 'thumbnail')),
      contentType: thumbnail.mimeType || 'image/jpeg',
      caption: `TeleCloud local thumbnail · ${finalName}`,
    });
  }

  const syncPayload = {
    folder_id: folderId,
    original_name: finalName,
    mime_type: original.mimeType || originalUpload.mime_type || 'application/octet-stream',
    size_bytes: originalStats.size,
    checksum_sha256: checksum,
    original: originalUpload,
    preview: previewUpload,
    thumbnail: thumbnailUpload,
  };

  const syncResult = await callOnlineJson('/api/local-agent/files', {
    method: 'POST',
    body: JSON.stringify(syncPayload),
  });

  const historyItem = {
    id: randomUUID(),
    original_name: syncPayload.original_name,
    folder_id: folderId,
    relative_path: relativePath,
    size_bytes: syncPayload.size_bytes,
    checksum_sha256: checksum,
    online_file_id: syncResult.file?.id || syncResult.duplicate?.id || null,
    skipped: Boolean(syncResult.skipped),
    skip_reason: syncResult.reason || null,
    created_at: new Date().toISOString(),
  };
  await addHistory(historyItem);

  await cleanupFiles(parsed.files);

  return {
    ok: true,
    file: syncResult.file || null,
    skipped: Boolean(syncResult.skipped),
    duplicate: syncResult.duplicate || null,
    name_changed: finalName !== requestedName,
    requested_name: requestedName,
    final_name: finalName,
    telegram: syncResult.skipped ? null : {
      original: summarizeTelegramUpload(originalUpload),
      preview: previewUpload ? summarizeTelegramUpload(previewUpload) : null,
      thumbnail: thumbnailUpload ? summarizeTelegramUpload(thumbnailUpload) : null,
    },
  };
}

async function resolveFolderIdForRelativePath(baseFolderId, relativePath) {
  const folderParts = getFolderPartsFromRelativePath(relativePath);
  if (!folderParts.length) return baseFolderId;

  const result = await callOnlineJson('/api/local-agent/folders', {
    method: 'POST',
    body: JSON.stringify({
      parent_id: baseFolderId,
      path: folderParts,
    }),
  });

  return result.folder_id || baseFolderId;
}

function getFolderPartsFromRelativePath(relativePath) {
  const normalized = normalizeRelativePath(relativePath);
  const parts = normalized.split('/').filter(Boolean);
  if (parts.length <= 1) return [];
  return parts.slice(0, -1).map((part) => sanitizeFileName(part)).filter(Boolean);
}

function normalizeRelativePath(value) {
  return String(value || '')
    .replace(/\\+/g, '/')
    .split('/')
    .map((part) => part.trim())
    .filter((part) => part && part !== '.' && part !== '..')
    .join('/');
}

function getFileNameFromRelativePath(relativePath) {
  const parts = normalizeRelativePath(relativePath).split('/').filter(Boolean);
  return parts.length ? parts[parts.length - 1] : '';
}


function ensureConfigured() {
  if (!TELECLOUD_BASE_URL) throw new Error('TELECLOUD_BASE_URL belum diisi di .env.agent');
  if (!LOCAL_AGENT_TOKEN) throw new Error('LOCAL_AGENT_TOKEN belum diisi di .env.agent');
  if (!BOT_TOKEN) throw new Error('BOT_TOKEN belum diisi di .env.agent');
  if (!ORIGINAL_CHAT_ID) throw new Error('TELEGRAM_ORIGINAL_CHAT_ID / TELEGRAM_CHAT_ID belum diisi di .env.agent');
}

function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const contentType = req.headers['content-type'] || '';
    if (!contentType.includes('multipart/form-data')) {
      reject(new Error('Request harus multipart/form-data'));
      return;
    }

    const busboy = Busboy({ headers: req.headers });
    const fields = {};
    const files = {};
    const writes = [];

    busboy.on('field', (name, value) => {
      fields[name] = value;
    });

    busboy.on('file', (name, stream, info) => {
      const fileId = randomUUID();
      const filename = sanitizeFileName(info.filename || `${name}-${fileId}`);
      const filePath = path.join(TMP_DIR, `${fileId}-${filename}`);
      const writeStream = createWriteStream(filePath);
      const writeDone = new Promise((resolveWrite, rejectWrite) => {
        writeStream.on('finish', resolveWrite);
        writeStream.on('error', rejectWrite);
        stream.on('error', rejectWrite);
      });
      stream.pipe(writeStream);
      writes.push(writeDone);
      files[name] ||= [];
      files[name].push({
        field: name,
        path: filePath,
        filename,
        mimeType: info.mimeType || 'application/octet-stream',
      });
    });

    busboy.on('error', reject);
    busboy.on('finish', async () => {
      try {
        await Promise.all(writes);
        resolve({ fields, files });
      } catch (err) {
        reject(err);
      }
    });

    req.pipe(busboy);
  });
}

async function uploadDocumentToTelegram({ chatId, filePath, fileName, contentType, caption }) {
  const form = new FormData();
  form.append('chat_id', chatId);
  form.append('document', createReadStream(filePath), { filename: fileName, contentType });
  form.append('caption', caption);
  form.append('disable_content_type_detection', 'false');

  const response = await postMultipart(`${TELEGRAM_API_BASE}/bot${BOT_TOKEN}/sendDocument`, form);
  if (!response.ok || !response.result?.message_id) {
    throw new Error(response.description || 'Upload ke Telegram gagal');
  }

  const document = response.result.document || {};
  return {
    chat_id: chatId,
    message_id: response.result.message_id,
    file_id: document.file_id || null,
    file_unique_id: document.file_unique_id || null,
    file_name: document.file_name || fileName,
    mime_type: document.mime_type || contentType,
    size_bytes: document.file_size || (await stat(filePath)).size,
  };
}

function postMultipart(urlString, form) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlString);
    const client = url.protocol === 'https:' ? https : http;
    const req = client.request(
      url,
      {
        method: 'POST',
        headers: form.getHeaders(),
      },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          try {
            const data = JSON.parse(body || '{}');
            if (res.statusCode && res.statusCode >= 400) {
              reject(new Error(data.description || `HTTP ${res.statusCode}`));
              return;
            }
            resolve(data);
          } catch (err) {
            reject(err);
          }
        });
      },
    );

    req.on('error', reject);
    form.pipe(req);
  });
}

async function checkOnlineAuth() {
  if (!TELECLOUD_BASE_URL || !LOCAL_AGENT_TOKEN) {
    return { ok: false, error: 'TELECLOUD_BASE_URL / LOCAL_AGENT_TOKEN belum lengkap', audit: null };
  }

  const audit = await callOnlineAudit().catch((err) => ({
    ok: false,
    error: err instanceof Error ? err.message : 'Audit endpoint failed',
    matched: false,
  }));

  if (audit && audit.ok === true && audit.matched === false) {
    return {
      ok: false,
      error: 'Token mismatch',
      audit,
    };
  }

  try {
    await callOnlineJson('/api/local-agent/ping');
    return { ok: true, error: null, audit };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Online auth failed',
      audit,
    };
  }
}

async function callOnlineAudit() {
  if (!TELECLOUD_BASE_URL) throw new Error('TELECLOUD_BASE_URL belum dikonfigurasi');
  const response = await fetch(`${TELECLOUD_BASE_URL}/api/local-agent/audit?agent_token=${encodeURIComponent(LOCAL_AGENT_TOKEN)}`, {
    method: 'GET',
    headers: {
      authorization: `Bearer ${LOCAL_AGENT_TOKEN}`,
      'x-local-agent-token': LOCAL_AGENT_TOKEN,
    },
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || data?.ok === false) {
    throw new Error(data?.error || `Online audit error (${response.status})`);
  }
  return data;
}

async function callOnlineJson(pathname, options = {}) {
  if (!TELECLOUD_BASE_URL) throw new Error('TELECLOUD_BASE_URL belum dikonfigurasi');
  const separator = pathname.includes('?') ? '&' : '?';
  const authPath = `${pathname}${separator}agent_token=${encodeURIComponent(LOCAL_AGENT_TOKEN)}`;
  const response = await fetch(`${TELECLOUD_BASE_URL}${authPath}`, {
    method: options.method || 'GET',
    headers: {
      authorization: `Bearer ${LOCAL_AGENT_TOKEN}`,
      'x-local-agent-token': LOCAL_AGENT_TOKEN,
      'content-type': 'application/json',
      ...(options.headers || {}),
    },
    body: options.body,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || data?.ok === false) {
    throw new Error(data?.error || `Online API error (${response.status})`);
  }
  return data;
}

async function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

async function readHistory() {
  try {
    return JSON.parse(await readFile(HISTORY_FILE, 'utf8'));
  } catch {
    return [];
  }
}

async function addHistory(item) {
  const current = await readHistory();
  current.unshift(item);
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(HISTORY_FILE, JSON.stringify(current.slice(0, 100), null, 2));
}

async function cleanupFiles(files) {
  const paths = Object.values(files).flat().map((file) => file.path);
  await Promise.all(paths.map((filePath) => rm(filePath, { force: true }).catch(() => undefined)));
}

function normalizeFolderId(value) {
  return typeof value === 'string' && value && value !== 'root' ? value : null;
}

function sanitizeFileName(name) {
  return String(name || 'file')
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180) || 'file';
}

function makeVariantName(name, variant) {
  const clean = sanitizeFileName(name);
  const dot = clean.lastIndexOf('.');
  if (dot <= 0) return `${clean}.${variant}.jpg`;
  return `${clean.slice(0, dot)}.${variant}.jpg`;
}

function summarizeTelegramUpload(upload) {
  return {
    chat_id: upload.chat_id,
    message_id: upload.message_id,
    size_bytes: upload.size_bytes,
  };
}

function localFingerprint(token) {
  const normalized = String(token || '').trim();
  if (!normalized) return 'empty';

  let hash = 2166136261;
  for (let index = 0; index < normalized.length; index += 1) {
    hash ^= normalized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16).padStart(8, '0');
}

function tokenHint(token) {
  const normalized = String(token || '').trim();
  if (!normalized) return 'empty';
  if (normalized.length <= 8) return `${normalized.length} chars`;
  return `${normalized.length} chars · starts ${normalized.slice(0, 4)} · ends ${normalized.slice(-4)}`;
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
  });
  res.end(JSON.stringify(data, null, 2));
}

function sendHtml(res, html) {
  res.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(html);
}

function dashboardHtml() {
  return String.raw`<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>TeleCloud Local Agent</title>
  <style>
    :root {
      --primary:#2563EB;
      --primary-hover:#1D4ED8;
      --border:#D8E1EE;
      --muted:#64748B;
      --bg:#F6F8FB;
      --text:#0F172A;
      --panel:#FFFFFF;
      --soft:#F8FAFC;
      --danger:#DC2626;
      --success:#15803D;
      --warning:#B45309;
    }
    * { box-sizing:border-box; }
    html, body { min-height:100%; }
    body {
      margin:0;
      background:var(--bg);
      color:var(--text);
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size:14px;
      line-height:1.45;
      -webkit-font-smoothing:antialiased;
      text-rendering:geometricPrecision;
    }
    button, input, select { font:inherit; }
    header {
      position:sticky;
      top:0;
      z-index:30;
      border-bottom:1px solid var(--border);
      background:rgba(255,255,255,.95);
      backdrop-filter:blur(10px);
    }
    .wrap {
      max-width:1500px;
      margin:0 auto;
      padding:14px 24px;
    }
    .brand {
      display:flex;
      align-items:center;
      gap:12px;
      min-height:52px;
    }
    .logo {
      display:flex;
      align-items:center;
      justify-content:center;
      width:36px;
      height:36px;
      border-radius:10px;
      background:var(--primary);
      color:white;
      font-size:15px;
      font-weight:800;
      letter-spacing:-.02em;
    }
    h1 {
      margin:0;
      font-size:18px;
      line-height:1.2;
      font-weight:750;
      letter-spacing:-.02em;
    }
    h2 {
      margin:0;
      font-size:15px;
      line-height:1.3;
      font-weight:720;
      letter-spacing:-.01em;
    }
    p { margin:0; }
    .muted { color:var(--muted); }
    .subtitle { margin-top:2px; color:#64748B; font-size:13px; }
    .grid {
      display:grid;
      grid-template-columns:minmax(0,1.1fr) minmax(320px,.9fr);
      gap:16px;
      margin-top:16px;
    }
    @media (max-width: 960px) {
      .wrap { padding:12px; }
      .grid { grid-template-columns:1fr; }
    }
    .card {
      overflow:hidden;
      border:1px solid var(--border);
      border-radius:12px;
      background:var(--panel);
      box-shadow:0 1px 3px rgba(15,23,42,.05);
    }
    .card-head {
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:12px;
      padding:14px 16px;
      border-bottom:1px solid var(--border);
      background:#fff;
    }
    .card-body { padding:16px; }
    .stack { display:grid; gap:13px; }
    label {
      display:block;
      margin-bottom:7px;
      color:#526984;
      font-size:11px;
      font-weight:750;
      letter-spacing:.05em;
      text-transform:uppercase;
    }
    select,
    .file-box {
      width:100%;
      min-height:42px;
      border:1px solid var(--border);
      border-radius:10px;
      background:#fff;
      color:var(--text);
      outline:none;
    }
    select {
      padding:9px 11px;
      font-size:14px;
    }
    .file-box {
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:10px;
      padding:7px 8px 7px 11px;
    }
    select:focus,
    .file-box:focus-within {
      border-color:var(--primary);
      box-shadow:0 0 0 3px rgba(37,99,235,.08);
    }
    .hidden-input { display:none; }
    .btns {
      display:flex;
      flex-wrap:wrap;
      gap:9px;
      margin-top:15px;
    }
    button {
      display:inline-flex;
      align-items:center;
      justify-content:center;
      min-height:38px;
      border:1px solid var(--border);
      border-radius:10px;
      background:#fff;
      color:#334155;
      padding:8px 12px;
      font-size:14px;
      font-weight:650;
      cursor:pointer;
      transition:background .15s, border-color .15s, color .15s;
    }
    button:hover { background:#F8FAFC; color:#0F172A; }
    button.primary {
      border-color:var(--primary);
      background:var(--primary);
      color:#fff;
    }
    button.primary:hover { background:var(--primary-hover); border-color:var(--primary-hover); color:#fff; }
    button:disabled { opacity:.55; cursor:not-allowed; }
    .status {
      display:grid;
      grid-template-columns:repeat(2,minmax(0,1fr));
      gap:10px;
    }
    @media (max-width: 520px) { .status { grid-template-columns:1fr; } }
    .pill {
      min-height:66px;
      border:1px solid var(--border);
      border-radius:11px;
      background:var(--soft);
      padding:11px;
    }
    .pill b {
      display:block;
      color:#64748B;
      font-size:11px;
      font-weight:750;
      letter-spacing:.05em;
      text-transform:uppercase;
    }
    .pill span {
      display:block;
      margin-top:5px;
      font-size:14px;
      font-weight:760;
      color:#0F172A;
    }
    .pill span.ok { color:var(--success); }
    .pill span.bad { color:var(--danger); }
    .pill span.warn { color:var(--warning); }
    .notice {
      display:none;
      margin-top:10px;
      border:1px solid #FCD34D;
      border-radius:10px;
      background:#FFFBEB;
      color:#92400E;
      padding:10px 11px;
      font-size:13px;
      line-height:1.55;
    }
    .hint {
      margin-top:7px;
      color:#64748B;
      font-size:12px;
      line-height:1.5;
    }
    .selected-list {
      display:grid;
      gap:7px;
      max-height:170px;
      margin-top:9px;
      overflow:auto;
    }
    .file-chip {
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:10px;
      border:1px solid var(--border);
      border-radius:10px;
      background:var(--soft);
      padding:8px 10px;
      color:#334155;
    }
    .file-chip strong {
      min-width:0;
      overflow:hidden;
      text-overflow:ellipsis;
      white-space:nowrap;
      font-size:13px;
      font-weight:650;
    }
    .file-chip small {
      flex-shrink:0;
      color:#64748B;
      font-size:12px;
      white-space:nowrap;
    }
    .progress {
      display:none;
      margin-top:15px;
      border:1px solid #BFDBFE;
      border-radius:11px;
      background:#EFF6FF;
      padding:12px;
    }
    .progress-head {
      display:flex;
      justify-content:space-between;
      gap:12px;
    }
    .progress-title {
      min-width:0;
      font-size:13px;
      font-weight:730;
      color:#172554;
    }
    .progress-sub {
      margin-top:2px;
      overflow:hidden;
      color:#1D4ED8;
      font-size:12px;
      text-overflow:ellipsis;
      white-space:nowrap;
    }
    .percent {
      flex-shrink:0;
      color:#1E40AF;
      font-size:12px;
      font-weight:760;
    }
    .bar {
      height:7px;
      margin-top:9px;
      overflow:hidden;
      border-radius:999px;
      background:#fff;
    }
    .bar > div {
      width:0%;
      height:100%;
      border-radius:999px;
      background:var(--primary);
      transition:width .22s ease;
    }
    .failed-panel {
      display:none;
      margin-top:12px;
      border:1px solid #FECACA;
      border-radius:11px;
      background:#FEF2F2;
      padding:12px;
    }
    .failed-panel h3 {
      margin:0;
      color:#991B1B;
      font-size:13px;
      font-weight:760;
    }
    .failed-list {
      display:grid;
      gap:7px;
      max-height:150px;
      margin-top:9px;
      overflow:auto;
    }
    .failed-chip {
      display:flex;
      align-items:flex-start;
      justify-content:space-between;
      gap:10px;
      border:1px solid #FECACA;
      border-radius:10px;
      background:#fff;
      padding:8px 10px;
      color:#7F1D1D;
    }
    .failed-chip strong {
      display:block;
      min-width:0;
      overflow:hidden;
      text-overflow:ellipsis;
      white-space:nowrap;
      font-size:13px;
      font-weight:700;
    }
    .failed-chip small {
      display:block;
      margin-top:2px;
      color:#B91C1C;
      font-size:12px;
      line-height:1.4;
    }
    button.danger {
      border-color:#FECACA;
      background:#FEF2F2;
      color:#B91C1C;
    }
    button.danger:hover {
      background:#FEE2E2;
      color:#991B1B;
    }
    .log {
      min-height:130px;
      max-height:280px;
      margin-top:15px;
      overflow:auto;
      border-radius:11px;
      background:#0F172A;
      color:#E2E8F0;
      padding:12px;
      font-family:ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size:12px;
      line-height:1.5;
      white-space:pre-wrap;
    }
    .history {
      display:grid;
      gap:8px;
    }
    .hist-item {
      border:1px solid var(--border);
      border-radius:10px;
      background:#fff;
      padding:10px;
    }
    .hist-item b {
      display:block;
      overflow:hidden;
      color:#0F172A;
      font-size:13px;
      font-weight:700;
      text-overflow:ellipsis;
      white-space:nowrap;
    }
    .hist-item small {
      color:#64748B;
      font-size:12px;
    }
    code {
      border-radius:5px;
      background:#F1F5F9;
      padding:1px 5px;
      font-family:ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size:12px;
    }
  </style>
</head>
<body>
  <header>
    <div class="wrap brand">
      <div class="logo">TC</div>
      <div>
        <h1>TeleCloud Local Agent</h1>
        <p class="subtitle">Upload besar dari komputer lokal, sync metadata ke TeleCloud Online.</p>
      </div>
    </div>
  </header>

  <main class="wrap">
    <div class="grid">
      <section class="card">
        <div class="card-head">
          <div>
            <h2>Upload via Local Agent</h2>
            <p class="subtitle">Original dikirim langsung dari komputer ke Telegram.</p>
          </div>
          <button id="refreshFolders">Refresh folders</button>
        </div>

        <div class="card-body">
          <div class="stack">
            <div>
              <label>Folder tujuan online</label>
              <select id="folder"></select>
              <div id="folderNotice" class="notice"></div>
            </div>

            <div>
              <label>Files</label>
              <div class="file-box">
                <span id="fileSummary" class="muted">Belum ada file dipilih</span>
                <button type="button" id="pickFiles">Choose files</button>
                <button type="button" id="pickFolder">Choose folder</button>
                <input id="file" class="hidden-input" type="file" multiple />
                <input id="folderInput" class="hidden-input" type="file" webkitdirectory directory multiple />
              </div>
              <div id="selectedFiles" class="selected-list"></div>
            </div>
          </div>

          <div class="btns">
            <button class="primary" id="upload">Start local upload</button>
            <button class="danger" id="retryFailed" style="display:none">Retry failed</button>
            <button id="clearSelection">Clear files</button>
            <button id="clear">Clear log</button>
          </div>

          <div id="failedPanel" class="failed-panel">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:10px">
              <div>
                <h3>Upload gagal</h3>
                <p class="hint" id="failedSummary"></p>
              </div>
              <button class="danger" id="retryFailedPanel">Retry failed</button>
            </div>
            <div id="failedList" class="failed-list"></div>
          </div>

          <div id="progress" class="progress">
            <div class="progress-head">
              <div class="progress-title">
                <div id="stage">Preparing...</div>
                <div id="subStage" class="progress-sub"></div>
              </div>
              <span id="pct" class="percent">0%</span>
            </div>
            <div class="bar"><div id="bar"></div></div>
            <p class="hint">Jangan tutup halaman sampai proses selesai.</p>
          </div>

          <div id="log" class="log">Ready.</div>
        </div>
      </section>

      <aside class="card">
        <div class="card-head">
          <h2>Status</h2>
          <button id="refreshStatus">Refresh</button>
        </div>
        <div class="card-body">
          <div id="status" class="status"></div>
          <div id="authNotice" class="notice"></div>
        </div>
      </aside>
    </div>

    <section class="card" style="margin-top:16px">
      <div class="card-head">
        <h2>Recent uploads</h2>
        <button id="refreshHistory">Refresh history</button>
      </div>
      <div class="card-body">
        <div id="history" class="history"></div>
      </div>
    </section>
  </main>

<script>
const $ = (id) => document.getElementById(id);
let folders = [];
let selectedItems = [];
let failedItems = [];
let selectionMode = 'files';

function log(message) {
  const now = new Date().toLocaleTimeString();
  $('log').textContent += '\\n[' + now + '] ' + message;
  $('log').scrollTop = $('log').scrollHeight;
}

function setProgress(label, value, subLabel = '') {
  $('progress').style.display = 'block';
  $('stage').textContent = label;
  $('subStage').textContent = subLabel;
  $('pct').textContent = Math.round(value) + '%';
  $('bar').style.width = Math.max(0, Math.min(100, value)) + '%';
}

function showNotice(id, message) {
  const el = $(id);
  if (!message) {
    el.style.display = 'none';
    el.textContent = '';
    return;
  }
  el.style.display = 'block';
  el.textContent = message;
}

async function loadStatus() {
  const data = await fetch('/api/status').then(r => r.json());
  const audit = data.online_auth_audit || null;
  const tokenMatch = audit && typeof audit.matched === 'boolean' ? audit.matched : data.online_auth_ok;
  const entries = [
    ['Online config', data.online_configured, true],
    ['Online auth', data.online_auth_ok, true],
    ['Token match', tokenMatch, true],
    ['Bot token', data.bot_token_configured, true],
    ['Original channel', data.original_channel_configured, true],
    ['Preview channel', data.preview_channel_configured, true],
    ['Thumbnail channel', data.thumbnail_channel_configured, true],
    ['Max file', data.max_file_mb + ' MB', false],
  ];
  $('status').innerHTML = entries.map(([label, value, bool]) => {
    return '<div class="pill"><b>' + label + '</b><span class="' + (bool ? (value ? 'ok' : 'bad') : '') + '">' + (bool ? (value ? 'Configured' : 'Missing') : value) + '</span></div>';
  }).join('');

  if (!data.online_auth_ok) {
    const received = audit?.received;
    const expected = audit?.expected;
    const detail = audit
      ? ' Local fingerprint: ' + (received?.fingerprint || data.local_agent_token_fingerprint || '-') + ' (' + (received?.length ?? '-') + ' chars). Cloud fingerprint: ' + (expected?.fingerprint || '-') + ' (' + (expected?.length ?? '-') + ' chars).'
      : ' Token lokal: ' + (data.local_agent_token_hint || '-') + '.';
    showNotice('authNotice', 'Online auth gagal: ' + (data.online_auth_error || 'Unauthorized') + '.' + detail + ' Jika fingerprint/length beda, Cloudflare Secret yang aktif masih berbeda atau belum redeploy production.');
  } else {
    showNotice('authNotice', '');
  }
}

async function loadFolders() {
  showNotice('folderNotice', '');
  $('folder').innerHTML = '<option value="">Loading...</option>';
  try {
    const data = await fetch('/api/folders').then(async r => {
      const body = await r.json().catch(() => ({}));
      if (!r.ok || body.ok === false) throw new Error(body.error || 'Gagal mengambil folders');
      return body;
    });
    folders = data.folders || [];
    $('folder').innerHTML = '<option value="">Root</option>' + folders.map(folder => '<option value="' + folder.id + '">' + escapeHtml(folder.name) + (folder.is_secure ? ' 🔒' : '') + '</option>').join('');
    log('Folders loaded: ' + folders.length);
  } catch (err) {
    $('folder').innerHTML = '<option value="">Root</option>';
    const message = err && err.message ? err.message : String(err);
    showNotice('folderNotice', 'Folder online gagal dimuat: ' + message);
    log('Folders error: ' + message);
  }
}

async function loadHistory() {
  const data = await fetch('/api/history').then(r => r.json());
  const items = data.uploads || [];
  $('history').innerHTML = items.length ? items.map(item => (
    '<div class="hist-item"><b>' + escapeHtml(item.original_name) + '</b><small>' + new Date(item.created_at).toLocaleString() + ' · ' + formatBytes(item.size_bytes) + (item.skipped ? ' · duplicate skipped' : '') + '</small></div>'
  )).join('') : '<p class="muted">No local uploads yet.</p>';
}

function renderSelectedFiles() {
  if (!selectedItems.length) {
    $('fileSummary').textContent = 'Belum ada file dipilih';
    $('selectedFiles').innerHTML = '';
    return;
  }

  const total = selectedItems.reduce((sum, item) => sum + item.file.size, 0);
  const folderText = selectionMode === 'folder' ? 'folder upload · ' : '';
  $('fileSummary').textContent = folderText + selectedItems.length + ' file dipilih · ' + formatBytes(total);
  $('selectedFiles').innerHTML = selectedItems.map((item) => {
    const label = item.relativePath || item.file.name;
    return '<div class="file-chip"><strong title="' + escapeHtml(label) + '">' + escapeHtml(label) + '</strong><small>' + formatBytes(item.file.size) + '</small></div>';
  }).join('');
}


function renderFailedItems() {
  const hasFailed = failedItems.length > 0;
  $('retryFailed').style.display = hasFailed ? 'inline-flex' : 'none';
  $('failedPanel').style.display = hasFailed ? 'block' : 'none';
  if (!hasFailed) {
    $('failedSummary').textContent = '';
    $('failedList').innerHTML = '';
    return;
  }

  $('failedSummary').textContent = failedItems.length + ' file gagal. Klik Retry failed untuk upload ulang hanya file yang gagal.';
  $('failedList').innerHTML = failedItems.map((item) => {
    const label = item.relativePath || item.file.name;
    return '<div class="failed-chip"><div style="min-width:0"><strong title="' + escapeHtml(label) + '">' + escapeHtml(label) + '</strong><small>' + escapeHtml(item.error || 'Upload failed') + '</small></div><small>' + formatBytes(item.file.size) + '</small></div>';
  }).join('');
}


async function uploadAll() {
  if (!selectedItems.length) {
    alert('Pilih file dulu.');
    return;
  }

  failedItems = [];
  renderFailedItems();

  $('upload').disabled = true;
  $('pickFiles').disabled = true;
  $('pickFolder').disabled = true;
  $('refreshFolders').disabled = true;
  $('progress').style.display = 'block';
  $('log').textContent = 'Starting multi upload...';

  let success = 0;
  let skipped = 0;
  let failed = 0;

  for (let index = 0; index < selectedItems.length; index += 1) {
    const item = selectedItems[index];
    const base = (index / selectedItems.length) * 100;
    const span = 100 / selectedItems.length;

    try {
      const result = await uploadOne(item, index + 1, selectedItems.length, base, span);
      if (result?.skipped) skipped += 1;
      else success += 1;
    } catch (err) {
      failed += 1;
      const message = err && err.message ? err.message : String(err);
      failedItems.push({ ...item, error: message });
      renderFailedItems();
      log('FAILED ' + (item.relativePath || item.file.name) + ': ' + message);
    }
  }

  setProgress('Multi upload complete', 100, success + ' sukses, ' + skipped + ' skipped, ' + failed + ' gagal');
  log('Done. Success: ' + success + ', skipped: ' + skipped + ', failed: ' + failed + '. Refresh TeleCloud Online to see uploaded files.');
  await loadHistory();
  renderFailedItems();

  $('upload').disabled = false;
  $('pickFiles').disabled = false;
  $('pickFolder').disabled = false;
  $('refreshFolders').disabled = false;
}

async function uploadOne(item, number, total, base, span) {
  const file = item.file;
  const relativePath = item.relativePath || file.name;
  const label = '[' + number + '/' + total + '] ' + relativePath;
  setProgress('Preparing file...', base + span * .04, label);
  log('Uploading ' + label);

  const form = new FormData();
  form.append('folder_id', $('folder').value || '');
  form.append('relative_path', relativePath);
  form.append('file', file, file.name);

  if (file.type.startsWith('image/')) {
    setProgress('Creating thumbnail...', base + span * .12, label);
    const thumbnail = await createImageVariant(file, 240, .72, 'thumbnail');
    if (thumbnail) form.append('thumbnail_file', thumbnail, thumbnail.name);

    setProgress('Creating optimized preview...', base + span * .22, label);
    const preview = await createImageVariant(file, 1600, .82, 'preview');
    if (preview) form.append('preview_file', preview, preview.name);
  }

  const result = await uploadWithProgress(form, base, span, label);
  if (result?.skipped) setProgress('Skipped duplicate', base + span, label);
  else setProgress('File complete', base + span, label);
  return result;
}

function uploadWithProgress(form, base, span, label) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload');

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      const pct = base + span * (.25 + (event.loaded / event.total) * .35);
      setProgress('Sending file to local agent...', pct, label);
    };

    xhr.onload = () => {
      let data = null;
      try { data = JSON.parse(xhr.responseText || '{}'); } catch {}
      if (xhr.status >= 400 || data?.ok === false) {
        reject(new Error(data?.error || 'Upload failed'));
        return;
      }
      setProgress(data?.skipped ? 'Skipped duplicate' : 'Syncing metadata online...', base + span * .92, label);
      log(JSON.stringify(data, null, 2));
      resolve(data);
    };

    xhr.onerror = () => reject(new Error('Network error to local agent'));
    setProgress('Uploading to Telegram...', base + span * .65, label);
    xhr.send(form);
  });
}


function retryFailedUploads() {
  if (!failedItems.length) {
    alert('Tidak ada file gagal untuk dicoba ulang.');
    return;
  }

  selectedItems = failedItems.map((item) => ({
    file: item.file,
    relativePath: item.relativePath || item.file.name,
  }));
  failedItems = [];
  renderSelectedFiles();
  renderFailedItems();
  uploadAll();
}


async function createImageVariant(file, maxSide, quality, suffix) {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob) return null;
    const dot = file.name.lastIndexOf('.');
    const name = dot > 0 ? file.name.slice(0, dot) + '.' + suffix + '.jpg' : file.name + '.' + suffix + '.jpg';
    return new File([blob], name, { type: 'image/jpeg' });
  } catch (err) {
    log('Image variant failed for ' + file.name + ': ' + err.message);
    return null;
  }
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' }[ch]));
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B','KB','MB','GB','TB'];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) { value /= 1024; index++; }
  return value.toFixed(value >= 10 || index === 0 ? 0 : 1) + ' ' + units[index];
}

$('pickFiles').addEventListener('click', () => $('file').click());
$('pickFolder').addEventListener('click', () => $('folderInput').click());
$('file').addEventListener('change', () => {
  selectionMode = 'files';
  selectedItems = Array.from($('file').files || []).map((file) => ({ file, relativePath: file.name }));
  $('folderInput').value = '';
  renderSelectedFiles();
});
$('folderInput').addEventListener('change', () => {
  selectionMode = 'folder';
  selectedItems = Array.from($('folderInput').files || []).map((file) => ({
    file,
    relativePath: file.webkitRelativePath || file.name,
  }));
  $('file').value = '';
  renderSelectedFiles();
});
$('upload').addEventListener('click', uploadAll);
$('retryFailed').addEventListener('click', retryFailedUploads);
$('retryFailedPanel').addEventListener('click', retryFailedUploads);
$('clearSelection').addEventListener('click', () => {
  $('file').value = '';
  $('folderInput').value = '';
  selectedItems = [];
  failedItems = [];
  selectionMode = 'files';
  renderSelectedFiles();
  renderFailedItems();
});
$('clear').addEventListener('click', () => $('log').textContent = 'Ready.');
$('refreshStatus').addEventListener('click', loadStatus);
$('refreshFolders').addEventListener('click', loadFolders);
$('refreshHistory').addEventListener('click', loadHistory);

loadStatus().catch(err => log('Status error: ' + err.message));
loadFolders().catch(err => log('Folders error: ' + err.message));
loadHistory().catch(err => log('History error: ' + err.message));
</script>
</body>
</html>`;
}
