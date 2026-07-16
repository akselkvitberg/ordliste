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

test("AdjektiverSubstantiv is (n-1) adjektiv followed by one substantiv", () => {
  const words = generatePhrase(Pattern.AdjektiverSubstantiv, 5, fixture).split(" ");
  words.slice(0, -1).forEach((w, i) => assert.ok(fixture.adjektiv.includes(w), `pos ${i} not adjektiv: ${w}`));
  assert.ok(fixture.substantiv.includes(words[words.length - 1]), `last not substantiv: ${words.at(-1)}`);
});

test("AdjektivSubstantivVerb cycles adjektiv, substantiv, verb", () => {
  const byClass = [fixture.adjektiv, fixture.substantiv, fixture.verb];
  const words = generatePhrase(Pattern.AdjektivSubstantivVerb, 7, fixture).split(" ");
  words.forEach((w, i) => assert.ok(byClass[i % 3].includes(w), `pos ${i} wrong class: ${w}`));
});

test("calcEntropyBits for AdjektiverSubstantiv = (n-1)*log2(adj) + log2(sub)", () => {
  // adjektiv pool 4 -> 2 bits, substantiv pool 8 -> 3 bits.
  const lists = {
    adjektiv: ["a", "b", "c", "d"],
    substantiv: ["e", "f", "g", "h", "i", "j", "k", "l"],
    verb: [],
  };
  // 5 words -> 4*2 + 3 = 11
  assert.equal(calcEntropyBits(Pattern.AdjektiverSubstantiv, 5, lists), 11);
});

test("calcEntropyBits for AdjektivSubstantivVerb sums the cycling pools", () => {
  // adj 4 -> 2, sub 8 -> 3, verb 2 -> 1 bit.
  const lists = {
    adjektiv: ["a", "b", "c", "d"],
    substantiv: ["e", "f", "g", "h", "i", "j", "k", "l"],
    verb: ["m", "n"],
  };
  // 4 words -> adj(2)+sub(3)+verb(1)+adj(2) = 8
  assert.equal(calcEntropyBits(Pattern.AdjektivSubstantivVerb, 4, lists), 8);
});

test("generatePhrase throws on an unknown pattern", () => {
  assert.throws(() => generatePhrase("bogus", 4, fixture), /Ukjent mønster/);
});

test("calcEntropyBits throws on an unknown pattern", () => {
  assert.throws(() => calcEntropyBits("bogus", 4, fixture), /Ukjent mønster/);
});

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
