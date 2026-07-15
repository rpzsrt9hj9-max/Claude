/*
 * Cœur cryptographique de la messagerie familiale.
 * Tout le chiffrement se fait ici, côté client (navigateur).
 * Le serveur ne voit jamais ni les phrases secrètes, ni les clés privées,
 * ni le contenu des messages.
 *
 * Primitives (WebCrypto natif, aucun code cryptographique maison) :
 *  - PBKDF2-SHA256, 600 000 itérations : dérivation de la phrase secrète
 *  - AES-256-GCM : chiffrement des messages, fichiers et clés privées
 *  - ECDH P-256 + HKDF-SHA256 : échange de clés de conversation
 *  - ECDSA P-256 / SHA-256 : signature des messages (authenticité)
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MsgCrypto = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const subtle = globalThis.crypto.subtle;
  const PBKDF2_ITERATIONS = 600000;

  // ---- Encodage ----
  function bufToB64(buf) {
    const bytes = new Uint8Array(buf);
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
      s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(s);
  }
  function b64ToBuf(b64) {
    const s = atob(b64);
    const bytes = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
    return bytes.buffer;
  }
  function utf8(str) { return new TextEncoder().encode(str); }
  function randomBytes(n) {
    const b = new Uint8Array(n);
    // getRandomValues est limité à 65 536 octets par appel
    for (let i = 0; i < n; i += 65536) {
      globalThis.crypto.getRandomValues(b.subarray(i, Math.min(n, i + 65536)));
    }
    return b;
  }

  // ---- Dérivation de la phrase secrète ----
  // 512 bits dérivés : moitié = clé de chiffrement locale (protège les clés
  // privées), moitié = jeton d'authentification envoyé au serveur.
  // Le serveur ne peut pas retrouver la clé de chiffrement à partir du jeton.
  async function deriveFromPassphrase(passphrase, saltB64) {
    const salt = b64ToBuf(saltB64);
    const baseKey = await subtle.importKey('raw', utf8(passphrase.normalize('NFKC')), 'PBKDF2', false, ['deriveBits']);
    const bits = new Uint8Array(await subtle.deriveBits(
      { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITERATIONS },
      baseKey, 512
    ));
    const encKey = await subtle.importKey('raw', bits.slice(0, 32), 'AES-GCM', false, ['encrypt', 'decrypt']);
    const authKeyHex = Array.from(bits.slice(32)).map(b => b.toString(16).padStart(2, '0')).join('');
    bits.fill(0);
    return { encKey, authKeyHex };
  }
  function newSalt() { return bufToB64(randomBytes(16)); }

  // ---- Identité : deux paires de clés P-256 ----
  async function generateIdentity() {
    const ecdh = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
    const ecdsa = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    return {
      pubEcdh: await subtle.exportKey('jwk', ecdh.publicKey),
      pubEcdsa: await subtle.exportKey('jwk', ecdsa.publicKey),
      privEcdh: await subtle.exportKey('jwk', ecdh.privateKey),
      privEcdsa: await subtle.exportKey('jwk', ecdsa.privateKey),
    };
  }

  // Chiffre les clés privées (JWK) avec la clé dérivée de la phrase secrète.
  async function encryptPrivateKeys(encKey, privEcdh, privEcdsa) {
    const iv = randomBytes(12);
    const data = utf8(JSON.stringify({ privEcdh, privEcdsa }));
    const ct = await subtle.encrypt({ name: 'AES-GCM', iv }, encKey, data);
    return { iv: bufToB64(iv), ct: bufToB64(ct) };
  }
  async function decryptPrivateKeys(encKey, blob) {
    const data = await subtle.decrypt(
      { name: 'AES-GCM', iv: b64ToBuf(blob.iv) }, encKey, b64ToBuf(blob.ct)
    );
    const jwks = JSON.parse(new TextDecoder().decode(data));
    const privEcdh = await subtle.importKey('jwk', jwks.privEcdh, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
    const privEcdsa = await subtle.importKey('jwk', jwks.privEcdsa, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
    return { privEcdh, privEcdsa };
  }

  // ---- Clé de conversation (AES-256-GCM) ----
  async function newConversationKey() {
    const raw = randomBytes(32);
    const key = await subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
    return { key, raw };
  }

  // Enveloppe la clé de conversation pour un membre : ECDH éphémère avec la
  // clé publique du membre, puis HKDF, puis AES-GCM (schéma type ECIES).
  async function wrapKeyFor(memberPubEcdhJwk, rawConvoKey) {
    const memberPub = await subtle.importKey('jwk', memberPubEcdhJwk, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
    const eph = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
    const shared = await subtle.deriveBits({ name: 'ECDH', public: memberPub }, eph.privateKey, 256);
    const hkdfSalt = randomBytes(16);
    const hkdfKey = await subtle.importKey('raw', shared, 'HKDF', false, ['deriveKey']);
    const wrapKey = await subtle.deriveKey(
      { name: 'HKDF', hash: 'SHA-256', salt: hkdfSalt, info: utf8('messagerie-wrap-v1') },
      hkdfKey, { name: 'AES-GCM', length: 256 }, false, ['encrypt']
    );
    const iv = randomBytes(12);
    const ct = await subtle.encrypt({ name: 'AES-GCM', iv }, wrapKey, rawConvoKey);
    return {
      epk: await subtle.exportKey('jwk', eph.publicKey),
      salt: bufToB64(hkdfSalt), iv: bufToB64(iv), ct: bufToB64(ct),
    };
  }

  async function unwrapKey(myPrivEcdh, wrapped) {
    const epk = await subtle.importKey('jwk', wrapped.epk, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
    const shared = await subtle.deriveBits({ name: 'ECDH', public: epk }, myPrivEcdh, 256);
    const hkdfKey = await subtle.importKey('raw', shared, 'HKDF', false, ['deriveKey']);
    const wrapKey = await subtle.deriveKey(
      { name: 'HKDF', hash: 'SHA-256', salt: b64ToBuf(wrapped.salt), info: utf8('messagerie-wrap-v1') },
      hkdfKey, { name: 'AES-GCM', length: 256 }, false, ['decrypt']
    );
    const raw = await subtle.decrypt({ name: 'AES-GCM', iv: b64ToBuf(wrapped.iv) }, wrapKey, b64ToBuf(wrapped.ct));
    return subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
  }

  // ---- Messages ----
  async function encryptMessage(convoKey, payloadObj) {
    const iv = randomBytes(12);
    const ct = await subtle.encrypt({ name: 'AES-GCM', iv }, convoKey, utf8(JSON.stringify(payloadObj)));
    return { iv: bufToB64(iv), ct: bufToB64(ct) };
  }
  async function decryptMessage(convoKey, msg) {
    const data = await subtle.decrypt({ name: 'AES-GCM', iv: b64ToBuf(msg.iv) }, convoKey, b64ToBuf(msg.ct));
    return JSON.parse(new TextDecoder().decode(data));
  }

  // La signature couvre l'identifiant de conversation + le chiffré,
  // pour empêcher toute réutilisation d'un message dans une autre conversation.
  function signedData(convoId, ivB64, ctB64) {
    return utf8(convoId + '|' + ivB64 + '|' + ctB64);
  }
  async function signMessage(privEcdsa, convoId, ivB64, ctB64) {
    const sig = await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privEcdsa, signedData(convoId, ivB64, ctB64));
    return bufToB64(sig);
  }
  async function verifyMessage(pubEcdsaJwk, convoId, ivB64, ctB64, sigB64) {
    try {
      const pub = await subtle.importKey('jwk', pubEcdsaJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
      return await subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, b64ToBuf(sigB64), signedData(convoId, ivB64, ctB64));
    } catch { return false; }
  }

  // ---- Fichiers (photos, messages vocaux) : iv (12 o) || chiffré ----
  async function encryptBlob(convoKey, arrayBuffer) {
    const iv = randomBytes(12);
    const ct = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv }, convoKey, arrayBuffer));
    const out = new Uint8Array(12 + ct.length);
    out.set(iv, 0); out.set(ct, 12);
    return out.buffer;
  }
  async function decryptBlob(convoKey, buf) {
    const bytes = new Uint8Array(buf);
    return subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(0, 12) }, convoKey, bytes.slice(12));
  }

  // ---- Empreinte de sécurité ----
  // À comparer de vive voix entre membres pour vérifier qu'aucun intermédiaire
  // (même le serveur) n'a substitué les clés publiques.
  async function fingerprint(pubEcdhJwk, pubEcdsaJwk) {
    const data = utf8(JSON.stringify([pubEcdhJwk.x, pubEcdhJwk.y, pubEcdsaJwk.x, pubEcdsaJwk.y]));
    const hash = new Uint8Array(await subtle.digest('SHA-256', data));
    const groups = [];
    for (let i = 0; i < 10; i += 2) {
      groups.push(String((hash[i] << 8 | hash[i + 1]) % 100000).padStart(5, '0'));
    }
    return groups.join(' ');
  }

  return {
    PBKDF2_ITERATIONS, bufToB64, b64ToBuf, newSalt, randomBytes,
    deriveFromPassphrase, generateIdentity, encryptPrivateKeys, decryptPrivateKeys,
    newConversationKey, wrapKeyFor, unwrapKey,
    encryptMessage, decryptMessage, signMessage, verifyMessage,
    encryptBlob, decryptBlob, fingerprint,
  };
});
