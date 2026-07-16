# Ordliste Passphrase Web Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Spectre.Console TUI with a static web page that generates Norwegian passphrases and lets the user browse the word lists.

**Architecture:** Plain HTML/CSS/JS, no build step and no runtime dependencies. Pure logic (random selection, phrase generation, entropy, filtering) lives in a DOM-free ES module `passphrase.js` so it can be unit-tested under Node's built-in test runner; `app.js` handles all DOM wiring, `fetch`, and rendering. The three `ordliste/*.txt` files are loaded once via `fetch` and shared by both page sections. Served over HTTP (GitHub Pages / `python -m http.server`).

**Tech Stack:** HTML5, CSS3, ES modules, Web Crypto API (`crypto.getRandomValues`), async Clipboard API. Tests use Node's built-in `node:test` + `node:assert` (Node 26 already installed) — no package.json, no dependencies.

## Global Constraints

- No build step, no bundler, no package manager, no framework — page is directly servable static files.
- Page runtime has **zero** third-party dependencies.
- Word selection MUST use `crypto.getRandomValues` (unbiased), never `Math.random`.
- UI copy is in Norwegian (bokmål), matching the existing TUI voice.
- Word-list files are plain UTF-8, one lowercase word per line, in `ordliste/` at the repo root; they are loaded via `fetch`, never inlined.
- Word-browser rendering is capped at 300 results (`RENDER_CAP = 300`).
- Antall-ord valid range is 2–20, default 6.
- Files live at the repo root: `index.html`, `styles.css`, `app.js`, `passphrase.js`; tests in `test/`.
- `passphrase.js` must be free of any DOM/`window`/`document` reference so it imports cleanly in Node.

---

## File Structure

- `passphrase.js` (create) — pure logic: `randomInt`, `generatePhrase`, `calcEntropyBits`, `filterWords`, `Pattern`. No DOM. ES module exports.
- `test/passphrase.test.js` (create) — Node unit tests for `passphrase.js`.
- `index.html` (create) — page markup; loads `app.js` as `<script type="module">`.
- `styles.css` (create) — hand-written styling.
- `app.js` (create) — DOM wiring: fetch lists, generator section, browser section, error handling. Imports from `passphrase.js`.
- `readme.md` (modify) — replace the "TUI" section with web-page usage.
- `Ordliste.Tui/` (delete) — `WordData.fs`, `Passphrase.fs`, `Pipeline.fs`, `Program.fs`, `Ordliste.Tui.fsproj`.
- `.gitignore` (modify) — the `bin/`/`obj/` lines become irrelevant once the TUI is gone; leaving them is harmless, so this file needs no change unless noted.

---

### Task 1: Pure generation logic (`randomInt` + `generatePhrase`)

**Files:**
- Create: `passphrase.js`
- Test: `test/passphrase.test.js`

**Interfaces:**
- Consumes: nothing (uses global `crypto`).
- Produces:
  - `Pattern` — object `{ AdjektivSubstantiv: "adjektiv-substantiv", Fritt: "fritt" }`.
  - `randomInt(max: number): number` — unbiased integer in `[0, max)`; throws if `max` is not a positive integer.
  - `generatePhrase(pattern: string, wordCount: number, lists: {adjektiv: string[], substantiv: string[], verb: string[]}): string` — space-separated phrase. `AdjektivSubstantiv` alternates adjektiv (even index) / substantiv (odd index); `Fritt` draws from the concatenation of all three lists.

- [ ] **Step 1: Write the failing test**

Create `test/passphrase.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomInt, generatePhrase, Pattern } from "../passphrase.js";

test("randomInt returns integers within [0, max)", () => {
  for (let i = 0; i < 1000; i++) {
    const n = randomInt(3);
    assert.ok(Number.isInteger(n));
    assert.ok(n >= 0 && n < 3, `out of range: ${n}`);
  }
});

test("randomInt covers the whole range over many draws", () => {
  const seen = new Set();
  for (let i = 0; i < 1000; i++) seen.add(randomInt(3));
  assert.deepEqual([...seen].sort(), [0, 1, 2]);
});

test("randomInt rejects non-positive or non-integer max", () => {
  assert.throws(() => randomInt(0));
  assert.throws(() => randomInt(-1));
  assert.throws(() => randomInt(2.5));
});

const fixture = {
  adjektiv: ["A1", "A2"],
  substantiv: ["S1", "S2"],
  verb: ["V1"],
};

test("generatePhrase produces the requested number of words", () => {
  const phrase = generatePhrase(Pattern.Fritt, 4, fixture);
  assert.equal(phrase.split(" ").length, 4);
});

test("AdjektivSubstantiv alternates adjektiv (even) and substantiv (odd)", () => {
  const words = generatePhrase(Pattern.AdjektivSubstantiv, 6, fixture).split(" ");
  words.forEach((w, i) => {
    if (i % 2 === 0) assert.ok(fixture.adjektiv.includes(w), `pos ${i} not adjektiv: ${w}`);
    else assert.ok(fixture.substantiv.includes(w), `pos ${i} not substantiv: ${w}`);
  });
});

test("Fritt draws only from the union of all three lists", () => {
  const union = new Set([...fixture.adjektiv, ...fixture.substantiv, ...fixture.verb]);
  const words = generatePhrase(Pattern.Fritt, 20, fixture).split(" ");
  words.forEach((w) => assert.ok(union.has(w), `unexpected word: ${w}`));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test`
