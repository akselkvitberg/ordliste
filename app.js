import { Pattern, generatePhrase, calcEntropyBits } from "./passphrase.js";

export const CATEGORIES = [
  { key: "substantiv", label: "Substantiv", file: "ordliste/substantiv.txt" },
  { key: "adjektiv", label: "Adjektiv", file: "ordliste/adjektiv.txt" },
  { key: "verb", label: "Verb", file: "ordliste/verb.txt" },
];

export const RENDER_CAP = 300;

/** Fetch all three lists in parallel and return them keyed by category. */
export async function loadLists() {
  const entries = await Promise.all(
    CATEGORIES.map(async (c) => {
      const res = await fetch(c.file);
      if (!res.ok) throw new Error(`${c.file}: HTTP ${res.status}`);
      const text = await res.text();
      const words = text
        .split(/\r?\n/)
        .map((w) => w.trim())
        .filter((w) => w !== "");
      return [c.key, words];
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

async function init() {
  let lists;
  try {
    lists = await loadLists();
  } catch {
    showError();
    return;
  }
  wireGenerator(lists);
  // Browser section wired in Task 5.
  window.__ordliste = { lists }; // exposed for the browser wiring in Task 5
}

init();
