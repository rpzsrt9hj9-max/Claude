/*
 * Messagerie familiale — logique applicative (côté navigateur).
 * Tout le contenu est chiffré/déchiffré ici via crypto.js ; le serveur
 * ne reçoit que des données opaques.
 */
'use strict';
/* global MsgCrypto */

const $ = (id) => document.getElementById(id);

const state = {
  me: null,            // { username, privEcdh, privEcdsa, pubEcdh, pubEcdsa }
  users: new Map(),    // pseudo minuscule -> { username, pubEcdh, pubEcdsa }
  convos: new Map(),   // id -> { meta, key, msgs:Map(seq->msg), unread }
  currentId: null,
  sse: null,
  recorder: null,
};

// ---------------------------------------------------------------- réseau
async function api(method, url, body) {
  const opts = { method, headers: {} };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(url, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'erreur'), { status: res.status });
  return data;
}

const ERRORS = {
  identifiants_invalides: 'Pseudonyme ou phrase secrète incorrects.',
  trop_de_tentatives: 'Trop de tentatives. Réessayez dans un quart d’heure.',
  pseudo_deja_pris: 'Ce pseudonyme est déjà pris dans la famille.',
  pseudo_invalide: 'Pseudonyme invalide (2 à 20 lettres, chiffres, - ou _).',
  invitation_invalide: 'Invitation invalide ou expirée.',
  fichier_trop_gros: 'Fichier trop volumineux (25 Mo maximum).',
};
function frError(e) { return ERRORS[e.message] || 'Une erreur est survenue. Réessayez.'; }

// ------------------------------------------------------- authentification
function showAuth(which) {
  $('auth-view').classList.remove('hidden');
  $('main-view').classList.add('hidden');
  for (const f of ['login-form', 'unlock-form', 'register-form', 'invite-invalid']) {
    $(f).classList.toggle('hidden', f !== which);
  }
}

function inviteTokenFromUrl() {
  const m = location.hash.match(/invitation=([a-f0-9]{64})/);
  return m ? m[1] : null;
}

async function init() {
  const invite = inviteTokenFromUrl();
  if (invite) {
    try {
      const info = await api('GET', '/api/invitation?token=' + invite);
      $('invite-by').textContent = info.createdBy;
      showAuth('register-form');
      return;
    } catch {
      showAuth('invite-invalid');
      return;
    }
  }
  try {
    const me = await api('GET', '/api/me');
    $('unlock-username').textContent = me.username;
    state.pendingUnlock = me;
    showAuth('unlock-form');
  } catch {
    showAuth('login-form');
  }
}

async function unlockKeys(username, passphrase, kdfSalt, encPriv) {
  const { encKey } = await MsgCrypto.deriveFromPassphrase(passphrase, kdfSalt);
  const keys = await MsgCrypto.decryptPrivateKeys(encKey, encPriv);
  state.me = { username, ...keys };
}

$('register-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl = $('register-error');
  errEl.classList.add('hidden');
  const username = $('register-username').value.trim();
  const p1 = $('register-passphrase').value;
  const p2 = $('register-passphrase2').value;
  if (p1 !== p2) { errEl.textContent = 'Les deux phrases secrètes ne correspondent pas.'; errEl.classList.remove('hidden'); return; }
  if (p1.length < 12) { errEl.textContent = 'Phrase secrète trop courte : 12 caractères minimum (idéalement 4 mots ou plus).'; errEl.classList.remove('hidden'); return; }
  const btn = $('register-btn');
  btn.disabled = true; btn.textContent = 'Création des clés…';
  try {
    const kdfSalt = MsgCrypto.newSalt();
    const { encKey, authKeyHex } = await MsgCrypto.deriveFromPassphrase(p1, kdfSalt);
    const id = await MsgCrypto.generateIdentity();
    const encPriv = await MsgCrypto.encryptPrivateKeys(encKey, id.privEcdh, id.privEcdsa);
    await api('POST', '/api/register', {
      inviteToken: inviteTokenFromUrl(), username, kdfSalt,
      authKey: authKeyHex, pubEcdh: id.pubEcdh, pubEcdsa: id.pubEcdsa, encPriv,
    });
    history.replaceState(null, '', location.pathname);
    await unlockKeys(username, p1, kdfSalt, encPriv);
    await loadApp();
  } catch (err) {
    errEl.textContent = frError(err); errEl.classList.remove('hidden');
  } finally {
    btn.disabled = false; btn.textContent = 'Créer mon compte';
  }
});

