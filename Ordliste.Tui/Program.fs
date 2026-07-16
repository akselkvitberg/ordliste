module Ordliste.Tui.Program

open System
open Spectre.Console
open Ordliste.Tui.WordData
open Ordliste.Tui.Passphrase
open Ordliste.Tui

let private rng = Random.Shared

/// Escape square brackets so arbitrary text is safe inside Spectre markup.
let private esc (text: string) = Markup.Escape text

// --------------------------------------------------------------------------
// Shared chrome
// --------------------------------------------------------------------------

let private drawHeader () =
    AnsiConsole.Clear()

    let title = FigletText("Ordliste").Centered()
    title.Color <- Color.Yellow
    AnsiConsole.Write title

    // Rule is centred by default.
    AnsiConsole.Write(Rule("[grey]Norsk ordliste – passord-fraser og ordsøk[/]"))
    AnsiConsole.WriteLine()

let private pause () =
    AnsiConsole.WriteLine()
    AnsiConsole.MarkupLine "[grey]Trykk en tast for å fortsette …[/]"
    Console.ReadKey true |> ignore

// --------------------------------------------------------------------------
// Passphrase generator
// --------------------------------------------------------------------------

let private tryCopyToClipboard (text: string) =
    try
        TextCopy.ClipboardService.SetText text
        true
    with _ ->
        false

let private passphraseScreen (lists: Map<Category, string[]>) =
    // Ask for the settings once, then let the user regenerate freely.
    drawHeader ()

    let pattern =
        AnsiConsole.Prompt(
            SelectionPrompt<Pattern>()
                .Title("Velg [green]mønster[/]:")
                .UseConverter(fun p -> p.DisplayName)
                .AddChoices(allPatterns)
        )

    let wordCount =
        AnsiConsole.Prompt(
            TextPrompt<int>("Hvor mange [green]ord[/] i frasen?")
                .DefaultValue(6)
                .Validate(fun n ->
                    if n >= 2 && n <= 20 then ValidationResult.Success()
                    else ValidationResult.Error("[red]Velg et tall mellom 2 og 20[/]"))
        )

    let mutable stay = true

    while stay do
        drawHeader ()
        let phrase = generate rng pattern wordCount lists

        let panel = Panel(Align.Center(Markup($"[bold yellow]{esc phrase}[/]"), VerticalAlignment.Middle))
        panel.Header <- PanelHeader("[green]Din passord-frase[/]")
        panel.Border <- BoxBorder.Rounded
        panel.Padding <- Padding(2, 1, 2, 1)
        panel.Expand <- true
        AnsiConsole.Write panel

        AnsiConsole.MarkupLine $"[grey]Mønster:[/] {esc pattern.DisplayName}   [grey]Antall ord:[/] {wordCount}"
        AnsiConsole.WriteLine()

        let choice =
            AnsiConsole.Prompt(
                SelectionPrompt<string>()
                    .Title("Hva nå?")
                    .AddChoices([ "Generer ny"; "Kopier til utklippstavle"; "Tilbake til meny" ])
            )

        match choice with
        | "Generer ny" -> ()
        | "Kopier til utklippstavle" ->
            if tryCopyToClipboard phrase then
                AnsiConsole.MarkupLine "[green]Kopiert til utklippstavle.[/]"
            else
                AnsiConsole.MarkupLine "[red]Klarte ikke å kopiere (ingen utklippstavle tilgjengelig her).[/]"

            pause ()
        | _ -> stay <- false

// --------------------------------------------------------------------------
// Word-list browser
// --------------------------------------------------------------------------

let private pageSize = 20

let private renderPage (category: Category) (words: string[]) (filter: string) (page: int) =
    let totalPages = max 1 ((words.Length + pageSize - 1) / pageSize)
    let page = page |> max 0 |> min (totalPages - 1)
    let pageWords = words |> Array.skip (page * pageSize) |> Array.truncate pageSize

    let table = Table()
    table.Border <- TableBorder.Rounded
    table.Title <- TableTitle($"[yellow]{category.DisplayName}[/]")
    table.AddColumn(TableColumn("[grey]#[/]").RightAligned()) |> ignore
    table.AddColumn(TableColumn "Ord") |> ignore

    pageWords
    |> Array.iteri (fun i w ->
        let index = page * pageSize + i + 1
        table.AddRow($"[grey]{index}[/]", $"[white]{esc w}[/]") |> ignore)

    if pageWords.Length = 0 then
        table.AddRow("", "[grey]Ingen treff[/]") |> ignore

    AnsiConsole.Write table

    let filterText =
        if String.IsNullOrEmpty filter then "" else $"   [grey]Filter:[/] «{esc filter}»"

    AnsiConsole.MarkupLine
        $"[grey]Side[/] {page + 1}[grey]/[/]{totalPages}   [grey]Totalt:[/] {words.Length} ord{filterText}"

    page, totalPages

let private applyFilter (all: string[]) (filter: string) =
    if String.IsNullOrWhiteSpace filter then
        all
    else
        let f = filter.Trim().ToLowerInvariant()
        all |> Array.filter (fun w -> w.Contains f)

