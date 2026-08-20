# Wprowadzenie do API Paragony.pl

API Paragony.pl pozwala zewnętrznym systemom **fiskalizować paragony na drukarkach
fiskalnych** i **wystawiać e-paragony**.

> Istnieją dwie drogi integracji z e-paragonami:
>
> 1. **Przez API Fakturowni** — paragon wystawiasz w Fakturowni i tam zlecasz fiskalizację
>    (opisane w [Integracji przez API Fakturowni](08-fakturownia.md)).
> 2. **Bezpośrednio przez API Paragony.pl** — Twój system sam zleca fiskalizację dokumentów,
>    które wystawia u siebie. **Ta dokumentacja opisuje drogę nr 2.**

## Jak to działa

```
┌──────────────┐  1. zlecenie fiskalizacji   ┌──────────────┐  3. fiskalizacja   ┌───────────────────┐
│ Twój system  │ ──────────────────────────▶ │ Paragony.pl  │ ◀────────────────▶ │ drukarka fiskalna │
│ (integrator) │ ◀────────────────────────── │    (API)     │                    │    + aplikacja    │
└──────────────┘  4. webhook ze statusem     └──────────────┘                    │    Paragony.pl    │
                     i linkiem do e-paragonu  2. kolejkuje                       └───────────────────┘
```

1. Twój system wysyła **zlecenie fiskalizacji** (`POST /print_requests.json`) z danymi
   dokumentu (pozycje, nabywca, tryb wydruku).
2. Paragony.pl kolejkuje zlecenie dla wskazanej drukarki fiskalnej.
3. Aplikacja Paragony.pl zainstalowana przy drukarce pobiera zlecenie, drukarka fiskalizuje
   dokument — jako **paragon papierowy** (`mode=print`) albo **e-paragon** (`mode=e_receipt`).
4. Paragony.pl wysyła do Twojego systemu **webhook** ze zmianą statusu; dla e-paragonu
   w webhooku przychodzi publiczny link do e-paragonu (`view_url`).

Status zlecenia możesz też w każdej chwili odpytać przez API
(`GET /print_requests/:id.json`).

## Hosty

| Host | Do czego służy |
|------|----------------|
| `https://app.paragony.pl` | rejestracja konta (`POST /account/accounts.json`) |
| `https://<prefix>.paragony.pl` | całe pozostałe API — konto ma własną subdomenę (`prefix` wybierasz przy rejestracji) |
| `https://paragony.pl` | strona produktowa, bez API |

## Konwencje

- Wszystkie żądania i odpowiedzi są w formacie JSON. Format wybiera sufiks `.json`
  w ścieżce (tak robią przykłady w tej dokumentacji) albo nagłówek
  `Accept: application/json`; żądania z body dodają `Content-Type: application/json`.
- Uwierzytelnienie: JWT podpisany Twoim tokenem API w nagłówku
  `Authorization: Bearer <jwt>` — [Konto i uwierzytelnianie](02-konto-i-uwierzytelnianie.md).
- Kwoty przekazuje się **brutto**, wyłącznie w PLN.
- W ścieżkach `:id`, `:code` itp. to placeholdery — podstaw wartość bez dwukropka
  (np. `GET /print_requests/987.json`).

## Szybki start

1. [Załóż konto i utwórz token API](02-konto-i-uwierzytelnianie.md).
2. Podłącz drukarkę fiskalną: zainstaluj przy niej aplikację
   [Paragony.pl](https://paragony.pl) i połącz ją z kontem (instrukcje w
   [bazie wiedzy](https://pomoc.fakturownia.pl/modul-paragony-pl)). Drukarka pojawi się na
   liście `GET /printers.json` — jej `id` wskażesz w zleceniach.
3. [Skonfiguruj webhook](05-webhooki.md), żeby dostawać zmiany statusów bez odpytywania.
4. [Wyślij pierwsze zlecenie fiskalizacji](04-endpointy.md#tworzenie-zlecenia) i obserwuj
   statusy ([cykl życia zlecenia](03-domena.md#statusy-zlecenia)).
5. Gdy coś pójdzie nie tak — [katalog błędów](06-bledy.md).

Maszynowa specyfikacja API: [`openapi.yaml`](openapi.yaml). Gotowe klienty CLI:
[klienci referencyjni](07-klienci-referencyjni.md).

## Słownik

| Pojęcie | Znaczenie |
|---------|-----------|
| **zlecenie fiskalizacji** (print request) | pojedyncze zadanie „zafiskalizuj ten dokument na tej drukarce w tym trybie”; ma cykl życia opisany statusami |
| **e-paragon** | paragon w postaci elektronicznej; po wystawieniu dostępny pod publicznym linkiem (`view_url`) |
| **paragon papierowy** (`mode=print`) | klasyczny wydruk fiskalny |
| **drukarka** | drukarka fiskalna podłączona do konta (przez aplikację Paragony.pl) |
| **connector** | zarejestrowana w koncie konfiguracja odbiornika powiadomień (typ, `code`, adres URL, sekret podpisu) — [rejestracja](05-webhooki.md#rejestracja-webhookow-connector) |
| **webhook** | pojedynczy `POST` ze zdarzeniem (zmiana statusu zlecenia, zmiana drukarki), wysłany na adres zarejestrowanego connectora |
| **`external_id`** | identyfikator dokumentu **w Twoim systemie**; chroni przed podwójną fiskalizacją — [unikalność](03-domena.md#unikalnosc) |
| **`vendor`** | identyfikator Twojego systemu — [opis ról](04-endpointy.md#tworzenie-zlecenia) |
| **prefix** | nazwa subdomeny Twojego konta (`https://<prefix>.paragony.pl`) |
