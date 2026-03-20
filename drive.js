// drive.js — Google Drive OAuth2 PKCE + backup/restore
// ⚠️  Set these before deploying
function getConfig() {
  try { return JSON.parse(localStorage.getItem('drive_config') || '{}'); } catch { return {}; }
}
function getClientId()     { return getConfig().clientId     || window.DRIVE_CONFIG?.clientId     || ''; }
function getClientSecret() { return getConfig().clientSecret || window.DRIVE_CONFIG?.clientSecret || ''; }
function saveConfig(clientId, clientSecret) {
  localStorage.setItem('drive_config', JSON.stringify({ clientId, clientSecret }));
}
function isConfigured() {
  return !!(getClientId() && getClientSecret());
}

const REDIRECT_URI = window.location.origin + window.location.pathname;

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive';
const BACKUP_FOLDER = 'personaccount_backup';
const BACKUP_FILE = 'accounting_backup.db';
const TOKEN_KEY = 'gd_tokens';

// ── PKCE helpers ──────────────────────────────────────────────────────────────

function generateCodeVerifier() {
  const array = new Uint8Array(64);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function generateCodeChallenge(verifier) {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// ── OAuth flow ────────────────────────────────────────────────────────────────

async function startOAuthFlow() {
  const verifier = generateCodeVerifier();
  const challenge = await generateCodeChallenge(verifier);
  const state = generateCodeVerifier().slice(0, 16);

  sessionStorage.setItem('pkce_verifier', verifier);
  sessionStorage.setItem('pkce_state', state);

  const params = new URLSearchParams({
    client_id: getClientId(),
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: DRIVE_SCOPE,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
    access_type: 'offline',
    prompt: 'consent',
  });

  window.location.href = `${AUTH_URL}?${params}`;
}

async function handleOAuthCallback(code, state) {
  const savedState = sessionStorage.getItem('pkce_state');
  const verifier = sessionStorage.getItem('pkce_verifier');

  if (state !== savedState) throw new Error('OAuth state mismatch');

  const resp = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: getClientId(),
      client_secret: getClientSecret(),
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code',
      code_verifier: verifier,
    }),
  });

  if (!resp.ok) throw new Error('Token exchange failed');
  const tokens = await resp.json();
  saveTokens(tokens);
  sessionStorage.removeItem('pkce_verifier');
  sessionStorage.removeItem('pkce_state');
}

// ── Token management ──────────────────────────────────────────────────────────

function saveTokens({ access_token, refresh_token, expires_in }) {
  localStorage.setItem(TOKEN_KEY, JSON.stringify({
    access_token,
    refresh_token,
    expires_at: Date.now() + expires_in * 1000,
  }));
}

function isAuthenticated() {
  return !!localStorage.getItem(TOKEN_KEY);
}

function clearTokens() {
  localStorage.removeItem(TOKEN_KEY);
}

async function refreshAccessToken() {
  const stored = JSON.parse(localStorage.getItem(TOKEN_KEY) || '{}');
  if (!stored.refresh_token) throw new Error('No refresh token');

  const resp = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: getClientId(),
      client_secret: getClientSecret(),
      grant_type: 'refresh_token',
      refresh_token: stored.refresh_token,
    }),
  });

  if (!resp.ok) {
    clearTokens();
    throw new Error('Token refresh failed — please reconnect Google Drive');
  }

  const tokens = await resp.json();
  saveTokens({ ...tokens, refresh_token: stored.refresh_token });
}

async function getAccessToken() {
  const stored = JSON.parse(localStorage.getItem(TOKEN_KEY) || '{}');
  if (!stored.access_token) throw new Error('Not authenticated');

  if (Date.now() > stored.expires_at - 60_000) {
    await refreshAccessToken();
    return JSON.parse(localStorage.getItem(TOKEN_KEY)).access_token;
  }
  return stored.access_token;
}

// ── Drive API helpers ─────────────────────────────────────────────────────────

async function driveRequest(url, options = {}) {
  const token = await getAccessToken();
  const resp = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Drive API error ${resp.status}: ${err}`);
  }
  return resp;
}

async function findFolderId(name) {
  const q = `name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const resp = await driveRequest(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)`
  );
  const data = await resp.json();
  return data.files?.[0]?.id || null;
}

async function findFileId(folderId, filename) {
  const q = `name='${filename}' and '${folderId}' in parents and trashed=false`;
  const resp = await driveRequest(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)`
  );
  const data = await resp.json();
  return data.files?.[0]?.id || null;
}

async function downloadFile(fileId) {
  const resp = await driveRequest(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`
  );
  return new Uint8Array(await resp.arrayBuffer());
}

async function uploadFile(folderId, fileId, bytes) {
  const blob = new Blob([bytes], { type: 'application/octet-stream' });

  if (fileId) {
    await driveRequest(
      `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
      { method: 'PATCH', body: blob }
    );
  } else {
    const metadata = JSON.stringify({ name: BACKUP_FILE, parents: [folderId] });
    const form = new FormData();
    form.append('metadata', new Blob([metadata], { type: 'application/json' }));
    form.append('file', blob);
    await driveRequest(
      `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart`,
      { method: 'POST', body: form }
    );
  }
}

// ── High-level backup / restore ───────────────────────────────────────────────

async function backup(dbBytes) {
  const folderId = await findFolderId(BACKUP_FOLDER);
  if (!folderId) throw new Error(`Folder "${BACKUP_FOLDER}" not found on Google Drive`);
  const fileId = await findFileId(folderId, BACKUP_FILE);
  await uploadFile(folderId, fileId, dbBytes);
}

async function restore() {
  const folderId = await findFolderId(BACKUP_FOLDER);
  if (!folderId) throw new Error('no_file');
  const fileId = await findFileId(folderId, BACKUP_FILE);
  if (!fileId) throw new Error('no_file');
  return await downloadFile(fileId);
}

// ── Public API ────────────────────────────────────────────────────────────────

window.Drive = {
  startOAuthFlow,
  handleOAuthCallback,
  isAuthenticated,
  clearTokens,
  backup,
  restore,
  saveConfig,
  isConfigured,
};
