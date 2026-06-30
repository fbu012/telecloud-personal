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
const TELECLOUD_BASE_URL = (process.env.TELECLOUD_BASE_URL || '').replace(/\/$/, '');
const LOCAL_AGENT_TOKEN = process.env.LOCAL_AGENT_TOKEN || '';
const BOT_TOKEN = process.env.BOT_TOKEN || '';
const TELEGRAM_API_BASE = (process.env.TELEGRAM_API_BASE || 'https://api.telegram.org').replace(/\/$/, '');
const ORIGINAL_CHAT_ID = process.env.TELEGRAM_ORIGINAL_CHAT_ID || process.env.TELEGRAM_CHAT_ID || '';
const PREVIEW_CHAT_ID = process.env.TELEGRAM_PREVIEW_CHAT_ID || ORIGINAL_CHAT_ID;
const THUMBNAIL_CHAT_ID = process.env.TELEGRAM_THUMBNAIL_CHAT_ID || ORIGINAL_CHAT_ID;
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
      return sendJson(res, 200, {
        ok: true,
        port: PORT,
        telecloud_base_url: TELECLOUD_BASE_URL,
        online_configured: Boolean(TELECLOUD_BASE_URL && LOCAL_AGENT_TOKEN),
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
    console.error(err);
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

async function callOnlineJson(pathname, options = {}) {
  if (!TELECLOUD_BASE_URL) throw new Error('TELECLOUD_BASE_URL belum dikonfigurasi');
  const response = await fetch(`${TELECLOUD_BASE_URL}${pathname}`, {
    method: options.method || 'GET',
    headers: {
      authorization: `Bearer ${LOCAL_AGENT_TOKEN}`,
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
    :root { --primary:#2563eb; --border:#dbe3ef; --muted:#64748b; --bg:#f6f8fb; --text:#0f172a; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: var(--bg); color: var(--text); }
    header { position: sticky; top: 0; z-index: 10; border-bottom: 1px solid var(--border); background: rgba(255,255,255,.94); backdrop-filter: blur(10px); }
    .wrap { max-width: 1120px; margin: 0 auto; padding: 18px; }
    .brand { display:flex; align-items:center; gap:12px; }
    .logo { width:40px; height:40px; border-radius:12px; background: var(--primary); color:white; display:flex; align-items:center; justify-content:center; font-weight:800; }
    h1 { font-size: 20px; margin: 0; }
    p { margin: 0; }
    .muted { color: var(--muted); }
    .grid { display:grid; grid-template-columns: 1.1fr .9fr; gap: 16px; margin-top: 18px; }
    @media (max-width: 860px) { .grid { grid-template-columns: 1fr; } }
    .card { border:1px solid var(--border); border-radius:16px; background:white; box-shadow: 0 1px 3px rgba(15,23,42,.05); overflow:hidden; }
    .card h2 { font-size: 16px; margin:0; }
    .card-head { padding:16px 18px; border-bottom:1px solid var(--border); display:flex; align-items:center; justify-content:space-between; gap:12px; }
    .card-body { padding:18px; }
    label { display:block; font-size: 12px; font-weight:700; text-transform: uppercase; letter-spacing:.04em; color:#475569; margin-bottom:8px; }
    input, select { width:100%; border:1px solid var(--border); border-radius:12px; padding:12px; font:inherit; outline:none; background:white; }
    input:focus, select:focus { border-color: var(--primary); }
    .row { display:grid; gap:14px; }
    .btns { display:flex; flex-wrap:wrap; gap:10px; margin-top:16px; }
    button { border:1px solid var(--border); border-radius:12px; background:white; color:#334155; padding:11px 14px; font-weight:700; cursor:pointer; }
    button.primary { background: var(--primary); color:white; border-color: var(--primary); }
    button:disabled { opacity:.55; cursor:not-allowed; }
    .status { display:grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap:10px; }
    .pill { border:1px solid var(--border); border-radius:12px; padding:12px; background:#f8fafc; }
    .pill b { display:block; font-size:12px; text-transform:uppercase; color:#64748b; letter-spacing:.04em; }
    .pill span { display:block; margin-top:6px; font-weight:800; }
    .ok { color:#15803d; }
    .bad { color:#b91c1c; }
    .progress { margin-top:16px; border:1px solid #bfdbfe; border-radius:14px; background:#eff6ff; padding:14px; display:none; }
    .bar { height:9px; border-radius:999px; background:white; overflow:hidden; margin-top:10px; }
    .bar > div { height:100%; width:0%; background:var(--primary); transition:width .2s ease; }
    .log { margin-top:16px; border-radius:14px; background:#0f172a; color:#e2e8f0; padding:14px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size:12px; min-height:130px; max-height:280px; overflow:auto; white-space:pre-wrap; }
    .history { display:grid; gap:10px; }
    .hist-item { border:1px solid var(--border); border-radius:12px; padding:12px; background:#fff; }
    .hist-item b { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .hist-item small { color:#64748b; }
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
    <div class="grid">
      <section class="card">
        <div class="card-head">
          <div>
            <h2>Upload via Local Agent</h2>
            <p class="muted">Original dikirim langsung dari komputer ke Telegram.</p>
          </div>
          <button id="refreshFolders">Refresh folders</button>
        </div>
        <div class="card-body">
          <div class="row">
            <div>
              <label>Folder tujuan online</label>
              <select id="folder"></select>
            </div>
            <div>
              <label>File</label>
              <input id="file" type="file" />
            </div>
          </div>

          <div class="btns">
            <button class="primary" id="upload">Start local upload</button>
            <button id="clear">Clear log</button>
          </div>

          <div id="progress" class="progress">
            <div style="display:flex;justify-content:space-between;gap:12px">
              <strong id="stage">Preparing...</strong>
              <span id="pct">0%</span>
            </div>
            <div class="bar"><div id="bar"></div></div>
            <p class="muted" style="margin-top:10px;font-size:13px">Jangan tutup halaman sampai proses selesai.</p>
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

function log(message) {
  const now = new Date().toLocaleTimeString();
  $('log').textContent += '\\n[' + now + '] ' + message;
  $('log').scrollTop = $('log').scrollHeight;
}

function setProgress(label, value) {
  $('progress').style.display = 'block';
  $('stage').textContent = label;
  $('pct').textContent = Math.round(value) + '%';
  $('bar').style.width = Math.max(0, Math.min(100, value)) + '%';
}

async function loadStatus() {
  const data = await fetch('/api/status').then(r => r.json());
  const entries = [
    ['Online API', data.online_configured],
    ['Bot token', data.bot_token_configured],
    ['Original channel', data.original_channel_configured],
    ['Preview channel', data.preview_channel_configured],
    ['Thumbnail channel', data.thumbnail_channel_configured],
    ['Max file', data.max_file_mb + ' MB'],
  ];
  $('status').innerHTML = entries.map(([label, value]) => {
    const bool = typeof value === 'boolean';
    return '<div class="pill"><b>' + label + '</b><span class="' + (bool ? (value ? 'ok' : 'bad') : '') + '">' + (bool ? (value ? 'Configured' : 'Missing') : value) + '</span></div>';
  }).join('');
}

async function loadFolders() {
  $('folder').innerHTML = '<option value="">Loading...</option>';
  const data = await fetch('/api/folders').then(r => r.json());
  folders = data.folders || [];
  $('folder').innerHTML = '<option value="">Root</option>' + folders.map(folder => '<option value="' + folder.id + '">' + escapeHtml(folder.name) + (folder.is_secure ? ' 🔒' : '') + '</option>').join('');
}

async function loadHistory() {
  const data = await fetch('/api/history').then(r => r.json());
  const items = data.uploads || [];
  $('history').innerHTML = items.length ? items.map(item => (
    '<div class="hist-item"><b>' + escapeHtml(item.original_name) + '</b><small>' + new Date(item.created_at).toLocaleString() + ' · ' + formatBytes(item.size_bytes) + (item.skipped ? ' · duplicate skipped' : '') + '</small></div>'
  )).join('') : '<p class="muted">No local uploads yet.</p>';
}

async function upload() {
  const file = $('file').files[0];
  if (!file) {
    alert('Pilih file dulu.');
    return;
  }

  $('upload').disabled = true;
  $('progress').style.display = 'block';
  $('log').textContent = 'Starting upload...';
  setProgress('Preparing file...', 5);

  try {
    const form = new FormData();
    form.append('folder_id', $('folder').value || '');
    form.append('file', file, file.name);

    if (file.type.startsWith('image/')) {
      setProgress('Creating thumbnail in browser...', 12);
      const thumbnail = await createImageVariant(file, 240, .72, 'thumbnail');
      if (thumbnail) form.append('thumbnail_file', thumbnail, thumbnail.name);

      setProgress('Creating optimized preview in browser...', 22);
      const preview = await createImageVariant(file, 1600, .82, 'preview');
      if (preview) form.append('preview_file', preview, preview.name);
      log('Image variants prepared.');
    }

    await uploadWithProgress(form);
    setProgress('Complete', 100);
    log('Upload complete. Refresh TeleCloud Online to see the file.');
    await loadHistory();
  } catch (err) {
    setProgress('Failed', 0);
    log('ERROR: ' + (err && err.message ? err.message : err));
  } finally {
    $('upload').disabled = false;
  }
}

function uploadWithProgress(form) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload');

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      const pct = 25 + (event.loaded / event.total) * 45;
      setProgress('Sending file to local agent...', pct);
    };

    xhr.onload = () => {
      let data = null;
      try { data = JSON.parse(xhr.responseText || '{}'); } catch {}
      if (xhr.status >= 400 || data?.ok === false) {
        reject(new Error(data?.error || 'Upload failed'));
        return;
      }
      setProgress('Local agent synced metadata online...', 94);
      log(JSON.stringify(data, null, 2));
      resolve(data);
    };

    xhr.onerror = () => reject(new Error('Network error to local agent'));
    setProgress('Uploading to Telegram and syncing metadata...', 72);
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
    log('Image variant failed: ' + err.message);
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

$('upload').addEventListener('click', upload);
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
