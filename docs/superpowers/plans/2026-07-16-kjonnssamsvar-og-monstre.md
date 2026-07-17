# Kjønnssamsvar og substantiv+verb-mønster — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adjektiver bøyes etter det nærmeste etterfølgende substantivets kjønn («blått ekorn», «fint hus»), og et nytt «substantiv + verb»-mønster legges til.

**Architecture:** `Generate.fsx` beriker ordlistene med grammatisk metadata som TSV (`substantiv.txt`: `ord<TAB>kjønn`, `adjektiv.txt`: `m/f-form<TAB>nøytrumsform` paret via `LEMMA_ID`). `passphrase.js` (ren, DOM-fri modul) får TSV-parsere og kjønnssamsvar i genereringen; `app.js`/`index.html` kobler det til UI-et. Entropi telles per adjektiv-lemma — formvalget er deterministisk gitt substantivet og bidrar ikke med entropi.

**Tech Stack:** Vanilla ES-moduler i nettleser, `node:test` (Node 26, kjøres med `node --test`), F#-skript kjørt med `dotnet fsi` (dotnet 10).

**Spec:** `docs/superpowers/specs/2026-07-16-kjonnssamsvar-og-monstre-design.md`

## Global Constraints

- Ordlistefilene forblir i `ordliste/` og er sjekket inn i git.
- Kjønnskoder er nøyaktig `m`, `f`, `n`.
- Mønsterverdier (`Pattern`): eksisterende verdier er uendret; ny verdi er `"substantiv-verb"`.
- Listeformer i JS: `lists.substantiv` = `{ord, kjonn}[]`, `lists.adjektiv` = `{mf, noyt}[]`, `lists.verb` = `string[]`.
- «Fritt»-poolen bruker m/f-formen av adjektivene; poolstørrelsen er |adjektiv| + |substantiv| + |verb| som i dag.
- Ugyldige TSV-linjer (manglende tab, tomt felt, ukjent kjønnskode) hoppes stille over ved parsing.
- Alle tester kjøres fra repo-roten med `node --test`.
- UI-tekst er på norsk (bokmål).

---

### Task 1: TSV-parsere i passphrase.js

**Files:**
- Modify: `passphrase.js` (legg til nederst, etter `filterWords`)
- Test: `test/passphrase.test.js` (legg til nederst)

**Interfaces:**
- Consumes: ingenting nytt.
- Produces (brukes av Task 4):
  - `parseSubstantiv(text: string): {ord: string, kjonn: "m"|"f"|"n"}[]`
  - `parseAdjektiv(text: string): {mf: string, noyt: string}[]`
  - `parseVerb(text: string): string[]`

- [ ] **Step 1: Skriv de failende testene**

Legg til nederst i `test/passphrase.test.js`, og utvid importen øverst i filen til også å hente de tre parserne:

```js
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
```

```js
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
```

- [ ] **Step 2: Kjør testene og se at de feiler**

Run: `node --test`
Expected: FAIL — `SyntaxError` / "does not provide an export named 'parseSubstantiv'".

- [ ] **Step 3: Implementer parserne**

Legg til nederst i `passphrase.js`:

```js
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
```

Merk: `"fin\t"` overlever ikke — linjen trimmes til `"fin"` før split, gir lengde 1 og filtreres bort. Det er tilsiktet og dekket av testen.

- [ ] **Step 4: Kjør testene og se at de passerer**

Run: `node --test`
Expected: alle tester PASS (de gamle var grønne fra før).

- [ ] **Step 5: Commit**

```bash
git add passphrase.js test/passphrase.test.js
git commit -m "Add TSV parsers for the enriched word lists"
```

---

### Task 2: Kjønnssamsvar og SubstantivVerb-mønster i passphrase.js

**Files:**
- Modify: `passphrase.js` (`Pattern`, `concatAll`, `poolForPosition` → `classForPosition`, `generatePhrase`, `calcEntropyBits`)
- Test: `test/passphrase.test.js` (erstatt fixture og mønster-/entropitester, legg til samsvarstester)

**Interfaces:**
- Consumes: ingenting fra Task 1 (uavhengig endring i samme fil).
- Produces (brukes av Task 4):
  - `Pattern.SubstantivVerb === "substantiv-verb"`
  - `generatePhrase(pattern, wordCount, lists)` og `calcEntropyBits(pattern, wordCount, lists)` med de nye listeformene (se Global Constraints).

- [ ] **Step 1: Oppdater testfixturene og skriv de failende testene**