$('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl = $('login-error');
  errEl.classList.add('hidden');
  const btn = $('login-btn');
  btn.disabled = true; btn.textContent = 'Connexion…';
  try {
    const username = $('login-username').value.trim();
    const passphrase = $('login-passphrase').value;
    const { kdfSalt } = await api('POST', '/api/salt', { username });
    const { authKeyHex } = await MsgCrypto.deriveFromPassphrase(passphrase, kdfSalt);
    const me = await api('POST', '/api/login', { username, authKey: authKeyHex });
    await unlockKeys(me.username, passphrase, me.kdfSalt, me.encPriv);
    await loadApp();
  } catch (err) {
    errEl.textContent = err.name === 'OperationError'
      ? 'Phrase secrète incorrecte.' : frError(err);
    errEl.classList.remove('hidden');
  } finally {
    btn.disabled = false; btn.textContent = 'Se connecter';
  }
});

$('unlock-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl = $('unlock-error');
  errEl.classList.add('hidden');
  const btn = $('unlock-btn');
  btn.disabled = true;
  try {
    const me = state.pendingUnlock;
    await unlockKeys(me.username, $('unlock-passphrase').value, me.kdfSalt, me.encPriv);
    await loadApp();
  } catch {
    errEl.textContent = 'Phrase secrète incorrecte.';
    errEl.classList.remove('hidden');
  } finally {
    btn.disabled = false;
  }
});

$('unlock-logout').addEventListener('click', async () => {
  await api('POST', '/api/logout').catch(() => {});
  showAuth('login-form');
});
$('btn-logout').addEventListener('click', async () => {
  await api('POST', '/api/logout').catch(() => {});
  location.reload();
});

// -------------------------------------------------------- chargement app
async function loadApp() {
  $('auth-view').classList.add('hidden');
  $('main-view').classList.remove('hidden');
  $('me-name').textContent = state.me.username;

  const [{ users }, { conversations }] = await Promise.all([
    api('GET', '/api/users'), api('GET', '/api/conversations'),
  ]);
  state.users = new Map(users.map(u => [u.username.toLowerCase(), u]));
  const mine = state.users.get(state.me.username.toLowerCase());
  state.me.pubEcdh = mine.pubEcdh;
  state.me.pubEcdsa = mine.pubEcdsa;

  for (const meta of conversations) await registerConvo(meta);
  renderConvoList();
  connectSSE();
}

async function registerConvo(meta) {
  if (state.convos.has(meta.id)) { state.convos.get(meta.id).meta = meta; return; }
  let key = null;
  try {
    key = await MsgCrypto.unwrapKey(state.me.privEcdh, meta.myWrappedKey);
  } catch { /* clé illisible : la conversation restera verrouillée */ }
  state.convos.set(meta.id, { meta, key, msgs: new Map(), unread: 0, loaded: false });
}

function lastReadSeq(id) { return parseInt(localStorage.getItem('lu:' + id) || '0', 10) || 0; }
function setLastRead(id, seq) { localStorage.setItem('lu:' + id, String(seq)); }

function convoDisplayName(meta) {
  if (meta.name) return meta.name;
  const others = meta.members.filter(m => m.toLowerCase() !== state.me.username.toLowerCase());
  return others.join(', ') || meta.members.join(', ');
}

function renderConvoList() {
  const list = $('convo-list');
  list.textContent = '';
  const sorted = [...state.convos.values()].sort((a, b) =>
    (b.meta.lastSeq * 1e13 + b.meta.createdAt) - (a.meta.lastSeq * 1e13 + a.meta.createdAt));
  for (const c of sorted) {
    const li = document.createElement('li');
    li.dataset.id = c.meta.id;
    if (c.meta.id === state.currentId) li.classList.add('active');
    const left = document.createElement('div');
    const name = document.createElement('div');
    name.className = 'convo-name';
    name.textContent = convoDisplayName(c.meta);
    const sub = document.createElement('div');
    sub.className = 'convo-sub';
    sub.textContent = c.meta.members.length > 2 ? `${c.meta.members.length} membres` : 'Conversation privée';
    left.append(name, sub);
    li.append(left);
    const unread = Math.max(0, c.meta.lastSeq - lastReadSeq(c.meta.id));
    if (unread > 0 && c.meta.id !== state.currentId) {
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = unread > 99 ? '99+' : String(unread);
      li.append(badge);
    }
    li.addEventListener('click', () => openConvo(c.meta.id));
    list.append(li);
  }
  $('convo-empty').classList.toggle('hidden', sorted.length > 0);
}

