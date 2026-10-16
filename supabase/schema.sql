-- Schéma de l'application « Déplacements » pour Supabase.
-- À exécuter une fois dans Supabase : SQL Editor > New query > coller > Run.

-- Numéro de révision global : le client récupère tout ce qui a changé depuis sa dernière synchro.
create sequence if not exists app_rev;

-- « Dernière modification gagne » : une écriture plus ancienne que la ligne en base est ignorée
-- (la ligne reçoit quand même une nouvelle révision pour que le client récupère la bonne version).
create or replace function app_lww() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.updated_at < old.updated_at then
    new := old;
  end if;
  new.rev := nextval('app_rev');
  return new;
end $$;

create table if not exists public.lieux (
  id text primary key,
  nom text,
  created_at bigint not null,
  updated_at bigint not null,
  deleted boolean not null default false,
  rev bigint
);
alter table public.lieux add column if not exists nom text;
create index if not exists lieux_rev on public.lieux(rev);
drop trigger if exists lieux_lww on public.lieux;
create trigger lieux_lww before insert or update on public.lieux for each row execute function app_lww();
alter table public.lieux enable row level security;
drop policy if exists "lieux connectés" on public.lieux;
create policy "lieux connectés" on public.lieux for all to authenticated using (true) with check (true);
grant select, insert, update on public.lieux to authenticated;
revoke all on public.lieux from anon;

create table if not exists public.appartements (
  id text primary key,
  nom text,
  created_at bigint not null,
  updated_at bigint not null,
  deleted boolean not null default false,
  rev bigint
);
alter table public.appartements add column if not exists nom text;
create index if not exists appartements_rev on public.appartements(rev);
drop trigger if exists appartements_lww on public.appartements;
create trigger appartements_lww before insert or update on public.appartements for each row execute function app_lww();
alter table public.appartements enable row level security;
drop policy if exists "appartements connectés" on public.appartements;
create policy "appartements connectés" on public.appartements for all to authenticated using (true) with check (true);
grant select, insert, update on public.appartements to authenticated;
revoke all on public.appartements from anon;

create table if not exists public.categories (
  id text primary key,
  nom text,
  created_at bigint not null,
  updated_at bigint not null,
  deleted boolean not null default false,
  rev bigint
);
alter table public.categories add column if not exists nom text;
create index if not exists categories_rev on public.categories(rev);
drop trigger if exists categories_lww on public.categories;
create trigger categories_lww before insert or update on public.categories for each row execute function app_lww();
alter table public.categories enable row level security;
drop policy if exists "categories connectés" on public.categories;
create policy "categories connectés" on public.categories for all to authenticated using (true) with check (true);
grant select, insert, update on public.categories to authenticated;
revoke all on public.categories from anon;

create table if not exists public.articles (
  id text primary key,
  nom text,
  type text,
  lieu_id text,
  categorie_id text,
  notes text,
  unite text,
  cumul_quantites boolean,
  created_at bigint not null,
  updated_at bigint not null,
  deleted boolean not null default false,
  rev bigint
);
alter table public.articles add column if not exists nom text;
alter table public.articles add column if not exists type text;
alter table public.articles add column if not exists lieu_id text;
alter table public.articles add column if not exists categorie_id text;
alter table public.articles add column if not exists notes text;
alter table public.articles add column if not exists unite text;
alter table public.articles add column if not exists cumul_quantites boolean;
create index if not exists articles_rev on public.articles(rev);
drop trigger if exists articles_lww on public.articles;
create trigger articles_lww before insert or update on public.articles for each row execute function app_lww();
alter table public.articles enable row level security;
drop policy if exists "articles connectés" on public.articles;
create policy "articles connectés" on public.articles for all to authenticated using (true) with check (true);
grant select, insert, update on public.articles to authenticated;
revoke all on public.articles from anon;

