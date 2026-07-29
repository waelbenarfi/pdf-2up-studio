/* ===================== 2-up Studio ===================== */
const $ = (id) => document.getElementById(id);

const state = {
  source: null,        // { id, name, pages, ratios, thumbs, sources: [...], ... }
  first: null,         // { id, name, thumb }
  manualRemoved: new Set(),
  manualKept: new Set(),
  job: null,
};
/* state.source.sources = les PDF envoyes, dans l'ordre d'assemblage :
   [{ file, name, pages, start }] ou `start` est l'index de leur premiere page
   dans le document fusionne. Le reste de l'application ne voit qu'un seul
   document : l'assemblage est fait par le serveur. */

const MM_TO_PT = 72 / 25.4;

/* ------------------------- utilitaires ------------------------- */
function toast(message, kind = "err", ms = 5200) {
  const el = document.createElement("div");
  el.className = "toast " + kind;
  el.textContent = message;
  $("toasts").appendChild(el);
  setTimeout(() => el.remove(), ms);
}

function show(el, visible) {
  el.classList.toggle("hidden", !visible);
}

function showView(name) {
  show($("emptyState"), name === "empty");
  show($("loadingState"), name === "loading");
  show($("pagesView"), name === "pages");
  show($("resultView"), name === "result");
}

/* seuil de detection : courbe douce de 0 % a 2 % d'encre */
function threshold() {
  const v = +$("sensitivity").value / 100;
  return v * v * 0.02;
}