Expected: FAIL — cannot find module `../passphrase.js` (or import error).

- [ ] **Step 3: Write minimal implementation**

Create `passphrase.js`:

```js
// passphrase.js — pure, DOM-free logic for the ordliste web page.
// Uses the Web Crypto API, available in browsers and in Node >= 20 via
// the global `crypto` object.

/** Pattern identifiers used by generatePhrase / calcEntropyBits. */
export const Pattern = {
  AdjektivSubstantiv: "adjektiv-substantiv",
  Fritt: "fritt",
};

/**
 * Cryptographically-random integer in [0, max), unbiased via rejection
 * sampling. Throws for non-positive or non-integer max.
 */
export function randomInt(max) {
  if (!Number.isInteger(max) || max <= 0) {
    throw new Error("max must be a positive integer");
  }
  // Reject the biased tail: largest multiple of max below 2^32.
  const limit = Math.floor(0x100000000 / max) * max;
  const buf = new Uint32Array(1);
  let x;
  do {
    crypto.getRandomValues(buf);
    x = buf[0];
  } while (x >= limit);
  return x % max;
}

/** Pick a random element from a non-empty array. */
function pick(arr) {
  return arr[randomInt(arr.length)];
}

/**
 * Generate a space-separated passphrase.
 * lists = { adjektiv: string[], substantiv: string[], verb: string[] }
 */
export function generatePhrase(pattern, wordCount, lists) {
  const alle = lists.adjektiv.concat(lists.substantiv, lists.verb);
  const words = [];
  for (let i = 0; i < wordCount; i++) {
    if (pattern === Pattern.AdjektivSubstantiv) {
      words.push(i % 2 === 0 ? pick(lists.adjektiv) : pick(lists.substantiv));
    } else {
      words.push(pick(alle));
    }
  }
  return words.join(" ");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test`
Expected: PASS — all tests in this file green.

- [ ] **Step 5: Commit**

```bash
git add passphrase.js test/passphrase.test.js
git commit -m "Add crypto-based passphrase generation logic"
```

---

### Task 2: Entropy and filter helpers (`calcEntropyBits` + `filterWords`)

**Files:**
- Modify: `passphrase.js`
- Test: `test/passphrase.test.js`

**Interfaces:**
- Consumes: `Pattern` from Task 1.
- Produces:
  - `calcEntropyBits(pattern: string, wordCount: number, lists): number` — approximate entropy in bits, rounded. Per-position pool: `Fritt` uses `|adjektiv|+|substantiv|+|verb|`; `AdjektivSubstantiv` uses `|adjektiv|` on even positions, `|substantiv|` on odd. Sum of `log2(pool)`, then `Math.round`.
  - `filterWords(words: string[], query: string): string[]` — case-insensitive substring filter; empty/whitespace query returns the input array unchanged.

- [ ] **Step 1: Write the failing test**

Append to `test/passphrase.test.js`:

