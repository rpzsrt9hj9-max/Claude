const STORAGE_KEY = "notes-app-state-v1";

let state = { notes: [], docs: [] };

// Navigation en mémoire : onglet courant + note/doc ouverte + note partagée reçue
let nav = { tab: "notes", noteId: null, docId: null, shared: null };
let editingBlockId = null;
let composerTodoMode = false;
let todoFilters = { noteId: "all", hideDone: false, sort: "date" };
let journalFilters = { noteId: "all" };

const mainEl = document.getElementById("main");
const viewTitleEl = document.getElementById("view-title");
const btnBack = document.getElementById("btn-back");
const topbarActions = document.getElementById("topbar-actions");
const tabbar = document.getElementById("tabbar");
const composerEl = document.getElementById("composer");
const composerInput = document.getElementById("composer-input");
const composerSend = document.getElementById("composer-send");
const composerTodoToggle = document.getElementById("composer-todo-toggle");
const composerClock = document.getElementById("composer-clock");
const overlayEl = document.getElementById("overlay");
const toastEl = document.getElementById("toast");

/* ---------- Utilitaires ---------- */

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === "class") el.className = value;
    else if (key.startsWith("on")) el.addEventListener(key.slice(2), value);
    else if (value !== null && value !== undefined && value !== false) el.setAttribute(key, value);
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child.nodeType ? child : document.createTextNode(child));
  }
  return el;
}

const timeFmt = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" });
const dayFmt = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" });
const dayYearFmt = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const shortDateFmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function fmtTime(ts) {
  return timeFmt.format(new Date(ts));
}

function fmtDay(ts) {
  const d = new Date(ts);
  const fmt = d.getFullYear() === new Date().getFullYear() ? dayFmt : dayYearFmt;
  return fmt.format(d);
}

function fmtShort(ts) {
  return shortDateFmt.format(new Date(ts));
}

function dayKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/* ---------- Persistance ---------- */

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.notes) && Array.isArray(parsed.docs)) {
      state = parsed;
    }
  } catch {
    // état corrompu : on repart de zéro plutôt que de bloquer l'app
  }
}

function getNote(id) {
  return state.notes.find((n) => n.id === id) || null;
}

function getDoc(id) {
  return state.docs.find((d) => d.id === id) || null;
}

function findBlock(blockId) {
  for (const note of state.notes) {
    const block = note.blocks.find((b) => b.id === blockId);
    if (block) return { note, block };
  }
  return null;
}

function allBlocks() {
  const rows = [];
  for (const note of state.notes) {
    for (const block of note.blocks) {
      rows.push({ note, block });
    }
  }
  return rows;
}

/* ---------- Actions sur les données ---------- */

function createNote(title) {
  const note = {
    id: uid(),
    title: title || "Sans titre",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    blocks: [],
  };
  state.notes.unshift(note);
  saveState();
  return note;
}

function addBlocks(note, text, asTodo) {
  const now = Date.now();
  const pieces = asTodo
    ? text.split("\n").map((l) => l.trim()).filter(Boolean)
    : [text.trim()];
  let offset = 0;
  for (const piece of pieces) {
    if (!piece) continue;
    note.blocks.push({
      id: uid(),
      type: asTodo ? "todo" : "text",
      text: piece,
      checked: false,
      createdAt: now + offset,
      docIds: [],
    });
    offset += 1;
  }
  note.updatedAt = now;
  saveState();
}

function toggleTodo(blockId) {
  const found = findBlock(blockId);
  if (!found || found.block.type !== "todo") return;
  found.block.checked = !found.block.checked;
  found.note.updatedAt = Date.now();
  saveState();
  render();
}

function deleteBlock(blockId) {
  const found = findBlock(blockId);
  if (!found) return;
  found.note.blocks = found.note.blocks.filter((b) => b.id !== blockId);
  found.note.updatedAt = Date.now();
  saveState();
  render();
}

