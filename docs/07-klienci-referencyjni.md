# Klienci referencyjni

Dwie referencyjne implementacje klienta tego API (Ruby i Node.js) — CLI pokrywające cały
cykl integracji: rejestrację konta, tokeny, drukarki, zlecenia i nasłuch webhooków
przez tunel.

| Klient | Technologia | Gdzie |
|--------|-------------|-------|
| `paragony_client.rb` | Ruby (czysty stdlib, jeden plik) | [`paragony_client.rb`](https://github.com/paragonypl/paragony-client/blob/main/paragony_client.rb) |
| `paragony_client` | Node.js (czysty `node:crypto`, bez zależności) | pakiet npm / [github.com/paragonypl/paragony-client](https://github.com/paragonypl/paragony-client) |

Oba klienty implementują identyczny zestaw komend:

```
signup                 załóż konto i zapisz credentiale lokalnie
login                  zaloguj się na istniejące konto i utwórz token API
configure              ustaw/pokaż lokalną konfigurację
token:create           utwórz nowy token API
token:list             wylistuj tokeny (bez surowych wartości)
printer:list           wylistuj drukarki konta
printer:register       zarejestruj/zaktualizuj drukarkę (upsert po uid)
pr:create              utwórz zlecenie fiskalizacji
pr:show                pokaż status/szczegóły zlecenia
pr:update              „edycja” = anuluj + utwórz na nowo
pr:cancel              anuluj zlecenie
pr:watch               odpytuj status aż do stanu końcowego
webhook:create/show/update/delete   zarządzaj connectorem webhooków
webhook:serve          all-in-one: tunel (cloudflared/ngrok) + rejestracja + nasłuch
```

Do czego się przydają:

- **wzorzec implementacji** — generowanie JWT, nagłówek `Authorization`, weryfikacja podpisu
  webhooków (`bh` z surowego body), paginacja po „nowych id” — dokładnie te fragmenty,
  które najłatwiej napisać źle;
- **testowanie integracji end-to-end** — `webhook:serve` podnosi lokalny odbiornik
  z tunelem i pokazuje webhooki na żywo, `pr:watch` śledzi zlecenie do stanu końcowego;
- **szybka diagnostyka** — gdy Twoja integracja nie działa, porównaj żądania (flaga
  `--verbose` wypisuje pełne żądania/odpowiedzi HTTP).
