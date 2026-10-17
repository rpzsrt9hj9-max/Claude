// Test de sécurité de la base : isolation des comptes, accès administrateur, code famille, photos.
// Utilise PostgreSQL en mémoire (PGlite). À lancer à la main :
//   npm install --no-save @electric-sql/pglite
//   node tests/securite.mjs
import { PGlite } from '@electric-sql/pglite';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const ANCIEN_SCHEMA = execSync('git show 84e9327:supabase/schema.sql', { encoding: 'utf8' });
const NOUVEAU_SCHEMA = fs.readFileSync('supabase/schema.sql', 'utf8');

const db = new PGlite();
let nb = 0;
const ok = (nom) => console.log(`  ✓ ${nom}`) || nb++;

// ---- Imitation des parties propres à Supabase ----
await db.exec(`
create role anon nologin; create role authenticated nologin;
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb not null default '{}', created_at timestamptz not null default now());
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean);
create table storage.objects (id serial primary key, bucket_id text, name text);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language plpgsql as $$
declare p text[]; begin p := string_to_array(name, '/'); return p[1:array_length(p, 1) - 1]; end $$;
grant usage on schema auth, storage, public to anon, authenticated;
grant all on storage.objects to authenticated;
grant usage on all sequences in schema storage to authenticated;
`);

const A = '11111111-1111-1111-1111-111111111111'; // administrateur (premier compte)
const B = '22222222-2222-2222-2222-222222222222';
const C = '33333333-3333-3333-3333-333333333333';
await db.query(`insert into auth.users (id, email) values ($1, 'admin@exemple.fr')`, [A]);

// ---- Base « avant » : schéma de la v3 avec les données de l'administrateur ----
await db.exec(ANCIEN_SCHEMA);
const t0 = Date.now() - 100000;
await db.exec(`
insert into appartements (id, nom, created_at, updated_at) values ('PA','Bien A',${t0},${t0}),('PB','Bien B',${t0},${t0});
insert into articles (id, nom, type, notes, lieu_id, created_at, updated_at) values ('art1','Ponceuse','outillage','NOTE PRIVEE','garage',${t0},${t0});
insert into categories (id, nom, created_at, updated_at) values ('cat1','Électroportatif',${t0},${t0});
insert into deplacements (id, nom, date_debut, statut, created_at, updated_at) values ('D1','Pau','2026-11-20','en_preparation',${t0},${t0});
insert into taches (id, deplacement_id, titre, appartement_id, fait, ordre, modele, created_at, updated_at) values
  ('t1','D1','Vernis','PA',false,1,false,${t0},${t0}),('t2','D1','Porte','PB',true,2,false,${t0},${t0}),
  ('m1',null,'Modèle joint',null,false,0,true,${t0},${t0});
insert into tache_articles (id, tache_id, article_id, quantite, created_at, updated_at) values ('m1~art1','m1','art1',2,${t0},${t0}),('t1~art1','t1','art1',1,${t0},${t0});
`);

// ---- Migration vers la nouvelle version ----
console.log('Migration');
await db.exec(NOUVEAU_SCHEMA);
const q = async (sql, params) => (await db.query(sql, params)).rows;
assert.deepEqual((await q('select user_id from admins')).map((r) => r.user_id), [A]);
ok("le premier compte devient administrateur");
for (const t of ['taches', 'articles', 'deplacements', 'voyages', 'intervention_taches', 'tache_articles', 'appartements']) {
  const r = await q(`select count(*) filter (where owner_id = $1) as a, count(*) as n from ${t}`, [A]);
  assert.equal(r[0].a, r[0].n, `${t} : toutes les lignes appartiennent à l'administrateur`);
}
ok("toutes les données existantes appartiennent à l'administrateur");
const code = (await q("select valeur from reglages_app where cle = 'code_famille'"))[0].valeur;
assert.match(code, /^[0-9A-F]{6}$/);
ok(`un code famille est généré (${code.length} caractères)`);
assert.equal((await q('select count(*)::int as n from profils'))[0].n, 1);
ok("un profil est créé pour le compte existant");
const avant = await q('select id, owner_id, rev from taches order by id');
await db.exec(NOUVEAU_SCHEMA);
assert.equal((await q("select valeur from reglages_app where cle = 'code_famille'"))[0].valeur, code);
assert.deepEqual((await q('select id, owner_id from taches order by id')).map((r) => r.id), avant.map((r) => r.id));
ok('relancer le script ne change ni le code famille ni les données');

