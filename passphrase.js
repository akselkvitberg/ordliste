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

/** Throw if `pattern` is not one of the known Pattern values. */
function assertKnownPattern(pattern) {
  if (pattern !== Pattern.AdjektivSubstantiv && pattern !== Pattern.Fritt) {
    throw new Error(`Ukjent mønster: ${pattern}`);
  }
}

/**
 * Generate a space-separated passphrase.
 * lists = { adjektiv: string[], substantiv: string[], verb: string[] }
 */
export function generatePhrase(pattern, wordCount, lists) {
  assertKnownPattern(pattern);
  // Only the free-mix pattern needs the combined pool; don't allocate it otherwise.
  const alle =
    pattern === Pattern.Fritt
      ? lists.adjektiv.concat(lists.substantiv, lists.verb)
      : null;
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

/**
 * Approximate entropy in bits, rounded to a whole number.
 * Per-position pool size:
 *   Fritt              -> |adjektiv| + |substantiv| + |verb|
 *   AdjektivSubstantiv -> |adjektiv| on even positions, |substantiv| on odd
 */
export function calcEntropyBits(pattern, wordCount, lists) {
  assertKnownPattern(pattern);
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
  return words.filter((w) => w.toLowerCase().includes(q));
}
