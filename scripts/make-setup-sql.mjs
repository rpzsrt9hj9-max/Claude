// Génère le SQL d'installation Supabase.
//   node scripts/make-setup-sql.mjs                 -> supabase/schema.sql (structure seule, publiable)
//   node scripts/make-setup-sql.mjs --seed <fichier> -> structure + jeu de départ (à NE PAS publier)
import fs from 'node:fs';
import { TABLES, BOOL_FIELDS, REAL_FIELDS } from '../shared/schema.js';

const colType = (f) => (BOOL_FIELDS.has(f) ? 'boolean' : REAL_FIELDS.has(f) ? 'double precision' : 'text');
const tables = Object.keys(TABLES);

let sql = `-- Schéma de l'application « Déplacements » pour Supabase.
-- À exécuter dans Supabase : SQL Editor > New query > coller > Run.
-- Peut être relancé sans risque : il ne fait que créer ou compléter ce qui manque.

-- Numéro de révision global : le client récupère tout ce qui a changé depuis sa dernière synchro.
create sequence if not exists app_rev;

-- « Dernière modification gagne » : une écriture plus ancienne que la ligne en base est ignorée
-- (la ligne reçoit quand même une nouvelle révision pour que le client récupère la bonne version).
-- Le propriétaire d'une ligne ne change jamais après sa création.
create or replace function app_lww() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    if new.updated_at < old.updated_at then
      new := old;
    end if;
    if old.owner_id is not null then
      new.owner_id := old.owner_id;
    end if;
  end if;
  new.rev := nextval('app_rev');
  return new;
end $$;

-- ---------- Comptes : administrateur, profils, code famille ----------

-- Administrateur(s) : peuvent consulter et modifier l'espace d'un autre compte.
create table if not exists public.admins (user_id uuid primary key);
alter table public.admins enable row level security;
drop policy if exists "admins lecture" on public.admins;
create policy "admins lecture" on public.admins for select to authenticated using (user_id = auth.uid());
grant select on public.admins to authenticated;
revoke all on public.admins from anon;
-- Le premier compte créé est l'administrateur (seulement si aucun n'est encore désigné).
insert into public.admins (user_id)
  select id from auth.users where not exists (select 1 from public.admins) order by created_at asc limit 1
  on conflict do nothing;

create or replace function public.est_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid())
$$;

-- Un espace est visible par son propriétaire ; l'administrateur voit celui du compte nommé dans
-- l'en-tête « x-observe-user » (envoyé seulement par l'appli en mode « Voir comme »).
-- Sans cet en-tête, même l'administrateur ne voit que ses propres données : les anciennes
-- versions de l'appli (v1 à v3) ne mélangent donc jamais les comptes.
create or replace function public.espace_visible(p_owner uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_owner = auth.uid()
      or (public.est_admin()
          and p_owner::text = nullif(nullif(current_setting('request.headers', true), '')::json ->> 'x-observe-user', ''))
$$;

-- Profil visible (prénom, e-mail) : le sien, ou tous pour l'administrateur.
create table if not exists public.profils (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  nom text,
  created_at timestamptz not null default now()
);
alter table public.profils enable row level security;
drop policy if exists "profils lecture" on public.profils;
create policy "profils lecture" on public.profils for select to authenticated using (id = auth.uid() or public.est_admin());
drop policy if exists "profils modification" on public.profils;
create policy "profils modification" on public.profils for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
grant select on public.profils to authenticated;
grant update (nom) on public.profils to authenticated;
revoke all on public.profils from anon;

create or replace function public.nouveau_profil() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profils (id, email, nom)
  values (new.id, new.email, nullif(trim(coalesce(new.raw_user_meta_data ->> 'nom', '')), ''))
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists profil_a_la_creation on auth.users;
create trigger profil_a_la_creation after insert on auth.users for each row execute function public.nouveau_profil();
insert into public.profils (id, email) select id, email from auth.users on conflict (id) do nothing;

-- Code famille : demandé à l'inscription. Lisible et modifiable par l'administrateur seulement.
create table if not exists public.reglages_app (cle text primary key, valeur text not null);
alter table public.reglages_app enable row level security;
drop policy if exists "reglages admin" on public.reglages_app;
create policy "reglages admin" on public.reglages_app for all to authenticated using (public.est_admin()) with check (public.est_admin());
grant select, insert, update on public.reglages_app to authenticated;
revoke all on public.reglages_app from anon;
insert into public.reglages_app (cle, valeur)
  values ('code_famille', upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6)))
  on conflict (cle) do nothing;

create or replace function public.verifier_code_famille() returns trigger
language plpgsql security definer set search_path = public as $$
declare attendu text;
begin
  select valeur into attendu from public.reglages_app where cle = 'code_famille';
  if attendu is null or trim(attendu) = '' then
    raise exception 'Inscriptions fermées';
  end if;
  if upper(trim(coalesce(new.raw_user_meta_data ->> 'code_famille', ''))) <> upper(trim(attendu)) then
    raise exception 'Code famille incorrect';
  end if;
  return new;
end $$;
drop trigger if exists verifier_code_famille on auth.users;
create trigger verifier_code_famille before insert on auth.users for each row execute function public.verifier_code_famille();

-- Retours des utilisateurs (bouton « Envoyer un retour »).
create table if not exists public.retours (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  texte text not null,
  ecran text,
  version text,
  created_at timestamptz not null default now(),
  lu boolean not null default false
);
alter table public.retours enable row level security;
drop policy if exists "retours ajout" on public.retours;
create policy "retours ajout" on public.retours for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "retours lecture" on public.retours;
create policy "retours lecture" on public.retours for select to authenticated using (user_id = auth.uid() or public.est_admin());
drop policy if exists "retours admin" on public.retours;
create policy "retours admin" on public.retours for update to authenticated using (public.est_admin()) with check (public.est_admin());
grant select, insert on public.retours to authenticated;
grant update (lu) on public.retours to authenticated;
revoke all on public.retours from anon;

-- ---------- Données de l'appli : une copie privée par compte ----------
`;