// ----------------------------------------------------------- temps réel
function connectSSE() {
  if (state.sse) state.sse.close();
  const sse = new EventSource('/api/events');
  state.sse = sse;
  sse.onmessage = async (e) => {
    const ev = JSON.parse(e.data);
    if (ev.type === 'message') {
      const c = state.convos.get(ev.convoId);
      if (!c) { await refreshConvos(); return; }
      c.meta.lastSeq = Math.max(c.meta.lastSeq, ev.message.seq);
      if (ev.convoId === state.currentId) {
        await appendMessage(c, ev.message);
        setLastRead(ev.convoId, c.meta.lastSeq);
        scrollMessages();
      }
      renderConvoList();
    } else if (ev.type === 'conversation') {
      await refreshConvos();
    }
  };
  sse.onopen = async () => {
    // Après une reconnexion, rattraper les messages manqués
    if (state.currentId) {
      const c = state.convos.get(state.currentId);
      if (c && c.loaded) await fetchNewMessages(c);
    }
    await refreshConvos();
  };
}

async function refreshConvos() {
  const { conversations } = await api('GET', '/api/conversations').catch(() => ({ conversations: null }));
  if (!conversations) return;
  const { users } = await api('GET', '/api/users').catch(() => ({ users: null }));
  if (users) state.users = new Map(users.map(u => [u.username.toLowerCase(), u]));
  for (const meta of conversations) await registerConvo(meta);
  renderConvoList();
}

// ------------------------------------------------------------ discussion
async function openConvo(id) {
  const c = state.convos.get(id);
  if (!c) return;
  state.currentId = id;
  document.querySelector('.main-view').classList.add('chat-open');
  $('chat-placeholder').classList.add('hidden');
  $('chat-active').classList.remove('hidden');
  $('chat-title').textContent = convoDisplayName(c.meta);
  $('chat-members').textContent = c.meta.members.join(', ');
  $('messages').textContent = '';
  if (!c.key) {
    const p = document.createElement('p');
    p.className = 'msg-warning';
    p.textContent = 'Impossible de déchiffrer la clé de cette conversation avec votre compte.';
    $('messages').append(p);
    renderConvoList();
    return;
  }
  c.rendered = new Set();
  if (!c.loaded) {
    const { messages } = await api('GET', `/api/messages/${id}?after=0`);
    for (const m of messages) c.msgs.set(m.seq, m);
    c.loaded = true;
  }
  for (const m of [...c.msgs.values()].sort((a, b) => a.seq - b.seq)) await appendMessage(c, m);
  setLastRead(id, c.meta.lastSeq);
  renderConvoList();
  scrollMessages();
}

async function fetchNewMessages(c) {
  const maxSeq = Math.max(0, ...c.msgs.keys());
  const { messages } = await api('GET', `/api/messages/${c.meta.id}?after=${maxSeq}`);
  for (const m of messages) {
    c.meta.lastSeq = Math.max(c.meta.lastSeq, m.seq);
    if (c.meta.id === state.currentId) await appendMessage(c, m);
    else c.msgs.set(m.seq, m);
  }
  if (c.meta.id === state.currentId && messages.length) {
    setLastRead(c.meta.id, c.meta.lastSeq);
    scrollMessages();
  }
}

function scrollMessages() {
  const el = $('messages');
  el.scrollTop = el.scrollHeight;
}

function fmtTime(ts) {
  const d = new Date(ts);
  const today = new Date().toDateString() === d.toDateString();
  const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  return today ? time : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) + ' ' + time;
}

// Déchiffre, vérifie la signature et affiche un message
async function appendMessage(c, m) {
  c.msgs.set(m.seq, m);
  if (!c.rendered) c.rendered = new Set();
  if (c.rendered.has(m.seq)) return;
  c.rendered.add(m.seq);

  const isMe = m.sender.toLowerCase() === state.me.username.toLowerCase();
  const div = document.createElement('div');
  div.className = 'msg ' + (isMe ? 'me' : 'other');

  if (!isMe && c.meta.members.length > 2) {
    const s = document.createElement('div');
    s.className = 'msg-sender';
    s.textContent = m.sender;
    div.append(s);
  }

  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';
  div.append(bubble);

  const sender = state.users.get(m.sender.toLowerCase());
  const sigOk = sender && await MsgCrypto.verifyMessage(sender.pubEcdsa, c.meta.id, m.iv, m.ct, m.sig);

  let payload = null;
  try { payload = await MsgCrypto.decryptMessage(c.key, m); } catch { /* illisible */ }

  if (!payload) {
    bubble.textContent = '⚠️ Message indéchiffrable';
  } else if (payload.kind === 'text') {
    bubble.textContent = payload.text;
  } else if (payload.kind === 'image' || payload.kind === 'audio') {
    bubble.textContent = payload.kind === 'image' ? '📷 Chargement…' : '🎤 Chargement…';
    loadMedia(c, payload, bubble).catch(() => { bubble.textContent = '⚠️ Fichier introuvable'; });
  } else {
    bubble.textContent = '⚠️ Type de message inconnu';
  }

  const meta = document.createElement('div');
  meta.className = 'msg-meta';
  meta.textContent = fmtTime(m.ts);
  div.append(meta);

  if (!sigOk) {
    const w = document.createElement('div');
    w.className = 'msg-warning';
    w.textContent = '⚠️ Signature non vérifiée';
    div.append(w);
  }

  $('messages').append(div);
}