// ---- Inscriptions : code famille ----
console.log('Inscriptions');
const inscrire = (id, email, meta) => db.query('insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)', [id, email, JSON.stringify(meta)]);
await assert.rejects(() => inscrire(B, 'b@exemple.fr', {}), /Code famille incorrect/);
await assert.rejects(() => inscrire(B, 'b@exemple.fr', { code_famille: 'FAUX99' }), /Code famille incorrect/);
ok('sans code ou avec un mauvais code, le compte n’est pas créé');
await inscrire(B, 'b@exemple.fr', { code_famille: ` ${code.toLowerCase()} `, nom: 'Marie' });
await inscrire(C, 'c@exemple.fr', { code_famille: code, nom: 'Paul' });
ok('avec le bon code (casse et espaces ignorés), le compte est créé');
assert.equal((await q('select nom from profils where id = $1', [B]))[0].nom, 'Marie');
ok('le prénom saisi à l’inscription est enregistré dans le profil');
await db.query("update reglages_app set valeur = '' where cle = 'code_famille'");
await assert.rejects(() => inscrire('44444444-4444-4444-4444-444444444444', 'd@exemple.fr', { code_famille: '' }), /Inscriptions fermées/);
await db.query("update reglages_app set valeur = $1 where cle = 'code_famille'", [code]);
ok('sans code défini, les inscriptions sont fermées');

// ---- Aide : exécuter en tant qu'un compte ----
const comme = async (uid, fn, { observe, role = 'authenticated' } = {}) => {
  await db.exec(`set role ${role}`);
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid ?? '']);
  await db.query("select set_config('request.headers', $1, false)", [observe ? JSON.stringify({ 'x-observe-user': observe }) : '']);
  try {
    return await fn();
  } finally {
    await db.exec('reset role');
  }
};
const lignes = (sql, params) => async () => (await db.query(sql, params)).rows;
const refuse = (sql, params) => async () => assert.rejects(() => db.query(sql, params), /row-level security|permission denied|violates/);
const now = Date.now();
const insTache = (id, titre, owner) =>
  db.query(`insert into taches (id, titre, modele, statut, created_at, updated_at${owner ? ', owner_id' : ''}) values ($1, $2, false, 'a_traiter', ${now}, ${now}${owner ? ', $3' : ''})`, owner ? [id, titre, owner] : [id, titre]);