```js
import { calcEntropyBits, filterWords } from "../passphrase.js";

test("calcEntropyBits sums log2(pool) per position for AdjektivSubstantiv", () => {
  // adjektiv pool 4 -> 2 bits, substantiv pool 8 -> 3 bits.
  const lists = {
    adjektiv: ["a", "b", "c", "d"],
    substantiv: ["e", "f", "g", "h", "i", "j", "k", "l"],
    verb: [],
  };
  // positions 0..3 -> adj(2)+sub(3)+adj(2)+sub(3) = 10
  assert.equal(calcEntropyBits(Pattern.AdjektivSubstantiv, 4, lists), 10);
});

test("calcEntropyBits uses the combined pool for Fritt", () => {
  // union size 8 -> 3 bits/word, 5 words -> 15
  const lists = {
    adjektiv: ["a", "b", "c", "d"],
    substantiv: ["e", "f"],
    verb: ["g", "h"],
  };
  assert.equal(calcEntropyBits(Pattern.Fritt, 5, lists), 15);
});

test("filterWords returns all words for an empty or whitespace query", () => {
  const words = ["kake", "bord", "lampe"];
  assert.deepEqual(filterWords(words, ""), words);
  assert.deepEqual(filterWords(words, "   "), words);
});

test("filterWords matches case-insensitive substrings and trims the query", () => {
  const words = ["kake", "bakke", "bord"];
  assert.deepEqual(filterWords(words, "ak"), ["kake", "bakke"]);
  assert.deepEqual(filterWords(words, "  KA  "), ["kake", "bakke"]);
  assert.deepEqual(filterWords(words, "xyz"), []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test`
Expected: FAIL — `calcEntropyBits`/`filterWords` are not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `passphrase.js`:

```js
/**
 * Approximate entropy in bits, rounded to a whole number.
 * Per-position pool size:
 *   Fritt              -> |adjektiv| + |substantiv| + |verb|
 *   AdjektivSubstantiv -> |adjektiv| on even positions, |substantiv| on odd
 */
export function calcEntropyBits(pattern, wordCount, lists) {
  const alleSize = lists.adjektiv.length + lists.substantiv.length + lists.verb.length;
  let bits = 0;
  for (let i = 0; i < wordCount; i++) {
    let pool;
    if (pattern === Pattern.AdjektivSubstantiv) {
      pool = i % 2 === 0 ? lists.adjektiv.length : lists.substantiv.length;
    } else {
      pool = alleSize;
    }
    bits += Math.log2(pool);
  }
  return Math.round(bits);
}

/** Case-insensitive substring filter. Empty/whitespace query returns all. */
export function filterWords(words, query) {
  const q = query.trim().toLowerCase();
  if (q === "") return words;
  return words.filter((w) => w.includes(q));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test`
Expected: PASS — all tests across both files green.

- [ ] **Step 5: Commit**

```bash
git add passphrase.js test/passphrase.test.js
git commit -m "Add entropy and word-filter helpers"
```

---

### Task 3: Page markup and styling (`index.html` + `styles.css`)

**Files:**
- Create: `index.html`
- Create: `styles.css`

**Interfaces:**
- Consumes: nothing yet (IDs/classes below are the contract `app.js` wires against in Tasks 4–5).
- Produces: DOM elements with these IDs — `#error` (+ `.hidden` toggling), generator: `#pattern`, `#word-count`, `#generate`, `#phrase`, `#copy`, `#copy-status`, `#entropy`; browser: `#tabs` (containing `<button class="tab" data-key="substantiv|adjektiv|verb">`), `#search`, `#count`, `#results`, `#truncated`.

- [ ] **Step 1: Create `index.html`**

```html
<!doctype html>
<html lang="nb">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Ordliste – passord-fraser</title>
    <link rel="stylesheet" href="styles.css" />
  </head>
  <body>
    <main class="container">
      <header>
        <h1>Ordliste</h1>
        <p class="tagline">Norsk ordliste – passord-fraser og ordsøk</p>
      </header>

      <div id="error" class="error hidden" role="alert"></div>

      <section class="card" id="generator">
        <h2>Generer passord-frase</h2>

        <div class="controls">
          <label>
            Mønster
            <select id="pattern">
              <option value="adjektiv-substantiv">Adjektiv + substantiv (vekselvis)</option>
              <option value="fritt">Fritt (blanding av alle ordklasser)</option>
            </select>
          </label>

          <label>
            Antall ord
            <input id="word-count" type="number" min="2" max="20" value="6" />
          </label>

          <button id="generate" type="button">Generer</button>
        </div>

        <output id="phrase" class="phrase" aria-live="polite"></output>

        <div class="phrase-actions">
          <button id="copy" type="button">Kopier</button>
          <span id="copy-status" class="copy-status" aria-live="polite"></span>
          <span id="entropy" class="entropy"></span>
        </div>
      </section>

      <section class="card" id="browser">
        <h2>Utforsk ordlistene</h2>

        <div id="tabs" class="tabs">
          <button class="tab" type="button" data-key="substantiv">Substantiv</button>
          <button class="tab" type="button" data-key="adjektiv">Adjektiv</button>
          <button class="tab" type="button" data-key="verb">Verb</button>
        </div>

        <input id="search" type="search" placeholder="Søk (delstreng) …" />
        <p id="count" class="count"></p>
        <div id="results" class="results"></div>
        <p id="truncated" class="truncated"></p>
      </section>
    </main>

    <script type="module" src="app.js"></script>
  </body>
</html>
```

