// ===== Google Sheet du catalogue <-> appli « Tâches et interventions » =====
// À coller dans le Sheet : Extensions > Apps Script (remplacer tout le contenu), puis Enregistrer.
// Menu « 🔄 Appli » dans le Sheet : saisir la clé (créée dans l'appli : Plus > Google Sheet du catalogue),
// puis « Synchroniser maintenant ». Rien ne se fait sans clic.
// Ce fichier est généré par scripts/make-apps-script.mjs : ne pas le modifier à la main.

const SUPABASE_URL = '__SUPABASE_URL__';
const SUPABASE_CLE_PUBLIQUE = '__SUPABASE_CLE__'; // clé publique du projet (la même que dans l'appli)

const ONGLET = 'Catalogue';
const ONGLET_JOURNAL = 'Journal';
const ONGLET_ETAT = '_synchro'; // caché : état de la dernière synchro (ne pas modifier)
const ONGLET_AIDE = "Mode d'emploi";
const LIGNES_LIBRES = 200; // lignes vides préparées (listes déroulantes, cases) sous le catalogue

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🔄 Appli')
    .addItem('Synchroniser maintenant', 'synchroniser')
    .addSeparator()
    .addItem('Saisir ou changer la clé de synchro', 'saisirCle')
    .addItem("Mode d'emploi", 'afficherAide')
    .addToUi();
}

const proprietes = () => PropertiesService.getDocumentProperties();