for (const [table, fields] of Object.entries(TABLES)) {
  sql += `
create table if not exists public.${table} (
  id text primary key,
${fields.map((f) => `  ${f} ${colType(f)},`).join('\n')}
  created_at bigint not null,
  updated_at bigint not null,
  deleted boolean not null default false,
  rev bigint
);
${fields.map((f) => `alter table public.${table} add column if not exists ${f} ${colType(f)};`).join('\n')}
alter table public.${table} add column if not exists owner_id uuid;
alter table public.${table} alter column owner_id set default auth.uid();
create index if not exists ${table}_rev on public.${table}(rev);
create index if not exists ${table}_owner_rev on public.${table}(owner_id, rev);
drop trigger if exists ${table}_lww on public.${table};
create trigger ${table}_lww before insert or update on public.${table} for each row execute function app_lww();
alter table public.${table} enable row level security;
drop policy if exists "${table} connectés" on public.${table};
drop policy if exists "${table} espace" on public.${table};
create policy "${table} espace" on public.${table} for all to authenticated
  using (public.espace_visible(owner_id)) with check (public.espace_visible(owner_id));
grant select, insert, update on public.${table} to authenticated;
revoke all on public.${table} from anon;
`;
}

// Les données existantes appartiennent à l'administrateur (le premier compte).
sql += `
-- ---------- Les données existantes appartiennent à l'administrateur ----------
do $$
declare adm uuid;
begin
  select user_id into adm from public.admins order by user_id limit 1;
  if adm is not null then
${tables.map((t) => `    update public.${t} set owner_id = adm where owner_id is null;`).join('\n')}
  end if;
end $$;
${tables.map((t) => `alter table public.${t} alter column owner_id set not null;`).join('\n')}
`;