async function loadMedia(c, payload, bubble) {
  const res = await fetch(`/api/blobs/${c.meta.id}/${payload.blobId}`);
  if (!res.ok) throw new Error('blob');
  const encrypted = await res.arrayBuffer();
  const clear = await MsgCrypto.decryptBlob(c.key, encrypted);
  const url = URL.createObjectURL(new Blob([clear], { type: payload.mime }));
  bubble.textContent = '';
  if (payload.kind === 'image') {
    const img = document.createElement('img');
    img.src = url;
    img.alt = 'Photo';
    img.addEventListener('click', () => window.open(url, '_blank'));
    bubble.append(img);
  } else {
    const audio = document.createElement('audio');
    audio.controls = true;
    audio.src = url;
    bubble.append(audio);
  }
}

// ----------------------------------------------------------------- envoi
async function sendPayload(payload) {
  const c = state.convos.get(state.currentId);
  if (!c || !c.key) return;
  const full = { ...payload, sender: state.me.username, ts: Date.now() };
  const { iv, ct } = await MsgCrypto.encryptMessage(c.key, full);
  const sig = await MsgCrypto.signMessage(state.me.privEcdsa, c.meta.id, iv, ct);
  const { seq } = await api('POST', `/api/messages/${c.meta.id}`, { iv, ct, sig });
  c.meta.lastSeq = Math.max(c.meta.lastSeq, seq);
  await appendMessage(c, { seq, sender: state.me.username, ts: full.ts, iv, ct, sig });
  setLastRead(c.meta.id, c.meta.lastSeq);
  renderConvoList();
  scrollMessages();
}

async function sendText() {
  const input = $('msg-input');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  input.style.height = 'auto';
  try { await sendPayload({ kind: 'text', text }); }
  catch (e) { alert(frError(e)); input.value = text; }
}

$('btn-send').addEventListener('click', sendText);
$('msg-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendText(); }
});
$('msg-input').addEventListener('input', (e) => {
  e.target.style.height = 'auto';
  e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
});
$('btn-back').addEventListener('click', () => {
  state.currentId = null;
  document.querySelector('.main-view').classList.remove('chat-open');
  renderConvoList();
});

// -------- photos : réduction côté client puis chiffrement + envoi --------
$('btn-photo').addEventListener('click', () => $('photo-input').click());
$('photo-input').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    let bytes, mime;
    try {
      bytes = await resizeImage(file);
      mime = 'image/jpeg';
    } catch {
      // Format non décodable par le navigateur : envoi du fichier tel quel
      bytes = await file.arrayBuffer();
      mime = file.type || 'application/octet-stream';
    }
    await sendEncryptedBlob(bytes, 'image', mime);
  } catch (err) { console.error('envoi photo :', err); alert(frError(err)); }
});

async function resizeImage(file, maxDim = 2048) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.85));
  return blob.arrayBuffer();
}

async function sendEncryptedBlob(arrayBuffer, kind, mime) {
  const c = state.convos.get(state.currentId);
  if (!c || !c.key) return;
  const encrypted = await MsgCrypto.encryptBlob(c.key, arrayBuffer);
  const res = await fetch(`/api/blobs/${c.meta.id}`, { method: 'POST', body: encrypted });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'erreur');
  await sendPayload({ kind, blobId: data.blobId, mime });
}

// ---------------------- messages vocaux (MediaRecorder) ----------------------
$('btn-voice').addEventListener('click', async () => {
  if (state.recorder) return;
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    alert('Impossible d’accéder au micro. Vérifiez les autorisations du navigateur.');
    return;
  }
  const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus'
    : MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : '';
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  const chunks = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  state.recorder = { rec, chunks, stream, start: Date.now(), cancelled: false };
  rec.start(250);
  $('recording-bar').classList.remove('hidden');
  $('rec-time').textContent = '0:00';
  state.recorder.timer = setInterval(() => {
    const s = Math.floor((Date.now() - state.recorder.start) / 1000);
    $('rec-time').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    if (s >= 300) stopRecording(false); // 5 minutes maximum
  }, 500);
});

