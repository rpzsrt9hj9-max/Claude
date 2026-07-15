/*
 * Serveur de la messagerie familiale chiffrée de bout en bout.
 *
 * Rôle volontairement limité : ce serveur relaie et stocke des données
 * OPAQUES (déjà chiffrées par les navigateurs). Il ne connaît ni les phrases
 * secrètes, ni les clés privées, ni le contenu des messages, photos ou
 * messages vocaux.
 *
 * Zéro dépendance npm : uniquement la bibliothèque standard de Node.js.
 * Démarrage : node server.js   (PORT et DATA_DIR configurables par variables
 * d'environnement).
 */
'use strict';

const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PORT = parseInt(process.env.PORT || '3000', 10);
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const PUBLIC_DIR = path.join(__dirname, 'public');

const MAX_JSON_BODY = 2 * 1024 * 1024;      // 2 Mo pour les requêtes JSON
const MAX_BLOB_SIZE = 25 * 1024 * 1024;     // 25 Mo par photo / message vocal
const SESSION_TTL = 30 * 24 * 3600 * 1000;  // 30 jours
const INVITE_TTL = 7 * 24 * 3600 * 1000;    // 7 jours

// ---------------------------------------------------------------- stockage
for (const d of [DATA_DIR, path.join(DATA_DIR, 'messages'), path.join(DATA_DIR, 'blobs')]) {
  fs.mkdirSync(d, { recursive: true });
}

function loadJson(name, fallback) {
  const file = path.join(DATA_DIR, name);
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function saveJson(name, obj) {
  const file = path.join(DATA_DIR, name);
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 1));
  fs.renameSync(tmp, file);
}

const users = loadJson('users.json', {});           // clé : pseudo en minuscules
const sessions = loadJson('sessions.json', {});     // token -> { username, expires }
const invites = loadJson('invites.json', {});       // hash(token) -> { createdBy, expires, used }
const conversations = loadJson('conversations.json', {}); // id -> { name, members, keys, lastSeq, ... }

// Secret du serveur (pour les sels factices anti-énumération de pseudos)
let serverSecret = loadJson('secret.json', null);
if (!serverSecret) {
  serverSecret = { value: crypto.randomBytes(32).toString('hex') };
  saveJson('secret.json', serverSecret);
}

// ------------------------------------------------------------- utilitaires
function sha256hex(s) { return crypto.createHash('sha256').update(s).digest('hex'); }
function randomToken() { return crypto.randomBytes(32).toString('hex'); }
function now() { return Date.now(); }

function hashAuthKey(authKeyHex, saltHex) {
  // scrypt côté serveur : même si la base fuite, le jeton d'authentification
  // (lui-même déjà issu de 600 000 itérations de PBKDF2) reste protégé.
  return crypto.scryptSync(authKeyHex, Buffer.from(saltHex, 'hex'), 32, { N: 16384, r: 8, p: 1 }).toString('hex');
}
function safeEqual(a, b) {
  const ba = Buffer.from(String(a)), bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

const USERNAME_RE = /^[\p{L}\p{N}_-]{2,20}$/u;

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}
function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > MAX_JSON_BODY) { reject(new Error('too_large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
      catch { reject(new Error('bad_json')); }
    });
    req.on('error', reject);
  });
}
function parseCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

// --------------------------------------------------------------- sessions
function createSession(res, req, username) {
  const token = randomToken();
  sessions[token] = { username, expires: now() + SESSION_TTL };
  saveJson('sessions.json', sessions);
  const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
  res.setHeader('Set-Cookie',
    `session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_TTL / 1000}${secure}`);
}
function getSession(req) {
  const token = parseCookies(req).session;
  if (!token) return null;
  const s = sessions[token];
  if (!s || s.expires < now()) { if (s) { delete sessions[token]; saveJson('sessions.json', sessions); } return null; }
  return { token, username: s.username };
}

// Limitation des tentatives de connexion : 10 par quart d'heure et par cible
const loginAttempts = new Map();
function rateLimited(key) {
  const windowMs = 15 * 60 * 1000;
  const rec = loginAttempts.get(key) || { count: 0, start: now() };
  if (now() - rec.start > windowMs) { rec.count = 0; rec.start = now(); }
  rec.count++;
  loginAttempts.set(key, rec);
  return rec.count > 10;
}

// ------------------------------------------------------ événements (SSE)
const sseClients = new Map(); // username -> Set<res>
function ssePush(username, event) {
  const set = sseClients.get(username);
  if (!set) return;
  const data = `data: ${JSON.stringify(event)}\n\n`;
  for (const res of set) res.write(data);
}
function notifyMembers(convoId, event, exceptUsername) {
  const convo = conversations[convoId];
  if (!convo) return;
  for (const m of convo.members) if (m !== exceptUsername) ssePush(m, event);
}
setInterval(() => {
  for (const set of sseClients.values()) for (const res of set) res.write(': ping\n\n');
}, 25000).unref();