/* ------------------------- envoi de fichiers ------------------------- */
function uploadFiles(files, kind, appendTo) {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    Array.from(files).forEach((file) => form.append("file", file));
    form.append("kind", kind);
    if (appendTo) form.append("appendTo", appendTo);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/upload");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && kind === "source") {
        const pct = Math.round((e.loaded / e.total) * 100);
        const what = files.length > 1 ? `${files.length} fichiers` : "du fichier";
        $("loadingText").textContent = pct < 100
          ? `Envoi ${what}… ${pct} %`
          : "Assemblage et analyse des pages…";
      }
    };
    xhr.onload = () => {
      let data = {};
      try { data = JSON.parse(xhr.responseText); } catch (_) { data = {}; }
      if (xhr.status === 200 && data.ok) resolve(data);
      else reject(new Error(data.error || `Erreur serveur (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("Connexion au serveur perdue."));
    xhr.send(form);
  });
}

/* Un PDF deja charge ? les suivants s'ajoutent a la liste au lieu de la
   remplacer : le serveur les colle bout a bout dans un seul document. */
async function handleSource(files) {
  const pdfs = Array.from(files).filter((f) => /\.pdf$/i.test(f.name));
  if (!pdfs.length) {
    toast("Aucun PDF dans la sélection : les documents source doivent être des PDF.");
    return;
  }
  const previous = state.source;
  const appendTo = previous ? previous.id : null;

  showView("loading");
  $("loadingText").textContent = "Envoi…";
  try {
    const data = await uploadFiles(pdfs, "source", appendTo);
    if (previous && previous.id !== data.id) discard(previous.id);
    applySource(data);
    showView("pages");
    if (appendTo) {
      toast(`${pdfs.length} document${pdfs.length > 1 ? "s" : ""} ajouté${
        pdfs.length > 1 ? "s" : ""} · ${data.pages} pages au total`, "ok");
    }
    if (!data.landscape) {
      toast("Ce PDF n'est pas en paysage : la mise en 2-up reste possible, "
          + "mais les pages seront très réduites.", "err", 7000);
    }
  } catch (err) {
    toast(err.message);
    showView(previous ? "pages" : "empty");
  }
}

/* Applique un document de travail (nouveau, complete ou reordonne). Les choix
   manuels de pages sont remis a zero : les numeros de page ont bouge. */
function applySource(data) {
  state.source = data;
  state.manualRemoved.clear();
  state.manualKept.clear();
  state.job = null;
  show($("dropSource"), false);
  show($("infoSource"), true);
  renderSources();
  buildGrid();
  updateGenerate();
}

/* ------------------------- liste des PDF source ------------------------- */
function renderSources() {
  const list = $("sourceList");
  const items = state.source.sources || [];
  list.innerHTML = "";

  items.forEach((s, i) => {
    const li = document.createElement("li");
    li.className = "fitem";
    li.dataset.file = s.file;
    li.innerHTML =
      `<span class="fnum">${i + 1}</span>` +
      `<div class="finfo"><strong></strong>` +
      `<span>${s.pages} page${s.pages > 1 ? "s" : ""} · ` +
      `p. ${s.start + 1}–${s.start + s.pages}</span></div>` +
      `<button class="icon-btn tiny" data-act="up" title="Monter"${i === 0 ? " disabled" : ""}>↑</button>` +
      `<button class="icon-btn tiny" data-act="down" title="Descendre"${
        i === items.length - 1 ? " disabled" : ""}>↓</button>` +
      `<button class="icon-btn tiny danger" data-act="del" title="Retirer ce document">×</button>`;
    li.querySelector("strong").textContent = s.name;
    list.appendChild(li);
  });

  const d = state.source;
  $("srcMeta").textContent =
    `${items.length} document${items.length > 1 ? "s" : ""} · ${d.pages} pages · ` +
    `${d.sizeMb} Mo · ${Math.round(d.width)} × ${Math.round(d.height)} pt ` +
    `(${d.landscape ? "paysage" : "portrait"})`;
}

/* Reordonne / retire un PDF de la liste sans rien renvoyer : le serveur garde
   les fichiers d'origine et refabrique le document assemble. */
async function arrangeSources(order) {
  showView("loading");
  $("loadingText").textContent = "Assemblage des documents…";
  try {
    const res = await fetch("/api/arrange", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceId: state.source.id, order }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || "Assemblage impossible.");
    applySource(data);
  } catch (err) {
    toast(err.message);
  }
  showView("pages");
}

async function handleFirst(files) {
  try {
    const data = await uploadFiles([files[0]], "first");
    if (state.first) discard(state.first.id);
    state.first = data;
    $("firstName").textContent = data.name;
    $("firstMeta").textContent = `${data.sizeMb} Mo · remplace la page 1`;
    $("firstThumb").src = data.thumbs[0] || "";
    show($("dropFirst"), false);
    show($("infoFirst"), true);
    show($("modeField"), true);
    updateCoverField();
    refresh();
  } catch (err) {
    toast(err.message);
  }
}

function discard(id) {
  if (!id) return;
  fetch("/api/discard", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  }).catch(() => {});
}

/* ------------------------- grille de pages ------------------------- */
function buildGrid() {
  const grid = $("pagesGrid");
  grid.innerHTML = "";

  /* separateur en tete de chaque PDF quand il y en a plusieurs */
  const items = state.source.sources || [];
  const starts = new Map();
  if (items.length > 1) items.forEach((s) => starts.set(s.start, s));

  state.source.thumbs.forEach((src, i) => {
    const group = starts.get(i);
    if (group) {
      const sep = document.createElement("div");
      sep.className = "grp-sep";
      sep.innerHTML = `<b></b><span>${group.pages} page${group.pages > 1 ? "s" : ""}</span>`;
      sep.querySelector("b").textContent = group.name;
      grid.appendChild(sep);
    }
    const card = document.createElement("div");
    card.className = "pcard";
    card.dataset.index = i;
    card.innerHTML =
      `<img src="${src}" alt="page ${i + 1}" loading="lazy">` +
      `<div class="cap"><b>Page ${i + 1}</b><span class="tag"></span></div>`;
    card.addEventListener("click", () => toggle(i));
    grid.appendChild(card);
  });
  refresh();
}

function autoEmpty(i) {
  return state.source.ratios[i] < threshold();
}

function isReplaced(i) {
  return i === 0 && !!state.first;
}

function isRemoved(i) {
  if (state.manualRemoved.has(i)) return true;
  if (state.manualKept.has(i)) return false;
  return isReplaced(i) || autoEmpty(i);
}

function toggle(i) {
  if (isRemoved(i)) {
    state.manualRemoved.delete(i);
    state.manualKept.add(i);
  } else {
    state.manualKept.delete(i);
    state.manualRemoved.add(i);
  }
  refresh();
}

function refresh() {
  if (!state.source) return;
  let removed = 0;
  /* la grille contient aussi des separateurs : on cible les vignettes et on
     lit leur vrai numero de page dans data-index */
  $("pagesGrid").querySelectorAll(".pcard").forEach((card) => {
    const i = +card.dataset.index;
    const gone = isRemoved(i);
    if (gone) removed++;
    card.classList.toggle("removed", gone);

    const tag = card.querySelector(".tag");
    tag.className = "tag";
    if (isReplaced(i)) { tag.textContent = "remplacée"; tag.classList.add("repl"); }
    else if (autoEmpty(i)) { tag.textContent = "vide"; tag.classList.add("empty"); }
    else { tag.textContent = ""; }
    card.title = `Encre détectée : ${(state.source.ratios[i] * 100).toFixed(3)} %`;
  });

  const total = state.source.pages;
  const kept = total - removed;
  const inline = state.first && document.querySelector('input[name="mode"]:checked').value === "inline";
  const cover = state.first && !inline;
  const sheets = Math.ceil((kept + (inline ? 1 : 0)) / 2) + (cover ? 1 : 0);

  $("pillTotal").textContent = `${total} pages`;
  $("pillRemoved").textContent = `${removed} supprimées`;
  $("pillKept").textContent = `${kept} gardées`;
  $("pillSheets").textContent = `${sheets} feuille${sheets > 1 ? "s" : ""} en sortie`;
  $("sensVal").textContent = (threshold() * 100).toFixed(2).replace(".", ",") + " %";
  updateGenerate();
}

function updateGenerate() {
  const ready = !!state.source;
  $("btnGenerate").disabled = !ready;
  $("genHint").textContent = ready
    ? "Tout est traité sur votre machine, rien n'est envoyé sur internet."
    : "Chargez d'abord un PDF paysage.";
}

/* ------------------------- generation ------------------------- */
async function generate() {
  if (!state.source) return;
  const removed = [];
  for (let i = 0; i < state.source.pages; i++) if (isRemoved(i)) removed.push(i);

  const btn = $("btnGenerate");
  btn.disabled = true;
  btn.querySelector(".btn-label").textContent = "Génération…";
  show(btn.querySelector(".spinner"), true);

  const payload = {
    sourceId: state.source.id,
    firstId: state.first ? state.first.id : null,
    removed,
    pageSize: $("pageSize").value,
    customSize: [ +$("customW").value * MM_TO_PT, +$("customH").value * MM_TO_PT ],
    outerMargin: +$("outerMargin").value,
    middleGap: +$("middleGap").value,
    coverMargin: +$("coverMargin").value,
    mode: document.querySelector('input[name="mode"]:checked').value,
  };

  try {
    const res = await fetch("/api/process", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || "Génération impossible.");
    if (state.job) discard(state.job.jobId);
    state.job = data;
    renderResult(data);
    showView("result");
    toast("PDF généré : " + data.fileName, "ok");
  } catch (err) {
    toast(err.message);
  } finally {
    btn.disabled = false;
    btn.querySelector(".btn-label").textContent = "Générer le PDF";
    show(btn.querySelector(".spinner"), false);
  }
}

function renderResult(data) {
  $("resultLine").textContent =
    `${data.fileName} · ${data.sizeMb} Mo · ` +
    `feuille ${Math.round(data.page_width)} × ${Math.round(data.page_height)} pt`;

  const stats = [
    [data.source_pages, "pages d'origine"],
    [data.removed_pages.length, "pages supprimées"],
    [data.kept_pages, "pages conservées"],
    [data.output_pages, "feuilles portrait"],
  ];
  $("resultStats").innerHTML = stats
    .map(([n, label]) => `<div class="stat"><b>${n}</b><span>${label}</span></div>`)
    .join("");

  $("btnDownload").href = "/api/download/" + data.jobId;
  $("btnDownload").setAttribute("download", data.fileName);

  const more = data.output_pages - data.previewCount;
  $("resultGrid").innerHTML =
    data.thumbs.map((src, i) =>
      `<div class="pcard"><img src="${src}" alt="feuille ${i + 1}">` +
      `<div class="cap"><b>Feuille ${i + 1}</b></div></div>`).join("") +
    (more > 0 ? `<div class="pcard" style="display:grid;place-items:center;min-height:150px">
        <div class="cap">+ ${more} autre${more > 1 ? "s" : ""}</div></div>` : "");
}

function resetAll() {
  [state.source, state.first, state.job].forEach((o) => o && discard(o.id || o.jobId));
  state.source = state.first = state.job = null;
  state.manualRemoved.clear();
  state.manualKept.clear();
  $("sourceList").innerHTML = "";
  show($("dropSource"), true); show($("infoSource"), false);
  show($("dropFirst"), true); show($("infoFirst"), false);
  show($("modeField"), false); show($("coverField"), false);
  $("fileSource").value = ""; $("fileFirst").value = "";
  showView("empty");
  updateGenerate();
}

/* ------------------------- branchements ------------------------- */
function wireDrop(zone, input, handler) {
  zone.addEventListener("click", () => input.click());
  zone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.click(); }
  });
  input.addEventListener("change", () => {
    if (input.files.length) handler(input.files);
    input.value = "";           // permet de reprendre le meme fichier ensuite
  });
  ["dragenter", "dragover"].forEach((ev) =>
    zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.add("over"); }));
  ["dragleave", "drop"].forEach((ev) =>
    zone.addEventListener(ev, () => zone.classList.remove("over")));
  zone.addEventListener("drop", (e) => {
    e.preventDefault();
    if (e.dataTransfer.files.length) handler(e.dataTransfer.files);
  });
}

function updateCoverField() {
  const mode = document.querySelector('input[name="mode"]:checked').value;
  show($("coverField"), !!state.first && mode === "cover");
}

wireDrop($("dropSource"), $("fileSource"), handleSource);
wireDrop($("dropFirst"), $("fileFirst"), handleFirst);

/* depot n'importe ou sur la page = PDF source (ajoutes a la liste si un
   document est deja charge) */
["dragover", "drop"].forEach((ev) =>
  window.addEventListener(ev, (e) => e.preventDefault()));
window.addEventListener("drop", (e) => {
  if (e.target.closest && e.target.closest(".drop")) return;  // zone deja gereee
  const files = e.dataTransfer ? Array.from(e.dataTransfer.files) : [];
  if (files.some((f) => /\.pdf$/i.test(f.name))) handleSource(files);
});

/* liste des PDF source : monter, descendre, retirer */
$("btnAddMore").addEventListener("click", () => $("fileSource").click());
$("sourceList").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-act]");
  if (!btn) return;
  const order = (state.source.sources || []).map((s) => s.file);
  const index = order.indexOf(btn.closest(".fitem").dataset.file);
  if (index < 0) return;

  if (btn.dataset.act === "del") {
    if (order.length === 1) { resetAll(); return; }
    order.splice(index, 1);
  } else {
    const target = index + (btn.dataset.act === "up" ? -1 : 1);
    if (target < 0 || target >= order.length) return;
    [order[index], order[target]] = [order[target], order[index]];
  }
  arrangeSources(order);
});

document.querySelectorAll("[data-remove]").forEach((btn) =>
  btn.addEventListener("click", () => {
    if (btn.dataset.remove === "source") { resetAll(); return; }
    discard(state.first && state.first.id);
    state.first = null;
    $("fileFirst").value = "";
    show($("dropFirst"), true); show($("infoFirst"), false);
    show($("modeField"), false); show($("coverField"), false);
    refresh();
  }));

$("sensitivity").addEventListener("input", refresh);
$("btnAuto").addEventListener("click", () => {
  state.manualRemoved.clear(); state.manualKept.clear(); refresh();
});
$("btnKeepAll").addEventListener("click", () => {
  state.manualRemoved.clear();
  state.manualKept = new Set(Array.from({ length: state.source.pages }, (_, i) => i));
  refresh();
});

$("pageSize").addEventListener("change", () =>
  show($("customField"), $("pageSize").value === "custom"));
$("outerMargin").addEventListener("input", (e) => $("outerVal").textContent = e.target.value + " pt");
$("middleGap").addEventListener("input", (e) => $("gapVal").textContent = e.target.value + " pt");
$("coverMargin").addEventListener("input", (e) => $("coverVal").textContent = e.target.value + " pt");
document.querySelectorAll('input[name="mode"]').forEach((r) =>
  r.addEventListener("change", () => { updateCoverField(); refresh(); }));

$("btnGenerate").addEventListener("click", generate);
$("btnBack").addEventListener("click", () => showView("pages"));
$("btnReset").addEventListener("click", resetAll);

/* theme clair / sombre */
const savedTheme = localStorage.getItem("twoup-theme");
if (savedTheme) document.documentElement.dataset.theme = savedTheme;
$("themeBtn").addEventListener("click", () => {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  localStorage.setItem("twoup-theme", next);
});