let private browseCategory (category: Category) (all: string[]) =
    let mutable filter = ""
    let mutable words = all
    let mutable page = 0
    let mutable stay = true

    while stay do
        drawHeader ()
        let actualPage, totalPages = renderPage category words filter page
        page <- actualPage
        AnsiConsole.WriteLine()

        let choices =
            [ if page < totalPages - 1 then "Neste side"
              if page > 0 then "Forrige side"
              "Søk / filtrer"
              if not (String.IsNullOrEmpty filter) then "Fjern filter"
              "Tilbake" ]

        let choice =
            AnsiConsole.Prompt(SelectionPrompt<string>().Title("Naviger:").AddChoices(choices))

        match choice with
        | "Neste side" -> page <- page + 1
        | "Forrige side" -> page <- page - 1
        | "Søk / filtrer" ->
            filter <- AnsiConsole.Ask<string>("Søk etter (delstreng):")
            words <- applyFilter all filter
            page <- 0
        | "Fjern filter" ->
            filter <- ""
            words <- all
            page <- 0
        | _ -> stay <- false

let private browserScreen (lists: Map<Category, string[]>) =
    let mutable stay = true

    while stay do
        drawHeader ()

        let choices =
            (allCategories |> List.map (fun c -> c.DisplayName)) @ [ "Tilbake til meny" ]

        let choice =
            AnsiConsole.Prompt(
                SelectionPrompt<string>()
                    .Title("Hvilken [green]ordliste[/] vil du utforske?")
                    .AddChoices(choices)
            )

        match allCategories |> List.tryFind (fun c -> c.DisplayName = choice) with
        | Some category -> browseCategory category lists.[category]
        | None -> stay <- false

// --------------------------------------------------------------------------
// Regenerate word lists (runs Generate.fsx)
// --------------------------------------------------------------------------

/// Re-run the generation pipeline. Returns the freshly loaded word lists on
/// success, or None if nothing changed (cancelled, missing data, or failure).
let private regenerateScreen () : Map<Category, string[]> option =
    drawHeader ()

    match Pipeline.tryFindRepoRoot () with
    | None ->
        AnsiConsole.MarkupLine $"[red]Fant ikke {esc Pipeline.scriptName}.[/]"
        pause ()
        None
    | Some repoRoot ->
        match Pipeline.missingSourceFiles repoRoot with
        | missing when not (List.isEmpty missing) ->
            AnsiConsole.MarkupLine "[yellow]Mangler kildedata for å generere ordlistene:[/]"
            missing |> List.iter (fun f -> AnsiConsole.MarkupLine $"  [red]•[/] {esc f}")
            AnsiConsole.WriteLine()
            AnsiConsole.MarkupLine "[grey]Last ned filene fra Språkbanken (se readme) og legg dem i:[/]"
            AnsiConsole.MarkupLine $"  [grey]{esc repoRoot}[/]"
            pause ()
            None
        | _ ->
            AnsiConsole.MarkupLine $"[grey]Kjører[/] dotnet fsi {esc Pipeline.scriptName} [grey]i[/] {esc repoRoot}"

            if not (AnsiConsole.Confirm("Dette kan ta en stund. Fortsette?", false)) then
                None
            else
                AnsiConsole.WriteLine()
                AnsiConsole.Write(Rule("[yellow]Generering[/]"))

                match Pipeline.run repoRoot with
                | Pipeline.DotnetNotFound ->
                    AnsiConsole.MarkupLine
                        "[red]Fant ikke 'dotnet'. Installer .NET SDK for å generere ordlistene.[/]"

                    pause ()
                    None
                | Pipeline.Completed 0 ->
                    AnsiConsole.WriteLine()
                    AnsiConsole.MarkupLine "[green]Ferdig! Laster inn de nye ordlistene …[/]"
                    let reloaded = loadAll ()
                    pause ()
                    Some reloaded
                | Pipeline.Completed code ->
                    AnsiConsole.WriteLine()
                    AnsiConsole.MarkupLine $"[red]Generering feilet (exit-kode {code}).[/]"
                    pause ()
                    None

// --------------------------------------------------------------------------
// Main menu
// --------------------------------------------------------------------------

let private mainMenu (initial: Map<Category, string[]>) =
    let genPassphrase = "Generer passord-frase"
    let browse = "Utforsk ordlistene"
    let regenerate = "Generer ordlistene på nytt"
    let quit = "Avslutt"

    let mutable lists = initial
    let mutable running = true

    while running do
        drawHeader ()

        let counts =
            allCategories
            |> List.map (fun c -> $"{c.DisplayName.ToLowerInvariant()}: {lists.[c].Length}")
            |> String.concat "   "

        AnsiConsole.MarkupLine $"[grey]Lastet inn – {esc counts}[/]"
        AnsiConsole.WriteLine()

        let choice =
            AnsiConsole.Prompt(
                SelectionPrompt<string>()
                    .Title("Hva vil du gjøre?")
                    .AddChoices([ genPassphrase; browse; regenerate; quit ])
            )

        match choice with
        | c when c = genPassphrase -> passphraseScreen lists
        | c when c = browse -> browserScreen lists
        | c when c = regenerate ->
            match regenerateScreen () with
            | Some reloaded -> lists <- reloaded
            | None -> ()
        | _ -> running <- false

[<EntryPoint>]
let main _ =
    Console.OutputEncoding <- Text.Encoding.UTF8

    try
        let lists = loadAll ()
        mainMenu lists
        drawHeader ()
        AnsiConsole.MarkupLine "[green]Ha det![/]"
        0
    with ex ->
        AnsiConsole.MarkupLine $"[red]Feil:[/] {esc ex.Message}"
        1
