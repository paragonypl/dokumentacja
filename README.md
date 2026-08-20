# API do wystawiania e-paragonów w systemie Paragony.pl oraz Fakturownia.pl

Opis jak zintegrować własną aplikację lub serwis z e-paragonami i wydrukami fiskalnymi
za pomocą [Paragony.pl](https://paragony.pl) i [Fakturownia.pl](https://fakturownia.pl).
Do fiskalizacji wymagana jest drukarka fiskalna z zainstalowaną aplikacją Paragony.pl
([instrukcja konfiguracji](https://pomoc.fakturownia.pl/45289196-Paragony-pl-2-5-1-modul-do-wydrukow-fiskalnych-instalacja-i-czynnosci-poinstalacyjne)).

## Dwie drogi integracji

1. **Przez API Fakturowni** — paragon wystawiasz w Fakturowni i tam zlecasz jego
   fiskalizację: [Integracja przez API Fakturowni](docs/08-fakturownia.md).
2. **Bezpośrednio przez API Paragony.pl** — Twój system sam zleca fiskalizację dokumentów,
   które wystawia u siebie, i odbiera statusy webhookami: start we
   [Wprowadzeniu](docs/01-wprowadzenie.md), pozostałe rozdziały w katalogu
   [`docs/`](docs/), maszynowa specyfikacja w [`openapi.yaml`](openapi.yaml).
