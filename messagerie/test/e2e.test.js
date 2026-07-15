/*
 * Test de bout en bout : démarre le serveur, puis rejoue le parcours complet
 * de deux utilisateurs (inscription par invitation, connexion, création de
 * conversation, échange de messages chiffrés + signés, fichiers chiffrés),
 * ainsi que les cas d'erreur (mauvaise phrase secrète, accès non autorisé).
 *
 * Utilise le VRAI code client (public/crypto.js) via WebCrypto de Node.
 */
'use strict';

const { spawn } = require('child_process');
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const MsgCrypto = require('../public/crypto.js');

const PORT = 3789;
const BASE = `http://127.0.0.1:${PORT}`;
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'messagerie-test-'));

// Petit client HTTP avec gestion des cookies de session
class Client {
  constructor() { this.cookie = null; }
  async call(method, url, body, raw) {
    const opts = { method, headers: {} };
    if (this.cookie) opts.headers.Cookie = this.cookie;
    if (body !== undefined) {
      if (raw) { opts.body = body; }
      else { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    }
    const res = await fetch(BASE + url, opts);
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) this.cookie = setCookie.split(';')[0];
    return res;
  }
  async json(method, url, body) {
    const res = await this.call(method, url, body);
    const data = await res.json();
    return { status: res.status, data };
  }
}

async function registerUser(inviteToken, username, passphrase) {
  const c = new Client();
  const kdfSalt = MsgCrypto.newSalt();
  const { encKey, authKeyHex } = await MsgCrypto.deriveFromPassphrase(passphrase, kdfSalt);
  const id = await MsgCrypto.generateIdentity();
  const encPriv = await MsgCrypto.encryptPrivateKeys(encKey, id.privEcdh, id.privEcdsa);
  const { status, data } = await c.json('POST', '/api/register', {
    inviteToken, username, kdfSalt, authKey: authKeyHex,
    pubEcdh: id.pubEcdh, pubEcdsa: id.pubEcdsa, encPriv,
  });
  assert.strictEqual(status, 200, 'inscription: ' + JSON.stringify(data));
  const keys = await MsgCrypto.decryptPrivateKeys(encKey, encPriv);
  return { client: c, username, ...keys, pubEcdh: id.pubEcdh, pubEcdsa: id.pubEcdsa };
}

async function login(username, passphrase) {
  const c = new Client();
  const salt = await c.json('POST', '/api/salt', { username });
  const { authKeyHex, encKey } = await MsgCrypto.deriveFromPassphrase(passphrase, salt.data.kdfSalt);
  const { status, data } = await c.json('POST', '/api/login', { username, authKey: authKeyHex });
  if (status !== 200) return { status };
  const keys = await MsgCrypto.decryptPrivateKeys(encKey, data.encPriv);
  return { status, client: c, username: data.username, ...keys };
}