// Migration vers les interventions (idempotente : peut être relancée sans risque).
// updated_at est mis à « maintenant » pour que la règle « dernière modification gagne » l'accepte.
sql += `
-- ---------- Migration : déplacements -> interventions ----------
do $$
declare maintenant bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  -- Statut des tâches à partir de l'ancienne case « fait »
  update public.taches set statut = case when fait then 'terminee' else 'a_traiter' end, updated_at = maintenant
  where statut is null and coalesce(modele, false) = false;
  -- Un lien intervention <-> tâche pour chaque tâche d'un ancien déplacement
  insert into public.intervention_taches (id, intervention_id, tache_id, resultat, ordre, created_at, updated_at, deleted, owner_id)
  select t.deplacement_id || '~' || t.id, t.deplacement_id, t.id,
         case when d.statut = 'termine' then case when t.fait then 'terminee' else 'reportee' end end,
         t.ordre, maintenant, maintenant, false, t.owner_id
  from public.taches t join public.deplacements d on d.id = t.deplacement_id
  where t.deplacement_id is not null and coalesce(t.modele, false) = false and coalesce(t.deleted, false) = false
  on conflict (id) do nothing;
end $$;

-- ---------- Migration : interventions -> déplacements (une intervention par bien) ----------
do $$
declare maintenant bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  -- Chaque intervention sans déplacement devient un déplacement de même identifiant
  -- (les cases « Pris » déjà cochées restent ainsi valables pour la liste de chargement).
  insert into public.voyages (id, nom, date_debut, created_at, updated_at, deleted, owner_id)
  select d.id, d.nom, d.date_debut, d.created_at, maintenant, false, d.owner_id
  from public.deplacements d
  where d.voyage_id is null and coalesce(d.deleted, false) = false
  on conflict (id) do nothing;
  update public.deplacements set voyage_id = id, updated_at = maintenant
  where voyage_id is null and coalesce(deleted, false) = false;

  -- Bien de l'intervention quand toutes ses tâches sont du même bien
  update public.deplacements d set appartement_id = x.bien, updated_at = maintenant
  from (
    select l.intervention_id, min(t.appartement_id) as bien
    from public.intervention_taches l join public.taches t on t.id = l.tache_id
    where coalesce(l.deleted, false) = false and t.appartement_id is not null
    group by l.intervention_id
    having count(distinct t.appartement_id) = 1
       and count(*) = (select count(*) from public.intervention_taches l2
                       where l2.intervention_id = l.intervention_id and coalesce(l2.deleted, false) = false)
  ) x
  where d.id = x.intervention_id and d.appartement_id is null;

  -- Interventions à plusieurs biens : une nouvelle intervention par bien, dans le même déplacement
  create temp table _a_scinder on commit drop as
    select l.id as lien_id, l.intervention_id, l.tache_id, l.resultat, l.ordre, t.appartement_id as bien,
           d.nom, d.date_debut, d.statut, d.voyage_id, d.owner_id, d.id || '~' || t.appartement_id as nouvelle_id
    from public.intervention_taches l
    join public.taches t on t.id = l.tache_id
    join public.deplacements d on d.id = l.intervention_id
    where coalesce(l.deleted, false) = false and coalesce(d.deleted, false) = false
      and d.appartement_id is null and t.appartement_id is not null;
  insert into public.deplacements (id, nom, date_debut, statut, voyage_id, appartement_id, created_at, updated_at, deleted, owner_id)
  select distinct s.nouvelle_id, s.nom || ' – ' || coalesce(a.nom, '?'), s.date_debut, s.statut, s.voyage_id, s.bien, maintenant, maintenant, false, s.owner_id
  from _a_scinder s left join public.appartements a on a.id = s.bien
  on conflict (id) do nothing;
  insert into public.intervention_taches (id, intervention_id, tache_id, resultat, ordre, created_at, updated_at, deleted, owner_id)
  select s.nouvelle_id || '~' || s.tache_id, s.nouvelle_id, s.tache_id, s.resultat, s.ordre, maintenant, maintenant, false, s.owner_id
  from _a_scinder s
  on conflict (id) do nothing;
  update public.intervention_taches set deleted = true, updated_at = maintenant
  where id in (select lien_id from _a_scinder);
  -- Commentaires de compte rendu : restent sur l'ancienne intervention (toujours visible dans le déplacement)
  -- Anciennes interventions devenues vides (toutes leurs tâches ont un bien) : supprimées
  update public.deplacements d set deleted = true, updated_at = maintenant
  where d.id in (select distinct intervention_id from _a_scinder)
    and not exists (select 1 from public.intervention_taches l where l.intervention_id = d.id and coalesce(l.deleted, false) = false)
    and not exists (select 1 from public.commentaires c where c.intervention_id = d.id and c.tache_id is null and coalesce(c.deleted, false) = false);
end $$;

-- ---------- v4 : références (T-0042, I-0017, D-0008) et type « Accessoire » ----------
do $$
declare maintenant bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  -- Références des éléments existants : par compte, dans l'ordre de création, à la suite des numéros déjà pris
  update public.taches t set ref = x.n, updated_at = maintenant
  from (select id, row_number() over (partition by owner_id order by created_at, id)
               + coalesce((select max(ref) from public.taches m where m.owner_id = s.owner_id), 0) as n
        from public.taches s where ref is null and coalesce(modele, false) = false and not deleted) x
  where t.id = x.id;
  update public.deplacements t set ref = x.n, updated_at = maintenant
  from (select id, row_number() over (partition by owner_id order by created_at, id)
               + coalesce((select max(ref) from public.deplacements m where m.owner_id = s.owner_id), 0) as n
        from public.deplacements s where ref is null and not deleted) x
  where t.id = x.id;
  update public.voyages t set ref = x.n, updated_at = maintenant
  from (select id, row_number() over (partition by owner_id order by created_at, id)
               + coalesce((select max(ref) from public.voyages m where m.owner_id = s.owner_id), 0) as n
        from public.voyages s where ref is null and not deleted) x
  where t.id = x.id;
  -- Batteries et chargeurs rangés en « Outillage » deviennent des « Accessoires » (reconnus par leur nom)
  update public.articles set type = 'accessoire', cumul_quantites = false, updated_at = maintenant
  where type = 'outillage' and not deleted and nom ~* '(^|[^[:alnum:]])(batterie|batteries|chargeur|chargeurs)([^[:alnum:]]|$)';
end $$;

-- ---------- Catalogue partagé : ce que l'administrateur propose aux nouveaux comptes ----------
-- Seuls le nom, le type, la catégorie, l'unité, les accessoires et les tâches types (étapes et matériel)
-- sont communiqués : jamais les notes, les lieux, les biens, les tâches ni les photos.
create or replace function public.catalogue_partage() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare adm uuid;
begin
  if auth.uid() is null then
    raise exception 'Connexion requise';
  end if;
  select user_id into adm from public.admins order by user_id limit 1;
  if adm is null then
    return null;
  end if;
  return jsonb_build_object(
    'proprietaire', (select coalesce(p.nom, split_part(p.email, '@', 1)) from public.profils p where p.id = adm),
    'categories', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'nom', c.nom) order by c.nom)
        from public.categories c where c.owner_id = adm and not c.deleted), '[]'::jsonb),
    'articles', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'nom', a.nom, 'type', a.type, 'categorie_id', a.categorie_id,
        'unite', a.unite, 'cumul_quantites', a.cumul_quantites) order by a.nom)
        from public.articles a where a.owner_id = adm and not a.deleted), '[]'::jsonb),
    'accessoires', coalesce((select jsonb_agg(jsonb_build_object('article_id', x.article_id, 'accessoire_id', x.accessoire_id, 'quantite', x.quantite))
        from public.article_accessoires x where x.owner_id = adm and not x.deleted), '[]'::jsonb),
    'modeles', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'titre', t.titre, 'description', t.description,
        'besoins', coalesce((select jsonb_agg(jsonb_build_object('article_id', ta.article_id, 'quantite', ta.quantite))
                             from public.tache_articles ta where ta.tache_id = t.id and not ta.deleted), '[]'::jsonb)) order by t.titre)
        from public.taches t where t.owner_id = adm and t.modele and not t.deleted), '[]'::jsonb)
  );
end $$;
revoke all on function public.catalogue_partage() from public, anon;
grant execute on function public.catalogue_partage() to authenticated;

-- ---------- Google Sheet du catalogue : clé de synchronisation ----------
-- L'appli crée une clé (montrée une seule fois) ; seul son empreinte SHA-256 est gardée. Le script du Sheet
-- l'envoie à sheet_lire / sheet_ecrire, qui n'ouvrent QUE le catalogue de son propriétaire
-- (articles, lieux, catégories, items à proposer, stock). Révocable à tout moment depuis l'appli.
create table if not exists public.cles_sheet (
  owner_id uuid primary key,
  cle_hash text not null unique,
  creee_le timestamptz not null default now(),
  utilisee_le timestamptz
);
alter table public.cles_sheet enable row level security;
revoke all on public.cles_sheet from anon, authenticated;

create or replace function public.creer_cle_sheet() returns text
language plpgsql volatile security definer set search_path = public as $$
declare v_cle text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
begin
  if auth.uid() is null then
    raise exception 'Connexion requise';
  end if;
  insert into public.cles_sheet (owner_id, cle_hash) values (auth.uid(), encode(sha256(convert_to(v_cle, 'UTF8')), 'hex'))
    on conflict (owner_id) do update set cle_hash = excluded.cle_hash, creee_le = now(), utilisee_le = null;
  return v_cle;
end $$;

create or replace function public.revoquer_cle_sheet() returns void
language sql volatile security definer set search_path = public as $$
  delete from public.cles_sheet where owner_id = auth.uid();
$$;

create or replace function public.etat_cle_sheet() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('creee_le', creee_le, 'utilisee_le', utilisee_le) from public.cles_sheet where owner_id = auth.uid();
$$;

revoke all on function public.creer_cle_sheet() from public, anon;
revoke all on function public.revoquer_cle_sheet() from public, anon;
revoke all on function public.etat_cle_sheet() from public, anon;
grant execute on function public.creer_cle_sheet() to authenticated;
grant execute on function public.revoquer_cle_sheet() to authenticated;
grant execute on function public.etat_cle_sheet() to authenticated;

-- Propriétaire d'une clé (usage interne) ; erreur si la clé est inconnue ou révoquée.
create or replace function public.sheet_proprietaire(p_cle text) returns uuid
language plpgsql volatile security definer set search_path = public as $$
declare v uuid;
begin
  select owner_id into v from public.cles_sheet where cle_hash = encode(sha256(convert_to(coalesce(p_cle, ''), 'UTF8')), 'hex');
  if v is null then
    raise exception 'Clé de synchronisation invalide ou révoquée';
  end if;
  update public.cles_sheet set utilisee_le = now() where owner_id = v;
  return v;
end $$;
revoke all on function public.sheet_proprietaire(text) from public, anon, authenticated;

-- Catalogue du propriétaire de la clé, avec le nombre de tâches qui utilisent chaque article.
create or replace function public.sheet_lire(p_cle text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare v uuid := public.sheet_proprietaire(p_cle);
begin
  return jsonb_build_object(
    'articles', coalesce((select jsonb_agg(to_jsonb(a) - 'owner_id' - 'rev') from public.articles a where a.owner_id = v and not a.deleted), '[]'::jsonb),
    'lieux', coalesce((select jsonb_agg(to_jsonb(x) - 'owner_id' - 'rev') from public.lieux x where x.owner_id = v and not x.deleted), '[]'::jsonb),
    'categories', coalesce((select jsonb_agg(to_jsonb(x) - 'owner_id' - 'rev') from public.categories x where x.owner_id = v and not x.deleted), '[]'::jsonb),
    'article_accessoires', coalesce((select jsonb_agg(to_jsonb(x) - 'owner_id' - 'rev') from public.article_accessoires x where x.owner_id = v and not x.deleted), '[]'::jsonb),
    'stocks', coalesce((select jsonb_agg(to_jsonb(x) - 'owner_id' - 'rev') from public.stocks x where x.owner_id = v and not x.deleted), '[]'::jsonb),
    'usages', coalesce((select jsonb_object_agg(u.article_id, jsonb_build_object('n', u.n, 'titres', u.titres)) from (
        select ta.article_id, count(*) as n, (array_agg(t.titre order by t.titre))[1:3] as titres
        from public.tache_articles ta join public.taches t on t.id = ta.tache_id
        where ta.owner_id = v and not ta.deleted and not t.deleted and not coalesce(t.modele, false)
        group by ta.article_id) u), '{}'::jsonb)
  );
end $$;

-- Écritures préparées par le Sheet (lignes complètes) : seulement les tables du catalogue, toujours chez le propriétaire de la clé.
create or replace function public.sheet_ecrire(p_cle text, p_ecritures jsonb) returns integer
language plpgsql volatile security definer set search_path = public as $$
declare
  v uuid := public.sheet_proprietaire(p_cle);
  w jsonb; t text; r jsonb; proprio uuid; cols text; maj text; n integer := 0;
begin
  if jsonb_typeof(p_ecritures) <> 'array' or jsonb_array_length(p_ecritures) > 5000 then
    raise exception 'Écritures invalides';
  end if;
  for w in select value from jsonb_array_elements(p_ecritures) loop
    t := w->>'table';
    if t is null or t not in ('articles', 'lieux', 'categories', 'article_accessoires', 'stocks') then
      raise exception 'Table non autorisée : %', t;
    end if;
    r := (w->'row') - 'owner_id' - 'rev';
    if coalesce(r->>'id', '') = '' then
      raise exception 'Identifiant manquant';
    end if;
    proprio := null;
    execute format('select owner_id from public.%I where id = $1', t) into proprio using r->>'id';
    if proprio is not null and proprio <> v then
      raise exception 'Ligne d''un autre compte';
    end if;
    r := r || jsonb_build_object('owner_id', v);
    select string_agg(quote_ident(c.column_name), ', '),
           string_agg(format('%1$I = excluded.%1$I', c.column_name), ', ') filter (where c.column_name <> 'id')
      into cols, maj
      from information_schema.columns c
      where c.table_schema = 'public' and c.table_name = t and r ? c.column_name;
    execute format('insert into public.%1$I (%2$s) select %2$s from jsonb_populate_record(null::public.%1$I, $1) on conflict (id) do update set %3$s', t, cols, maj) using r;
    n := n + 1;
  end loop;
  return n;
end $$;

revoke all on function public.sheet_lire(text) from public;
revoke all on function public.sheet_ecrire(text, jsonb) from public;
grant execute on function public.sheet_lire(text) to anon, authenticated;
grant execute on function public.sheet_ecrire(text, jsonb) to anon, authenticated;

-- ---------- Photos : bucket privé Supabase Storage ----------
-- Chaque compte écrit et lit dans son dossier (nom = identifiant du compte) ; l'administrateur partout.
insert into storage.buckets (id, name, public) values ('photos', 'photos', false) on conflict (id) do nothing;
drop policy if exists "photos lecture" on storage.objects;
create policy "photos lecture" on storage.objects for select to authenticated
  using (bucket_id = 'photos' and (public.est_admin() or (storage.foldername(name))[1] = auth.uid()::text));
drop policy if exists "photos ajout" on storage.objects;
create policy "photos ajout" on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (public.est_admin() or (storage.foldername(name))[1] = auth.uid()::text));
drop policy if exists "photos modification" on storage.objects;
create policy "photos modification" on storage.objects for update to authenticated
  using (bucket_id = 'photos' and (public.est_admin() or (storage.foldername(name))[1] = auth.uid()::text));
drop policy if exists "photos suppression" on storage.objects;
create policy "photos suppression" on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and (public.est_admin() or (storage.foldername(name))[1] = auth.uid()::text));
`;

