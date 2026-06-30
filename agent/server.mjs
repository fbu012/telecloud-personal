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

  const folderId = normalizeFolderId(parsed.fields.folder_id);
  const checksum = await sha256File(original.path);

  const originalUpload = await uploadDocumentToTelegram({
    chatId: ORIGINAL_CHAT_ID,
    filePath: original.path,
    fileName: sanitizeFileName(original.filename || 'file'),
    contentType: original.mimeType || 'application/octet-stream',
    caption: `TeleCloud local original · ${original.filename || 'file'}`,
  });

  let previewUpload = null;
  const preview = parsed.files.preview_file?.[0];
  if (preview) {
    previewUpload = await uploadDocumentToTelegram({
      chatId: PREVIEW_CHAT_ID,
      filePath: preview.path,
      fileName: sanitizeFileName(preview.filename || makeVariantName(original.filename || 'file', 'preview')),
      contentType: preview.mimeType || 'image/jpeg',
      caption: `TeleCloud local preview · ${original.filename || 'file'}`,
    });
  }

  let thumbnailUpload = null;
  const thumbnail = parsed.files.thumbnail_file?.[0];
  if (thumbnail) {
    thumbnailUpload = await uploadDocumentToTelegram({
      chatId: THUMBNAIL_CHAT_ID,
      filePath: thumbnail.path,
      fileName: sanitizeFileName(thumbnail.filename || makeVariantName(original.filename || 'file', 'thumbnail')),
      contentType: thumbnail.mimeType || 'image/jpeg',
      caption: `TeleCloud local thumbnail · ${original.filename || 'file'}`,
    });
  }

  const syncPayload = {
    folder_id: folderId,
    original_name: sanitizeFileName(original.filename || originalUpload.file_name || 'file'),
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
    size_bytes: syncPayload.size_bytes,
    checksum_sha256: checksum,
    online_file_id: syncResult.file?.id || null,
    skipped: Boolean(syncResult.skipped),
    created_at: new Date().toISOString(),
  };
  await addHistory(historyItem);

  await cleanupFiles(parsed.files);

  return {
    ok: true,
    file: syncResult.file || null,
    skipped: Boolean(syncResult.skipped),
    duplicate: syncResult.duplicate || null,
    telegram: {
      original: summarizeTelegramUpload(originalUpload),
      preview: previewUpload ? summarizeTelegramUpload(previewUpload) : null,
      thumbnail: thumbnailUpload ? summarizeTelegramUpload(thumbnailUpload) : null,
    },
  };
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
    return { ok: false, error: 'TELECLOUD_BASE_URL / LOCAL_AGENT_TOKEN belum lengkap' };
  }

  try {
    await callOnlineJson('/api/local-agent/ping');
    return { ok: true, error: null };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Online auth failed',
    };
  }
}

