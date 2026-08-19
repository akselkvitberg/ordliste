import { test } from "node:test";
import assert from "node:assert/strict";
import {
  randomInt,
  generatePhrase,
  Pattern,
  calcEntropyBits,
  filterWords,
  parseSubstantiv,
  parseAdjektiv,
  parseVerb,
} from "../passphrase.js";

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

// Fixture med bare m/f-substantiv: adjektiver skal da alltid stå i m/f-form.
const fixture = {
  adjektiv: [
    { mf: "fin", noyt: "fint" },
    { mf: "blå", noyt: "blått" },
  ],
  substantiv: [
    { ord: "katt", kjonn: "m" },
    { ord: "bok", kjonn: "f" },
  ],
  verb: ["løper"],
};

// Fixture med bare nøytrumssubstantiv: adjektiver foran substantiv skal stå i nøytrum.
const noytFixture = {
  adjektiv: fixture.adjektiv,
  substantiv: [
    { ord: "hus", kjonn: "n" },
    { ord: "eple", kjonn: "n" },
  ],
  verb: ["brenner"],
};

const adjMf = ["fin", "blå"];
const adjNoyt = ["fint", "blått"];
const substOrd = ["katt", "bok"];
const noytOrd = ["hus", "eple"];

test("generatePhrase produces the requested number of words", () => {
  const phrase = generatePhrase(Pattern.Fritt, 4, fixture);
  assert.equal(phrase.split(" ").length, 4);
});

test("AdjektivSubstantiv alternates adjektiv (even) and substantiv (odd)", () => {
  const words = generatePhrase(Pattern.AdjektivSubstantiv, 6, fixture).split(" ");
  words.forEach((w, i) => {
    if (i % 2 === 0) assert.ok(adjMf.includes(w), `pos ${i} not adjektiv: ${w}`);
    else assert.ok(substOrd.includes(w), `pos ${i} not substantiv: ${w}`);
  });
});

test("Fritt draws only from mf-forms, substantiv and verb", () => {
  const union = new Set([...adjMf, ...substOrd, ...fixture.verb]);
  const words = generatePhrase(Pattern.Fritt, 20, fixture).split(" ");
  words.forEach((w) => assert.ok(union.has(w), `unexpected word: ${w}`));
});

test("AdjektiverSubstantiv is (n-1) adjektiv followed by one substantiv", () => {
  const words = generatePhrase(Pattern.AdjektiverSubstantiv, 5, fixture).split(" ");
  words.slice(0, -1).forEach((w, i) => assert.ok(adjMf.includes(w), `pos ${i} not adjektiv: ${w}`));
  assert.ok(substOrd.includes(words.at(-1)), `last not substantiv: ${words.at(-1)}`);
});

test("AdjektivSubstantivVerb cycles adjektiv, substantiv, verb", () => {
  const byClass = [adjMf, substOrd, fixture.verb];
  const words = generatePhrase(Pattern.AdjektivSubstantivVerb, 7, fixture).split(" ");
  words.forEach((w, i) => assert.ok(byClass[i % 3].includes(w), `pos ${i} wrong class: ${w}`));
});

test("SubstantivVerb alternates substantiv (even) and verb (odd)", () => {
  const words = generatePhrase(Pattern.SubstantivVerb, 6, fixture).split(" ");
  words.forEach((w, i) => {
    if (i % 2 === 0) assert.ok(substOrd.includes(w), `pos ${i} not substantiv: ${w}`);
    else assert.ok(fixture.verb.includes(w), `pos ${i} not verb: ${w}`);
  });
});

test("adjektiv foran nøytrumssubstantiv får nøytrumsform", () => {
  const words = generatePhrase(Pattern.AdjektivSubstantiv, 4, noytFixture).split(" ");
  assert.ok(adjNoyt.includes(words[0]), `pos 0 not nøytrum: ${words[0]}`);
  assert.ok(adjNoyt.includes(words[2]), `pos 2 not nøytrum: ${words[2]}`);
});

test("adjektiv foran m/f-substantiv får m/f-form", () => {
  const words = generatePhrase(Pattern.AdjektivSubstantiv, 4, fixture).split(" ");
  assert.ok(adjMf.includes(words[0]), `pos 0 not m/f: ${words[0]}`);
  assert.ok(adjMf.includes(words[2]), `pos 2 not m/f: ${words[2]}`);
});

test("alle adjektivene i AdjektiverSubstantiv samsvarer med sluttsubstantivet", () => {
  const words = generatePhrase(Pattern.AdjektiverSubstantiv, 5, noytFixture).split(" ");
  words.slice(0, -1).forEach((w, i) => assert.ok(adjNoyt.includes(w), `pos ${i} not nøytrum: ${w}`));
  assert.ok(noytOrd.includes(words.at(-1)));
});

test("AdjektivSubstantivVerb bøyer adjektivet etter neste substantiv", () => {
  const words = generatePhrase(Pattern.AdjektivSubstantivVerb, 6, noytFixture).split(" ");
  assert.ok(adjNoyt.includes(words[0]), `pos 0 not nøytrum: ${words[0]}`);
  assert.ok(adjNoyt.includes(words[3]), `pos 3 not nøytrum: ${words[3]}`);
});

