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
2. Ett nytt mønster: «substantiv + verb». (Mønstrene «adjektiver + ett
   substantiv» og «adjektiv + substantiv + verb» finnes allerede i koden
   og får kjønnssamsvar.)
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
  prioriteres fem > mask > nøyt. Alle variantene er grammatisk korrekte,
  valget handler bare om determinisme og visning. (Fem først fordi
  Ordbanken etter 2005-reformen registrerer et parallelt
  hankjønnsparadigme for nesten alle hunkjønnsord — mask først ville
  kollapset nesten alt hunkjønn til `m`.)

**Adjektiv** (`ordliste/adjektiv.txt`, linjer `m/f-form<TAB>nøytrumsform`):

- Per lemma pares formene via `LEMMA_ID`, valgt på tag: m/f-formen fra
  rader med `adj pos m/f ub ent`, nøytrumsformen fra rader med
  `adj pos nøyt ub ent`. (`BOY_NUMMER` er paradigme-relativ og kan ikke
  brukes — i liten-paradigmet er «lite» nummer 3 og bestemt form «lille»
  nummer 4. Tag-matchen utelukker også determinativer som «annen»/«selv»,
  som er tagget `det dem <adj>`.)
- Mangler nøytrumsform (f.eks. «moderne»), gjenbrukes m/f-formen.
- M/f-formen må passere gyldighetsfilteret (`isValidWord`) og
  svartelisten. Nøytrumsformen er avledet (trekkes aldri selvstendig) og
  slipper lengdetaket på 9 tegn — «knallhardt» (10) er gyldig — men må
  bestå bokstav- og svartelistefilteret.
- Deler to lemmaer samme m/f-form, foretrekkes paret med egen
  nøytrumsform (deterministisk, robust mot radrekkefølge i kilden).
- Frekvensfiltrering skjer som før på m/f-formen.

**Verb** (`ordliste/verb.txt`): uendret — presensformer, ren tekstliste.

### 2. Lasting og visning (`app.js`)

- `loadLists()` parser TSV: substantiv → `{ord, kjonn}`, adjektiv →
  `{mf, noyt}`, verb → strenger.
- Ordliste-fanen viser substantiv som «ekorn (n)» og adjektiv som
  «fin / fint». Søket treffer begge adjektivformer.
- Ugyldige linjer (manglende tab eller ukjent kjønnskode) hoppes over.

### 3. Generering (`passphrase.js`)

Kodebasen har allerede fire mønstre (`AdjektivSubstantiv`,
`AdjektiverSubstantiv`, `AdjektivSubstantivVerb`, `Fritt`) bygget på
per-posisjon-pooler (`poolForPosition`). Designet bygger videre på dette:
de eksisterende mønstrene får kjønnssamsvar, og ett nytt mønster
(`SubstantivVerb`) legges til.

| Mønster | Mal | Eksempel (6 ord) |
|---|---|---|
| Adjektiv + substantiv | adj, subst (vekselvis) | blått ekorn gammel katt fint hus |
| Adjektiver + ett substantiv | adj × (n−1), subst | gammelt, blått, fint … hus¹ |
| Adjektiv + substantiv + verb | adj, subst, verb (syklisk) | blått ekorn spiser gammel fisk løper |
| Substantiv + verb (ny) | subst, verb (vekselvis) | ekorn hopper katt sover hus brenner |
| Fritt | alle ord | (som i dag) |

¹ uten komma i selve frasen.

I «fritt»-mønsteret brukes m/f-formen av adjektivene i den samlede
ordpoolen, slik at poolstørrelsen (|adjektiv| + |substantiv| + |verb|)
og entropien er som i dag.

**Samsvarsregel:** Et adjektiv bøyes etter det *nærmeste etterfølgende*
substantivet i frasen. Substantivene trekkes derfor først (eller ved
oppslag fremover), og adjektivformen (m/f eller nøytrum) bestemmes av
kjønnet. I «adjektiver + ett substantiv» samsvarer dermed alle
adjektivene med det avsluttende substantivet. Følger det ikke noe
substantiv etter adjektivet (oddetall ordantall i adj+subst-mønsteret),
brukes m/f-formen.

**Entropi:** Adjektivbidraget telles per lemma — formvalget er
deterministisk gitt substantivet og gir null ekstra entropi. Entropien
per posisjon er dermed uendret fra i dag, og beregningen forblir ærlig.

`index.html` får det nye mønsteret i nedtrekkslisten.

### 4. Feilhåndtering

- Ukjente mønsterverdier kaster fortsatt feil (`assertKnownPattern`).
- TSV-linjer uten tab eller med ukjent kjønnskode filtreres bort ved
  lasting.

### 5. Testing

`test/passphrase.test.js` utvides med kontrollerte minilister:

- Nøytrumssubstantiv gir nøytrumsform av adjektivet foran; m/f-substantiv
  gir m/f-form — i alle mønstre med adjektiv.
- I «adjektiver + ett substantiv» samsvarer alle adjektivene med det
  avsluttende substantivet.
- Hengende adjektiv (siste posisjon) bruker m/f-form.
- Det nye «substantiv + verb»-mønsteret følger malen for ulike ordantall.
- Entropi telles per adjektiv-lemma og per mal-posisjon.
- TSV-parsingen i `loadLists` håndterer gyldige og ugyldige linjer.

`Generate.fsx` kjøres på nytt for å regenerere ordlistene i det nye
formatet.
