// Génère google-sheet/Code.gs : la logique de synchro (shared/sheet.js, testée) empaquetée + le script du Sheet.
// Usage : node scripts/make-apps-script.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { build } from 'vite';

// Valeurs publiques du projet, lues dans src/supabase.js (qui ne peut pas être importé hors navigateur).
const config = fs.readFileSync('src/supabase.js', 'utf8');
const lire = (nom) => config.match(new RegExp(`${nom} = '([^']+)'`))[1];
const SUPABASE_URL = lire('SUPABASE_URL');
const SUPABASE_ANON_KEY = lire('SUPABASE_ANON_KEY');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'apps-script-'));
await build({
  configFile: false,
  logLevel: 'warn',
  build: {
    outDir: tmp,
    emptyOutDir: true,
    minify: false,
    lib: { entry: path.resolve('shared/sheet.js'), name: 'Synchro', formats: ['iife'], fileName: () => 'synchro.js' },
  },
});
const synchro = fs.readFileSync(path.join(tmp, 'synchro.js'), 'utf8');
const script = fs
  .readFileSync('google-sheet/script-source.js', 'utf8')
  .replace('__SUPABASE_URL__', SUPABASE_URL)
  .replace('__SUPABASE_CLE__', SUPABASE_ANON_KEY);
fs.writeFileSync('google-sheet/Code.gs', `${script}\n// ===== Logique de synchronisation (générée depuis shared/sheet.js) =====\n${synchro}`);
fs.rmSync(tmp, { recursive: true, force: true });
console.log('google-sheet/Code.gs écrit.');