// ---- Isolation des comptes ----
console.log('Isolation');
assert.equal((await comme(B, lignes('select * from taches'))).length, 0);
assert.equal((await comme(B, lignes('select * from articles'))).length, 0);
ok('un nouveau compte ne voit aucune donnée de l’administrateur');
await comme(B, () => insTache('b-t1', 'Tâche de Marie'));
assert.equal((await comme(B, lignes('select owner_id from taches')))[0].owner_id, B);
ok('une ligne créée sans propriétaire explicite appartient à son auteur (anciennes versions de l’appli)');
assert.equal((await comme(C, lignes('select * from taches'))).length, 0);
ok('un autre proche ne voit pas les données de Marie');
await comme(B, refuse(`insert into taches (id, titre, modele, created_at, updated_at, owner_id) values ('vol', 'x', false, ${now}, ${now}, $1)`, [A]));
ok('on ne peut pas écrire dans l’espace de quelqu’un d’autre');
await comme(B, async () => {
  // Tentative de modifier une ligne de l'administrateur par upsert : refusée ou sans effet
  await db.query(`insert into taches (id, titre, modele, created_at, updated_at) values ('t1','PIRATÉ',false,${now},${now + 1000})
    on conflict (id) do update set titre = excluded.title`.replace('excluded.title', 'excluded.titre')).catch(() => {});
});
assert.equal((await q("select titre from taches where id = 't1'"))[0].titre, 'Vernis');
ok('modifier une ligne de l’administrateur par son identifiant échoue');
assert.equal((await comme(B, lignes('select * from taches'), { observe: A })).length, 1);
ok('un compte ordinaire ne gagne rien en envoyant l’en-tête « Voir comme »');
await comme(B, refuse("update admins set user_id = user_id"));
await comme(B, refuse("insert into admins (user_id) values ($1)", [B]));
assert.equal((await comme(B, lignes('select est_admin() as v')))[0].v, false);
ok('un compte ordinaire ne peut pas se faire administrateur');
assert.equal((await comme(B, lignes('select * from reglages_app'))).length, 0);
await comme(B, refuse("insert into reglages_app (cle, valeur) values ('code_famille','HACK')"));
await comme(B, async () => { await db.query("update reglages_app set valeur = 'HACK'"); });
assert.equal((await q("select valeur from reglages_app where cle = 'code_famille'"))[0].valeur, code);
ok('le code famille n’est ni lisible ni modifiable par un compte ordinaire');
assert.deepEqual((await comme(B, lignes('select id from profils'))).map((r) => r.id), [B]);
ok('chacun ne voit que son propre profil');
await comme(null, refuse('select * from taches'), { role: 'anon' });
ok('sans connexion, aucune donnée n’est accessible');

// ---- Administrateur ----
console.log('Administrateur');
assert.deepEqual((await comme(A, lignes('select id from taches order by id'))).map((r) => r.id), ['m1', 't1', 't2']);
ok('sans « Voir comme », l’administrateur ne voit que ses propres données (les anciennes versions restent sûres)');
const vuAdmin = await comme(A, lignes('select id, owner_id from taches order by id'), { observe: B });
assert.deepEqual(vuAdmin.filter((r) => r.owner_id === B).map((r) => r.id), ['b-t1']);
ok('avec « Voir comme Marie », il accède aux données de Marie');
assert.equal((await comme(A, lignes('select * from taches where owner_id = $1', [B]))).length, 0);
ok('sans l’en-tête, impossible même en filtrant sur Marie');
assert.equal((await comme(A, lignes('select * from taches where owner_id = $1', [B]), { observe: C })).length, 0);
ok('l’en-tête ne donne accès qu’au compte désigné');
await comme(A, () => insTache('b-t2', 'Ajoutée par l’admin', B), { observe: B });
assert.equal((await comme(B, lignes("select owner_id from taches where id = 'b-t2'")))[0].owner_id, B);
ok('l’administrateur peut ajouter une tâche chez Marie (elle lui appartient)');
await comme(A, async () => { await db.query(`update taches set titre = 'Corrigée par l’admin', updated_at = ${now + 5000} where id = 'b-t1'`); }, { observe: B });
assert.equal((await q("select titre, owner_id from taches where id = 'b-t1'"))[0].titre, 'Corrigée par l’admin');
assert.equal((await q("select owner_id from taches where id = 'b-t1'"))[0].owner_id, B);
ok('il peut modifier une tâche de Marie sans changer son propriétaire');
await comme(A, refuse('insert into taches (id, titre, modele, created_at, updated_at, owner_id) values ($1, $2, false, 1, 1, $3)', ['x1', 'x', B]));
ok('sans « Voir comme », il ne peut pas écrire dans l’espace de Marie');
await comme(A, refuse('insert into taches (id, titre, modele, created_at, updated_at, owner_id) values ($1, $2, false, 1, 1, $3)', ['x2', 'x', C]), { observe: B });
ok('avec « Voir comme Marie », il ne peut pas écrire chez Paul');
assert.equal((await comme(A, lignes("select valeur from reglages_app where cle = 'code_famille'")))[0].valeur, code);
await comme(A, async () => { await db.query("update reglages_app set valeur = 'NOUVEAU' where cle = 'code_famille'"); });
assert.equal((await q("select valeur from reglages_app where cle = 'code_famille'"))[0].valeur, 'NOUVEAU');
await db.query("update reglages_app set valeur = $1 where cle = 'code_famille'", [code]);
ok('il lit et modifie le code famille');
assert.equal((await comme(A, lignes('select id from profils'))).length, 3);
ok('il voit la liste des comptes');