create table if not exists public.article_accessoires (
  id text primary key,
  article_id text,
  accessoire_id text,
  quantite double precision,
  created_at bigint not null,
  updated_at bigint not null,
  deleted boolean not null default false,
  rev bigint
);
alter table public.article_accessoires add column if not exists article_id text;
alter table public.article_accessoires add column if not exists accessoire_id text;
alter table public.article_accessoires add column if not exists quantite double precision;
create index if not exists article_accessoires_rev on public.article_accessoires(rev);
drop trigger if exists article_accessoires_lww on public.article_accessoires;
create trigger article_accessoires_lww before insert or update on public.article_accessoires for each row execute function app_lww();
alter table public.article_accessoires enable row level security;
drop policy if exists "article_accessoires connectés" on public.article_accessoires;
create policy "article_accessoires connectés" on public.article_accessoires for all to authenticated using (true) with check (true);
grant select, insert, update on public.article_accessoires to authenticated;
revoke all on public.article_accessoires from anon;

create table if not exists public.voyages (
  id text primary key,
  nom text,
  date_debut text,
  created_at bigint not null,
  updated_at bigint not null,
  deleted boolean not null default false,
  rev bigint
);
alter table public.voyages add column if not exists nom text;
alter table public.voyages add column if not exists date_debut text;
create index if not exists voyages_rev on public.voyages(rev);
drop trigger if exists voyages_lww on public.voyages;
create trigger voyages_lww before insert or update on public.voyages for each row execute function app_lww();
alter table public.voyages enable row level security;
drop policy if exists "voyages connectés" on public.voyages;
create policy "voyages connectés" on public.voyages for all to authenticated using (true) with check (true);
grant select, insert, update on public.voyages to authenticated;
revoke all on public.voyages from anon;

create table if not exists public.deplacements (
  id text primary key,
  nom text,
  date_debut text,
  statut text,
  voyage_id text,
  appartement_id text,
  created_at bigint not null,
  updated_at bigint not null,
  deleted boolean not null default false,
  rev bigint
);
alter table public.deplacements add column if not exists nom text;
alter table public.deplacements add column if not exists date_debut text;
alter table public.deplacements add column if not exists statut text;
alter table public.deplacements add column if not exists voyage_id text;
alter table public.deplacements add column if not exists appartement_id text;
create index if not exists deplacements_rev on public.deplacements(rev);
drop trigger if exists deplacements_lww on public.deplacements;
create trigger deplacements_lww before insert or update on public.deplacements for each row execute function app_lww();
alter table public.deplacements enable row level security;
drop policy if exists "deplacements connectés" on public.deplacements;
create policy "deplacements connectés" on public.deplacements for all to authenticated using (true) with check (true);
grant select, insert, update on public.deplacements to authenticated;
revoke all on public.deplacements from anon;

create table if not exists public.taches (
  id text primary key,
  deplacement_id text,
  titre text,
  description text,
  appartement_id text,
  fait boolean,
  ordre double precision,
  modele boolean,
  statut text,
  echeance text,
  modele_id text,
  created_at bigint not null,
  updated_at bigint not null,
  deleted boolean not null default false,
  rev bigint
);
alter table public.taches add column if not exists deplacement_id text;
alter table public.taches add column if not exists titre text;
alter table public.taches add column if not exists description text;
alter table public.taches add column if not exists appartement_id text;
alter table public.taches add column if not exists fait boolean;
alter table public.taches add column if not exists ordre double precision;
alter table public.taches add column if not exists modele boolean;
alter table public.taches add column if not exists statut text;
alter table public.taches add column if not exists echeance text;
alter table public.taches add column if not exists modele_id text;
create index if not exists taches_rev on public.taches(rev);
drop trigger if exists taches_lww on public.taches;
create trigger taches_lww before insert or update on public.taches for each row execute function app_lww();
alter table public.taches enable row level security;
drop policy if exists "taches connectés" on public.taches;
create policy "taches connectés" on public.taches for all to authenticated using (true) with check (true);
grant select, insert, update on public.taches to authenticated;
revoke all on public.taches from anon;

