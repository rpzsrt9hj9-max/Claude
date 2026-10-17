// ===== Google Sheet du catalogue <-> appli « Tâches et interventions » =====
// À coller dans le Sheet : Extensions > Apps Script (remplacer tout le contenu), puis Enregistrer.
// Menu « 🔄 Appli » dans le Sheet : saisir la clé (créée dans l'appli : Plus > Google Sheet du catalogue),
// puis « Synchroniser maintenant ». Rien ne se fait sans clic.
// Ce fichier est généré par scripts/make-apps-script.mjs : ne pas le modifier à la main.

const SUPABASE_URL = 'https://fuaokqhgspgzzdklhvtn.supabase.co';
const SUPABASE_CLE_PUBLIQUE = 'sb_publishable_lLUE3Ifwu_XBNh09BZryVw_uvfWNIKC'; // clé publique du projet (la même que dans l'appli)

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

// ===== Logique de synchronisation (générée depuis shared/sheet.js) =====
var Synchro = (function(exports) {
	Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
	var defaultCumul = (type) => type !== "outillage" && type !== "accessoire";
	var accessoireId = (articleId, accessoireIdValue) => `${articleId}~${accessoireIdValue}`;
	var stockId = (articleId, lieuId) => `${articleId}~${lieuId ?? "sans-lieu"}`;
	function uuid() {
		if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
		return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
			const r = Math.random() * 16 | 0;
			return (c === "x" ? r : r & 3 | 8).toString(16);
		});
	}
	//#endregion
	//#region shared/match.js
	/** Minuscules, sans accents, ponctuation remplacée par des espaces. */
	function normalize(s) {
		return (s ?? "").toString().normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/ø/g, "o").replace(/œ/g, "oe").replace(/æ/g, "ae").replace(/[^a-z0-9]+/g, " ").trim();
	}
	function singular(token) {
		if (token.length > 3 && /[sx]$/.test(token) && !/\d/.test(token)) return token.slice(0, -1);
		return token;
	}
	/** Clé de comparaison : normalisée, au singulier, sans espaces (« 12 v » == « 12V »). */
	function nameKey(s) {
		return normalize(s).split(" ").map(singular).join("");
	}
	//#endregion
	//#region shared/sheet.js
	var COLONNES = [
		"ID",
		"Nom",
		"Type",
		"Lieu",
		"Catégorie",
		"Unité",
		"À acheter",
		"Stock",
		"Items à proposer",
		"Notes",
		"Utilisé dans",
		"Modifié le"
	];
	var COL = Object.fromEntries(COLONNES.map((c, i) => [c, i]));
	var TYPES_SHEET = {
		outillage: "Outillage",
		accessoire: "Accessoire",
		consommable: "Consommable",
		materiel: "Matériel"
	};
	/** « outil », « Outillage », « conso », « matériaux »… -> code du type, sinon null. */
	function lireType(texte) {
		const k = nameKey(texte);
		if (!k) return null;
		if (k.startsWith("out")) return "outillage";
		if (k.startsWith("acc") || k.startsWith("bat")) return "accessoire";
		if (k.startsWith("con")) return "consommable";
		if (k.startsWith("mat")) return "materiel";
		return null;
	}
	var texte = (v) => v == null ? "" : String(v).trim();
	var nombre = (v) => {
		if (v === "" || v == null) return null;
		const n = typeof v === "number" ? v : Number(String(v).replace(",", ".").replace(/\s/g, ""));
		return Number.isFinite(n) ? n : null;
	};
	var booleen = (v) => v === true || /^(true|vrai|oui|x|1)$/i.test(texte(v));
	/** « Batterie 18V ×2; Chargeur » -> [{ nom, quantite }] */
	function lireItems(v) {
		return texte(v).split(/[;\n]/).map((s) => s.trim()).filter(Boolean).map((s) => {
			const m = s.match(/^(.*?)\s*[×x*]\s*(\d+(?:[.,]\d+)?)$/i);
			return m && m[1] ? {
				nom: m[1].trim(),
				quantite: Number(m[2].replace(",", "."))
			} : {
				nom: s,
				quantite: 1
			};
		});
	}
	var ecrireItems = (items) => items.map((i) => i.quantite === 1 ? i.nom : `${i.nom} ×${String(i.quantite).replace(".", ",")}`).join("; ");
	/** Une ligne du Sheet (tableau de cellules) -> champs lus. */
	function lireLigne(cellules) {
		const c = (nom) => cellules[COL[nom]];
		return {
			id: texte(c("ID")),
			nom: texte(c("Nom")),
			typeTexte: texte(c("Type")),
			type: lireType(c("Type")),
			lieu: texte(c("Lieu")),
			categorie: texte(c("Catégorie")),
			unite: texte(c("Unité")),
			aAcheter: booleen(c("À acheter")),
			stock: nombre(c("Stock")),
			items: lireItems(c("Items à proposer")),
			notes: texte(c("Notes"))
		};
	}
	/** Empreinte des champs modifiables : sert à savoir qui a changé (Sheet ou appli) depuis la dernière synchro. */
	function signature(f) {
		return JSON.stringify([
			f.nom,
			f.type,
			nameKey(f.lieu),
			nameKey(f.categorie),
			f.unite,
			!!f.aAcheter,
			f.stock,
			f.items.map((i) => `${nameKey(i.nom)}×${i.quantite}`).sort(),
			f.notes
		]);
	}
	var vivants = (l) => (l || []).filter((x) => !x.deleted);
	/** Index pratique de l'état du serveur. */
	function indexer(srv) {
		const parId = (t) => new Map(vivants(srv[t]).map((x) => [x.id, x]));
		return {
			articles: parId("articles"),
			lieux: parId("lieux"),
			categories: parId("categories")
		};
	}
	function stockDe(articleId, srv) {
		const l = vivants(srv.stocks).filter((s) => s.article_id === articleId);
		return l.length ? l.reduce((t, s) => t + (Number(s.quantite) || 0), 0) : null;
	}
	/** Champs d'un article du serveur, dans la même forme que lireLigne. */
	function champsServeur(a, srv) {
		const ix = indexer(srv);
		const items = vivants(srv.article_accessoires).filter((x) => x.article_id === a.id && ix.articles.has(x.accessoire_id)).map((x) => ({
			nom: ix.articles.get(x.accessoire_id).nom,
			quantite: Number(x.quantite) || 1
		})).sort((x, y) => x.nom.localeCompare(y.nom, "fr"));
		return {
			id: a.id,
			nom: texte(a.nom),
			type: a.type || "materiel",
			typeTexte: TYPES_SHEET[a.type] ?? "",
			lieu: ix.lieux.get(a.lieu_id)?.nom ?? "",
			categorie: ix.categories.get(a.categorie_id)?.nom ?? "",
			unite: texte(a.unite),
			aAcheter: !!a.a_acheter,
			stock: stockDe(a.id, srv),
			items,
			notes: texte(a.notes)
		};
	}
	var dateCourte = (ms) => {
		if (!ms) return "";
		const d = new Date(Number(ms));
		const z = (n) => String(n).padStart(2, "0");
		return `${z(d.getDate())}/${z(d.getMonth() + 1)}/${d.getFullYear()} ${z(d.getHours())}:${z(d.getMinutes())}`;
	};
	/** Cellules d'une ligne du Sheet pour un article du serveur. */
	function ligneDepuisServeur(a, srv) {
		const f = champsServeur(a, srv);
		const u = srv.usages?.[a.id];
		return [
			f.id,
			f.nom,
			TYPES_SHEET[f.type] ?? f.type,
			f.lieu,
			f.categorie,
			f.unite,
			f.aAcheter,
			f.stock ?? "",
			ecrireItems(f.items),
			f.notes,
			u ? `${u.n} tâche${u.n > 1 ? "s" : ""}` : "",
			dateCourte(a.updated_at)
		];
	}
	/**
	* Prépare une synchronisation.
	* serveur : { articles, lieux, categories, article_accessoires, stocks, usages: { [articleId]: { n, titres } } }
	* lignes : cellules du Sheet (sans l'en-tête) ; etat : { [id]: signature à la dernière synchro }
	* supprimerUtilises : supprimer aussi les articles déjà utilisés dans des tâches (après confirmation).
	* Renvoie { writes, lignes, etat, journal, bloquees } ; bloquees = suppressions d'articles utilisés, non faites.
	*/
	function planSynchro({ serveur, lignes, etat = {}, maintenant = Date.now(), nouvelId = uuid, supprimerUtilises = false }) {
		const srv = {
			articles: vivants(serveur.articles).map((x) => ({ ...x })),
			lieux: vivants(serveur.lieux).map((x) => ({ ...x })),
			categories: vivants(serveur.categories).map((x) => ({ ...x })),
			article_accessoires: vivants(serveur.article_accessoires).map((x) => ({ ...x })),
			stocks: vivants(serveur.stocks).map((x) => ({ ...x })),
			usages: serveur.usages || {}
		};
		const writes = [];
		const journal = [];
		const note = (action, nom, detail = "") => journal.push({
			action,
			nom,
			detail
		});
		const ecrire = (table, row) => {
			const liste = srv[table];
			const i = liste.findIndex((x) => x.id === row.id);
			const complet = {
				...i >= 0 ? liste[i] : {
					created_at: maintenant,
					deleted: false
				},
				...row,
				updated_at: maintenant
			};
			writes.push({
				table,
				row: complet
			});
			if (complet.deleted) {
				if (i >= 0) liste.splice(i, 1);
			} else if (i >= 0) liste[i] = complet;
			else liste.push(complet);
			return complet;
		};
		const articleParId = (id) => srv.articles.find((a) => a.id === id);
		const articleParNom = (nom) => srv.articles.find((a) => nameKey(a.nom) === nameKey(nom));
		const refParNom = (table, nom, quoi) => {
			if (!nom) return null;
			const ex = srv[table].find((x) => nameKey(x.nom) === nameKey(nom));
			if (ex) return ex.id;
			const r = ecrire(table, {
				id: nouvelId(),
				nom
			});
			note(`${quoi} créé${quoi === "Catégorie" ? "e" : ""}`, nom);
			return r.id;
		};
		const fixerStockSrv = (articleId, lieuId, quantite) => {
			const cible = stockId(articleId, lieuId);
			for (const s of srv.stocks.filter((x) => x.article_id === articleId && (quantite == null || x.id !== cible))) ecrire("stocks", {
				id: s.id,
				deleted: true
			});
			if (quantite != null) ecrire("stocks", {
				id: cible,
				article_id: articleId,
				lieu_id: lieuId ?? null,
				quantite,
				deleted: false
			});
		};
		/** Envoie les champs d'une ligne du Sheet vers l'article (création si besoin), sans les items. */
		const pousser = (f, existant) => {
			let type = f.type;
			if (!type) {
				type = existant?.type || "materiel";
				if (f.typeTexte) note("Type non reconnu", f.nom, `« ${f.typeTexte} » : ${TYPES_SHEET[type]} gardé`);
			}
			const row = {
				id: existant?.id ?? nouvelId(),
				nom: f.nom,
				type,
				lieu_id: refParNom("lieux", f.lieu, "Lieu"),
				categorie_id: refParNom("categories", f.categorie, "Catégorie"),
				unite: f.unite || null,
				a_acheter: f.aAcheter,
				notes: f.notes || null,
				deleted: false
			};
			if (!existant || existant.type !== type) row.cumul_quantites = defaultCumul(type);
			if (!existant) row.achete_le = null;
			const stockAvant = existant ? stockDe(existant.id, srv) : null;
			const a = ecrire("articles", row);
			if (stockAvant !== f.stock || existant && existant.lieu_id !== a.lieu_id && stockAvant != null) fixerStockSrv(a.id, a.lieu_id, f.stock);
			note(existant ? "Modifié" : "Ajouté", f.nom);
			return a;
		};
		/** Items à proposer d'une ligne : ajoute, retire ou change les quantités. */
		const pousserItems = (article, items) => {
			const voulus = /* @__PURE__ */ new Map();
			for (const it of items) {
				const cible = articleParNom(it.nom);
				if (!cible) {
					note("Item inconnu", article.nom, `« ${it.nom} » n'existe pas dans le catalogue : ignoré`);
					continue;
				}
				if (cible.id !== article.id) voulus.set(cible.id, it.quantite);
			}
			const actuels = srv.article_accessoires.filter((x) => x.article_id === article.id);
			for (const x of actuels) if (!voulus.has(x.accessoire_id)) ecrire("article_accessoires", {
				id: x.id,
				deleted: true
			});
			for (const [accId, q] of voulus) {
				const x = actuels.find((y) => y.accessoire_id === accId);
				if (!x || Number(x.quantite) !== q) ecrire("article_accessoires", {
					id: x?.id ?? accessoireId(article.id, accId),
					article_id: article.id,
					accessoire_id: accId,
					quantite: q,
					deleted: false
				});
			}
		};
		const lus = [];
		const idsVus = /* @__PURE__ */ new Set();
		for (const cellules of lignes) {
			const f = lireLigne(cellules);
			if (!f.nom) continue;
			if (f.id && idsVus.has(f.id)) f.id = "";
			if (f.id) idsVus.add(f.id);
			lus.push(f);
		}
		const ordre = [];
		const itemsAPousser = [];
		const serveurInitial = new Map(srv.articles.map((a) => [a.id, a]));
		for (const f of lus) {
			const s = f.id ? serveurInitial.get(f.id) : null;
			const dernier = f.id ? etat[f.id] : void 0;
			if (f.id && !s) {
				if (dernier !== void 0) {
					note("Supprimé dans l'appli", f.nom, "ligne retirée du Sheet");
					continue;
				}
				f.id = "";
			}
			if (!f.id) {
				const meme = articleParNom(f.nom);
				const existant = meme && !idsVus.has(meme.id) ? meme : null;
				if (meme && !existant) note("Doublon", f.nom, "un article du même nom existe déjà : créé quand même");
				const a = pousser(f, existant);
				idsVus.add(a.id);
				ordre.push(a.id);
				itemsAPousser.push([a, f.items]);
				continue;
			}
			const sigSheet = signature(f);
			const sigSrv = signature(champsServeur(s, srv));
			ordre.push(s.id);
			if (sigSheet === sigSrv) continue;
			if (dernier !== void 0 && sigSheet === dernier) continue;
			if (dernier !== void 0 && sigSrv !== dernier) note("Conflit", f.nom, "modifié dans le Sheet et dans l'appli : le Sheet l'emporte");
			const a = pousser(f, s);
			itemsAPousser.push([a, f.items]);
		}
		for (const [a, items] of itemsAPousser) pousserItems(articleParId(a.id) ?? a, items);
		const bloquees = [];
		const ajoutsFin = [];
		for (const a of [...serveurInitial.values()]) {
			if (idsVus.has(a.id) || etat[a.id] === void 0) continue;
			const u = srv.usages[a.id];
			if (u && !supprimerUtilises) {
				bloquees.push({
					id: a.id,
					nom: a.nom,
					n: u.n,
					titres: u.titres || []
				});
				ajoutsFin.push(a.id);
				note("Non supprimé", a.nom, `utilisé dans ${u.n} tâche${u.n > 1 ? "s" : ""} : ligne remise`);
				continue;
			}
			for (const x of srv.article_accessoires.filter((y) => y.article_id === a.id || y.accessoire_id === a.id)) ecrire("article_accessoires", {
				id: x.id,
				deleted: true
			});
			for (const s of srv.stocks.filter((y) => y.article_id === a.id)) ecrire("stocks", {
				id: s.id,
				deleted: true
			});
			ecrire("articles", {
				id: a.id,
				deleted: true
			});
			note("Supprimé", a.nom, u ? `était utilisé dans ${u.n} tâche${u.n > 1 ? "s" : ""}` : "");
		}
		const nouveauxAppli = srv.articles.filter((a) => !idsVus.has(a.id) && etat[a.id] === void 0 && serveurInitial.has(a.id)).sort((x, y) => x.nom.localeCompare(y.nom, "fr"));
		for (const a of nouveauxAppli) note("Ajouté depuis l'appli", a.nom);
		const ids = [
			...ordre,
			...ajoutsFin,
			...nouveauxAppli.map((a) => a.id)
		];
		const finales = [];
		const nouvelEtat = {};
		for (const id of ids) {
			const a = articleParId(id);
			if (!a) continue;
			finales.push(ligneDepuisServeur(a, srv));
			nouvelEtat[id] = signature(champsServeur(a, srv));
		}
		return {
			writes,
			lignes: finales,
			etat: nouvelEtat,
			journal,
			bloquees
		};
	}
	//#endregion
	exports.COL = COL;
	exports.COLONNES = COLONNES;
	exports.TYPES_SHEET = TYPES_SHEET;
	exports.champsServeur = champsServeur;
	exports.ligneDepuisServeur = ligneDepuisServeur;
	exports.lireItems = lireItems;
	exports.lireLigne = lireLigne;
	exports.lireType = lireType;
	exports.planSynchro = planSynchro;
	exports.signature = signature;
	return exports;
})({});