/* ---------- Navigation ---------- */

function goTab(tab) {
  nav = { tab, noteId: null, docId: null, shared: null };
  editingBlockId = null;
  if (location.hash) history.replaceState(null, "", location.pathname);
  render();
}

function openNote(noteId) {
  nav = { ...nav, noteId, docId: null };
  editingBlockId = null;
  render();
}

function openDocView(docId) {
  nav = { ...nav, tab: "docs", noteId: null, docId };
  render();
}

function goBack() {
  if (nav.shared) {
    nav.shared = null;
    history.replaceState(null, "", location.pathname);
  } else if (nav.noteId) {
    nav.noteId = null;
  } else if (nav.docId) {
    nav.docId = null;
  }
  editingBlockId = null;
  render();
}

/* ---------- Rendu global ---------- */

function render() {
  mainEl.textContent = "";
  topbarActions.textContent = "";

  const inDetail = Boolean(nav.noteId || nav.docId || nav.shared);
  btnBack.classList.toggle("hidden", !inDetail);
  tabbar.classList.toggle("hidden", Boolean(nav.noteId || nav.shared));

  const showComposer = Boolean(nav.noteId && getNote(nav.noteId));
  composerEl.classList.toggle("hidden", !showComposer);
  document.body.classList.toggle("composer-open", showComposer);

  tabbar.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === nav.tab && !inDetail);
  });

  if (nav.shared) return renderShared();
  if (nav.noteId) return renderNote();
  if (nav.docId) return renderDoc();
  if (nav.tab === "todos") return renderTodos();
  if (nav.tab === "journal") return renderJournal();
  if (nav.tab === "docs") return renderDocs();
  return renderNotesList();
}

/* ---------- Liste des notes ---------- */

function renderNotesList() {
  viewTitleEl.textContent = "Notes";

  mainEl.append(
    h("button", {
      class: "primary-btn",
      type: "button",
      onclick: () => {
        const note = createNote("");
        openNote(note.id);
        setTimeout(() => document.getElementById("note-title-input")?.focus(), 50);
      },
    }, "+ Nouvelle note")
  );

  if (state.notes.length === 0) {
    mainEl.append(h("div", { class: "empty-hint" },
      "Aucune note pour l'instant.\nCrée une note et dépose tes idées : chacune sera datée automatiquement."));
    return;
  }

  const sorted = [...state.notes].sort((a, b) => b.updatedAt - a.updatedAt);
  for (const note of sorted) {
    const pending = note.blocks.filter((b) => b.type === "todo" && !b.checked).length;
    const last = note.blocks[note.blocks.length - 1];
    mainEl.append(
      h("div", { class: "card tappable", onclick: () => openNote(note.id) },
        h("p", { class: "note-card-title" }, note.title || "Sans titre"),
        h("div", { class: "note-card-meta" },
          h("span", {}, fmtShort(note.updatedAt)),
          h("span", {}, `${note.blocks.length} entrée${note.blocks.length > 1 ? "s" : ""}`),
          pending > 0 ? h("span", { class: "badge" }, `${pending} à faire`) : null,
        ),
        last ? h("div", { class: "note-card-preview" }, last.text) : null,
      )
    );
  }
}

/* ---------- Vue d'une note ---------- */

