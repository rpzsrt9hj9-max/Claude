import { describe, expect, it } from 'vitest';
import { computeTrip } from '../shared/calc.js';
import { calculerCaisses, fusionner, lireFusions, separer } from '../shared/caisses.js';
import { planRetrait, texteRetrait } from '../shared/retrait.js';
import { arreter, bilan, demarrer, enCours } from '../shared/temps.js';
import { cleKit, priseId } from '../shared/schema.js';

const r = (o) => ({ created_at: 1, updated_at: 1, deleted: false, ...o });
function data() {
  return {
    appartements: [r({ id: 'P', nom: 'Pasteur' }), r({ id: 'G', nom: 'De Gaulle' }), r({ id: 'M', nom: 'Mulot' })],
    articles: [
      r({ id: 'perc', nom: 'Perceuse', type: 'outillage', cumul_quantites: false }),
      r({ id: 'vis', nom: 'Vis', type: 'consommable', cumul_quantites: true }),
      r({ id: 'amp', nom: 'Ampoule', type: 'materiel', cumul_quantites: true }),
      r({ id: 'peint', nom: 'Peinture retouche', type: 'materiel', cumul_quantites: false, caisse_mode: 'commun' }),
      r({ id: 'kit', nom: 'Basique outillage', type: 'outillage', kit: true, cumul_quantites: false }),
      r({ id: 'cut', nom: 'Cutter', type: 'outillage' }),
      r({ id: 'metre', nom: 'Mètre', type: 'outillage' }),
      r({ id: 'lun', nom: 'Lunettes de soleil', type: 'materiel', cumul_quantites: true }),
    ],
    taches: [
      r({ id: 'tp', titre: 'Changer ampoules', appartement_id: 'P', modele_id: 'mod' }),
      r({ id: 'tg', titre: 'Fixer étagère', appartement_id: 'G' }),
      r({ id: 'tm', titre: 'Retouches', appartement_id: 'M' }),
      r({ id: 'mod', titre: 'Changer ampoules (type)', modele: true }),
    ],
    tache_articles: [
      r({ id: 'tp~amp', tache_id: 'tp', article_id: 'amp', quantite: 2 }),
      r({ id: 'tp~vis', tache_id: 'tp', article_id: 'vis', quantite: 10 }),
      r({ id: 'tg~amp', tache_id: 'tg', article_id: 'amp', quantite: 3 }),
      r({ id: 'tg~perc', tache_id: 'tg', article_id: 'perc', quantite: 1 }),
      r({ id: 'tg~vis', tache_id: 'tg', article_id: 'vis', quantite: 20 }),
      r({ id: 'tm~peint', tache_id: 'tm', article_id: 'peint', quantite: 1 }),
      r({ id: 'tp~peint', tache_id: 'tp', article_id: 'peint', quantite: 1 }),
      r({ id: 'tm~kit', tache_id: 'tm', article_id: 'kit', quantite: 1 }),
      r({ id: 'mod~amp', tache_id: 'mod', article_id: 'amp', quantite: 2 }),
    ],
    kit_contenus: [r({ id: 'kit~cut', kit_id: 'kit', article_id: 'cut', quantite: 1 }), r({ id: 'kit~metre', kit_id: 'kit', article_id: 'metre', quantite: 1 })],
    voyage_articles: [r({ id: 'V~lun', voyage_id: 'V', article_id: 'lun', quantite: 1 })],
    prise_articles: [],
    article_accessoires: [],
    intervention_taches: [],
    lieux: [],
    temps: [],
  };
}
const trip = (d) => computeTrip('V', d, d.taches.filter((t) => !t.modele), d.voyage_articles);

describe('v5 : affaires du déplacement et basiques', () => {
  it('les affaires liées au déplacement (sans tâche) sont à prendre', () => {
    const lun = trip(data()).items.find((i) => i.article.id === 'lun');
    expect(lun.total).toBe(1);
    expect(lun.usages[0]).toMatchObject({ tache: null, voyage: true });
  });
  it('un basique est « pris » quand tout son contenu est vérifié ; à la sortie, la caisse sort d’un bloc', () => {
    const d = data();
    let kit = trip(d).items.find((i) => i.article.id === 'kit');
    expect(kit.contenu.map((c) => c.article.nom)).toEqual(['Cutter', 'Mètre']);
    expect(kit.status.etat).toBe('vide');
    d.prise_articles.push(r({ id: priseId('V', cleKit('kit', 'cut')), deplacement_id: 'V', article_id: cleKit('kit', 'cut'), pris: true, quantite_prise: 1 }));
    kit = trip(d).items.find((i) => i.article.id === 'kit');
    expect(kit.status.etat).toBe('partiel');
    d.prise_articles.push(r({ id: priseId('V', cleKit('kit', 'metre')), deplacement_id: 'V', article_id: cleKit('kit', 'metre'), pris: true, quantite_prise: 1 }));
    expect(trip(d).items.find((i) => i.article.id === 'kit').status.complet).toBe(true);
    const sortie = computeTrip('sortir~I', d, d.taches.filter((t) => !t.modele)).items.find((i) => i.article.id === 'kit');
    expect(sortie.status.etat).toBe('vide');
  });
});