// -------------------------------------------------------- messages (JSONL)
function messagesFile(convoId) { return path.join(DATA_DIR, 'messages', convoId + '.jsonl'); }
function appendMessage(convoId, msg) {
  fs.appendFileSync(messagesFile(convoId), JSON.stringify(msg) + '\n');
}
function readMessages(convoId, afterSeq) {
  let raw;
  try { raw = fs.readFileSync(messagesFile(convoId), 'utf8'); } catch { return []; }
  const out = [];
  for (const line of raw.split('\n')) {
    if (!line) continue;
    const m = JSON.parse(line);
    if (m.seq > afterSeq) out.push(m);
  }
  return out;
}

// ----------------------------------------------------- invitation initiale
function ensureFounderInvite() {
  if (Object.keys(users).length > 0) return;
  const founderFile = path.join(DATA_DIR, 'founder-invite.txt');
  let token;
  try { token = fs.readFileSync(founderFile, 'utf8').trim(); } catch { /* absent */ }
  if (!token || !invites[sha256hex(token)] || invites[sha256hex(token)].used) {
    token = randomToken();
    invites[sha256hex(token)] = { createdBy: '(fondateur)', expires: now() + 365 * 24 * 3600 * 1000, used: false };
    saveJson('invites.json', invites);
    fs.writeFileSync(founderFile, token + '\n');
  }
  console.log('');
  console.log('=== PREMIÈRE UTILISATION ===');
  console.log('Aucun compte n\'existe encore. Créez le vôtre en ouvrant :');
  console.log(`    http://localhost:${PORT}/#invitation=${token}`);
  console.log('(remplacez localhost par l\'adresse publique de votre serveur)');
  console.log('============================');
  console.log('');
}