function renderNote() {
  const note = getNote(nav.noteId);
  if (!note) {
    nav.noteId = null;
    return render();
  }

  viewTitleEl.textContent = note.title || "Sans titre";

  topbarActions.append(
    h("button", {
      class: "icon-btn accent", type: "button", "aria-label": "Partager la note",
      onclick: () => shareNote(note),
    }, "⤴"),
    h("button", {
      class: "icon-btn danger", type: "button", "aria-label": "Supprimer la note",
      onclick: () => {
        if (confirm(`Supprimer la note « ${note.title || "Sans titre"} » ?`)) {
          state.notes = state.notes.filter((n) => n.id !== note.id);
          saveState();
          goBack();
        }
      },
    }, "🗑"),
  );

  mainEl.append(
    h("input", {
      id: "note-title-input",
      class: "title-input",
      type: "text",
      value: note.title,
      placeholder: "Titre de la note (ex : Courses)",
      oninput: (e) => {
        note.title = e.target.value;
        note.updatedAt = Date.now();
        viewTitleEl.textContent = note.title || "Sans titre";
        saveState();
      },
    })
  );

  if (note.blocks.length === 0) {
    mainEl.append(h("div", { class: "empty-hint" },
      "Note vide. Écris en bas de l'écran : chaque entrée sera horodatée.\nActive ☑ pour ajouter des cases à cocher — elles remonteront dans l'onglet « À faire »."));
  }

  let lastDay = null;
  for (const block of note.blocks) {
    const key = dayKey(block.createdAt);
    if (key !== lastDay) {
      lastDay = key;
      mainEl.append(h("div", { class: "day-sep" }, fmtDay(block.createdAt)));
    }
    mainEl.append(renderBlockRow(note, block, { showNoteChip: false }));
  }
}

function renderBlockRow(note, block, { showNoteChip }) {
  if (editingBlockId === block.id) {
    return renderBlockEditor(note, block);
  }

  const chips = [];
  if (showNoteChip) {
    chips.push(h("span", { class: "chip note-chip" }, note.title || "Sans titre"));
  }
  for (const docId of block.docIds || []) {
    const doc = getDoc(docId);
    if (doc) chips.push(h("span", { class: "chip" }, doc.name));
  }

  return h("div", {
    class: `block-row${block.type === "todo" && block.checked ? " done" : ""}`,
    onclick: () => openBlockSheet(note, block),
  },
    h("span", { class: "block-time" }, fmtTime(block.createdAt)),
    block.type === "todo"
      ? h("input", {
          class: "block-check", type: "checkbox",
          ...(block.checked ? { checked: "" } : {}),
          onclick: (e) => {
            e.stopPropagation();
            toggleTodo(block.id);
          },
        })
      : null,
    h("div", { class: "block-body" },
      h("div", { class: "block-text" }, block.text),
      chips.length > 0 ? h("div", { class: "block-chips" }, chips) : null,
    ),
  );
}

function renderBlockEditor(note, block) {
  const textarea = h("textarea", { class: "block-edit", rows: 3 });
  textarea.value = block.text;
  return h("div", { class: "block-row" },
    h("span", { class: "block-time" }, fmtTime(block.createdAt)),
    h("div", { class: "block-body" },
      textarea,
      h("div", { class: "block-edit-actions" },
        h("button", {
          class: "ghost-btn", type: "button",
          onclick: () => {
            const value = textarea.value.trim();
            if (value) {
              block.text = value;
              note.updatedAt = Date.now();
              saveState();
            }
            editingBlockId = null;
            render();
          },
        }, "Enregistrer"),
        h("button", {
          class: "filter-toggle", type: "button",
          onclick: () => {
            editingBlockId = null;
            render();
          },
        }, "Annuler"),
      ),
    ),
  );
}

/* ---------- Feuille d'actions sur un bloc ---------- */

function openBlockSheet(note, block) {
  const actions = [];

  if (nav.noteId !== note.id) {
    actions.push({
      label: `Ouvrir la note « ${note.title || "Sans titre"} »`,
      class: "accent",
      onclick: () => openNote(note.id),
    });
  }

  actions.push({
    label: "📂 Associer à un document…",
    class: "accent",
    onclick: () => openDocPicker(note, block),
  });

  for (const docId of block.docIds || []) {
    const doc = getDoc(docId);
    if (doc) {
      actions.push({
        label: `Retirer du document « ${doc.name} »`,
        onclick: () => {
          block.docIds = block.docIds.filter((id) => id !== docId);
          saveState();
          render();
        },
      });
    }
  }

  actions.push({
    label: block.type === "todo" ? "Convertir en texte simple" : "☑ Convertir en case à cocher",
    onclick: () => {
      block.type = block.type === "todo" ? "text" : "todo";
      block.checked = false;
      note.updatedAt = Date.now();
      saveState();
      render();
    },
  });

  actions.push({
    label: "✏️ Modifier le texte",
    onclick: () => {
      editingBlockId = block.id;
      render();
    },
  });

  actions.push({
    label: "🗑 Supprimer cette entrée",
    class: "danger",
    onclick: () => deleteBlock(block.id),
  });

  openSheet(`Entrée du ${fmtShort(block.createdAt)}`, actions);
}

