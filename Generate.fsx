// 6.4.1 er bevisst pinnet: upinnet versjon feiler/mis-parser den >1 GB
// store ngram-CSV-en under design-time sample-oppløsning. Ikke fjern pinnen.
#r "nuget: FSharp.Data, 6.4.1"

open System
open System.IO
open FSharp.Data
open System.Text.RegularExpressions

[<Literal>]
let FullformListePath = "fullformsliste.txt"
type FullformListe = CsvProvider<FullformListePath, "\t", Encoding = "iso-8859-1">

[<Literal>]
let WordFreqPath = "ngram-2022-digibok-unigram.csv"
type WordFreq = CsvProvider<WordFreqPath>

// First we collect all the valid words from the Ordbank fullformsliste.

let normaliser (line:string) = line.Trim().ToLowerInvariant().Replace("aa", "å")

let onlyValidLetterRegex = new Regex("^[a-zA-ZÆæØøÅå]+$");
let isValidWord word =
    onlyValidLetterRegex.Match(word).Success && // Exclude strings with hyphens, weird letters and aposrophs
    word.Length > 3 && word.Length < 10 && // Limit to words between 3 and 10 characters long for convenience
    (word.ToCharArray() |> Array.distinct |> Array.length) > 1 // Not just one character repeated such as AAAA

let isInWordClass (wordClass:string) (tags:string) = tags.Contains(wordClass)

let bannedWords =
    File.ReadAllLines(@"svarteliste.txt")
    |> Array.map normaliser
    |> Array.filter (fun x -> x <> "")
let isNotABannedWord (word:string) = bannedWords |> Array.exists (fun (w:string) -> word.Contains(w)) |> not

type WordRow = {OPPSLAG: string; TAG: string; BOY_NUMMER: int; LEMMA_ID: int}

let allRows =
    FullformListe.GetSample().Rows
    |> Seq.map (fun r -> {OPPSLAG = normaliser r.OPPSLAG; TAG = r.TAG; BOY_NUMMER = r.BOY_NUMMER; LEMMA_ID = r.LEMMA_ID})
    |> Seq.cache

let listOfValidWords =
    allRows
    |> Seq.where (fun r -> isValidWord r.OPPSLAG)
    |> Seq.where (fun r -> isNotABannedWord r.OPPSLAG)
    |> Seq.cache

let isInListOfValidWords =
    let set = listOfValidWords |> Seq.map (fun r -> r.OPPSLAG) |> Set
    let test word = Set.contains word set
    test

let collapseWords input =
    input
    |> Seq.distinctBy (fun r -> r.LEMMA_ID)
    |> Seq.map (fun r -> r.OPPSLAG)
    |> Seq.sort
    |> Seq.distinct
    |> Seq.toArray

let verb =
    listOfValidWords
    |> Seq.where (fun r -> isInWordClass "verb" r.TAG)
    |> Seq.where (fun r -> r.BOY_NUMMER = 2) // we only care about type "presens"
    |> collapseWords

// Adjektiv: par av (m/f-form, nøytrumsform) per lemma, valgt på tag
// ("adj pos m/f ub ent" / "adj pos nøyt ub ent") og koblet via LEMMA_ID.
// BOY_NUMMER er paradigme-relativ og kan ikke brukes: i liten-paradigmet
// er "lite" nummer 3 og bestemt form "lille" nummer 4. Tag-matchen
// utelukker også determinativer ("det dem <adj> ..." for annen/selv/egen).
// Nøytrumsformen er avledet (trekkes aldri selvstendig) og slipper derfor
// lengdetaket — "knallhardt" (10 tegn) er gyldig — men må bestå bokstav-
// og svartelistefilteret.
let isValidDerivedForm (word: string) =
    onlyValidLetterRegex.Match(word).Success &&
    word.Length > 3 &&
    (word.ToCharArray() |> Array.distinct |> Array.length) > 1 &&
    isNotABannedWord word

let adjektivPairs =
    allRows
    |> Seq.where (fun r -> r.TAG.Contains("adj pos m/f ub ent") || r.TAG.Contains("adj pos nøyt ub ent"))
    |> Seq.groupBy (fun r -> r.LEMMA_ID)
    |> Seq.choose (fun (_, rows) ->
        let mf =
            rows
            |> Seq.tryFind (fun r -> r.TAG.Contains("adj pos m/f ub ent") && isValidWord r.OPPSLAG && isNotABannedWord r.OPPSLAG)
            |> Option.map (fun r -> r.OPPSLAG)
        match mf with
        | Some mf ->
            let noyt =
                rows
                |> Seq.tryPick (fun r ->
                    if r.TAG.Contains("adj pos nøyt ub ent") && isValidDerivedForm r.OPPSLAG
                    then Some r.OPPSLAG
                    else None)
                |> Option.defaultValue mf
            Some (mf, noyt)
        | None -> None)
    |> Seq.where (fun (mf, _) -> Array.contains mf verb |> not) // Reject words that can also be mistaken for verbs
    // Deler to lemmaer samme m/f-form, vinner paret med egen nøytrumsform
    // (deterministisk, robust mot radrekkefølgen i kilden).
    |> Seq.sortBy (fun (mf, noyt) -> (mf, (if mf = noyt then 1 else 0), noyt))
    |> Seq.distinctBy fst
    |> Seq.toArray

let adjektiv = adjektivPairs |> Array.map fst
let noytFormForAdjektiv = adjektivPairs |> Map.ofArray

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

// Now that we have a list of words that are acceptable, let's find the most commonly used words so that we have something useful to work with

let groupData (list:(string*int) seq) =
    list
    |> Seq.map (fun (str, freq) -> str.ToLowerInvariant(), freq)
    |> Seq.groupBy (fun (str, freq) -> str)
    |> Seq.map (fun (key, items) -> key, items |> Seq.sumBy snd)

let wordsWithFrequency =
    WordFreq.GetSample().Rows
    |> Seq.where (fun r -> r.Lang = "nob")
    |> Seq.map (fun r -> normaliser r.First, r.Freq)
    |> Seq.filter (fst >> isInListOfValidWords)
    |> Seq.groupBy fst
    |> Seq.map (fun (word, items) -> word, items |> Seq.sumBy snd)
    |> Seq.sortByDescending snd
    |> Seq.toArray

printfn "%d" wordsWithFrequency.Length

let verbSet = verb |> Set
let adjektivSet = adjektiv |> Set
let substantivSet = substantiv |> Set

let adjektivWithFrequency = wordsWithFrequency |> Array.filter (fun (word,_) -> Set.contains word adjektivSet)
let verbWithFrequency = wordsWithFrequency |> Array.filter (fun (word,_) -> Set.contains word verbSet)
let substantivWithFrequency = wordsWithFrequency |> Array.filter (fun (word,_) -> Set.contains word substantivSet)

printfn "%A" {|Substantiver = substantivWithFrequency.Length; Adjektiver = adjektivWithFrequency.Length; Verb = verbWithFrequency.Length|}

Directory.CreateDirectory("ordliste") |> ignore

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