- [ ] **Step 2: Create `styles.css`**

```css
:root {
  --bg: #f7f7f8;
  --card: #ffffff;
  --ink: #1c1c1e;
  --muted: #6b6b70;
  --accent: #b8860b;
  --border: #e2e2e5;
  --error-bg: #fdecec;
  --error-ink: #a12020;
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg: #17171a;
    --card: #212125;
    --ink: #f2f2f4;
    --muted: #a0a0a8;
    --accent: #e6b422;
    --border: #34343a;
    --error-bg: #3a1e1e;
    --error-ink: #ff9b9b;
  }
}

* { box-sizing: border-box; }

body {
  margin: 0;
  background: var(--bg);
  color: var(--ink);
  font: 16px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}

.container { max-width: 760px; margin: 0 auto; padding: 1.5rem; }

header { text-align: center; margin-bottom: 1.5rem; }
h1 { margin: 0; font-size: 2.5rem; letter-spacing: 0.05em; color: var(--accent); }
.tagline { margin: 0.25rem 0 0; color: var(--muted); }

.card {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 1.25rem;
  margin-bottom: 1.25rem;
}
.card h2 { margin-top: 0; font-size: 1.2rem; }

.controls { display: flex; flex-wrap: wrap; gap: 1rem; align-items: flex-end; }
label { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.85rem; color: var(--muted); }
select, input[type="number"], input[type="search"] {
  font: inherit;
  padding: 0.5rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg);
  color: var(--ink);
}
input[type="number"] { width: 6rem; }
input[type="search"] { width: 100%; margin: 0.75rem 0; }

button {
  font: inherit;
  cursor: pointer;
  padding: 0.5rem 1rem;
  border: 1px solid var(--accent);
  border-radius: 8px;
  background: var(--accent);
  color: #1c1c1e;
  font-weight: 600;
}
button:hover { filter: brightness(1.05); }

.phrase {
  display: block;
  min-height: 2.5rem;
  margin: 1rem 0;
  padding: 1rem;
  border-radius: 8px;
  background: var(--bg);
  border: 1px dashed var(--border);
  font-size: 1.3rem;
  font-weight: 600;
  color: var(--accent);
  word-break: break-word;
  text-align: center;
}

.phrase-actions { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; }
.copy-status { color: var(--accent); font-size: 0.9rem; }
.entropy { margin-left: auto; color: var(--muted); font-size: 0.9rem; }

.tabs { display: flex; gap: 0.5rem; }
.tab {
  background: transparent;
  color: var(--ink);
  border: 1px solid var(--border);
  font-weight: 500;
}
.tab.active { background: var(--accent); color: #1c1c1e; border-color: var(--accent); }

.count { color: var(--muted); font-size: 0.9rem; margin: 0.25rem 0; }
.results {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 0.25rem 1rem;
}
.results span { padding: 0.15rem 0; border-bottom: 1px solid var(--border); font-size: 0.95rem; }
.truncated { color: var(--muted); font-size: 0.85rem; font-style: italic; }

.error {
  background: var(--error-bg);
  color: var(--error-ink);
  border: 1px solid var(--error-ink);
  border-radius: 8px;
  padding: 0.75rem 1rem;
  margin-bottom: 1.25rem;
}
.hidden { display: none; }
```

- [ ] **Step 3: Verify the page renders (static, no data yet)**

Run: `python -m http.server 8000`
Then open `http://localhost:8000/` in a browser.
Expected: header, both cards, controls, tabs, and inputs are visible and styled. No JS yet, so buttons do nothing and lists are empty — that is fine at this stage.

- [ ] **Step 4: Commit**

```bash
git add index.html styles.css
git commit -m "Add web page markup and styling"
```

---

### Task 4: Data loading and generator wiring (`app.js`)

**Files:**
- Create: `app.js`