I `test/passphrase.test.js`: erstatt hele blokken fra `const fixture = {` til og med testen `"calcEntropyBits uses the combined pool for Fritt"` med følgende (testene for `randomInt` og `filterWords` og parser-testene fra Task 1 beholdes uendret):

```js
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
```

- [ ] **Step 2: Kjør testene og se at de nye feiler**

Run: `node --test`
Expected: FAIL — bl.a. `Pattern.SubstantivVerb` er `undefined`, og mønstertestene får objekter i stedet for strenger («[object Object]»).

- [ ] **Step 3: Implementer kjønnssamsvar og nytt mønster**

I `passphrase.js`:

Legg til i `Pattern`-objektet (etter `AdjektivSubstantivVerb`):

```js
  SubstantivVerb: "substantiv-verb",
```

Erstatt `concatAll` og `poolForPosition` med:

```js
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
```

Erstatt `generatePhrase` med:

```js
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
```

Erstatt pool-oppslaget i `calcEntropyBits` (linjen med `poolForPosition(...).length`) med:

```js
    const pool =
      pattern === Pattern.Fritt
        ? alleSize
        : lists[classForPosition(pattern, i, wordCount)].length;
```

(Resten av `calcEntropyBits` er uendret — `alleSize` summerer allerede lengdene, og adjektivlengden teller lemmaer.)

- [ ] **Step 4: Kjør testene og se at alle passerer**

Run: `node --test`
Expected: alle tester PASS.

- [ ] **Step 5: Commit**

```bash
git add passphrase.js test/passphrase.test.js
git commit -m "Bøy adjektiver etter substantivets kjønn og legg til substantiv+verb-mønster"
```

---

### Task 3: Berikede ordlister fra Generate.fsx

**Files:**
- Modify: `Generate.fsx`
- Modify (regenerert): `ordliste/substantiv.txt`, `ordliste/adjektiv.txt`, `ordliste/verb.txt`