test("hengende adjektiv uten etterfølgende substantiv bruker m/f-formen", () => {
  // 3 ord i AdjektivSubstantiv: adj subst adj — siste adjektiv har ingen
  // etterfølgende substantiv og skal stå i m/f-form selv i nøytrum-fixturen.
  const words = generatePhrase(Pattern.AdjektivSubstantiv, 3, noytFixture).split(" ");
  assert.ok(adjNoyt.includes(words[0]), `pos 0 not nøytrum: ${words[0]}`);
  assert.ok(adjMf.includes(words[2]), `pos 2 not m/f: ${words[2]}`);
});

// Entropilister med kjente størrelser: adj 4 -> 2 bits, subst 8 -> 3 bits, verb 2 -> 1 bit.
const entLists = {
  adjektiv: Array.from({ length: 4 }, (_, i) => ({ mf: `a${i}`, noyt: `an${i}` })),
  substantiv: Array.from({ length: 8 }, (_, i) => ({ ord: `s${i}`, kjonn: "m" })),
  verb: ["v0", "v1"],
};

test("calcEntropyBits sums log2(pool) per position for AdjektivSubstantiv", () => {
  // posisjon 0..3 -> adj(2)+sub(3)+adj(2)+sub(3) = 10
  assert.equal(calcEntropyBits(Pattern.AdjektivSubstantiv, 4, entLists), 10);
});

test("calcEntropyBits for AdjektiverSubstantiv = (n-1)*log2(adj) + log2(sub)", () => {
  // 5 ord -> 4*2 + 3 = 11
  assert.equal(calcEntropyBits(Pattern.AdjektiverSubstantiv, 5, entLists), 11);
});

test("calcEntropyBits for AdjektivSubstantivVerb sums the cycling pools", () => {
  // 4 ord -> adj(2)+sub(3)+verb(1)+adj(2) = 8
  assert.equal(calcEntropyBits(Pattern.AdjektivSubstantivVerb, 4, entLists), 8);
});

test("calcEntropyBits for SubstantivVerb sums alternating pools", () => {
  // 4 ord -> sub(3)+verb(1)+sub(3)+verb(1) = 8
  assert.equal(calcEntropyBits(Pattern.SubstantivVerb, 4, entLists), 8);
});

test("calcEntropyBits uses the combined pool for Fritt", () => {
  // 4 + 8 + 2 = 14 er ikke en toerpotens; bruk 4+2+2=8 -> 3 bits/ord.
  const lists = {
    adjektiv: entLists.adjektiv,
    substantiv: entLists.substantiv.slice(0, 2),
    verb: entLists.verb,
  };
  // 5 ord -> 15
  assert.equal(calcEntropyBits(Pattern.Fritt, 5, lists), 15);
});

test("generatePhrase throws on an unknown pattern", () => {
  assert.throws(() => generatePhrase("bogus", 4, fixture), /Ukjent mønster/);
});

test("calcEntropyBits throws on an unknown pattern", () => {
  assert.throws(() => calcEntropyBits("bogus", 4, fixture), /Ukjent mønster/);
});

test("filterWords returns all words for an empty or whitespace query", () => {
  const words = ["kake", "bord", "lampe"];
  assert.deepEqual(filterWords(words, ""), words);
  assert.deepEqual(filterWords(words, "   "), words);
});

test("filterWords matches case-insensitive substrings and trims the query", () => {
  const words = ["kake", "bakke", "bord"];
  assert.deepEqual(filterWords(words, "ak"), ["kake", "bakke"]);
  assert.deepEqual(filterWords(words, "  AK  "), ["kake", "bakke"]);
  assert.deepEqual(filterWords(words, "xyz"), []);
});

test("parseSubstantiv parses ord<TAB>kjønn lines into objects", () => {
  const text = "ekorn\tn\nkatt\tm\nbok\tf\n";
  assert.deepEqual(parseSubstantiv(text), [
    { ord: "ekorn", kjonn: "n" },
    { ord: "katt", kjonn: "m" },
    { ord: "bok", kjonn: "f" },
  ]);
});

test("parseSubstantiv handles CRLF line endings", () => {
  assert.deepEqual(parseSubstantiv("hus\tn\r\nkatt\tm\r\n"), [
    { ord: "hus", kjonn: "n" },
    { ord: "katt", kjonn: "m" },
  ]);
});

test("parseSubstantiv skips blank, tab-less and unknown-gender lines", () => {
  const text = "ekorn\tn\n\nrart\nhus\tx\n   \nkatt\tm\n";
  assert.deepEqual(parseSubstantiv(text), [
    { ord: "ekorn", kjonn: "n" },
    { ord: "katt", kjonn: "m" },
  ]);
});

test("parseAdjektiv parses mf<TAB>nøytrum pairs", () => {
  const text = "blå\tblått\nfin\tfint\nmoderne\tmoderne\n";
  assert.deepEqual(parseAdjektiv(text), [
    { mf: "blå", noyt: "blått" },
    { mf: "fin", noyt: "fint" },
    { mf: "moderne", noyt: "moderne" },
  ]);
});

test("parseAdjektiv skips blank and malformed lines", () => {
  const text = "blå\tblått\nrart\n\nfin\t\n";
  assert.deepEqual(parseAdjektiv(text), [{ mf: "blå", noyt: "blått" }]);
});

test("parseVerb returns trimmed non-empty lines", () => {
  assert.deepEqual(parseVerb("løper\n hopper \n\n"), ["løper", "hopper"]);
});