async function main() {
  // --- démarrage du serveur ---
  const server = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, PORT: String(PORT), DATA_DIR },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  server.stdout.resume();
  try {
    for (let i = 0; ; i++) {
      try { await fetch(BASE + '/'); break; }
      catch { if (i > 50) throw new Error('serveur injoignable'); await new Promise(r => setTimeout(r, 100)); }
    }

    // --- invitation fondateur ---
    const founderToken = fs.readFileSync(path.join(DATA_DIR, 'founder-invite.txt'), 'utf8').trim();
    const bad = await new Client().json('GET', '/api/invitation?token=' + '0'.repeat(64));
    assert.strictEqual(bad.status, 404, 'une invitation inconnue doit être refusée');

    // --- inscription sans invitation : refusée ---
    const noInvite = await new Client().json('POST', '/api/register', {
      inviteToken: 'x', username: 'Intrus', kdfSalt: 'YWJjZA==', authKey: 'a'.repeat(64),
      pubEcdh: {}, pubEcdsa: {}, encPriv: {},
    });
    assert.strictEqual(noInvite.status, 403, 'inscription sans invitation doit échouer');

    // --- inscription du fondateur puis d'un second membre ---
    const papa = await registerUser(founderToken, 'Papa', 'les chats verts dansent le soir');
    const reuse = await new Client().json('GET', '/api/invitation?token=' + founderToken);
    assert.strictEqual(reuse.status, 404, 'une invitation est à usage unique');

    const inv = await papa.client.json('POST', '/api/invites');
    assert.strictEqual(inv.status, 200);
    const lea = await registerUser(inv.data.token, 'Léa', 'un piano bleu nage sous la lune');

    // --- connexion : bonne et mauvaise phrase secrète ---
    const badLogin = await login('Papa', 'mauvaise phrase secrète !');
    assert.strictEqual(badLogin.status, 401, 'mauvaise phrase secrète doit échouer');
    const papa2 = await login('Papa', 'les chats verts dansent le soir');
    assert.strictEqual(papa2.status, 200, 'reconnexion avec la bonne phrase');

    // --- création d'une conversation chiffrée ---
    const users = (await papa.client.json('GET', '/api/users')).data.users;
    const byName = Object.fromEntries(users.map(u => [u.username.toLowerCase(), u]));
    const { raw } = await MsgCrypto.newConversationKey();
    const wrappedKeys = {};
    for (const m of ['papa', 'léa']) wrappedKeys[m] = await MsgCrypto.wrapKeyFor(byName[m].pubEcdh, raw);
    const convo = await papa.client.json('POST', '/api/conversations', {
      name: 'Famille', members: ['papa', 'léa'], wrappedKeys,
    });
    assert.strictEqual(convo.status, 200, JSON.stringify(convo.data));
    const convoId = convo.data.id;

    // --- Papa envoie un message chiffré et signé ---
    const papaKey = await MsgCrypto.unwrapKey(papa.privEcdh, convo.data.conversation.myWrappedKey);
    const payload = { kind: 'text', text: 'Bonjour Léa ! 🏡', sender: 'Papa', ts: Date.now() };
    const { iv, ct } = await MsgCrypto.encryptMessage(papaKey, payload);
    const sig = await MsgCrypto.signMessage(papa.privEcdsa, convoId, iv, ct);
    const sent = await papa.client.json('POST', `/api/messages/${convoId}`, { iv, ct, sig });
    assert.strictEqual(sent.status, 200);

    // --- le serveur ne stocke que du chiffré ---
    const onDisk = fs.readFileSync(path.join(DATA_DIR, 'messages', convoId + '.jsonl'), 'utf8');
    assert.ok(!onDisk.includes('Bonjour'), 'le texte en clair ne doit jamais toucher le disque du serveur');

    // --- Léa reçoit, déchiffre et vérifie la signature ---
    const leaConvos = (await lea.client.json('GET', '/api/conversations')).data.conversations;
    assert.strictEqual(leaConvos.length, 1);
    const leaKey = await MsgCrypto.unwrapKey(lea.privEcdh, leaConvos[0].myWrappedKey);
    const msgs = (await lea.client.json('GET', `/api/messages/${convoId}?after=0`)).data.messages;
    assert.strictEqual(msgs.length, 1);
    const received = await MsgCrypto.decryptMessage(leaKey, msgs[0]);
    assert.strictEqual(received.text, 'Bonjour Léa ! 🏡');
    assert.strictEqual(msgs[0].sender, 'Papa', 'l’expéditeur est attesté par le serveur');
    assert.ok(await MsgCrypto.verifyMessage(byName.papa.pubEcdsa, convoId, msgs[0].iv, msgs[0].ct, msgs[0].sig),
      'la signature de Papa doit être valide');
    assert.ok(!await MsgCrypto.verifyMessage(byName['léa'].pubEcdsa, convoId, msgs[0].iv, msgs[0].ct, msgs[0].sig),
      'la signature ne doit pas se vérifier avec une autre clé');
    assert.ok(!await MsgCrypto.verifyMessage(byName.papa.pubEcdsa, 'autre-convo', msgs[0].iv, msgs[0].ct, msgs[0].sig),
      'la signature est liée à la conversation');

    // --- fichier (photo/vocal) chiffré : aller-retour ---
    const original = MsgCrypto.randomBytes(200000);
    const encryptedBlob = await MsgCrypto.encryptBlob(papaKey, original.buffer);
    const up = await papa.client.call('POST', `/api/blobs/${convoId}`, Buffer.from(encryptedBlob), true);
    assert.strictEqual(up.status, 200);
    const { blobId } = await up.json();
    const down = await lea.client.call('GET', `/api/blobs/${convoId}/${blobId}`);
    assert.strictEqual(down.status, 200);
    const decrypted = new Uint8Array(await MsgCrypto.decryptBlob(leaKey, await down.arrayBuffer()));
    assert.deepStrictEqual(decrypted, original, 'le fichier déchiffré doit être identique à l’original');

    // --- contrôle d'accès ---
    const anon = await new Client().json('GET', `/api/messages/${convoId}?after=0`);
    assert.strictEqual(anon.status, 401, 'accès anonyme refusé');
    const inv2 = await papa.client.json('POST', '/api/invites');
    const marc = await registerUser(inv2.data.token, 'Marc', 'le vélo rouge grimpe la colline');
    const outsider = await marc.client.json('GET', `/api/messages/${convoId}?after=0`);
    assert.strictEqual(outsider.status, 404, 'un membre hors conversation ne voit pas les messages');
    const outsiderBlob = await marc.client.call('GET', `/api/blobs/${convoId}/${blobId}`);
    assert.strictEqual(outsiderBlob.status, 404, 'ni les fichiers');

    // --- une clé enveloppée pour Léa est indéchiffrable par Marc ---
    let stolen = false;
    try { await MsgCrypto.unwrapKey(marc.privEcdh, leaConvos[0].myWrappedKey); stolen = true; } catch { }
    assert.ok(!stolen, 'la clé de conversation ne doit pas être déchiffrable par un tiers');

    console.log('✅ Tous les tests de bout en bout sont passés.');
  } finally {
    server.kill();
    fs.rmSync(DATA_DIR, { recursive: true, force: true });
  }
}

main().catch((e) => { console.error('❌ Échec du test :', e); process.exit(1); });
