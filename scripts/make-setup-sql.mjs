// Génère le SQL d'installation Supabase.
//   node scripts/make-setup-sql.mjs                 -> supabase/schema.sql (structure seule, publiable)
//   node scripts/make-setup-sql.mjs --seed <fichier> -> structure + jeu de départ (à NE PAS publier)
import fs from 'node:fs';
import { TABLES, BOOL_FIELDS, REAL_FIELDS } from '../shared/schema.js';

const colType = (f) => (BOOL_FIELDS.has(f) ? 'boolean' : REAL_FIELDS.has(f) ? 'double precision' : 'text');

let sql = `-- Schéma de l'application « Déplacements » pour Supabase.
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
create index if not exists ${table}_rev on public.${table}(rev);
drop trigger if exists ${table}_lww on public.${table};
create trigger ${table}_lww before insert or update on public.${table} for each row execute function app_lww();
alter table public.${table} enable row level security;
drop policy if exists "${table} connectés" on public.${table};
create policy "${table} connectés" on public.${table} for all to authenticated using (true) with check (true);
grant select, insert, update on public.${table} to authenticated;
revoke all on public.${table} from anon;
`;
}

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
  sql += `\n-- Jeu de données de départ (importé seulement si la base est vide)\ndo $$ begin\nif not exists (select 1 from public.deplacements) then\n`;
  for (const [table, rows] of Object.entries(seed)) {
    const cols = ['id', ...TABLES[table], 'created_at', 'updated_at'];
    for (const r of rows) {
      const row = { ...r, created_at: now, updated_at: now };
      sql += `insert into public.${table} (${cols.join(', ')}) values (${cols.map((c) => lit(row[c])).join(', ')});\n`;
    }
  }
  sql += `end if;\nend $$;\n`;
  fs.writeFileSync(process.argv[seedIdx + 1], sql);
  console.log(`${process.argv[seedIdx + 1]} écrit (contient tes données : ne pas publier).`);
}
