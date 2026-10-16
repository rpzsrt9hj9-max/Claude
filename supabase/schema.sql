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

create table if not exists public.deplacements (
  id text primary key,
  nom text,
  date_debut text,
  statut text,
  created_at bigint not null,
  updated_at bigint not null,
  deleted boolean not null default false,
  rev bigint
);
alter table public.deplacements add column if not exists nom text;
alter table public.deplacements add column if not exists date_debut text;
alter table public.deplacements add column if not exists statut text;
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