describe('v5 : caisses par combinaison de biens', () => {
  it('outils et consommables en commun, matériel réparti, exceptions et caisse « Déplacement »', () => {
    const d = data();
    const { caisses, parArticle } = calculerCaisses(trip(d).items, d);
    const nom = (c) => c.nom;
    expect(caisses.map(nom)).toEqual(['De Gaulle', 'Mulot', 'Pasteur', 'De Gaulle + Pasteur', 'Mulot + Pasteur', 'Déplacement']);
    const contenu = (n) => caisses.find((c) => c.nom === n).lignes.map((l) => `${l.article.nom} ×${l.quantite}`);
    expect(contenu('Pasteur')).toEqual(['Ampoule ×2']);
    expect(contenu('De Gaulle')).toEqual(['Ampoule ×3', 'Perceuse ×1']);
    expect(contenu('De Gaulle + Pasteur')).toEqual(['Vis ×30']);
    expect(contenu('Mulot + Pasteur')).toEqual(['Peinture retouche ×1']);
    expect(contenu('Mulot')).toEqual(['Basique outillage ×1']);
    expect(contenu('Déplacement')).toEqual(['Lunettes de soleil ×1']);
    expect(parArticle.get('amp').map((c) => `${c.nom} ×${c.quantite}`)).toEqual(['De Gaulle ×3', 'Pasteur ×2']);
  });
  it('fusionner puis séparer deux caisses', () => {
    const d = data();
    const { caisses } = calculerCaisses(trip(d).items, d);
    const cle = (n) => caisses.find((c) => c.nom === n).cle;
    const fus = fusionner([], cle('Pasteur'), cle('Mulot'));
    const apres = calculerCaisses(trip(d).items, d, fus).caisses;
    const fusionnee = apres.find((c) => c.nom.includes('Mulot · Pasteur'));
    expect(fusionnee.lignes.map((l) => l.article.nom)).toEqual(['Ampoule', 'Basique outillage']);
    expect(lireFusions({ caisses: JSON.stringify(fus) })).toEqual(fus);
    expect(separer(fus, fusionnee.cle)).toEqual([]);
  });
});

describe('v5 : retirer un article de la liste à prendre', () => {
  it('retire des tâches (regroupées par bien) et propose la tâche type', () => {
    const d = data();
    const amp = trip(d).items.find((i) => i.article.id === 'amp');
    const plan = planRetrait(amp, 'V', d);
    expect(plan.groupes).toEqual([{ bien: 'De Gaulle', taches: ['Fixer étagère'] }, { bien: 'Pasteur', taches: ['Changer ampoules'] }]);
    expect(plan.writes.map((w) => w.row.id).sort()).toEqual(['tg~amp', 'tp~amp']);
    expect(plan.modeles.map((m) => m.modele.titre)).toEqual(['Changer ampoules (type)']);
    expect(plan.writesModele('mod')).toEqual([{ table: 'tache_articles', row: { id: 'mod~amp', deleted: true } }]);
    expect(texteRetrait(amp, plan)).toMatch(/🏠 De Gaulle\n {3}• Fixer étagère/);
    const lun = trip(d).items.find((i) => i.article.id === 'lun');
    expect(planRetrait(lun, 'V', d).writes).toEqual([{ table: 'voyage_articles', row: { id: 'V~lun', deleted: true } }]);
  });
});

describe('v5 : suivi du temps', () => {
  it('un seul chrono : en lancer un arrête le précédent', () => {
    let temps = [];
    const appliquer = (writes) => {
      for (const { row } of writes) {
        const i = temps.findIndex((t) => t.id === row.id);
        if (i >= 0) temps[i] = { ...temps[i], ...row };
        else temps.push({ ...row });
      }
    };
    appliquer(demarrer('trajet', { voyage_id: 'V' }, temps, 0, 't1'));
    appliquer(demarrer('preparation', { voyage_id: 'V' }, temps, 3_600_000, 't2'));
    expect(temps.find((t) => t.id === 't1').fin).toBe(3_600_000);
    expect(enCours(temps).id).toBe('t2');
    appliquer(arreter(temps, 3_602_000));
    expect(temps.find((t) => t.id === 't2').deleted).toBe(true); // moins de 5 s : effacé
  });
  it('bilan : temps commun réparti à parts égales, temps d’une tâche à son bien', () => {
    const d = data();
    const h = 3_600_000;
    d.temps = [
      r({ id: 'a', activite: 'trajet', debut: 0, fin: 3 * h, voyage_id: 'V' }),
      r({ id: 'b', activite: 'tache', debut: 3 * h, fin: 5 * h, voyage_id: 'V', intervention_id: 'IP', tache_id: 'tp' }),
    ];
    const its = [{ id: 'IP', appartement_id: 'P' }, { id: 'IG', appartement_id: 'G' }, { id: 'IM', appartement_id: 'M' }];
    const b = bilan('V', its, d);
    expect(b.total).toBe(5 * h);
    expect(b.parActivite).toEqual({ trajet: 3 * h, tache: 2 * h });
    const p = b.parBien.find((x) => x.nom === 'Pasteur');
    expect(p.ms).toBe(3 * h); // 1 h de trajet + 2 h de tâche
    expect(b.parBien.find((x) => x.nom === 'Mulot').ms).toBe(h);
    expect(b.parTache).toEqual([{ tache: d.taches[0], ms: 2 * h }]);
  });
});
