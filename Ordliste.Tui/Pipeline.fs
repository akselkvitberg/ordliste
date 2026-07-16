module Ordliste.Tui.Pipeline

open System
open System.Diagnostics
open System.IO

/// The generator script and the source-data files it needs, all expected to
/// live in the repo root (next to Generate.fsx).
let scriptName = "Generate.fsx"
let requiredSourceFiles = [ "fullformsliste.txt"; "ngram-2022-digibok-unigram.csv" ]

let private walkUpFor (name: string) (start: string) =
    let rec loop (dir: DirectoryInfo) =
        if isNull dir then None
        elif File.Exists(Path.Combine(dir.FullName, name)) then Some dir.FullName
        else loop dir.Parent

    loop (DirectoryInfo start)

/// Locate the directory containing Generate.fsx, searching upward from both the
/// working directory and the executable location.
let tryFindRepoRoot () =
    [ Directory.GetCurrentDirectory(); AppContext.BaseDirectory ]
    |> List.tryPick (walkUpFor scriptName)

/// The source-data files that are not present in the given repo root.
let missingSourceFiles (repoRoot: string) =
    requiredSourceFiles
    |> List.filter (fun f -> Path.Combine(repoRoot, f) |> File.Exists |> not)

type RunResult =
    | Completed of exitCode: int
    | DotnetNotFound

/// Run `dotnet fsi Generate.fsx` in the repo root, inheriting the current
/// console so the script's output streams live, and return the exit code.
let run (repoRoot: string) =
    try
        let psi =
            ProcessStartInfo(FileName = "dotnet", WorkingDirectory = repoRoot, UseShellExecute = false)

        psi.ArgumentList.Add "fsi"
        psi.ArgumentList.Add scriptName

        use p = Process.Start psi
        p.WaitForExit()
        Completed p.ExitCode
    with :? System.ComponentModel.Win32Exception ->
        DotnetNotFound