function openDocPicker(note, block) {
  const actions = state.docs.map((doc) => ({
    label: (block.docIds || []).includes(doc.id) ? `✓ ${doc.name}` : doc.name,
    onclick: () => {
      block.docIds = block.docIds || [];
      if (!block.docIds.includes(doc.id)) {
        block.docIds.push(doc.id);
        saveState();
        showToast(`Associé à « ${doc.name} »`);
      }
      render();
    },
  }));

  const input = h("input", {
    class: "sheet-input", type: "text",
    placeholder: "Nouveau document (ex : Projet Louis Blanc)",
  });

  openSheet("Associer à un document", actions, [
    input,
    h("button", {
      class: "sheet-btn accent", type: "button",
      onclick: () => {
        const name = input.value.trim();
        if (!name) return;
        const doc = { id: uid(), name, createdAt: Date.now() };
        state.docs.push(doc);
        block.docIds = block.docIds || [];
        block.docIds.push(doc.id);
        saveState();
        closeSheet();
        showToast(`Associé à « ${name} »`);
        render();
      },
    }, "+ Créer et associer"),
  ]);
}

/* ---------- À faire (page commune des cases à cocher) ---------- */

function renderTodos() {
  viewTitleEl.textContent = "À faire";

  const todos = allBlocks().filter(({ block }) => block.type === "todo");

  const noteOptions = [h("option", { value: "all" }, "Toutes les notes")];
  const seen = new Set();
  for (const { note } of todos) {
    if (!seen.has(note.id)) {
      seen.add(note.id);
      noteOptions.push(h("option", {
        value: note.id,
        ...(todoFilters.noteId === note.id ? { selected: "" } : {}),
      }, note.title || "Sans titre"));
    }
  }

  mainEl.append(
    h("div", { class: "filter-row" },
      h("select", {
        class: "filter-select",
        onchange: (e) => { todoFilters.noteId = e.target.value; render(); },
      }, noteOptions),
      h("select", {
        class: "filter-select",
        onchange: (e) => { todoFilters.sort = e.target.value; render(); },
      },
        h("option", { value: "date", ...(todoFilters.sort === "date" ? { selected: "" } : {}) }, "Trier par date"),
        h("option", { value: "note", ...(todoFilters.sort === "note" ? { selected: "" } : {}) }, "Trier par note"),
      ),
      h("button", {
        class: `filter-toggle${todoFilters.hideDone ? " active" : ""}`, type: "button",
        onclick: () => { todoFilters.hideDone = !todoFilters.hideDone; render(); },
      }, todoFilters.hideDone ? "Faites masquées" : "Masquer les faites"),
    )
  );

  let rows = todos;
  if (todoFilters.noteId !== "all") {
    rows = rows.filter(({ note }) => note.id === todoFilters.noteId);
  }
  if (todoFilters.hideDone) {
    rows = rows.filter(({ block }) => !block.checked);
  }

  rows.sort((a, b) => {
    if (a.block.checked !== b.block.checked) return a.block.checked ? 1 : -1;
    if (todoFilters.sort === "note") {
      const cmp = (a.note.title || "").localeCompare(b.note.title || "", "fr");
      if (cmp !== 0) return cmp;
    }
    return b.block.createdAt - a.block.createdAt;
  });

  if (rows.length === 0) {
    mainEl.append(h("div", { class: "empty-hint" },
      "Aucune case à cocher.\nDans une note, active le mode ☑ du composeur : chaque ligne devient une tâche qui apparaît ici, sous la forme « Note : tâche »."));
    return;
  }

  for (const { note, block } of rows) {
    mainEl.append(
      h("div", { class: `todo-row${block.checked ? " done" : ""}` },
        h("input", {
          class: "block-check", type: "checkbox",
          ...(block.checked ? { checked: "" } : {}),
          onclick: () => toggleTodo(block.id),
        }),
        h("div", {
          class: "todo-label",
          onclick: () => openNote(note.id),
        },
          h("span", { class: "todo-note" }, `${note.title || "Sans titre"} : `),
          block.text,
          h("div", { class: "todo-meta" }, fmtShort(block.createdAt)),
        ),
      )
    );
  }
}