// ------------------------------------------------------------------- API
const api = {

  // Vérifie une invitation avant l'inscription
  'GET /api/invitation': (req, res, q) => {
    const inv = invites[sha256hex(q.get('token') || '')];
    if (!inv || inv.used || inv.expires < now()) return sendJson(res, 404, { error: 'invitation_invalide' });
    sendJson(res, 200, { valid: true, createdBy: inv.createdBy });
  },

  // Inscription (nécessite une invitation valable)
  'POST /api/register': async (req, res) => {
    if (rateLimited('reg:' + req.socket.remoteAddress)) return sendJson(res, 429, { error: 'trop_de_tentatives' });
    const b = await readJsonBody(req);
    const inv = invites[sha256hex(String(b.inviteToken || ''))];
    if (!inv || inv.used || inv.expires < now()) return sendJson(res, 403, { error: 'invitation_invalide' });
    const username = String(b.username || '').trim();
    if (!USERNAME_RE.test(username)) return sendJson(res, 400, { error: 'pseudo_invalide' });
    const key = username.toLowerCase();
    if (users[key]) return sendJson(res, 409, { error: 'pseudo_deja_pris' });
    if (typeof b.authKey !== 'string' || b.authKey.length !== 64 ||
        !b.kdfSalt || !b.pubEcdh || !b.pubEcdsa || !b.encPriv) {
      return sendJson(res, 400, { error: 'donnees_incompletes' });
    }
    const serverSalt = crypto.randomBytes(16).toString('hex');
    users[key] = {
      username,
      serverSalt,
      authHash: hashAuthKey(b.authKey, serverSalt),
      kdfSalt: String(b.kdfSalt),
      pubEcdh: b.pubEcdh,
      pubEcdsa: b.pubEcdsa,
      encPriv: b.encPriv,
      createdAt: now(),
    };
    inv.used = true;
    saveJson('users.json', users);
    saveJson('invites.json', invites);
    try { fs.unlinkSync(path.join(DATA_DIR, 'founder-invite.txt')); } catch { /* déjà absent */ }
    createSession(res, req, key);
    sendJson(res, 200, { ok: true, username });
  },

  // Étape 1 : récupérer le sel KDF (sel factice stable si le pseudo n'existe
  // pas, pour ne pas révéler quels pseudos sont enregistrés)
  'POST /api/salt': async (req, res) => {
    const b = await readJsonBody(req);
    const key = String(b.username || '').trim().toLowerCase();
    const u = users[key];
    if (u) return sendJson(res, 200, { kdfSalt: u.kdfSalt });
    const fake = crypto.createHmac('sha256', serverSecret.value).update('salt:' + key).digest().subarray(0, 16);
    sendJson(res, 200, { kdfSalt: fake.toString('base64') });
  },

  // Étape 2 : connexion avec le jeton dérivé de la phrase secrète
  'POST /api/login': async (req, res) => {
    const b = await readJsonBody(req);
    const key = String(b.username || '').trim().toLowerCase();
    if (rateLimited('login:' + req.socket.remoteAddress) || rateLimited('login-user:' + key)) {
      return sendJson(res, 429, { error: 'trop_de_tentatives' });
    }
    const u = users[key];
    if (!u || typeof b.authKey !== 'string' ||
        !safeEqual(hashAuthKey(b.authKey, u.serverSalt), u.authHash)) {
      return sendJson(res, 401, { error: 'identifiants_invalides' });
    }
    createSession(res, req, key);
    sendJson(res, 200, { ok: true, username: u.username, encPriv: u.encPriv, kdfSalt: u.kdfSalt });
  },

  'POST /api/logout': (req, res, q, session) => {
    if (session) { delete sessions[session.token]; saveJson('sessions.json', sessions); }
    res.setHeader('Set-Cookie', 'session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0');
    sendJson(res, 200, { ok: true });
  },

  // Session en cours : renvoie ce qu'il faut pour déverrouiller localement
  'GET /api/me': (req, res, q, session) => {
    if (!session) return sendJson(res, 401, { error: 'non_connecte' });
    const u = users[session.username];
    sendJson(res, 200, { username: u.username, encPriv: u.encPriv, kdfSalt: u.kdfSalt });
  },

  // Annuaire familial : pseudos et clés publiques
  'GET /api/users': (req, res, q, session) => {
    if (!session) return sendJson(res, 401, { error: 'non_connecte' });
    sendJson(res, 200, {
      users: Object.values(users).map(u => ({
        username: u.username, pubEcdh: u.pubEcdh, pubEcdsa: u.pubEcdsa,
      })),
    });
  },

  // Créer une invitation (tout membre de la famille peut inviter)
  'POST /api/invites': (req, res, q, session) => {
    if (!session) return sendJson(res, 401, { error: 'non_connecte' });
    const token = randomToken();
    invites[sha256hex(token)] = { createdBy: users[session.username].username, expires: now() + INVITE_TTL, used: false };
    saveJson('invites.json', invites);
    sendJson(res, 200, { token, expiresInDays: INVITE_TTL / 86400000 });
  },

  // Créer une conversation (la clé arrive déjà enveloppée pour chaque membre)
  'POST /api/conversations': async (req, res, q, session) => {
    if (!session) return sendJson(res, 401, { error: 'non_connecte' });
    const b = await readJsonBody(req);
    const members = Array.isArray(b.members) ? [...new Set(b.members.map(m => String(m).toLowerCase()))] : [];
    if (!members.includes(session.username)) members.push(session.username);
    if (members.length < 2) return sendJson(res, 400, { error: 'membres_insuffisants' });
    for (const m of members) {
      if (!users[m]) return sendJson(res, 400, { error: 'membre_inconnu' });
      if (!b.wrappedKeys || !b.wrappedKeys[m]) return sendJson(res, 400, { error: 'cle_manquante' });
    }
    const id = randomToken().slice(0, 24);
    conversations[id] = {
      id,
      name: String(b.name || '').slice(0, 60),
      members,
      keys: Object.fromEntries(members.map(m => [m, b.wrappedKeys[m]])),
      createdBy: session.username,
      createdAt: now(),
      lastSeq: 0,
    };
    saveJson('conversations.json', conversations);
    const convo = conversations[id];
    notifyMembers(id, { type: 'conversation', convoId: id }, session.username);
    sendJson(res, 200, { ok: true, id, conversation: publicConvo(convo, session.username) });
  },

  // Mes conversations
  'GET /api/conversations': (req, res, q, session) => {
    if (!session) return sendJson(res, 401, { error: 'non_connecte' });
    const mine = Object.values(conversations)
      .filter(c => c.members.includes(session.username))
      .map(c => publicConvo(c, session.username));
    sendJson(res, 200, { conversations: mine });
  },

  // Flux temps réel
  'GET /api/events': (req, res, q, session) => {
    if (!session) return sendJson(res, 401, { error: 'non_connecte' });
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-store',
      'X-Accel-Buffering': 'no',
    });
    res.write(': connecté\n\n');
    let set = sseClients.get(session.username);
    if (!set) { set = new Set(); sseClients.set(session.username, set); }
    set.add(res);
    req.on('close', () => {
      set.delete(res);
      if (set.size === 0) sseClients.delete(session.username);
    });
  },
};

function publicConvo(c, username) {
  return {
    id: c.id, name: c.name, members: c.members.map(m => users[m].username),
    myWrappedKey: c.keys[username], createdBy: c.createdBy, lastSeq: c.lastSeq,
  };
}

