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