/* ---------- Journal (chronologie globale) ---------- */

function renderJournal() {
  viewTitleEl.textContent = "Journal";

  const rows = allBlocks();

  const noteOptions = [h("option", { value: "all" }, "Toutes les notes")];
  for (const note of state.notes) {
    noteOptions.push(h("option", {
      value: note.id,
      ...(journalFilters.noteId === note.id ? { selected: "" } : {}),
    }, note.title || "Sans titre"));
  }

  mainEl.append(
    h("div", { class: "filter-row" },
      h("select", {
        class: "filter-select",
        onchange: (e) => { journalFilters.noteId = e.target.value; render(); },
      }, noteOptions),
    )
  );

  let filtered = rows;
  if (journalFilters.noteId !== "all") {
    filtered = filtered.filter(({ note }) => note.id === journalFilters.noteId);
  }

  if (filtered.length === 0) {
    mainEl.append(h("div", { class: "empty-hint" },
      "Le journal est vide.\nTout ce que tu déposes dans n'importe quelle note apparaît ici, dans l'ordre chronologique, avec sa date et son heure."));
    return;
  }

  // Jours du plus récent au plus ancien ; à l'intérieur d'un jour, du matin au soir
  filtered.sort((a, b) => a.block.createdAt - b.block.createdAt);
  const byDay = new Map();
  for (const row of filtered) {
    const key = dayKey(row.block.createdAt);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(row);
  }

  const days = [...byDay.values()].reverse();
  for (const dayRows of days) {
    mainEl.append(h("div", { class: "day-sep" }, fmtDay(dayRows[0].block.createdAt)));
    for (const { note, block } of dayRows) {
      mainEl.append(renderBlockRow(note, block, { showNoteChip: true }));
    }
  }
}

/* ---------- Documents (sous-ensembles) ---------- */

function renderDocs() {
  viewTitleEl.textContent = "Documents";

  mainEl.append(
    h("button", {
      class: "primary-btn", type: "button",
      onclick: () => {
        const name = prompt("Nom du document (ex : Projet Louis Blanc)");
        if (!name || !name.trim()) return;
        state.docs.push({ id: uid(), name: name.trim(), createdAt: Date.now() });
        saveState();
        render();
      },
    }, "+ Nouveau document")
  );

  if (state.docs.length === 0) {
    mainEl.append(h("div", { class: "empty-hint" },
      "Aucun document.\nUn document regroupe des entrées venant de n'importe quelles notes : touche une entrée puis « Associer à un document »."));
    return;
  }

  for (const doc of state.docs) {
    const count = allBlocks().filter(({ block }) => (block.docIds || []).includes(doc.id)).length;
    mainEl.append(
      h("div", { class: "card tappable", onclick: () => openDocView(doc.id) },
        h("p", { class: "note-card-title" }, doc.name),
        h("div", { class: "note-card-meta" },
          h("span", {}, `${count} entrée${count > 1 ? "s" : ""} associée${count > 1 ? "s" : ""}`),
        ),
      )
    );
  }
}