async function callOnlineJson(pathname, options = {}) {
  if (!TELECLOUD_BASE_URL) throw new Error('TELECLOUD_BASE_URL belum dikonfigurasi');
  const response = await fetch(`${TELECLOUD_BASE_URL}${pathname}`, {
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
      --primary-dark:#1D4ED8;
      --border:#D8E1EE;
      --muted:#64748B;
      --bg:#F6F8FB;
      --text:#0F172A;
      --danger:#DC2626;
      --success:#15803D;
      --warning:#B45309;
    }
    * { box-sizing: border-box; }
    html, body { min-height:100%; }
    body {
      margin:0;
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size:14px;
      background:var(--bg);
      color:var(--text);
    }
    button, input, select { font: inherit; }
    header {
      position:sticky;
      top:0;
      z-index:10;
      border-bottom:1px solid var(--border);
      background:rgba(255,255,255,.96);
      backdrop-filter: blur(10px);
    }
    .wrap { max-width:1500px; margin:0 auto; padding:18px 24px; }
    .brand { display:flex; align-items:center; gap:14px; }
    .logo {
      width:44px; height:44px; border-radius:12px;
      background:var(--primary); color:white;
      display:flex; align-items:center; justify-content:center;
      font-size:18px; font-weight:800;
      box-shadow:0 8px 18px rgba(37,99,235,.18);
    }
    h1 { margin:0; font-size:20px; line-height:1.2; font-weight:750; letter-spacing:-.02em; }
    h2 { margin:0; font-size:16px; font-weight:700; letter-spacing:-.01em; }
    p { margin:0; }
    .muted { color:var(--muted); }
    .main-grid { display:grid; grid-template-columns:minmax(0,1.15fr) minmax(340px,.85fr); gap:18px; margin-top:18px; }
    @media (max-width: 980px) {
      .wrap { padding:14px; }
      .main-grid { grid-template-columns:1fr; }
    }
    .card {
      overflow:hidden;
      border:1px solid var(--border);
      border-radius:14px;
      background:white;
      box-shadow:0 1px 3px rgba(15,23,42,.05);
    }
    .card-head {
      padding:18px 20px;
      border-bottom:1px solid var(--border);
      display:flex; align-items:center; justify-content:space-between; gap:12px;
    }
    .card-body { padding:18px 20px 20px; }
    .stack { display:grid; gap:14px; }
    label {
      display:block; margin-bottom:8px;
      font-size:12px; font-weight:700;
      text-transform:uppercase; letter-spacing:.04em;
      color:#526984;
    }
    select, .file-box {
      width:100%;
      border:1px solid var(--border);
      border-radius:10px;
      background:white;
      padding:11px 12px;
      color:var(--text);
      outline:none;
    }
    select:focus, .file-box:focus-within { border-color:var(--primary); box-shadow:0 0 0 3px rgba(37,99,235,.08); }
    .file-box { display:flex; align-items:center; justify-content:space-between; gap:12px; min-height:46px; }
    .hidden-input { display:none; }
    .btns { display:flex; flex-wrap:wrap; gap:10px; margin-top:16px; }
    button {
      border:1px solid var(--border);
      border-radius:10px;
      background:white;
      color:#334155;
      padding:10px 13px;
      font-weight:650;
      cursor:pointer;
      transition:background .15s, border-color .15s, color .15s, transform .15s;
    }
    button:hover { background:#F8FAFC; }
    button.primary { background:var(--primary); border-color:var(--primary); color:white; }
    button.primary:hover { background:var(--primary-dark); }
    button:disabled { opacity:.55; cursor:not-allowed; transform:none; }
    .status { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; }
    @media (max-width: 520px) { .status { grid-template-columns:1fr; } }
    .pill {
      border:1px solid var(--border);
      border-radius:12px;
      background:#F8FAFC;
      padding:12px;
      min-height:76px;
    }
    .pill b { display:block; font-size:12px; text-transform:uppercase; letter-spacing:.04em; color:#64748B; }
    .pill span { display:block; margin-top:7px; font-size:16px; font-weight:800; }
    .ok { color:var(--success); }
    .bad { color:var(--danger); }
    .warn { color:var(--warning); }
    .selected-list {
      margin-top:10px;
      display:grid;
      gap:8px;
      max-height:170px;
      overflow:auto;
    }
    .file-chip {
      display:flex; align-items:center; justify-content:space-between; gap:10px;
      border:1px solid var(--border);
      border-radius:10px;
      background:#F8FAFC;
      padding:9px 10px;
      color:#334155;
    }
    .file-chip strong {
      min-width:0;
      overflow:hidden;
      text-overflow:ellipsis;
      white-space:nowrap;
      font-weight:650;
    }
    .file-chip small { color:#64748B; white-space:nowrap; }
    .progress {
      margin-top:16px;
      border:1px solid #BFDBFE;
      border-radius:12px;
      background:#EFF6FF;
      padding:14px;
      display:none;
    }
    .bar { height:8px; border-radius:999px; background:white; overflow:hidden; margin-top:10px; }
    .bar > div { height:100%; width:0%; background:var(--primary); transition:width .25s ease; }
    .log {
      margin-top:16px;
      border-radius:12px;
      background:#0F172A;
      color:#E2E8F0;
      padding:14px;
      font-family:ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size:12px;
      line-height:1.55;
      min-height:150px;
      max-height:300px;
      overflow:auto;
      white-space:pre-wrap;
    }
    .history { display:grid; gap:10px; }
    .hist-item { border:1px solid var(--border); border-radius:12px; padding:12px; background:white; }
    .hist-item b { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-weight:700; }
    .hist-item small { color:#64748B; }
    code { border-radius:6px; background:#F1F5F9; padding:2px 5px; font-family:ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size:12px; }
    .notice {
      display:none;
      margin-top:12px;
      border-radius:12px;
      border:1px solid #FCD34D;
      background:#FFFBEB;
      color:#92400E;
      padding:12px;
      line-height:1.6;
    }
  </style>
</head>
<body>
  <header>
    <div class="wrap brand">
      <div class="logo">TC</div>
      <div>
        <h1>TeleCloud Local Agent</h1>
        <p class="muted">Upload besar dari komputer lokal, sync metadata ke TeleCloud Online.</p>
      </div>
    </div>
  </header>

  <main class="wrap">
    <div class="main-grid">
      <section class="card">
        <div class="card-head">
          <div>
            <h2>Upload via Local Agent</h2>
            <p class="muted">Original dikirim langsung dari komputer ke Telegram.</p>
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
                <input id="file" class="hidden-input" type="file" multiple />
              </div>
              <div id="selectedFiles" class="selected-list"></div>
            </div>
          </div>

          <div class="btns">
            <button class="primary" id="upload">Start local upload</button>
            <button id="clearSelection">Clear files</button>
            <button id="clear">Clear log</button>
          </div>

          <div id="progress" class="progress">
            <div style="display:flex;justify-content:space-between;gap:12px">
              <div style="min-width:0">
                <strong id="stage">Preparing...</strong>
                <p id="subStage" class="muted" style="margin-top:2px;font-size:12px"></p>
              </div>
              <span id="pct" style="font-weight:750;color:#1E40AF">0%</span>
            </div>
            <div class="bar"><div id="bar"></div></div>
            <p class="muted" style="margin-top:10px;font-size:12px">Jangan tutup halaman sampai proses selesai.</p>
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

    <section class="card" style="margin-top:18px">
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
let selectedFiles = [];

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
  const entries = [
    ['Online config', data.online_configured, true],
    ['Online auth', data.online_auth_ok, true],
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
    showNotice('authNotice', 'Online auth gagal: ' + (data.online_auth_error || 'Unauthorized') + '. Pastikan LOCAL_AGENT_TOKEN di .env.agent sama persis dengan secret Cloudflare, lalu redeploy online.');
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
    showNotice('folderNotice', 'Folder online gagal dimuat: ' + message + '. Cek LOCAL_AGENT_TOKEN dan redeploy online.');
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
  if (!selectedFiles.length) {
    $('fileSummary').textContent = 'Belum ada file dipilih';
    $('selectedFiles').innerHTML = '';
    return;
  }

  const total = selectedFiles.reduce((sum, file) => sum + file.size, 0);
  $('fileSummary').textContent = selectedFiles.length + ' file dipilih · ' + formatBytes(total);
  $('selectedFiles').innerHTML = selectedFiles.map((file, index) => (
    '<div class="file-chip"><strong title="' + escapeHtml(file.name) + '">' + escapeHtml(file.name) + '</strong><small>' + formatBytes(file.size) + '</small></div>'
  )).join('');
}

async function uploadAll() {
  if (!selectedFiles.length) {
    alert('Pilih file dulu.');
    return;
  }

  $('upload').disabled = true;
  $('pickFiles').disabled = true;
  $('refreshFolders').disabled = true;
  $('progress').style.display = 'block';
  $('log').textContent = 'Starting multi upload...';

  let success = 0;
  let failed = 0;

  for (let index = 0; index < selectedFiles.length; index += 1) {
    const file = selectedFiles[index];
    const base = (index / selectedFiles.length) * 100;
    const span = 100 / selectedFiles.length;

    try {
      await uploadOne(file, index + 1, selectedFiles.length, base, span);
      success += 1;
    } catch (err) {
      failed += 1;
      log('FAILED ' + file.name + ': ' + (err && err.message ? err.message : err));
    }
  }

  setProgress('Multi upload complete', 100, success + ' sukses, ' + failed + ' gagal');
  log('Done. Success: ' + success + ', failed: ' + failed + '. Refresh TeleCloud Online to see uploaded files.');
  await loadHistory();

  $('upload').disabled = false;
  $('pickFiles').disabled = false;
  $('refreshFolders').disabled = false;
}

async function uploadOne(file, number, total, base, span) {
  const label = '[' + number + '/' + total + '] ' + file.name;
  setProgress('Preparing file...', base + span * .04, label);
  log('Uploading ' + label);

  const form = new FormData();
  form.append('folder_id', $('folder').value || '');
  form.append('file', file, file.name);

  if (file.type.startsWith('image/')) {
    setProgress('Creating thumbnail...', base + span * .12, label);
    const thumbnail = await createImageVariant(file, 240, .72, 'thumbnail');
    if (thumbnail) form.append('thumbnail_file', thumbnail, thumbnail.name);

    setProgress('Creating optimized preview...', base + span * .22, label);
    const preview = await createImageVariant(file, 1600, .82, 'preview');
    if (preview) form.append('preview_file', preview, preview.name);
  }

  await uploadWithProgress(form, base, span, label);
  setProgress('File complete', base + span, label);
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
      setProgress('Syncing metadata online...', base + span * .92, label);
      log(JSON.stringify(data, null, 2));
      resolve(data);
    };

    xhr.onerror = () => reject(new Error('Network error to local agent'));
    setProgress('Uploading to Telegram...', base + span * .65, label);
    xhr.send(form);
  });
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
$('file').addEventListener('change', () => {
  selectedFiles = Array.from($('file').files || []);
  renderSelectedFiles();
});
$('upload').addEventListener('click', uploadAll);
$('clearSelection').addEventListener('click', () => {
  $('file').value = '';
  selectedFiles = [];
  renderSelectedFiles();
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
