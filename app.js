import {
  generatePhrase,
  calcEntropyBits,
  filterWords,
  parseSubstantiv,
  parseAdjektiv,
  parseVerb,
} from "./passphrase.js";

export const CATEGORIES = [
  { key: "substantiv", label: "Substantiv", file: "ordliste/substantiv.txt", parse: parseSubstantiv },
  { key: "adjektiv", label: "Adjektiv", file: "ordliste/adjektiv.txt", parse: parseAdjektiv },
  { key: "verb", label: "Verb", file: "ordliste/verb.txt", parse: parseVerb },
];

export const RENDER_CAP = 300;

/** Fetch all three lists in parallel and return them keyed by category. */
export async function loadLists() {
  const entries = await Promise.all(
    CATEGORIES.map(async (c) => {
      const res = await fetch(c.file);
      if (!res.ok) throw new Error(`${c.file}: HTTP ${res.status}`);
      return [c.key, c.parse(await res.text())];
    })
  );
  return Object.fromEntries(entries);
}

const $ = (id) => document.getElementById(id);

function showError() {
  const el = $("error");
  el.textContent =
    "Klarte ikke å laste ordlistene. Siden må serveres over HTTP " +
    "(f.eks. «python -m http.server» eller GitHub Pages), ikke åpnes " +
    "direkte som en fil.";
  el.classList.remove("hidden");
  ["pattern", "word-count", "generate", "copy", "search"].forEach((id) => {
    const c = $(id);
    if (c) c.disabled = true;
  });
  document.querySelectorAll("#tabs .tab").forEach((b) => (b.disabled = true));
}

function wireGenerator(lists) {
  const patternEl = $("pattern");
  const countEl = $("word-count");
  const phraseEl = $("phrase");
  const entropyEl = $("entropy");
  let current = "";

  const clampCount = () => {
    let n = parseInt(countEl.value, 10);
    if (Number.isNaN(n)) n = 6;
    n = Math.min(20, Math.max(2, n));
    countEl.value = String(n);
    return n;
  };

  const generate = () => {
    const pattern = patternEl.value;
    const count = clampCount();
    current = generatePhrase(pattern, count, lists);
    phraseEl.textContent = current;
    entropyEl.textContent = `≈ ${calcEntropyBits(pattern, count, lists)} bits`;
    $("copy-status").textContent = "";
  };

  $("generate").addEventListener("click", generate);

  $("copy").addEventListener("click", async () => {
    if (!current) return;
    try {
      await navigator.clipboard.writeText(current);
      $("copy-status").textContent = "Kopiert!";
    } catch {
      $("copy-status").textContent = "Kunne ikke kopiere.";
    }
    setTimeout(() => ($("copy-status").textContent = ""), 1500);
  });

  generate(); // show an initial phrase
}

function wireBrowser(lists) {
  const searchEl = $("search");
  const resultsEl = $("results");
  const countEl = $("count");
  const truncatedEl = $("truncated");
  const tabButtons = [...document.querySelectorAll("#tabs .tab")];
  let activeKey = "substantiv";

  // Visningsstrenger for ordliste-fanen: substantiv med kjønn, adjektiv med
  // begge former (én form når de er like, f.eks. "moderne"). Søket treffer
  // dermed begge adjektivformene.
  const displayLists = {
    substantiv: lists.substantiv.map((s) => `${s.ord} (${s.kjonn})`),
    adjektiv: lists.adjektiv.map((a) => (a.mf === a.noyt ? a.mf : `${a.mf} / ${a.noyt}`)),
    verb: lists.verb,
  };

  const render = () => {
    const all = displayLists[activeKey];
    const filtered = filterWords(all, searchEl.value);
    const shown = filtered.slice(0, RENDER_CAP);

    const frag = document.createDocumentFragment();
    for (const w of shown) {
      const span = document.createElement("span");
      span.textContent = w;
      frag.appendChild(span);
    }
    resultsEl.replaceChildren(frag);

    countEl.textContent = `Viser ${shown.length} av ${filtered.length} ord`;
    truncatedEl.textContent =
      filtered.length > RENDER_CAP
        ? `… og ${filtered.length - RENDER_CAP} flere – søk for å avgrense`
        : "";
  };

  tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      activeKey = btn.dataset.key;
      tabButtons.forEach((b) => b.classList.toggle("active", b === btn));
      render();
    });
  });

  searchEl.addEventListener("input", render);

  // Activate the first tab and do the initial render.
  tabButtons[0].classList.add("active");
  render();
}

function wireToggleList() {
  const btn = $("toggle-list");
  const content = $("browser-content");
  btn.addEventListener("click", () => {
    const hidden = content.classList.toggle("hidden");
    btn.textContent = hidden ? "Se ordliste" : "Skjul ordliste";
    btn.setAttribute("aria-expanded", String(!hidden));
  });
}

async function init() {
  let lists;
  try {
    lists = await loadLists();
  } catch {
    showError();
    return;
  }
  wireGenerator(lists);
  wireBrowser(lists);
  wireToggleList();
}

init();
