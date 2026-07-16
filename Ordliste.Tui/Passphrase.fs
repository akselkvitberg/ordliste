module Ordliste.Tui.Passphrase

open System
open Ordliste.Tui.WordData

/// How the words in a passphrase are chosen.
type Pattern =
    /// Alternating adjektiv/substantiv, like the original notebook's AdjSub().
    | AdjektivSubstantiv
    /// A free mix drawn from all three word classes.
    | Fritt

    member this.DisplayName =
        match this with
        | AdjektivSubstantiv -> "Adjektiv + substantiv (vekselvis)"
        | Fritt -> "Fritt (blanding av alle ordklasser)"

let allPatterns = [ AdjektivSubstantiv; Fritt ]

let private pick (rng: Random) (arr: string[]) = arr.[rng.Next arr.Length]

/// Generate a single passphrase from the loaded word lists.
let generate (rng: Random) (pattern: Pattern) (wordCount: int) (lists: Map<Category, string[]>) =
    let adjektiv = lists.[Adjektiv]
    let substantiv = lists.[Substantiv]
    let alle = Array.concat [ adjektiv; substantiv; lists.[Verb] ]

    [ for i in 0 .. wordCount - 1 ->
          match pattern with
          | AdjektivSubstantiv -> if i % 2 = 0 then pick rng adjektiv else pick rng substantiv
          | Fritt -> pick rng alle ]
    |> String.concat " "
