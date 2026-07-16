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