**Interfaces:**
- Consumes: ingenting fra tidligere tasks (F#-siden er frittstående).
- Produces (brukes av Task 4 som data): `ordliste/substantiv.txt` med linjer `ord<TAB>m|f|n`, `ordliste/adjektiv.txt` med linjer `mf<TAB>nøytrum`, `ordliste/verb.txt` uendret format (ett ord per linje).

Dette er et datagenereringsskript uten testrammeverk; «testen» er verifiserbare sjekker på utdataene (Step 3). Merk at kildefilene (`fullformsliste.txt`, `ngram-2022-digibok-unigram.csv`) er gitignorerte, men ligger lokalt i repoet. Skriptet bruker latin-1-dekoding for fullformslista, så taggen `nøyt` kan matches direkte som streng i F#-koden.

- [ ] **Step 1: Endre Generate.fsx**

Erstatt `adjektiv`-definisjonen (blokken `let adjektiv = ...`) med:

```fsharp
// Adjektiv: par av (m/f-form, nøytrumsform) per lemma, koblet via LEMMA_ID.
// BOY_NUMMER 1 = "pos m/f ub ent" (fin), BOY_NUMMER 4 = "pos nøyt ub ent" (fint).
// Lemmaer uten gyldig nøytrumsform gjenbruker m/f-formen (f.eks. "moderne").
let adjektivPairs =
    listOfValidWords
    |> Seq.where (fun r -> isInWordClass "adj" r.TAG)
    |> Seq.where (fun r -> r.BOY_NUMMER = 1 || r.BOY_NUMMER = 4)
    |> Seq.groupBy (fun r -> r.LEMMA_ID)
    |> Seq.choose (fun (_, rows) ->
        let form n = rows |> Seq.tryFind (fun r -> r.BOY_NUMMER = n) |> Option.map (fun r -> r.OPPSLAG)
        match form 1 with
        | Some mf -> Some (mf, form 4 |> Option.defaultValue mf)
        | None -> None)
    |> Seq.where (fun (mf, _) -> Array.contains mf verb |> not) // Reject words that can also be mistaken for verbs
    |> Seq.sortBy fst
    |> Seq.distinctBy fst
    |> Seq.toArray

let adjektiv = adjektivPairs |> Array.map fst
let noytFormForAdjektiv = adjektivPairs |> Map.ofArray
```

Erstatt `substantiv`-definisjonen (blokken `let substantiv = ...`) med:

```fsharp
let kjonnFromTag (tag: string) =
    if tag.Contains("mask") then Some "m"
    elif tag.Contains("fem") then Some "f"
    elif tag.Contains("nøyt") then Some "n"
    else None

// Substantiv med kjønn. Ord som finnes i flere kjønn (f.eks. "ekorn") får
// kjønnet med flest rader; ved likhet prioriteres fem > mask > nøyt — alle
// variantene er grammatisk korrekte, valget handler bare om determinisme.
// (Fem først: Ordbanken har parallelle hankjønnsrader for nesten alle
// hunkjønnsord, så mask først ville gitt ~0 f-ord.)
let kjonnForSubstantiv =
    listOfValidWords
    |> Seq.where (fun r -> isInWordClass "subst" r.TAG)
    |> Seq.where (fun r -> isInWordClass "prop" r.TAG |> not) // ignore proper nouns
    |> Seq.where (fun r -> r.BOY_NUMMER = 1) // we only care about type "entall ubestemt"
    |> Seq.where (fun r -> Array.contains r.OPPSLAG verb |> not) // Reject words that can also be mistaken for verbs
    |> Seq.where (fun r -> Array.contains r.OPPSLAG adjektiv |> not) // Reject words that can also be mistaken for adjektives
    |> Seq.choose (fun r -> kjonnFromTag r.TAG |> Option.map (fun k -> r.OPPSLAG, k))
    |> Seq.groupBy fst
    |> Seq.map (fun (word, items) ->
        let prioritet = function "f" -> 0 | "m" -> 1 | _ -> 2
        let kjonn =
            items
            |> Seq.countBy snd
            |> Seq.sortBy (fun (g, antall) -> (-antall, prioritet g))
            |> Seq.head
            |> fst
        word, kjonn)
    |> Map.ofSeq

let substantiv = kjonnForSubstantiv |> Map.toArray |> Array.map fst
```

Erstatt lagringsblokken (fra `let saveToFile ...` til og med de tre `saveToFile`-kallene) med:

```fsharp
let topWords count items = items |> Array.take count |> Array.map fst |> Array.sort

let saveLines fileName (lines: string seq) =
    File.WriteAllLines($"ordliste//{fileName}.txt", lines)

topWords 10_000 substantivWithFrequency
|> Seq.map (fun w -> sprintf "%s\t%s" w (Map.find w kjonnForSubstantiv))
|> saveLines "substantiv"

topWords 10_000 adjektivWithFrequency
|> Seq.map (fun w -> sprintf "%s\t%s" w (Map.find w noytFormForAdjektiv))
|> saveLines "adjektiv"

topWords 5_000 verbWithFrequency |> saveLines "verb"
```

Slett demolinjene nederst (`let random ...`, `let AdjSub ...` og `printfn "%s" (AdjSub())`) — de bruker de gamle listeformene, og nettsiden er nå konsumenten.

- [ ] **Step 2: Kjør skriptet**

Run: `dotnet fsi Generate.fsx` (fra repo-roten; kan ta noen minutter)
Expected: skriver antall ord med frekvens og en record med `Substantiver`/`Adjektiver`/`Verb`-antall, ingen exceptions. (`Map.find` i lagringsblokken kaster hvis et frekvensord mangler i kjønns-/formkartene — at skriptet fullfører er i seg selv en konsistenssjekk.)

- [ ] **Step 3: Verifiser utdataformatet**

Run (Git Bash):

```bash
wc -l ordliste/substantiv.txt ordliste/adjektiv.txt ordliste/verb.txt
grep -P "^hus\tn$" ordliste/substantiv.txt
grep -P "^katt\tm$" ordliste/substantiv.txt
grep -P "^fin\tfint$" ordliste/adjektiv.txt
grep -P "^blå\tblått$" ordliste/adjektiv.txt
awk -F'\t' 'NF != 2 {bad++} END {print bad + 0}' ordliste/substantiv.txt
awk -F'\t' 'NF != 2 {bad++} END {print bad + 0}' ordliste/adjektiv.txt
awk -F'\t' '$2 !~ /^[mfn]$/ {bad++} END {print bad + 0}' ordliste/substantiv.txt
awk -F'\t' 'NF != 1 {bad++} END {print bad + 0}' ordliste/verb.txt
```

Expected: 10000 + 10000 + 5000 linjer; de fire grep-ene treffer hver sin linje; alle fire awk-sjekkene skriver `0`.

- [ ] **Step 4: Commit**

```bash
git add Generate.fsx ordliste/substantiv.txt ordliste/adjektiv.txt ordliste/verb.txt
git commit -m "Berik ordlistene med kjønn og nøytrumsformer (TSV)"
```

---

### Task 4: Koble UI-et til de berikede listene

**Files:**
- Modify: `app.js` (`CATEGORIES`, `loadLists`, `wireBrowser`)
- Modify: `index.html` (nytt `<option>` i mønster-nedtrekkslisten)

**Interfaces:**
- Consumes: `parseSubstantiv` / `parseAdjektiv` / `parseVerb` fra Task 1, `Pattern.SubstantivVerb`-verdien `"substantiv-verb"` og de nye listeformene fra Task 2, TSV-filene fra Task 3.
- Produces: ferdig side; `loadLists()` returnerer `{substantiv: {ord, kjonn}[], adjektiv: {mf, noyt}[], verb: string[]}`.

`app.js` har ingen node-tester (modulen kjører `init()` med DOM-tilgang ved import); verifiseringen er manuell i nettleser (Step 3).

- [ ] **Step 1: Oppdater app.js**

Erstatt importen og `CATEGORIES`/`loadLists` øverst i filen med:

```js
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
```

I `wireBrowser`: legg til visningsstrenger rett etter variabeldeklarasjonene (før `const render = ...`), og bruk dem i `render`:

```js
  // Visningsstrenger for ordliste-fanen: substantiv med kjønn, adjektiv med
  // begge former (én form når de er like, f.eks. "moderne"). Søket treffer
  // dermed begge adjektivformene.
  const displayLists = {
    substantiv: lists.substantiv.map((s) => `${s.ord} (${s.kjonn})`),
    adjektiv: lists.adjektiv.map((a) => (a.mf === a.noyt ? a.mf : `${a.mf} / ${a.noyt}`)),
    verb: lists.verb,
  };
```

og endre første linje i `render` fra `const all = lists[activeKey];` til:

```js
    const all = displayLists[activeKey];
```

- [ ] **Step 2: Oppdater index.html**

Legg til et nytt valg i `<select id="pattern">` etter `adjektiv-substantiv-verb`-linjen:

```html
              <option value="substantiv-verb">Substantiv + verb</option>
```

- [ ] **Step 3: Kjør testene og verifiser manuelt i nettleser**

Run: `node --test`
Expected: alle tester PASS.

Start så en statisk server fra repo-roten og åpne siden (bruk `.claude/launch.json`/preview-verktøyet, f.eks. `python -m http.server 8000`):

1. Generer fraser med alle fem mønstrene — ingen konsollfeil, riktig antall ord.
2. Velg «Adjektiv + substantiv» og generer til du ser et nøytrumssubstantiv (f.eks. ord som «hus», «vann», «barn»): adjektivet foran skal stå i nøytrumsform («fint hus», ikke «fin hus»). Sjekk mot `ordliste/substantiv.txt` at substantivet faktisk er `n`.
3. Velg «Substantiv + verb»: annenhver substantiv/verb, entropi vises.
4. Åpne «Se ordliste»: substantiv vises som «hus (n)», adjektiv som «fin / fint», og søk på «fint» treffer «fin / fint».

- [ ] **Step 4: Commit**

```bash
git add app.js index.html
git commit -m "Koble UI-et til de berikede TSV-ordlistene og nytt mønster"
```

---

### Task 5: Sluttverifisering

**Files:**
- Ingen nye endringer — kjør full verifisering av hele leveransen.

**Interfaces:**
- Consumes: alt fra Task 1–4.
- Produces: bekreftet grønn tilstand før integrasjon.

- [ ] **Step 1: Kjør hele testsuiten**

Run: `node --test`
Expected: alle tester PASS, 0 failing.

- [ ] **Step 2: Grammatisk stikkprøve på ekte data**

Run (fra repo-roten):

```bash
node --input-type=module -e "
import { generatePhrase, Pattern, parseSubstantiv, parseAdjektiv, parseVerb } from './passphrase.js';
import { readFileSync } from 'node:fs';
const lists = {
  substantiv: parseSubstantiv(readFileSync('ordliste/substantiv.txt', 'utf8')),
  adjektiv: parseAdjektiv(readFileSync('ordliste/adjektiv.txt', 'utf8')),
  verb: parseVerb(readFileSync('ordliste/verb.txt', 'utf8')),
};
for (let i = 0; i < 10; i++) console.log(generatePhrase(Pattern.AdjektivSubstantiv, 6, lists));
"
```

Expected: 10 fraser der hvert adjektiv samsvarer med substantivet etter («blått hus», «fin katt» — aldri «blå hus» der huset er nøytrum). Les gjennom og bekreft manuelt; slå opp kjønnet i `ordliste/substantiv.txt` ved tvil.

- [ ] **Step 3: Sjekk at arbeidstreet er rent og pushet**

```bash
git status --short
```

Expected: ingen ucommittede endringer i kildefiler (kun evt. urelaterte endringer som lå der fra før: `.gitignore`, `svarteliste.txt`).