**Interfaces:**
- Consumes: `Pattern`, `generatePhrase`, `calcEntropyBits` from `passphrase.js`; DOM IDs from Task 3.
- Produces:
  - `loadLists(): Promise<{substantiv: string[], adjektiv: string[], verb: string[]}>` — fetches the three files in parallel, splits on newlines, trims, drops blanks; rejects if any fetch is not `ok`.
  - `CATEGORIES` — array of `{ key, label, file }`.
  - `RENDER_CAP` — `300`.
  - A module-level `init()` that runs on load, stores the loaded `lists`, and wires the generator. (Browser wiring is added in Task 5.)

- [ ] **Step 1: Create `app.js` with loading + generator wiring**

```js
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
```

- [ ] **Step 2: Verify generator works in the browser**

Run: `python -m http.server 8000` (from the repo root)
Open `http://localhost:8000/` and check the browser console.
Expected:
- No console errors; an initial phrase is shown on load.
- Clicking **Generer** produces a new phrase of the selected length.
- Switching **Mønster** to *Fritt* and generating produces a mixed phrase.
- Entering a word count outside 2–20 is clamped on the next generate.
- **Kopier** shows "Kopiert!" and the phrase is on the clipboard.
- The entropy readout (e.g. "≈ 80 bits") updates with count/pattern.

- [ ] **Step 3: Commit**

```bash
git add app.js
git commit -m "Add data loading and passphrase generator wiring"
```

---

### Task 5: Word-browser wiring (`app.js`)

**Files:**
- Modify: `app.js`

**Interfaces:**
- Consumes: `filterWords` from `passphrase.js`; `CATEGORIES`, `RENDER_CAP`, and the `lists` object from Task 4; DOM IDs `#tabs`, `.tab[data-key]`, `#search`, `#count`, `#results`, `#truncated`.
- Produces: `wireBrowser(lists)` — tab switching, live search filtering, capped rendering.

- [ ] **Step 1: Add the import for `filterWords`**

Change the first line of `app.js` from:

```js
import { Pattern, generatePhrase, calcEntropyBits } from "./passphrase.js";
```

to:

```js
import { generatePhrase, calcEntropyBits, filterWords } from "./passphrase.js";
```

(`Pattern` is unused in `app.js` — the `<select>` supplies the pattern string values directly.)

- [ ] **Step 2: Add `wireBrowser` above `init`**

Insert this function just before `async function init()`:

```js
function wireBrowser(lists) {
  const searchEl = $("search");
  const resultsEl = $("results");
  const countEl = $("count");
  const truncatedEl = $("truncated");
  const tabButtons = [...document.querySelectorAll("#tabs .tab")];
  let activeKey = "substantiv";

  const render = () => {
    const all = lists[activeKey];
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
```

- [ ] **Step 3: Call `wireBrowser` from `init` and drop the temporary global**

Replace the tail of `init` (from `wireGenerator(lists);` to the end of the function) with:

```js
  wireGenerator(lists);
  wireBrowser(lists);
}

init();
```

(This removes the `window.__ordliste = { lists };` line added in Task 4.)

- [ ] **Step 4: Verify the browser section in a real browser**

Run: `python -m http.server 8000`
Open `http://localhost:8000/` and check:
- Substantiv tab is active on load; the count reads "Viser 300 av 10000 ord" and "… og 9700 flere – søk for å avgrense" is shown.
- Clicking **Adjektiv** / **Verb** switches lists and updates the count.
- Typing in the search box filters live and case-insensitively; the count updates; when a filter returns ≤300 results the truncation line disappears.
- Clearing the search restores the full (capped) list.
- No console errors.

- [ ] **Step 5: Commit**

```bash
git add app.js
git commit -m "Add word-list browser wiring"
```

---

### Task 6: Remove the TUI and update the readme

**Files:**
- Delete: `Ordliste.Tui/WordData.fs`, `Ordliste.Tui/Passphrase.fs`, `Ordliste.Tui/Pipeline.fs`, `Ordliste.Tui/Program.fs`, `Ordliste.Tui/Ordliste.Tui.fsproj`
- Modify: `readme.md`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing (repository cleanup + docs).

- [ ] **Step 1: Delete the TUI project**

```bash
git rm -r Ordliste.Tui
```

Expected: git stages the removal of all five files under `Ordliste.Tui/`.

- [ ] **Step 2: Replace the "TUI" section of `readme.md`**

In `readme.md`, replace the entire section from the `## TUI` heading through the blank line before `## Generere ordlistene på nytt` with:

```markdown
## Nettside

Prosjektet har en enkel nettside for å generere passord-fraser og utforske ordlistene. Den består av statiske filer (`index.html`, `styles.css`, `app.js`, `passphrase.js`) og leser de ferdiggenererte ordlistene i `ordliste/`-mappa (`substantiv.txt`, `adjektiv.txt`, `verb.txt`).

Siden må serveres over HTTP (nettleseren blokkerer `fetch` fra `file://`). Kjør en enkel lokal server fra prosjektmappa:

```
python -m http.server 8000
```

og åpne http://localhost:8000/ i nettleseren. Siden kan også publiseres direkte med GitHub Pages (fra rota av repoet).

Med nettsiden kan du:

- generere passord-fraser med valgbart mønster (adjektiv + substantiv vekselvis, eller fritt) og antall ord, regenerere og kopiere til utklippstavla
- se et anslag for entropi (bits) for frasen
- bla i og søke/filtrere i hver ordliste

Ordfrasene genereres med nettleserens kryptografisk sikre tilfeldighetskilde (`crypto.getRandomValues`).
```

- [ ] **Step 3: Verify the readme has no remaining TUI references**

Run: `grep -in "tui\|dotnet run\|Spectre" readme.md`
Expected: no matches (empty output).

- [ ] **Step 4: Commit**

```bash
git add -A readme.md Ordliste.Tui
git commit -m "Remove Spectre.Console TUI in favour of the web page"
```

---

### Task 7: End-to-end verification

**Files:** none (verification only).

**Interfaces:**
- Consumes: the whole page.
- Produces: nothing.

- [ ] **Step 1: Run the unit tests**

Run: `node --test`
Expected: all tests pass (generation, entropy, filter).

- [ ] **Step 2: Full manual pass in a served browser**

Run: `python -m http.server 8000` from the repo root, open `http://localhost:8000/`, and confirm every item in the spec's testing section:
- lists load with no console errors;
- both mønster patterns produce sensible phrases of the requested length;
- antall-ord bounds (2–20) are enforced;
- copy works and shows "Kopiert!";
- entropy readout updates with word count and pattern;
- browser tabs, live search, "Viser X av Y ord" count, and the 300-result cap all behave.

- [ ] **Step 3: Verify the `file://` error path**

Open `index.html` directly via `file://` (e.g. drag it into a browser tab).
Expected: the red error banner appears with the Norwegian "må serveres over HTTP" message, and the controls are disabled.

- [ ] **Step 4: Confirm the TUI is gone and nothing references it**

Run: `git ls-files Ordliste.Tui` (expected: empty) and `grep -rin "Ordliste.Tui\|Spectre" --include=*.md --include=*.fsx .` (expected: empty).

No commit needed — this task only verifies.

---

## Self-Review

**Spec coverage:**
- Static page, no build step, no deps → Tasks 3–5 (plain files), Global Constraints. ✓
- Two sections (generator + browser) on one page → Tasks 3–5. ✓
- `fetch` the three static `.txt` files once, shared → Task 4 `loadLists`, passed into both `wireGenerator`/`wireBrowser`. ✓
- `file://` / fetch-failure error path → Task 4 `showError`, verified Task 7. ✓
- Generator: mønster (2 patterns), antall ord (2–20, default 6), Generer, Kopier + confirmation, entropy readout → Tasks 3–4. ✓
- `crypto.getRandomValues`, unbiased → Task 1 `randomInt`. ✓
- Browser: tabs, live substring search, "Viser X av Y ord", 300 cap + "… og N flere" → Tasks 3, 5. ✓
- Delete `Ordliste.Tui/`; update `readme.md`; `Generate.fsx` unchanged → Task 6. ✓
- Testing/verification → Task 7. ✓

**Placeholder scan:** No TBD/TODO/"add error handling"/"similar to Task N" — every code step contains full code. ✓

**Type consistency:** `Pattern`, `randomInt`, `generatePhrase`, `calcEntropyBits`, `filterWords` signatures match between `passphrase.js` (Tasks 1–2), the tests, and `app.js` (Tasks 4–5). `lists` shape `{substantiv, adjektiv, verb}` is consistent across `loadLists`, `wireGenerator`, `wireBrowser`, and `generatePhrase`/`calcEntropyBits` (which read `lists.adjektiv/.substantiv/.verb`). `CATEGORIES` keys match `lists` keys and `.tab[data-key]` values. Task 5 removes the temporary `window.__ordliste` global from Task 4. ✓

**Note on `passphrase.js` in Node:** `crypto` is available as a global in Node ≥ 20 (confirmed Node 26 installed), so `test/passphrase.test.js` runs `randomInt`/`generatePhrase` directly with no import of `node:crypto`.