const seedIdx = process.argv.indexOf('--seed');
if (seedIdx < 0) {
  fs.writeFileSync('supabase/schema.sql', sql);
  console.log('supabase/schema.sql écrit.');
} else {
  const { buildSeed } = await import('./seed.local.js');
  const seed = buildSeed();
  const now = Date.now();
  const lit = (v) => (v == null ? 'null' : typeof v === 'boolean' ? String(v) : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
  sql += `\n-- Jeu de données de départ (importé seulement si la base est vide ; propriétaire : l'administrateur)\ndo $$ begin\nif not exists (select 1 from public.deplacements) then\n`;
  for (const [table, rows] of Object.entries(seed)) {
    const cols = ['id', ...TABLES[table], 'created_at', 'updated_at'];
    for (const r of rows) {
      const row = { ...r, created_at: now, updated_at: now };
      sql += `insert into public.${table} (${cols.join(', ')}, owner_id) values (${cols.map((c) => lit(row[c])).join(', ')}, (select user_id from public.admins order by user_id limit 1));\n`;
    }
  }
  sql += `end if;\nend $$;\n`;
  fs.writeFileSync(process.argv[seedIdx + 1], sql);
  console.log(`${process.argv[seedIdx + 1]} écrit (contient tes données : ne pas publier).`);
}
