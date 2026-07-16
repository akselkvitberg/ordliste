// passphrase.js — pure, DOM-free logic for the ordliste web page.
// Uses the Web Crypto API, available in browsers and in Node >= 20 via
// the global `crypto` object.

/** Pattern identifiers used by generatePhrase / calcEntropyBits. */
export const Pattern = {
  AdjektivSubstantiv: "adjektiv-substantiv",
  AdjektiverSubstantiv: "adjektiver-substantiv",
  AdjektivSubstantivVerb: "adjektiv-substantiv-verb",
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

/** The combined pool of every word class, used by the Fritt pattern. */
function concatAll(lists) {
  return lists.adjektiv.concat(lists.substantiv, lists.verb);
}

/**
 * The word list a given position draws from, for every pattern except Fritt
 * (which draws from the combined pool the caller supplies). Shared by
 * generatePhrase (picks a word) and calcEntropyBits (measures the pool).
 *   AdjektivSubstantiv     -> adjektiv on even positions, substantiv on odd
 *   AdjektiverSubstantiv   -> adjektiv everywhere except the last position (substantiv)
 *   AdjektivSubstantivVerb -> adjektiv, substantiv, verb, repeating
 */
function poolForPosition(pattern, i, wordCount, lists) {
  switch (pattern) {
    case Pattern.AdjektivSubstantiv:
      return i % 2 === 0 ? lists.adjektiv : lists.substantiv;
    case Pattern.AdjektiverSubstantiv:
      return i < wordCount - 1 ? lists.adjektiv : lists.substantiv;
    case Pattern.AdjektivSubstantivVerb:
      return [lists.adjektiv, lists.substantiv, lists.verb][i % 3];
  }
}

/**
 * Generate a space-separated passphrase.
 * lists = { adjektiv: string[], substantiv: string[], verb: string[] }
 */
export function generatePhrase(pattern, wordCount, lists) {
  assertKnownPattern(pattern);
  // Only the free-mix pattern needs the combined pool; don't allocate it otherwise.
  const alle = pattern === Pattern.Fritt ? concatAll(lists) : null;
  const words = [];
  for (let i = 0; i < wordCount; i++) {
    const pool = pattern === Pattern.Fritt ? alle : poolForPosition(pattern, i, wordCount, lists);
    words.push(pick(pool));
  }
  return words.join(" ");
}

/**
 * Approximate entropy in bits, rounded to a whole number. Sums log2 of the
 * pool size at each position, so it matches how generatePhrase samples:
 *   Fritt -> |adjektiv| + |substantiv| + |verb| at every position
 *   others -> the per-position pool from poolForPosition
 */
export function calcEntropyBits(pattern, wordCount, lists) {
  assertKnownPattern(pattern);
  const alleSize = lists.adjektiv.length + lists.substantiv.length + lists.verb.length;
  let bits = 0;
  for (let i = 0; i < wordCount; i++) {
    const pool =
      pattern === Pattern.Fritt ? alleSize : poolForPosition(pattern, i, wordCount, lists).length;
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