// ---- Dernière modification gagne ----
console.log('Synchronisation');
await comme(B, async () => { await db.query(`update taches set titre = 'Trop ancienne', updated_at = 5 where id = 'b-t1'`); });
assert.notEqual((await q("select titre from taches where id = 'b-t1'"))[0].titre, 'Trop ancienne');
ok('une modification plus ancienne est toujours ignorée');

// ---- Catalogue partagé ----
console.log('Catalogue partagé');
const cat = (await comme(B, lignes('select catalogue_partage() as c')))[0].c;
assert.equal(cat.articles.length, 1);
assert.equal(cat.articles[0].nom, 'Ponceuse');
assert.equal(cat.modeles.length, 1);
assert.equal(cat.modeles[0].besoins[0].quantite, 2);
ok('un proche reçoit les articles et tâches types de l’administrateur');
const texte = JSON.stringify(cat);
for (const interdit of ['NOTE PRIVEE', 'garage', 'Bien A', 'Vernis', 'Pau']) assert.ok(!texte.includes(interdit), `ne doit pas contenir ${interdit}`);
ok('sans notes, lieux, biens, tâches ni déplacements');
await comme(null, refuse('select catalogue_partage()'), { role: 'anon' });
ok('inaccessible sans connexion');

// ---- Photos ----
console.log('Photos');
await db.query("insert into storage.objects (bucket_id, name) values ('photos', 'ancien-dossier/vieille.jpg')");
await comme(B, () => db.query("insert into storage.objects (bucket_id, name) values ('photos', $1)", [`${B}/i1/p1.jpg`]));
await comme(B, refuse("insert into storage.objects (bucket_id, name) values ('photos', $1)", [`${A}/i1/p2.jpg`]));
await comme(B, refuse("insert into storage.objects (bucket_id, name) values ('photos', 'i1/p3.jpg')"));
ok('chacun ne peut envoyer des photos que dans son dossier');
assert.deepEqual((await comme(B, lignes('select name from storage.objects'))).map((r) => r.name), [`${B}/i1/p1.jpg`]);
ok('et ne voit que ses photos');
assert.equal((await comme(A, lignes('select name from storage.objects'))).length, 2);
await comme(A, () => db.query("insert into storage.objects (bucket_id, name) values ('photos', $1)", [`${B}/i9/pA.jpg`]));
ok("l'administrateur voit toutes les photos, anciennes comprises, et peut en ajouter chez un proche");

// ---- Retours ----
console.log('Retours');
await comme(B, () => db.query("insert into retours (texte, ecran, version) values ('Super appli', 'Tâches', 'v4')"));
await comme(B, refuse("insert into retours (user_id, texte) values ($1, 'usurpé')", [A]));
assert.equal((await comme(B, lignes('select * from retours'))).length, 1);
assert.equal((await comme(C, lignes('select * from retours'))).length, 0);
assert.equal((await comme(A, lignes('select * from retours'))).length, 1);
ok('un retour est lisible par son auteur et par l’administrateur seulement');
await comme(A, async () => { await db.query('update retours set lu = true'); });
assert.equal((await q('select lu from retours'))[0].lu, true);
await comme(B, async () => { await db.query('update retours set lu = false'); });
assert.equal((await q('select lu from retours'))[0].lu, true);
ok('seul l’administrateur peut marquer un retour comme lu');

