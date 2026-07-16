# Ordliste passphrase web page — design

**Date:** 2026-07-16
**Status:** Approved (pending spec review)

## Purpose

Replace the Spectre.Console TUI (`Ordliste.Tui/`) with a static web page that
generates Norwegian passphrases from the generated word lists and lets the user
browse those lists. The page is plain HTML/CSS/JS with no build step and no
runtime dependencies, served over HTTP (e.g. GitHub Pages).

## Scope

In scope:

- A single web page with two sections: a passphrase generator and a word-list
  browser.
- Loading the existing `ordliste/*.txt` files as static files via `fetch()`.
- Deleting the `Ordliste.Tui/` project.
- Updating `readme.md` to describe the web page and how to serve it.

Out of scope:

- Regenerating the word lists (still done by `Generate.fsx`, unchanged).
- Any server-side code, framework, bundler, or package manager.
- Offline/`file://` support (the page requires being served over HTTP).

## File layout

Served from the repo root so relative paths to `ordliste/` resolve directly:

```
index.html        the page markup
styles.css        styling
app.js            logic: fetch lists, generate, copy, browse
ordliste/
  substantiv.txt  ~10 000 words (unchanged)
  adjektiv.txt    ~10 000 words (unchanged)
  verb.txt        ~5 000 words  (unchanged)
```

The word-list files are plain UTF-8, one lowercase word per line.

## Data loading

- On page load, `app.js` issues three parallel `fetch()` requests for the
  `.txt` files, splits each response on newlines, and trims empty trailing
  lines into three string arrays held in memory.
- Both sections (generator and browser) share these arrays — the lists are
  fetched exactly once.
- If any fetch fails (missing file, or the page was opened via `file://`),
  the page shows a clear Norwegian error explaining it must be served over
  HTTP, and both sections are disabled.

## Section 1 — Generer passord-frase

UI (Norwegian):

- **Mønster** selector with four options:
  - *Adjektiv + substantiv (vekselvis)* — alternates: even positions draw
    from adjektiv, odd positions from substantiv.
  - *Adjektiver + ett substantiv* — the first (N−1) words are adjektiv and the
    last word is a substantiv (e.g. 6 words → 5 adjektiv + 1 substantiv).
  - *Adjektiv + substantiv + verb* — cycles adjektiv → substantiv → verb,
    repeating, across the N positions.
  - *Fritt (blanding av alle ordklasser)* — draws from all three lists
    concatenated.
- **Antall ord** — number input, default 6, valid range 2–20.
- **Generer**-button — produces a phrase (space-separated words) and displays
  it prominently.
- **Kopier**-button — copies the current phrase via the async Clipboard API,
  showing a brief "Kopiert!" confirmation; on failure shows a fallback message.
- **Strength readout** — approximate entropy shown as e.g. "≈ 80 bits",
  computed as the sum over positions of `log2(poolSize)`, where `poolSize`
  is the pool the word at that position is drawn from (for *vekselvis*,
  `|adjektiv|` on even positions and `|substantiv|` on odd; for *fritt*, the
  combined pool size at every position). Rounded to a whole number of bits.

Generation logic:

- Word selection uses `crypto.getRandomValues` (via a small unbiased
  `randomInt(max)` helper using rejection sampling), **not** `Math.random`.
  This is a deliberate improvement over the TUI, which used .NET's
  non-cryptographic `System.Random`.
- Regenerating (clicking **Generer** again) reuses the current mønster and
  antall-ord settings.

## Section 2 — Utforsk ordlistene

- **Provenance text**: a short always-visible paragraph explaining where the
  word lists come from and how they were calculated (Norsk Ordbank filtered to
  4–9-letter words without proper nouns or blacklisted words, ranked by
  Språkbanken N-gram frequency; sources credited CC-BY).
- **Reveal toggle**: the tabs/search/results are wrapped in a container that
  starts hidden. A **Se ordliste** button reveals it and becomes **Skjul
  ordliste** (toggling `aria-expanded`).
- **Kategori-faner**: Substantiv / Adjektiv / Verb. Selecting a tab shows that
  list.
- **Søkefelt**: a text input that filters the active list as the user types,
  using a lowercase substring match (`word.includes(query)`), mirroring the
  TUI filter.
- **Results**: rendered as a responsive multi-column grid of words, with a
  "Viser X av Y ord" count above it.
- **Render cap**: at most 300 matches are rendered at a time to keep typing
  responsive without a virtualization library. When results are truncated, a
  line reads "… og N flere — søk for å avgrense".
- Uses the arrays already fetched for the generator; no additional requests.

## Styling

- `styles.css`, hand-written, no framework.
- Clean, legible, responsive layout that works on mobile and desktop.
- Light/dark friendly is a nice-to-have, not required.

## Repository changes

- Delete the `Ordliste.Tui/` directory (all four `.fs` files and the
  `.fsproj`).
- Update `readme.md`: describe the web page, how to serve it locally
  (`python -m http.server` or similar), and note GitHub Pages as the intended
  host. Remove TUI-specific instructions.
- `.gitignore` keeps ignoring `bin/` and `obj/` (harmless once the TUI is
  gone) and the large source-data CSV/txt files.
- `Generate.fsx` is unchanged.

## Testing / verification

- Serve the repo root over HTTP locally and load `index.html` in a browser.
- Verify: lists load (no console errors); both mønster patterns produce
  sensible phrases of the requested length; antall-ord bounds are enforced;
  copy works; strength readout updates with word count/pattern; the browser
  tabs, search filter, count, and render cap all behave.
- Verify the `file://` error path shows the HTTP message.

## Open questions

None.