// Routes avec identifiant de conversation dans le chemin
async function handleConvoRoutes(req, res, session, parts, q) {
  // /api/messages/:convoId  et  /api/blobs/:convoId[/:blobId]
  const [, , kind, convoId, blobId] = parts;
  if (!session) return sendJson(res, 401, { error: 'non_connecte' });
  const convo = conversations[convoId];
  if (!convo || !convo.members.includes(session.username)) {
    return sendJson(res, 404, { error: 'conversation_introuvable' });
  }

  if (kind === 'messages' && req.method === 'GET') {
    const after = parseInt(q.get('after') || '0', 10) || 0;
    return sendJson(res, 200, { messages: readMessages(convoId, after), lastSeq: convo.lastSeq });
  }

  if (kind === 'messages' && req.method === 'POST') {
    const b = await readJsonBody(req);
    if (typeof b.iv !== 'string' || typeof b.ct !== 'string' || typeof b.sig !== 'string') {
      return sendJson(res, 400, { error: 'donnees_incompletes' });
    }
    convo.lastSeq++;
    const msg = {
      seq: convo.lastSeq,
      sender: users[session.username].username,
      ts: now(),
      iv: b.iv, ct: b.ct, sig: b.sig,
    };
    appendMessage(convoId, msg);
    saveJson('conversations.json', conversations);
    notifyMembers(convoId, { type: 'message', convoId, message: msg }, null);
    return sendJson(res, 200, { ok: true, seq: msg.seq });
  }

  if (kind === 'blobs' && req.method === 'POST') {
    const id = randomToken().slice(0, 32);
    const dir = path.join(DATA_DIR, 'blobs', convoId);
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, id);
    const ws = fs.createWriteStream(file);
    let size = 0, aborted = false;
    req.on('data', c => {
      size += c.length;
      if (size > MAX_BLOB_SIZE && !aborted) {
        aborted = true; ws.destroy(); fs.unlink(file, () => {});
        sendJson(res, 413, { error: 'fichier_trop_gros' });
        req.destroy();
      }
    });
    req.pipe(ws);
    ws.on('finish', () => { if (!aborted) sendJson(res, 200, { ok: true, blobId: id }); });
    ws.on('error', () => { if (!aborted) sendJson(res, 500, { error: 'erreur_ecriture' }); });
    return;
  }

  if (kind === 'blobs' && req.method === 'GET' && blobId) {
    if (!/^[a-f0-9]{32}$/.test(blobId)) return sendJson(res, 400, { error: 'identifiant_invalide' });
    const file = path.join(DATA_DIR, 'blobs', convoId, blobId);
    fs.stat(file, (err, st) => {
      if (err) return sendJson(res, 404, { error: 'fichier_introuvable' });
      res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Length': st.size,
        'Cache-Control': 'private, max-age=31536000',
      });
      fs.createReadStream(file).pipe(res);
    });
    return;
  }

  sendJson(res, 404, { error: 'introuvable' });
}

// -------------------------------------------------------- fichiers statiques
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
};
function serveStatic(req, res, pathname) {
  let rel = pathname === '/' ? 'index.html' : pathname.slice(1);
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Introuvable'); }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': rel === 'index.html' ? 'no-cache' : 'public, max-age=3600',
    });
    res.end(data);
  });
}

// ---------------------------------------------------------------- serveur
const server = http.createServer(async (req, res) => {
  // En-têtes de sécurité pour toutes les réponses
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; img-src 'self' blob: data:; media-src blob:; " +
    "connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");

  const url = new URL(req.url, 'http://localhost');
  const pathname = url.pathname;

  try {
    if (pathname.startsWith('/api/')) {
      const session = getSession(req);
      const parts = pathname.split('/'); // ['', 'api', ...]
      if ((parts[2] === 'messages' || parts[2] === 'blobs') && parts[3]) {
        return await handleConvoRoutes(req, res, session, parts, url.searchParams);
      }
      const handler = api[req.method + ' ' + pathname];
      if (handler) return await handler(req, res, url.searchParams, session);
      return sendJson(res, 404, { error: 'introuvable' });
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
    serveStatic(req, res, pathname);
  } catch (e) {
    const status = e.message === 'too_large' ? 413 : e.message === 'bad_json' ? 400 : 500;
    if (status === 500) console.error(e);
    if (!res.headersSent) sendJson(res, status, { error: 'erreur' });
  }
});

// Purge périodique des sessions et invitations expirées
setInterval(() => {
  let dirty = false;
  for (const [t, s] of Object.entries(sessions)) if (s.expires < now()) { delete sessions[t]; dirty = true; }
  if (dirty) saveJson('sessions.json', sessions);
  dirty = false;
  for (const [h, i] of Object.entries(invites)) if (i.expires < now() && !i.used) { delete invites[h]; dirty = true; }
  if (dirty) saveJson('invites.json', invites);
}, 3600 * 1000).unref();

server.listen(PORT, () => {
  console.log(`Messagerie familiale démarrée sur le port ${PORT}`);
  console.log(`Données stockées dans : ${DATA_DIR}`);
  ensureFounderInvite();
});
