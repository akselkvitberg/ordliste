# Norske ordlister

Dette er et forsøk på å lage en liste over ord som kan brukes til å generere passord-fraser, som "korthåra tuba blekkete prøvefelt bakkete foting"

## Nettside

Prosjektet har en enkel nettside for å generere passord-fraser og utforske ordlistene. Den består av statiske filer (`index.html`, `styles.css`, `app.js`, `passphrase.js`) og leser de ferdiggenererte ordlistene i `ordliste/`-mappa (`substantiv.txt`, `adjektiv.txt`, `verb.txt`).

Siden må serveres over HTTP (nettleseren blokkerer `fetch` fra `file://`). Kjør en enkel lokal server fra prosjektmappa:

```
python -m http.server 8000
```

og åpne http://localhost:8000/ i nettleseren. Siden kan også publiseres direkte med GitHub Pages (fra rota av repoet).

Med nettsiden kan du:

- generere passord-fraser med valgbart mønster (adjektiv + substantiv vekselvis, eller fritt) og antall ord, regenerere og kopiere til utklippstavla
- se et anslag for entropi (bits) for frasen
- bla i og søke/filtrere i hver ordliste

Ordfrasene genereres med nettleserens kryptografisk sikre tilfeldighetskilde (`crypto.getRandomValues`).

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