// ---- Google Sheet du catalogue ----
console.log('Google Sheet');
await q(`insert into articles (id, nom, type, created_at, updated_at, owner_id) values ('a-perceuse', 'Perceuse admin', 'outillage', 1, 1, $1)`, [A]);
await comme(B, async () => { await db.query(`insert into articles (id, nom, type, created_at, updated_at) values ('b-vis', 'Vis de Marie', 'consommable', ${now}, ${now})`); });
await comme(B, async () => { await db.query(`insert into tache_articles (id, tache_id, article_id, quantite, created_at, updated_at) values ('b-t1~b-vis', 'b-t1', 'b-vis', 3, ${now}, ${now})`); });
await comme(null, refuse('select creer_cle_sheet()'), { role: 'anon' });
const cleB = (await comme(B, lignes('select creer_cle_sheet() as c')))[0].c;
assert.match(cleB, /^[0-9a-f]{64}$/);
assert.ok(!(await q('select cle_hash from cles_sheet')).some((r) => r.cle_hash === cleB));
ok('la clé est créée par son propriétaire et seule son empreinte est gardée');
await comme(B, refuse('select * from cles_sheet'));
await comme(null, refuse('select sheet_proprietaire($1)', [cleB]), { role: 'anon' });
ok('la table des clés et la fonction interne sont inaccessibles');
const lu = (await comme(null, lignes('select sheet_lire($1) as j', [cleB]), { role: 'anon' }))[0].j;
assert.deepEqual(lu.articles.map((a) => a.id), ['b-vis']);
assert.equal(lu.articles[0].owner_id, undefined);
assert.deepEqual(lu.usages['b-vis'], { n: 1, titres: ['Corrigée par l’admin'] });
ok('avec la clé, le Sheet lit seulement le catalogue de Marie (et le nombre de tâches par article)');
await comme(null, () => assert.rejects(() => db.query('select sheet_lire($1)', ['mauvaise-cle']), /invalide/), { role: 'anon' });
ok('une mauvaise clé est refusée');
const ecr = (w) => comme(null, lignes('select sheet_ecrire($1, $2::jsonb) as n', [cleB, JSON.stringify(w)]), { role: 'anon' });
await ecr([
  { table: 'lieux', row: { id: 'b-l1', nom: 'Garage', created_at: now, updated_at: now + 1, deleted: false } },
  { table: 'articles', row: { id: 'b-marteau', nom: 'Marteau', type: 'outillage', lieu_id: 'b-l1', cumul_quantites: false, created_at: now, updated_at: now + 1, deleted: false, owner_id: A } },
  { table: 'articles', row: { id: 'b-vis', nom: 'Vis 4x40', type: 'consommable', created_at: now, updated_at: now + 2, deleted: false } },
]);
const chezB = await q("select id, nom, owner_id, rev from articles where id in ('b-marteau', 'b-vis') order by id");
assert.deepEqual(chezB.map((r) => [r.id, r.nom, r.owner_id]), [['b-marteau', 'Marteau', B], ['b-vis', 'Vis 4x40', B]]);
assert.ok(chezB.every((r) => r.rev > 0));
ok('le Sheet ajoute et modifie des articles chez Marie (propriétaire forcé, révision mise à jour pour la synchro)');
await comme(null, () => assert.rejects(() => db.query('select sheet_ecrire($1, $2::jsonb)', [cleB, JSON.stringify([{ table: 'articles', row: { id: 'a-perceuse', nom: 'Volée', created_at: 1, updated_at: now + 9, deleted: true } }])]), /autre compte/), { role: 'anon' });
assert.equal((await q("select nom, deleted from articles where id = 'a-perceuse'"))[0].nom, 'Perceuse admin');
for (const t of ['taches', 'appartements', 'cles_sheet']) {
  await comme(null, () => assert.rejects(() => db.query('select sheet_ecrire($1, $2::jsonb)', [cleB, JSON.stringify([{ table: t, row: { id: 'x', created_at: 1, updated_at: 1 } }])]), /non autorisée/), { role: 'anon' });
}
ok("impossible de toucher l'article d'un autre compte ou une autre table que le catalogue");
await comme(B, async () => { await db.query('select revoquer_cle_sheet()'); });
await comme(null, () => assert.rejects(() => db.query('select sheet_lire($1)', [cleB]), /révoquée/), { role: 'anon' });
ok('une clé révoquée ne marche plus');

console.log(`\n${nb} vérifications réussies.`);