function saisirCle() {
  const ui = SpreadsheetApp.getUi();
  const r = ui.prompt('Clé de synchronisation', "Colle la clé créée dans l'appli (Plus > Google Sheet du catalogue) :", ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  const cle = r.getResponseText().trim();
  if (!cle) return;
  try {
    const serveur = rpc('sheet_lire', { p_cle: cle });
    proprietes().setProperty('CLE', cle);
    ui.alert('Clé enregistrée ✓', `Le catalogue de l'appli contient ${serveur.articles.length} article(s).\nLance maintenant « 🔄 Appli > Synchroniser maintenant ».`, ui.ButtonSet.OK);
  } catch (e) {
    ui.alert('Clé refusée', String(e.message || e), ui.ButtonSet.OK);
  }
}

function rpc(nom, params) {
  const rep = UrlFetchApp.fetch(`${SUPABASE_URL}/rest/v1/rpc/${nom}`, {
    method: 'post',
    contentType: 'application/json',
    headers: { apikey: SUPABASE_CLE_PUBLIQUE },
    payload: JSON.stringify(params),
    muteHttpExceptions: true,
  });
  const texte = rep.getContentText();
  if (rep.getResponseCode() >= 300) {
    let message = texte;
    try {
      message = JSON.parse(texte).message || texte;
    } catch (e) {
      // réponse non JSON : on garde le texte brut
    }
    throw new Error(message);
  }
  return texte ? JSON.parse(texte) : null;
}

function synchroniser() {
  const ui = SpreadsheetApp.getUi();
  const cle = proprietes().getProperty('CLE');
  if (!cle) {
    saisirCle();
    if (!proprietes().getProperty('CLE')) return;
    return synchroniser();
  }
  const verrou = LockService.getDocumentLock();
  if (!verrou.tryLock(20000)) {
    ui.alert('Une synchronisation est déjà en cours. Réessaie dans un instant.');
    return;
  }
  try {
    const ss = SpreadsheetApp.getActive();
    const feuille = preparerOnglets(ss);
    if (!feuille) return;
    ss.toast('Lecture du catalogue de l’appli…', 'Synchronisation', 30);
    const serveur = rpc('sheet_lire', { p_cle: cle });
    const lignes = lireLignes(feuille);
    const etat = lireEtat(ss);
    const maintenant = Date.now();
    const options = { serveur, lignes, etat, maintenant, nouvelId: () => Utilities.getUuid() };
    let plan = Synchro.planSynchro(options);
    if (plan.bloquees.length) {
      const liste = plan.bloquees
        .map((b) => `• ${b.nom} : ${b.n} tâche${b.n > 1 ? 's' : ''}${b.titres.length ? ` (${b.titres.join(', ')}${b.n > b.titres.length ? '…' : ''})` : ''}`)
        .join('\n');
      const r = ui.alert(
        'Articles utilisés dans des tâches',
        `Tu as supprimé ${plan.bloquees.length} article(s) qui servent encore dans des tâches :\n\n${liste}\n\nLes supprimer quand même ? Ils disparaîtront aussi de ces tâches.\n\n« Non » : ces lignes sont remises dans le Sheet, le reste de la synchro continue.`,
        ui.ButtonSet.YES_NO,
      );
      if (r === ui.Button.YES) plan = Synchro.planSynchro({ ...options, supprimerUtilises: true });
    }
    for (let i = 0; i < plan.writes.length; i += 400) rpc('sheet_ecrire', { p_cle: cle, p_ecritures: plan.writes.slice(i, i + 400) });
    ecrireLignes(feuille, plan.lignes, serveur);
    ecrireEtat(ss, plan.etat);
    journaliser(ss, plan.journal);
    const compte = (a) => plan.journal.filter((j) => j.action === a).length;
    const resume = [
      `${compte('Ajouté')} ajouté(s)`,
      `${compte('Modifié')} modifié(s)`,
      `${compte('Supprimé')} supprimé(s)`,
      `${compte("Ajouté depuis l'appli") + compte("Supprimé dans l'appli")} venu(s) de l'appli`,
    ].join(' · ');
    const alertes = plan.journal.filter((j) => ['Item inconnu', 'Type non reconnu', 'Conflit', 'Doublon'].includes(j.action)).length;
    ss.toast(`${resume}${alertes ? ` · ⚠️ ${alertes} remarque(s) : voir l'onglet Journal` : ''}`, 'Synchronisation terminée ✓', 10);
  } catch (e) {
    ui.alert('Synchronisation interrompue', `${e.message || e}\n\nRien n'a été perdu : corrige puis relance.`, ui.ButtonSet.OK);
  } finally {
    verrou.releaseLock();
  }
}

/** Crée les onglets s'ils manquent ; vérifie l'en-tête du catalogue. */
function preparerOnglets(ss) {
  const colonnes = Synchro.COLONNES;
  let feuille = ss.getSheetByName(ONGLET);
  if (!feuille) {
    const premiere = ss.getSheets()[0];
    const vide = premiere && premiere.getLastRow() === 0 && ss.getSheets().length === 1;
    feuille = vide ? premiere.setName(ONGLET) : ss.insertSheet(ONGLET, 0);
  }
  const entete = feuille.getRange(1, 1, 1, colonnes.length).getValues()[0];
  const ok = entete.every((v, i) => String(v).trim() === colonnes[i]);
  if (!ok) {
    if (feuille.getLastRow() > 0 && entete.some((v) => String(v).trim())) {
      SpreadsheetApp.getUi().alert(`La première ligne de l'onglet « ${ONGLET} » doit être l'en-tête :\n${colonnes.join(' | ')}\n\nRemets-la (ou supprime l'onglet pour repartir de zéro), puis relance.`);
      return null;
    }
    feuille.getRange(1, 1, 1, colonnes.length).setValues([colonnes]);
  }
  feuille.setFrozenRows(1);
  feuille.setFrozenColumns(2);
  feuille.getRange(1, 1, 1, colonnes.length).setFontWeight('bold').setBackground('#e0f2fe');
  if (!ss.getSheetByName(ONGLET_JOURNAL)) {
    const j = ss.insertSheet(ONGLET_JOURNAL);
    j.getRange(1, 1, 1, 4).setValues([['Date', 'Action', 'Article', 'Détail']]).setFontWeight('bold');
    j.setFrozenRows(1);
  }
  if (!ss.getSheetByName(ONGLET_ETAT)) {
    const e = ss.insertSheet(ONGLET_ETAT);
    e.getRange(1, 1, 1, 2).setValues([['ID', 'Empreinte (ne pas modifier)']]);
    e.hideSheet();
  }
  if (!ss.getSheetByName(ONGLET_AIDE)) ecrireAide(ss.insertSheet(ONGLET_AIDE));
  return feuille;
}

function lireLignes(feuille) {
  const n = feuille.getLastRow() - 1;
  if (n < 1) return [];
  return feuille.getRange(2, 1, n, Synchro.COLONNES.length).getValues();
}

function ecrireLignes(feuille, lignes, serveur) {
  const nbCol = Synchro.COLONNES.length;
  const total = lignes.length + LIGNES_LIBRES;
  if (feuille.getMaxRows() < total + 1) feuille.insertRowsAfter(feuille.getMaxRows(), total + 1 - feuille.getMaxRows());
  const zone = feuille.getRange(2, 1, feuille.getMaxRows() - 1, nbCol);
  zone.clearContent();
  zone.clearDataValidations();
  const col = (nom) => Synchro.COL[nom] + 1;
  const plage = (nom) => feuille.getRange(2, col(nom), total, 1);
  // Format texte avant d'écrire : Google ne transforme pas les ID ni les dates d'affichage.
  plage('ID').setNumberFormat('@');
  plage('Modifié le').setNumberFormat('@');
  if (lignes.length) feuille.getRange(2, 1, lignes.length, nbCol).setValues(lignes);

  const liste = (valeurs, strict) => SpreadsheetApp.newDataValidation().requireValueInList(valeurs, true).setAllowInvalid(!strict).build();
  plage('Type').setDataValidation(liste(['Outillage', 'Accessoire', 'Consommable', 'Matériel'], false));
  // Lieux et catégories : liste des existants, mais un nouveau nom est accepté (il sera créé).
  const noms = (table, colonne) => {
    const s = new Set(serveur[table].map((x) => x.nom).filter(Boolean));
    lignes.forEach((l) => l[Synchro.COL[colonne]] && s.add(String(l[Synchro.COL[colonne]])));
    return [...s].sort((a, b) => a.localeCompare(b, 'fr')).slice(0, 450);
  };
  const lieux = noms('lieux', 'Lieu');
  const categories = noms('categories', 'Catégorie');
  if (lieux.length) plage('Lieu').setDataValidation(liste(lieux, false));
  if (categories.length) plage('Catégorie').setDataValidation(liste(categories, false));
  plage('À acheter').insertCheckboxes();
  plage('ID').setFontColor('#94a3b8').setFontSize(8);
  plage('Utilisé dans').setFontColor('#64748b');
  plage('Modifié le').setFontColor('#64748b');
  feuille.setColumnWidth(col('ID'), 70);
  feuille.setColumnWidth(col('Nom'), 240);
  feuille.setColumnWidth(col('Items à proposer'), 240);
  feuille.setColumnWidth(col('Notes'), 200);
  // Colonnes gérées par l'appli : simple avertissement si on les modifie.
  feuille.getProtections(SpreadsheetApp.ProtectionType.RANGE).forEach((p) => p.getDescription() === 'appli' && p.remove());
  ['ID', 'Utilisé dans', 'Modifié le'].forEach((nom) => plage(nom).protect().setDescription('appli').setWarningOnly(true));
}

function lireEtat(ss) {
  const f = ss.getSheetByName(ONGLET_ETAT);
  const etat = {};
  if (!f || f.getLastRow() < 2) return etat;
  f.getRange(2, 1, f.getLastRow() - 1, 2).getValues().forEach(([id, sig]) => {
    if (id) etat[id] = String(sig);
  });
  return etat;
}

function ecrireEtat(ss, etat) {
  const f = ss.getSheetByName(ONGLET_ETAT);
  if (f.getLastRow() > 1) f.getRange(2, 1, f.getLastRow() - 1, 2).clearContent();
  const lignes = Object.keys(etat).map((id) => [id, etat[id]]);
  if (lignes.length) {
    f.getRange(2, 1, lignes.length, 2).setNumberFormat('@');
    f.getRange(2, 1, lignes.length, 2).setValues(lignes);
  }
}

function journaliser(ss, journal) {
  if (!journal.length) return;
  const f = ss.getSheetByName(ONGLET_JOURNAL);
  const quand = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm');
  f.insertRowsAfter(1, journal.length);
  f.getRange(2, 1, journal.length, 4).setValues(journal.map((j) => [quand, j.action, j.nom, j.detail]));
  if (f.getMaxRows() > 3000) f.deleteRows(3001, f.getMaxRows() - 3000);
}

const AIDE = [
  ['Google Sheet du catalogue — mode d’emploi'],
  [''],
  ['1. Une ligne = un article de l’appli. Ajoute des lignes (copier-coller en masse possible), modifie, ou supprime une ligne.'],
  ['2. Rien ne bouge tant que tu ne cliques pas sur « 🔄 Appli > Synchroniser maintenant ». La synchro marche dans les deux sens :'],
  ['   ce que tu as changé ici part dans l’appli, et ce qui a été changé dans l’appli revient ici.'],
  ['3. Supprimer une ligne supprime l’article. S’il sert encore dans une tâche, la synchro te le demande d’abord.'],
  ['   Si un article a été modifié des deux côtés, c’est le Sheet qui l’emporte (noté dans le Journal).'],
  [''],
  ['Colonnes'],
  ['• ID : rempli par l’appli. Ne pas le modifier ni le copier (une ligne copiée avec son ID devient un nouvel article).'],
  ['• Type : Outillage, Accessoire, Consommable ou Matériel (« outil », « conso », « batterie »… sont aussi compris).'],
  ['• Lieu, Catégorie : choisis dans la liste ou tape un nouveau nom : il sera créé dans l’appli.'],
  ['• À acheter : case à cocher (pastille rouge sur Catalogue dans l’appli).'],
  ['• Stock : quantité au lieu principal (vide = non suivie).'],
  ['• Items à proposer : noms d’articles existants séparés par « ; », avec « ×2 » pour une quantité. Ex. : Batterie 18V ×2; Foret 6 mm'],
  ['• Utilisé dans, Modifié le : affichés par l’appli, à titre d’information.'],
  [''],
  ['Onglet Journal : chaque synchro y note ce qui a été ajouté, modifié, supprimé, et les remarques (item inconnu, type non reconnu…).'],
  ['Onglet caché _synchro : mémoire de la dernière synchro. Ne pas le modifier.'],
  [''],
  ['Sécurité : la clé ne donne accès qu’au catalogue (pas aux tâches ni aux biens). Elle se révoque dans l’appli (Plus > Google Sheet du catalogue).'],
];

function ecrireAide(f) {
  f.getRange(1, 1, AIDE.length, 1).setValues(AIDE);
  f.getRange(1, 1).setFontWeight('bold').setFontSize(14);
  f.getRange(9, 1).setFontWeight('bold');
  f.setColumnWidth(1, 900);
}

function afficherAide() {
  const ss = SpreadsheetApp.getActive();
  let f = ss.getSheetByName(ONGLET_AIDE);
  if (!f) ecrireAide((f = ss.insertSheet(ONGLET_AIDE)));
  ss.setActiveSheet(f);
}