function renderDoc() {
  const doc = getDoc(nav.docId);
  if (!doc) {
    nav.docId = null;
    return render();
  }

  viewTitleEl.textContent = doc.name;

  topbarActions.append(
    h("button", {
      class: "icon-btn danger", type: "button", "aria-label": "Supprimer le document",
      onclick: () => {
        if (!confirm(`Supprimer le document « ${doc.name} » ? Les entrées resteront dans leurs notes.`)) return;
        for (const { block } of allBlocks()) {
          block.docIds = (block.docIds || []).filter((id) => id !== doc.id);
        }
        state.docs = state.docs.filter((d) => d.id !== doc.id);
        saveState();
        goBack();
      },
    }, "🗑"),
  );

  const rows = allBlocks()
    .filter(({ block }) => (block.docIds || []).includes(doc.id))
    .sort((a, b) => a.block.createdAt - b.block.createdAt);

  if (rows.length === 0) {
    mainEl.append(h("div", { class: "empty-hint" },
      "Aucune entrée associée à ce document pour l'instant.\nDans une note ou dans le journal, touche une entrée puis « Associer à un document »."));
    return;
  }

  let lastDay = null;
  for (const { note, block } of rows) {
    const key = dayKey(block.createdAt);
    if (key !== lastDay) {
      lastDay = key;
      mainEl.append(h("div", { class: "day-sep" }, fmtDay(block.createdAt)));
    }
    mainEl.append(renderBlockRow(note, block, { showNoteChip: true }));
  }
}

/* ---------- Partage ---------- */

function encodeShare(note) {
  const payload = {
    v: 1,
    title: note.title,
    createdAt: note.createdAt,
    blocks: note.blocks.map((b) => ({
      type: b.type, text: b.text, checked: b.checked, createdAt: b.createdAt,
    })),
  };
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const b64 = btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${location.origin}${location.pathname}#partage=${b64}`;
}

function decodeShare(encoded) {
  const b64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(b64);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  const payload = JSON.parse(new TextDecoder().decode(bytes));
  if (!payload || typeof payload.title !== "string" || !Array.isArray(payload.blocks)) {
    throw new Error("format invalide");
  }
  return payload;
}

