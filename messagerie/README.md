# 🏡🔐 Messagerie familiale chiffrée de bout en bout

Une messagerie web privée, pensée pour une famille : conversations à deux ou en
groupe, messages texte, **photos** et **messages vocaux** — le tout **chiffré de
bout en bout** dans le navigateur. Le serveur ne voit jamais rien en clair.

- **Aucun numéro de téléphone, aucun email** : juste un pseudonyme et une phrase secrète.
- **Accès uniquement sur invitation** : chaque membre rejoint via un lien à usage
  unique généré par un membre existant. Personne d'autre ne peut créer de compte.
- **Historique conservé chiffré** sur le serveur : on retrouve ses conversations
  depuis n'importe quel appareil avec sa phrase secrète.
- **Zéro dépendance** : uniquement Node.js. Pas de `npm install`, rien à auditer
  d'autre que ces quelques fichiers.

## Comment la sécurité fonctionne

| Élément | Protection |
|---|---|
| Phrase secrète | Ne quitte **jamais** le navigateur. PBKDF2-SHA256, 600 000 itérations. |
| Clés privées (ECDH + ECDSA P-256) | Générées dans le navigateur, stockées **chiffrées** (AES-256-GCM) par la phrase secrète. |
| Messages, photos, vocaux | Chiffrés AES-256-GCM avec la clé de conversation, **avant** l'envoi. |
| Clé de conversation | Enveloppée individuellement pour chaque membre (ECDH éphémère + HKDF, schéma type ECIES). |
| Authenticité | Chaque message est signé ECDSA par son auteur ; le destinataire vérifie la signature. |
| Connexion au serveur | Le serveur ne reçoit qu'un jeton dérivé de la phrase secrète (jamais la phrase), re-haché en scrypt côté serveur. |
| Anti-intrusion | Inscriptions sur invitation uniquement, limitation des tentatives de connexion, cookies HttpOnly/SameSite, CSP stricte. |

Le serveur ne stocke que des blobs chiffrés : même si quelqu'un vole le disque
du serveur, il n'obtient ni messages, ni photos, ni clés utilisables.

### Vérification d'identité (empreintes de sécurité)

Dans 🛡️ *Sécurité et compte*, chacun voit son **empreinte** (10 groupes de
chiffres) et celles des autres membres. Comparez-les une fois de vive voix
(téléphone ou en personne) : si elles correspondent, aucun intermédiaire —
pas même le serveur — ne peut se faire passer pour un membre de la famille.

### Limites à connaître (transparence)

- **La phrase secrète est irrécupérable.** C'est le prix du vrai chiffrement de
  bout en bout : personne — pas même le serveur — ne peut la réinitialiser.
  Choisissez 4-5 mots faciles à retenir et notez-les en lieu sûr.
- **Pas de « secret persistant » à la Signal (double ratchet)** : une clé de
  conversation compromise permettrait de lire l'historique de cette
  conversation. Pour un usage familial c'est un compromis raisonnable ;
  créez une nouvelle conversation si vous voulez repartir sur une clé neuve.
- **Le code est servi par votre serveur** : comme pour toute application web,
  la sécurité suppose que le serveur (le vôtre !) sert le code non modifié et
  que HTTPS est actif.
- **HTTPS est obligatoire** en production : le chiffrement dans le navigateur
  (WebCrypto) n'est actif que sur `https://` (ou `localhost` pour les tests).

## Essai local

```bash
node server.js
```

Au premier démarrage, le serveur affiche un **lien fondateur** — ouvrez-le pour
créer le premier compte. Ensuite, invitez les autres via le bouton 🎟️.

Tests automatiques (API + chiffrement de bout en bout) :

```bash
npm test
```

## Déploiement sur Oracle Cloud (offre Always Free)

Oracle Cloud offre gratuitement et sans limite de durée des machines virtuelles
ARM (jusqu'à 4 cœurs / 24 Go de RAM) — largement suffisant.

### 1. Créer la machine virtuelle

1. Créez un compte sur [oracle.com/cloud/free](https://www.oracle.com/cloud/free/).
2. *Compute → Instances → Create instance* :
   - Image : **Ubuntu 24.04** ;
   - Shape : **VM.Standard.A1.Flex** (Always Free), 1 cœur / 6 Go suffisent ;
   - Téléchargez la **clé SSH privée** proposée (ou fournissez la vôtre).
3. Notez l'**adresse IP publique** de l'instance.

### 2. Ouvrir les ports 80 et 443

Dans Oracle Cloud : *Networking → Virtual Cloud Networks → votre VCN →
Security Lists → Default Security List → Add Ingress Rules* :

- Source `0.0.0.0/0`, protocole TCP, port **80** ;
- Source `0.0.0.0/0`, protocole TCP, port **443**.

Puis sur la machine (le pare-feu Ubuntu d'Oracle bloque aussi par défaut) :

```bash
sudo iptables -I INPUT -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

### 3. Un nom de domaine (nécessaire pour HTTPS)

- Si vous avez un domaine : créez un enregistrement `A` (ex. `famille.mondomaine.fr`)
  pointant vers l'IP publique.
- Sinon, [duckdns.org](https://www.duckdns.org) fournit gratuitement un
  sous-domaine (ex. `mafamille.duckdns.org`) à pointer vers votre IP.

### 4. Installer l'application

Connectez-vous en SSH (`ssh -i clé.pem ubuntu@IP_PUBLIQUE`) puis :

```bash
# Node.js 22
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# L'application
sudo git clone -b claude/encrypted-family-messaging-oyy9ow \
  https://github.com/VOTRE_COMPTE/VOTRE_DEPOT.git /opt/messagerie

# Service systemd (démarrage automatique)
sudo tee /etc/systemd/system/messagerie.service > /dev/null <<'EOF'
[Unit]
Description=Messagerie familiale
After=network.target

[Service]
WorkingDirectory=/opt/messagerie/messagerie
ExecStart=/usr/bin/node server.js
Environment=PORT=3000
Environment=DATA_DIR=/var/lib/messagerie
Restart=always
User=www-data
StateDirectory=messagerie

[Install]
WantedBy=multi-user.target
EOF
sudo mkdir -p /var/lib/messagerie && sudo chown www-data: /var/lib/messagerie
sudo systemctl enable --now messagerie
```

### 5. HTTPS automatique avec Caddy

```bash
sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt-get update && sudo apt-get install -y caddy

echo 'mafamille.duckdns.org {
    reverse_proxy 127.0.0.1:3000
}' | sudo tee /etc/caddy/Caddyfile
sudo systemctl restart caddy
```

Caddy obtient et renouvelle **automatiquement** le certificat HTTPS
(Let's Encrypt). C'est tout.

### 6. Premier compte et invitations

```bash
sudo journalctl -u messagerie | grep invitation
```

Le journal contient le lien fondateur : remplacez `http://localhost:3000` par
`https://mafamille.duckdns.org`, ouvrez-le, créez votre compte, puis invitez
chaque membre de la famille avec le bouton 🎟️ (lien à usage unique, valable
7 jours, à transmettre par un canal de confiance).

### Sauvegardes

Tout vit dans `/var/lib/messagerie` (données chiffrées). Une archive
régulière suffit :

```bash
sudo tar czf sauvegarde-messagerie-$(date +%F).tar.gz /var/lib/messagerie
```

### Mise à jour

```bash
cd /opt/messagerie && sudo git pull && sudo systemctl restart messagerie
```