create table if not exists public.tache_articles (
  id text primary key,
  tache_id text,
  article_id text,
  quantite double precision,
  created_at bigint not null,
  updated_at bigint not null,
  deleted boolean not null default false,
  rev bigint
);
alter table public.tache_articles add column if not exists tache_id text;
alter table public.tache_articles add column if not exists article_id text;
alter table public.tache_articles add column if not exists quantite double precision;
create index if not exists tache_articles_rev on public.tache_articles(rev);
drop trigger if exists tache_articles_lww on public.tache_articles;
create trigger tache_articles_lww before insert or update on public.tache_articles for each row execute function app_lww();
alter table public.tache_articles enable row level security;
drop policy if exists "tache_articles connectés" on public.tache_articles;
create policy "tache_articles connectés" on public.tache_articles for all to authenticated using (true) with check (true);
grant select, insert, update on public.tache_articles to authenticated;
revoke all on public.tache_articles from anon;

create table if not exists public.prise_articles (
  id text primary key,
  deplacement_id text,
  article_id text,
  pris boolean,
  quantite_prise double precision,
  created_at bigint not null,
  updated_at bigint not null,
  deleted boolean not null default false,
  rev bigint
);
alter table public.prise_articles add column if not exists deplacement_id text;
alter table public.prise_articles add column if not exists article_id text;
alter table public.prise_articles add column if not exists pris boolean;
alter table public.prise_articles add column if not exists quantite_prise double precision;
create index if not exists prise_articles_rev on public.prise_articles(rev);
drop trigger if exists prise_articles_lww on public.prise_articles;
create trigger prise_articles_lww before insert or update on public.prise_articles for each row execute function app_lww();
alter table public.prise_articles enable row level security;
drop policy if exists "prise_articles connectés" on public.prise_articles;
create policy "prise_articles connectés" on public.prise_articles for all to authenticated using (true) with check (true);
grant select, insert, update on public.prise_articles to authenticated;
revoke all on public.prise_articles from anon;

create table if not exists public.intervention_taches (
  id text primary key,
  intervention_id text,
  tache_id text,
  resultat text,
  ordre double precision,
  created_at bigint not null,
  updated_at bigint not null,
  deleted boolean not null default false,
  rev bigint
);
alter table public.intervention_taches add column if not exists intervention_id text;
alter table public.intervention_taches add column if not exists tache_id text;
alter table public.intervention_taches add column if not exists resultat text;
alter table public.intervention_taches add column if not exists ordre double precision;
create index if not exists intervention_taches_rev on public.intervention_taches(rev);
drop trigger if exists intervention_taches_lww on public.intervention_taches;
create trigger intervention_taches_lww before insert or update on public.intervention_taches for each row execute function app_lww();
alter table public.intervention_taches enable row level security;
drop policy if exists "intervention_taches connectés" on public.intervention_taches;
create policy "intervention_taches connectés" on public.intervention_taches for all to authenticated using (true) with check (true);
grant select, insert, update on public.intervention_taches to authenticated;
revoke all on public.intervention_taches from anon;

create table if not exists public.commentaires (
  id text primary key,
  tache_id text,
  intervention_id text,
  texte text,
  auteur text,
  dans_rapport boolean,
  created_at bigint not null,
  updated_at bigint not null,
  deleted boolean not null default false,
  rev bigint
);
alter table public.commentaires add column if not exists tache_id text;
alter table public.commentaires add column if not exists intervention_id text;
alter table public.commentaires add column if not exists texte text;
alter table public.commentaires add column if not exists auteur text;
alter table public.commentaires add column if not exists dans_rapport boolean;
create index if not exists commentaires_rev on public.commentaires(rev);
drop trigger if exists commentaires_lww on public.commentaires;
create trigger commentaires_lww before insert or update on public.commentaires for each row execute function app_lww();
alter table public.commentaires enable row level security;
drop policy if exists "commentaires connectés" on public.commentaires;
create policy "commentaires connectés" on public.commentaires for all to authenticated using (true) with check (true);
grant select, insert, update on public.commentaires to authenticated;
revoke all on public.commentaires from anon;