async function shareNote(note) {
  const url = encodeShare(note);
  const title = note.title || "Note partagée";
  if (navigator.share) {
    try {
      await navigator.share({ title, url });
      return;
    } catch {
      // partage annulé ou indisponible : on retombe sur la copie
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    showToast("Lien de partage copié 📋");
  } catch {
    prompt("Copie ce lien de partage :", url);
  }
}

function checkSharedHash() {
  const match = location.hash.match(/^#partage=(.+)$/);
  if (!match) return false;
  try {
    nav.shared = decodeShare(match[1]);
    return true;
  } catch {
    history.replaceState(null, "", location.pathname);
    showToast("Lien de partage illisible");
    return false;
  }
}

function renderShared() {
  const shared = nav.shared;
  viewTitleEl.textContent = shared.title || "Note partagée";

  mainEl.append(
    h("div", { class: "shared-banner" },
      "Note partagée avec toi, en lecture seule. Tu peux l'importer dans tes notes pour la modifier."),
    h("button", {
      class: "primary-btn", type: "button",
      onclick: () => {
        const note = {
          id: uid(),
          title: shared.title || "Note importée",
          createdAt: shared.createdAt || Date.now(),
          updatedAt: Date.now(),
          blocks: shared.blocks.map((b) => ({
            id: uid(),
            type: b.type === "todo" ? "todo" : "text",
            text: String(b.text ?? ""),
            checked: Boolean(b.checked),
            createdAt: Number(b.createdAt) || Date.now(),
            docIds: [],
          })),
        };
        state.notes.unshift(note);
        saveState();
        nav.shared = null;
        history.replaceState(null, "", location.pathname);
        showToast("Note importée ✓");
        openNote(note.id);
      },
    }, "Importer dans mes notes"),
  );

  let lastDay = null;
  for (const block of shared.blocks) {
    const key = dayKey(block.createdAt);
    if (key !== lastDay) {
      lastDay = key;
      mainEl.append(h("div", { class: "day-sep" }, fmtDay(block.createdAt)));
    }
    mainEl.append(
      h("div", { class: `block-row${block.type === "todo" && block.checked ? " done" : ""}` },
        h("span", { class: "block-time" }, fmtTime(block.createdAt)),
        block.type === "todo"
          ? h("input", { class: "block-check", type: "checkbox", disabled: "", ...(block.checked ? { checked: "" } : {}) })
          : null,
        h("div", { class: "block-body" }, h("div", { class: "block-text" }, String(block.text ?? ""))),
      )
    );
  }
}

/* ---------- Feuille d'actions générique ---------- */

function openSheet(title, actions, extraNodes = []) {
  overlayEl.textContent = "";
  overlayEl.classList.remove("hidden");
  const sheet = h("div", { class: "sheet" },
    h("p", { class: "sheet-title" }, title),
    actions.map((action) =>
      h("button", {
        class: `sheet-btn${action.class ? ` ${action.class}` : ""}`,
        type: "button",
        onclick: () => {
          closeSheet();
          action.onclick();
        },
      }, action.label)
    ),
    extraNodes,
  );
  sheet.addEventListener("click", (e) => e.stopPropagation());
  overlayEl.append(sheet);
}

function closeSheet() {
  overlayEl.classList.add("hidden");
  overlayEl.textContent = "";
}

overlayEl.addEventListener("click", closeSheet);

/* ---------- Toast ---------- */

let toastTimer = null;

function showToast(message) {
  toastEl.textContent = message;
  toastEl.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.add("hidden"), 2200);
}

/* ---------- Composeur ---------- */

function updateComposerClock() {
  composerClock.textContent = shortDateFmt.format(new Date());
}

function submitComposer() {
  const note = getNote(nav.noteId);
  const text = composerInput.value;
  if (!note || !text.trim()) return;
  addBlocks(note, text, composerTodoMode);
  composerInput.value = "";
  composerInput.style.height = "auto";
  render();
  window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
  composerInput.focus();
}

composerSend.addEventListener("click", submitComposer);

composerInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey && !composerTodoMode) {
    e.preventDefault();
    submitComposer();
  }
});

composerInput.addEventListener("input", () => {
  composerInput.style.height = "auto";
  composerInput.style.height = `${Math.min(composerInput.scrollHeight, 120)}px`;
});

composerTodoToggle.addEventListener("click", () => {
  composerTodoMode = !composerTodoMode;
  composerTodoToggle.classList.toggle("active", composerTodoMode);
  composerInput.placeholder = composerTodoMode
    ? "Une tâche par ligne…"
    : "Dépose une idée…";
  composerInput.focus();
});

/* ---------- Barre d'onglets & retour ---------- */

tabbar.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => goTab(btn.dataset.tab));
});

btnBack.addEventListener("click", goBack);

window.addEventListener("hashchange", () => {
  if (checkSharedHash()) render();
});

/* ---------- Démarrage ---------- */

loadState();
checkSharedHash();
render();
updateComposerClock();
setInterval(updateComposerClock, 15000);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      const reg = await navigator.serviceWorker.register("service-worker.js", {
        updateViaCache: "none",
      });

      reg.addEventListener("updatefound", () => {
        const newWorker = reg.installing;
        newWorker?.addEventListener("statechange", () => {
          if (newWorker.state === "activated") {
            window.location.reload();
          }
        });
      });

      reg.update();
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") {
          reg.update();
        }
      });
    } catch {
      // service worker indisponible, l'app fonctionne sans cache hors ligne
    }
  });

  let hasReloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (hasReloaded) return;
    hasReloaded = true;
    window.location.reload();
  });
}
