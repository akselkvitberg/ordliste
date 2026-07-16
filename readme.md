# Norske ordlister

Dette er et forsøk på å lage en liste over ord som kan brukes til å generere passord-fraser, som "korthåra tuba blekkete prøvefelt bakkete foting"

## TUI

Prosjektet har et enkelt terminal-grensesnitt (bygget med [Spectre.Console](https://spectreconsole.net/)) for å generere passord-fraser og utforske ordlistene:

```
dotnet run --project Ordliste.Tui
```

Appen leser de ferdiggenererte ordlistene i `ordliste/`-mappa (`substantiv.txt`, `adjektiv.txt`, `verb.txt`), så du trenger ikke kildedataene for å bruke den. Den lar deg:

- generere passord-fraser med valgbart mønster og antall ord, regenerere og kopiere til utklippstavla
- bla i og søke/filtrere i hver ordliste
- generere ordlistene på nytt ved å kjøre `Generate.fsx` (krever at kildedataene er lagt inn – se under)

## Generere ordlistene på nytt

Last ned Norsk Ordbank fra Språkbanken: https://www.nb.no/sprakbanken/ressurskatalog/oai-nb-no-sbr-5/

Last ned unigram fra N-gram ressursen fra Språkbanken: https://www.nb.no/sprakbanken/ressurskatalog/oai-nb-no-sbr-76/    
F.eks. ngram-2022-digibok-unigram.csv.gz

Filene som er relevante er fullformsliste.txt fra ordbanken og ngram-2022-digibok-unigram.csv (eller tilsvarende) fra N-gram ressursen.

Legg inn ord som skal svartelistes i svarteliste.txt

Kjør scriptet med `dotnet fsi Generate.fsx` (krever .NET SDK med F# installert).

Kilder: 
[Norsk Ordbank (CC-BY)](https://www.nb.no/sprakbanken/ressurskatalog/oai-nb-no-sbr-5/)
[N-gram (CC-BY)](https://www.nb.no/sprakbanken/ressurskatalog/oai-nb-no-sbr-76/)
