# Design: Kjønnssamsvar og nye setningsmønstre

**Dato:** 2026-07-16
**Status:** Godkjent

## Bakgrunn

Passordfrasene genereres i dag uten grammatisk samsvar: adjektivlisten
inneholder bare m/f-formen (entall ubestemt, BOY_NUMMER 1), så fraser som
«fin hus» og «blå ekorn» er grammatisk feil for intetkjønnsord. Ordlistene
er rene tekstfiler uten metadata, så genereringen i `passphrase.js` kan
ikke vite hvilket kjønn et substantiv har.

Ordbankens `fullformsliste.txt` har all informasjonen som trengs:

- Substantiv er tagget `subst mask|fem|nøyt appell ent ub` (BOY_NUMMER 1).
- Adjektiv finnes som `adj pos m/f ub ent` (BOY_NUMMER 1, f.eks. «fin») og
  `adj pos nøyt ub ent` (BOY_NUMMER 4, f.eks. «fint»), koblet via
  `LEMMA_ID`.

Siden m/f-formen dekker både hankjønn og hunkjønn («fin katt», «fin bok»),
trengs bare to adjektivformer: felleskjønn (m/f) og nøytrum.

## Mål

1. Adjektiv bøyes etter det etterfølgende substantivets kjønn.
2. To nye mønstre: «substantiv + verb» og «setning» (adj subst verb).
3. Entropiberegningen forblir ærlig: formvalget er deterministisk og
   bidrar ikke med entropi.

## Løsning: berikede TSV-ordlister (alternativ A)

Vurderte alternativer: (A) TSV-ordlister med metadata, (B) én JSON-fil,
(C) separate filer per kjønn. A ble valgt: minst endring, lettlest og
diffbar tekst, og ordliste-fanen i nettsiden fungerer fortsatt.

### 1. Datagenerering (`Generate.fsx`)

**Substantiv** (`ordliste/substantiv.txt`, linjer `ord<TAB>kjønn`):

- Kjønn (`m`/`f`/`n`) leses fra taggen for rader med BOY_NUMMER 1.
- Ord med flere kjønn (f.eks. «ekorn» er både mask og nøyt) får ett kjønn
  deterministisk: kjønnet med flest rader for ordet; ved likhet
  prioriteres mask > fem > nøyt. Alle variantene er grammatisk korrekte,
  valget handler bare om determinisme.

**Adjektiv** (`ordliste/adjektiv.txt`, linjer `m/f-form<TAB>nøytrumsform`):

- Per lemma pares BOY_NUMMER 1-formen med BOY_NUMMER 4-formen via
  `LEMMA_ID`.
- Mangler nøytrumsform (f.eks. «moderne»), gjenbrukes m/f-formen.
- Begge former må passere gyldighetsfilteret (`isValidWord`) og
  svartelisten.
- Frekvensfiltrering skjer som før på m/f-formen.

**Verb** (`ordliste/verb.txt`): uendret — presensformer, ren tekstliste.

### 2. Lasting og visning (`app.js`)

- `loadLists()` parser TSV: substantiv → `{ord, kjonn}`, adjektiv →
  `{mf, noyt}`, verb → strenger.
- Ordliste-fanen viser substantiv som «ekorn (n)» og adjektiv som
  «fin / fint». Søket treffer begge adjektivformer.
- Ugyldige linjer (manglende tab eller ukjent kjønnskode) hoppes over.

### 3. Generering (`passphrase.js`)

Fire mønstre, alle bygget på sykliske maler som gjentas til ønsket
ordantall er nådd:

| Mønster | Mal | Eksempel (6 ord) |
|---|---|---|
| Adjektiv + substantiv | adj, subst | blått ekorn gammel katt fint hus |
| Substantiv + verb | subst, verb | ekorn hopper katt sover hus brenner |
| Setning | adj, subst, verb | blått ekorn spiser gammel fisk løper |
| Fritt | alle ord | (som i dag) |

I «fritt»-mønsteret brukes m/f-formen av adjektivene i den samlede
ordpoolen, slik at poolstørrelsen (|adjektiv| + |substantiv| + |verb|)
og entropien er som i dag.

**Samsvarsregel:** På en adjektivposisjon velges det etterfølgende
substantivet først; adjektivformen (m/f eller nøytrum) bestemmes av
substantivets kjønn. Står adjektivet sist uten etterfølgende substantiv
(oddetall ordantall i adj+subst-mønsteret), brukes m/f-formen.

**Entropi:** Adjektivbidraget telles per lemma — formvalget er
deterministisk gitt substantivet og gir null ekstra entropi. Entropien
per posisjon er dermed uendret fra i dag, og beregningen forblir ærlig.

`index.html` får de to nye mønstrene i nedtrekkslisten.

### 4. Feilhåndtering

- Ukjente mønsterverdier kaster fortsatt feil (`assertKnownPattern`).
- TSV-linjer uten tab eller med ukjent kjønnskode filtreres bort ved
  lasting.

### 5. Testing

`test/passphrase.test.js` utvides med kontrollerte minilister:

- Nøytrumssubstantiv gir nøytrumsform av adjektivet foran; m/f-substantiv
  gir m/f-form.
- Hengende adjektiv (siste posisjon) bruker m/f-form.
- Nye mønstre følger malene sine for ulike ordantall.
- Entropi telles per adjektiv-lemma og per mal-posisjon.
- TSV-parsingen i `loadLists` håndterer gyldige og ugyldige linjer.

`Generate.fsx` kjøres på nytt for å regenerere ordlistene i det nye
formatet.