function stopRecording(cancelled) {
  const r = state.recorder;
  if (!r) return;
  r.cancelled = cancelled;
  clearInterval(r.timer);
  r.rec.onstop = async () => {
    r.stream.getTracks().forEach(t => t.stop());
    $('recording-bar').classList.add('hidden');
    state.recorder = null;
    if (r.cancelled || !r.chunks.length) return;
    const blob = new Blob(r.chunks, { type: r.rec.mimeType || 'audio/webm' });
    try { await sendEncryptedBlob(await blob.arrayBuffer(), 'audio', blob.type); }
    catch (e) { alert(frError(e)); }
  };
  r.rec.stop();
}
$('btn-rec-send').addEventListener('click', () => stopRecording(false));
$('btn-rec-cancel').addEventListener('click', () => stopRecording(true));

// ------------------------------------------------------ fenêtres modales
function openModal(id) {
  $('modal-backdrop').classList.remove('hidden');
  for (const m of document.querySelectorAll('.modal')) m.classList.toggle('hidden', m.id !== id);
}
function closeModal() { $('modal-backdrop').classList.add('hidden'); }
for (const b of document.querySelectorAll('.modal-close')) b.addEventListener('click', closeModal);
$('modal-backdrop').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeModal(); });

// Nouvelle conversation
$('btn-new-convo').addEventListener('click', async () => {
  // Recharger l'annuaire : des membres ont pu s'inscrire entre-temps
  const { users } = await api('GET', '/api/users').catch(() => ({ users: null }));
  if (users) state.users = new Map(users.map(u => [u.username.toLowerCase(), u]));
  const picker = $('nc-members');
  picker.textContent = '';
  $('nc-name').value = '';
  $('nc-error').classList.add('hidden');
  for (const u of state.users.values()) {
    if (u.username.toLowerCase() === state.me.username.toLowerCase()) continue;
    const label = document.createElement('label');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.value = u.username.toLowerCase();
    label.append(cb, document.createTextNode(u.username));
    picker.append(label);
  }
  openModal('modal-new-convo');
});

$('nc-create').addEventListener('click', async () => {
  const errEl = $('nc-error');
  errEl.classList.add('hidden');
  const selected = [...document.querySelectorAll('#nc-members input:checked')].map(i => i.value);
  if (selected.length === 0) {
    errEl.textContent = 'Choisissez au moins un participant.';
    errEl.classList.remove('hidden');
    return;
  }
  try {
    const members = [...selected, state.me.username.toLowerCase()];
    const { raw } = await MsgCrypto.newConversationKey();
    const wrappedKeys = {};
    for (const m of members) {
      wrappedKeys[m] = await MsgCrypto.wrapKeyFor(state.users.get(m).pubEcdh, raw);
    }
    const { id, conversation } = await api('POST', '/api/conversations', {
      name: $('nc-name').value.trim(), members, wrappedKeys,
    });
    await registerConvo(conversation);
    closeModal();
    renderConvoList();
    openConvo(id);
  } catch (e) {
    errEl.textContent = frError(e);
    errEl.classList.remove('hidden');
  }
});

// Invitation
$('btn-invite').addEventListener('click', async () => {
  try {
    const { token } = await api('POST', '/api/invites');
    $('invite-link').textContent = `${location.origin}/#invitation=${token}`;
    openModal('modal-invite');
  } catch (e) { alert(frError(e)); }
});
$('invite-copy').addEventListener('click', async () => {
  await navigator.clipboard.writeText($('invite-link').textContent);
  $('invite-copy').textContent = 'Copié ✓';
  setTimeout(() => { $('invite-copy').textContent = 'Copier le lien'; }, 1500);
});

// Profil / sécurité
$('btn-profile').addEventListener('click', async () => {
  $('profile-name').textContent = state.me.username;
  $('my-fingerprint').textContent = await MsgCrypto.fingerprint(state.me.pubEcdh, state.me.pubEcdsa);
  const list = $('family-fingerprints');
  list.textContent = '';
  for (const u of state.users.values()) {
    if (u.username.toLowerCase() === state.me.username.toLowerCase()) continue;
    const li = document.createElement('li');
    const code = document.createElement('code');
    code.textContent = await MsgCrypto.fingerprint(u.pubEcdh, u.pubEcdsa);
    li.append(document.createTextNode(u.username + ' : '), code);
    list.append(li);
  }
  openModal('modal-profile');
});

init();