create table if not exists public.photos (
  id text primary key,
  commentaire_id text,
  chemin text,
  legende text,
  dans_rapport boolean,
  created_at bigint not null,
  updated_at bigint not null,
  deleted boolean not null default false,
  rev bigint
);
alter table public.photos add column if not exists commentaire_id text;
alter table public.photos add column if not exists chemin text;
alter table public.photos add column if not exists legende text;
alter table public.photos add column if not exists dans_rapport boolean;
create index if not exists photos_rev on public.photos(rev);
drop trigger if exists photos_lww on public.photos;
create trigger photos_lww before insert or update on public.photos for each row execute function app_lww();
alter table public.photos enable row level security;
drop policy if exists "photos connectés" on public.photos;
create policy "photos connectés" on public.photos for all to authenticated using (true) with check (true);
grant select, insert, update on public.photos to authenticated;
revoke all on public.photos from anon;

-- ---------- Migration : déplacements -> interventions ----------
do $$
declare maintenant bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  -- Statut des tâches à partir de l'ancienne case « fait »
  update public.taches set statut = case when fait then 'terminee' else 'a_traiter' end, updated_at = maintenant
  where statut is null and coalesce(modele, false) = false;
  -- Un lien intervention <-> tâche pour chaque tâche d'un ancien déplacement
  insert into public.intervention_taches (id, intervention_id, tache_id, resultat, ordre, created_at, updated_at, deleted)
  select t.deplacement_id || '~' || t.id, t.deplacement_id, t.id,
         case when d.statut = 'termine' then case when t.fait then 'terminee' else 'reportee' end end,
         t.ordre, maintenant, maintenant, false
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
  insert into public.voyages (id, nom, date_debut, created_at, updated_at, deleted)
  select d.id, d.nom, d.date_debut, d.created_at, maintenant, false
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
           d.nom, d.date_debut, d.statut, d.voyage_id, d.id || '~' || t.appartement_id as nouvelle_id
    from public.intervention_taches l
    join public.taches t on t.id = l.tache_id
    join public.deplacements d on d.id = l.intervention_id
    where coalesce(l.deleted, false) = false and coalesce(d.deleted, false) = false
      and d.appartement_id is null and t.appartement_id is not null;
  insert into public.deplacements (id, nom, date_debut, statut, voyage_id, appartement_id, created_at, updated_at, deleted)
  select distinct s.nouvelle_id, s.nom || ' – ' || coalesce(a.nom, '?'), s.date_debut, s.statut, s.voyage_id, s.bien, maintenant, maintenant, false
  from _a_scinder s left join public.appartements a on a.id = s.bien
  on conflict (id) do nothing;
  insert into public.intervention_taches (id, intervention_id, tache_id, resultat, ordre, created_at, updated_at, deleted)
  select s.nouvelle_id || '~' || s.tache_id, s.nouvelle_id, s.tache_id, s.resultat, s.ordre, maintenant, maintenant, false
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

-- ---------- Photos : bucket privé Supabase Storage, réservé aux comptes connectés ----------
insert into storage.buckets (id, name, public) values ('photos', 'photos', false) on conflict (id) do nothing;
drop policy if exists "photos lecture" on storage.objects;
create policy "photos lecture" on storage.objects for select to authenticated using (bucket_id = 'photos');
drop policy if exists "photos ajout" on storage.objects;
create policy "photos ajout" on storage.objects for insert to authenticated with check (bucket_id = 'photos');
drop policy if exists "photos modification" on storage.objects;
create policy "photos modification" on storage.objects for update to authenticated using (bucket_id = 'photos');
drop policy if exists "photos suppression" on storage.objects;
create policy "photos suppression" on storage.objects for delete to authenticated using (bucket_id = 'photos');
