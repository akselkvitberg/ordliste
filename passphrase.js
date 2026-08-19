// passphrase.js — pure, DOM-free logic for the ordliste web page.
// Uses the Web Crypto API, available in browsers and in Node >= 20 via
// the global `crypto` object.

/** Pattern identifiers used by generatePhrase / calcEntropyBits. */
export const Pattern = {
  AdjektivSubstantiv: "adjektiv-substantiv",
  AdjektiverSubstantiv: "adjektiver-substantiv",
  AdjektivSubstantivVerb: "adjektiv-substantiv-verb",
  SubstantivVerb: "substantiv-verb",
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

/** Throw if `pattern` is not one of the known Pattern values. */
function assertKnownPattern(pattern) {
  if (!Object.values(Pattern).includes(pattern)) {
    throw new Error(`Ukjent mønster: ${pattern}`);
  }
}

/**
 * The combined pool of every word class, used by the Fritt pattern.
 * Adjectives contribute their m/f form only, so the pool size (and the
 * entropy) stays |adjektiv| + |substantiv| + |verb|.
 */
function concatAll(lists) {
  return lists.adjektiv
    .map((a) => a.mf)
    .concat(lists.substantiv.map((s) => s.ord), lists.verb);
}

/**
 * The word class a given position draws from, for every pattern except
 * Fritt (which draws from the combined pool). Shared by generatePhrase
 * (picks a word) and calcEntropyBits (measures the pool).
 *   AdjektivSubstantiv     -> adjektiv on even positions, substantiv on odd
 *   AdjektiverSubstantiv   -> adjektiv everywhere except the last position (substantiv)
 *   AdjektivSubstantivVerb -> adjektiv, substantiv, verb, repeating
 *   SubstantivVerb         -> substantiv on even positions, verb on odd
 */
function classForPosition(pattern, i, wordCount) {
  switch (pattern) {
    case Pattern.AdjektivSubstantiv:
      return i % 2 === 0 ? "adjektiv" : "substantiv";
    case Pattern.AdjektiverSubstantiv:
      return i < wordCount - 1 ? "adjektiv" : "substantiv";
    case Pattern.AdjektivSubstantivVerb:
      return ["adjektiv", "substantiv", "verb"][i % 3];
    case Pattern.SubstantivVerb:
      return i % 2 === 0 ? "substantiv" : "verb";
  }
}

/**
 * Generate a space-separated passphrase.
 * lists = {
 *   adjektiv: {mf, noyt}[],
 *   substantiv: {ord, kjonn}[],   // kjonn: "m" | "f" | "n"
 *   verb: string[],
 * }
 */
export function generatePhrase(pattern, wordCount, lists) {
  assertKnownPattern(pattern);
  if (pattern === Pattern.Fritt) {
    const alle = concatAll(lists);
    return Array.from({ length: wordCount }, () => pick(alle)).join(" ");
  }
  const classes = [];
  const picks = [];
  for (let i = 0; i < wordCount; i++) {
    const cls = classForPosition(pattern, i, wordCount);
    classes.push(cls);
    picks.push(pick(lists[cls]));
  }
  // Et adjektiv bøyes etter det nærmeste etterfølgende substantivet i
  // frasen; uten etterfølgende substantiv brukes m/f-formen. Formvalget er
  // deterministisk gitt substantivet og bidrar derfor ikke med entropi.
  const words = picks.map((item, i) => {
    switch (classes[i]) {
      case "substantiv":
        return item.ord;
      case "verb":
        return item;
      default: {
        const next = classes.findIndex((c, k) => k > i && c === "substantiv");
        const neuter = next !== -1 && picks[next].kjonn === "n";
        return neuter ? item.noyt : item.mf;
      }
    }
  });
  return words.join(" ");
}

/**
 * Approximate entropy in bits, rounded to a whole number. Sums log2 of the
 * pool size at each position, so it matches how generatePhrase samples:
 *   Fritt -> |adjektiv| + |substantiv| + |verb| at every position
 *   others -> the per-position pool from classForPosition
 */
export function calcEntropyBits(pattern, wordCount, lists) {
  assertKnownPattern(pattern);
  const alleSize = lists.adjektiv.length + lists.substantiv.length + lists.verb.length;
  let bits = 0;
  for (let i = 0; i < wordCount; i++) {
    const pool =
      pattern === Pattern.Fritt
        ? alleSize
        : lists[classForPosition(pattern, i, wordCount)].length;
    bits += Math.log2(pool);
  }
  return Math.round(bits);
}

/** Case-insensitive substring filter. Empty/whitespace query returns all. */
export function filterWords(words, query) {
  const q = query.trim().toLowerCase();
  if (q === "") return words;
  return words.filter((w) => w.toLowerCase().includes(q));
}

/** Non-empty, trimmed lines from a text blob (handles CRLF). */
function nonEmptyLines(text) {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== "");
}

/** Parse verb.txt: one presens form per line. */
export function parseVerb(text) {
  return nonEmptyLines(text);
}

/**
 * Parse substantiv.txt: `ord<TAB>kjønn` per line, kjønn in {m, f, n}.
 * Malformed lines are silently skipped.
 */
export function parseSubstantiv(text) {
  return nonEmptyLines(text)
    .map((l) => l.split("\t"))
    .filter((p) => p.length === 2 && p[0] !== "" && ["m", "f", "n"].includes(p[1]))
    .map(([ord, kjonn]) => ({ ord, kjonn }));
}

/**
 * Parse adjektiv.txt: `m/f-form<TAB>nøytrumsform` per line.
 * Malformed lines are silently skipped.
 */
export function parseAdjektiv(text) {
  return nonEmptyLines(text)
    .map((l) => l.split("\t"))
    .filter((p) => p.length === 2 && p[0] !== "" && p[1] !== "")
    .map(([mf, noyt]) => ({ mf, noyt }));
}
