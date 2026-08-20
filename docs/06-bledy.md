# Błędy — katalog i sposoby rozwiązania

## Kody HTTP

| Kod | Kiedy | Co robić |
|-----|-------|----------|
| `200` | żądanie przetworzone; przy tworzeniu zleceń nie znaczy „wszystko przyjęte” | przejdź po elementach `print_requests[]` — [tworzenie zlecenia](04-endpointy.md#tworzenie-zlecenia) |
| `201` | zasób utworzony (konto, token, drukarka, connector) | — |
| `204` | zasób usunięty (connector) | — |
| `401` (`{"error":"login_required"}`) | brak nagłówka `Authorization`, nierozpoznany format albo niepoprawny JWT (zły podpis/fingerprint, wygasły `exp`, uszkodzona struktura); odpowiedź nie niesie przyczyny | zweryfikuj format `Bearer <jwt>` i budowę JWT — [uwierzytelnianie](02-konto-i-uwierzytelnianie.md#najczęstsze-błędy-uwierzytelnienia) |
| `404` | zasób nie istnieje (np. zlecenie o danym `id`, connector o danym `code`) | sprawdź identyfikator i **subdomenę konta** (zasób innego konta = 404) |
| `422` | błąd walidacji / operacja niedozwolona w tym stanie | komunikat w body — katalog niżej |
| `5xx` / timeout | awaria po stronie serwera | ponów później, wydłużając odstęp między próbami |

Body błędu ma zwykle kształt `{"status":"error","message":"…","print_requests":[…]}`
(tworzenie zleceń — [kontrakt pozycyjny](04-endpointy.md#tworzenie-zlecenia)),
`{"message":"…"}` (pozostałe akcje zleceń) albo mapę `pole → lista komunikatów`
(walidacje drukarki).

## Rejestracja konta

Walidacje [rejestracji](02-konto-i-uwierzytelnianie.md#założenie-konta) wracają jako `422`
z mapą `pole → lista komunikatów`; błędy użytkownika są zagnieżdżone pod kluczem `user`.

| Odpowiedź | Przyczyna | Rozwiązanie |
|-----------|-----------|-------------|
| `{"user":{"login":["zostało już zajęte"]}}` | ten e-mail jest już zarejestrowany — `login` domyślnie równa się e-mailowi, więc kolizja wychodzi na polu, którego nie wysyłasz | użyj innego e-maila albo [utwórz token](02-konto-i-uwierzytelnianie.md#token-api--skąd-go-wziąć) na istniejącym koncie |

## Tworzenie zlecenia — błędy odrzuconych dokumentów

Odrzucony dokument wraca w odpowiedzi tworzenia jako element
`{"external_id": …, "errors": [komunikaty]}` na swojej pozycji
([kontrakt pozycyjny](04-endpointy.md#tworzenie-zlecenia)). Błąd całego żądania
(pusta/nieobecna tablica `print_requests`) wraca w top-level `message`.

Katalog komunikatów. Błędy pojedynczej pozycji (cena, stawka VAT, rabat, brak nazwy)
przychodzą jako komunikat wielolinijkowy: `Error: Nieprawidłowe dane:`, numer dokumentu
i numer pozycji, na końcu komunikat z katalogu — dopasowuj go po fragmencie.

| Komunikat | Przyczyna | Rozwiązanie |
|-----------|-----------|-------------|
| `Brak paragonów do wydruku` | pusta/nieobecna top-levelowa tablica `print_requests` — także wtedy, gdy payload ma inny kształt (np. dokumenty zagnieżdżone pod innym kluczem) | wyślij dokumenty w top-levelowej tablicy `print_requests` ([kształt](04-endpointy.md#tworzenie-zlecenia)) |
| `ID paragonu jest nieprawidłowe` | brak `external_id` dokumentu | zawsze nadawaj `external_id` |
| `vendor: nie może być puste` | brak pola `vendor` albo pusta wartość (ani wspólnej dla żądania, ani per dokument) | podaj niepusty `vendor` — [opis vendora](04-endpointy.md#tworzenie-zlecenia) |
| `Nie znaleziono drukarki o id '…'` / `…o nazwie '…'` | `printer_id`/`printer_name` pozycji nie pasuje do żadnej drukarki konta | pobierz listę `GET /printers.json` i użyj aktualnego `id` |
| `nieznany tryb wydruku '…' (dozwolone: print, e_receipt)` | literówka w `mode` | użyj `print` lub `e_receipt` |
| `Brak pozycji na paragonie.` | puste `positions` | dodaj pozycje |
| `Brakuje nazwy pozycji` | pozycja bez `name` | uzupełnij nazwę pozycji |
| `ma inną walutę niż PLN.` | `currency` ≠ `PLN` | fiskalizować można wyłącznie dokumenty w PLN |
| `Kwota brutto musi być dodatnia.` | `price_gross` dokumentu ≤ 0 | popraw kwoty |
| `Niepoprawna ilość na pozycji N. … (ilość musi być dodatnia)` | `quantity` pozycji ≤ 0 | ustaw `quantity` większe od zera |
| `Niepoprawna ilość na pozycji N. … (ilość może mieć maksymalnie 5 miejsc po przecinku)` | `quantity` ma więcej niż 5 miejsc po przecinku | zaokrąglij `quantity` do maksymalnie 5 miejsc po przecinku |
| `Niepoprawna cena X (cena musi być dodatnia)` | `total_price_gross` pozycji ≤ 0 | popraw pozycję |
| `Niepoprawna cena jednostkowa X (price_gross musi być dodatni)` | `price_gross` pozycji ≤ 0 | popraw cenę jednostkową |
| `Niepoprawna wartość brutto na pozycji N. …` | `total_price_gross ≠ price_gross × quantity` (2 miejsca) | wyrównaj wartości pozycji |
| `Niepoprawna wartość brutto na dokumencie` | suma pozycji (minus rabaty) ≠ `price_gross` dokumentu | wyrównaj sumę dokumentu albo pomiń `price_gross` (zostanie wyliczona) |
| `Niepoprawna stawka VAT "…"` | `tax` spoza [mapowania stawek](03-domena.md#stawki-vat) | użyj: 23, 8, 5, 0, `zw`, `disabled` |
| `Rabat na tej pozycji nie da się rozbić na … szt. z ceną jednostkową co do grosza na tym urządzeniu. Prześlij price_gross i total_price_gross już PO rabacie (bez pól discount/discount_percent).` | faktura (`kind=vat`) z rabatem na drukarce, która nie obsługuje osobnej linii rabatu, a rabatu nie da się wliczyć w cenę jednostkową co do grosza — błąd zwracany **przy wydruku**, nie przy tworzeniu zlecenia | prześlij `price_gross`/`total_price_gross` już po rabacie, bez pól `discount`/`discount_percent` — [rabat na fakturze](03-domena.md#rabat-na-fakturze) |
| `Fiskalizacja dokumentów ze stawką disabled wymaga wcześniejszej konfiguracji Zera technicznego w Ustawieniach na stronie Paragony.pl` | pozycja ma `tax="disabled"`, a konto nie ma skonfigurowanego Zera technicznego | skonfiguruj Zero techniczne w Ustawieniach konta |
| `eParagon można wystawić tylko z Paragonu` | `mode=e_receipt` przy `kind` ≠ `receipt` | e-paragon wymaga `kind="receipt"` |
| `Próba wydruku faktury bez numeru NIP nabywcy.` | dokument typu faktura bez `buyer.tax_no` (dotyczy części drukarek) | uzupełnij NIP nabywcy |
| `Paragon jest już zafiskalizowany — nie drukujemy ponownie` | aktywne zlecenie o tym `external_id` jest już zafiskalizowane | to ochrona przed podwójną fiskalizacją — [szczegóły](03-domena.md#unikalnosc); jeśli to NOWY dokument, nadaj mu inny `external_id` |

Osobny przypadek: `mode=e_receipt` na drukarce, która nie obsługuje / nie ma
skonfigurowanych e-paragonów, **nie odrzuca dokumentu** — zlecenie jest przyjmowane
od razu ze statusem `error` (element odpowiedzi ma `id` i `status: "error"`,
dokument nie zostanie zafiskalizowany). Skonfiguruj e-paragony na drukarce
(aplikacja Paragony.pl) albo użyj `mode=print`.

<a name="rozliczenia"></a>
## Rozliczenia e-paragonów

Wystawianie e-paragonów wymaga aktywnej subskrypcji z dostępnym limitem; ważnej subskrypcji
wymagają też paragony papierowe. Zlecenie (niezależnie od `mode`) może zostać odrzucone z:

| Komunikat | Przyczyna | Rozwiązanie |
|-----------|-----------|-------------|
| `Rozliczenia paragonów nie są skonfigurowane dla tego konta — zlecenie odrzucone` | konto nie ma skonfigurowanych rozliczeń paragonów — blokuje utworzenie **każdego** zlecenia, niezależnie od `mode` (papierowy paragon też) | skonfiguruj/opłać rozliczenia w sekcji **Płatności** konta Paragony.pl (konta prowadzone przez Fakturownię — w panelu Fakturowni) |
| `Brak subskrypcji Paragony.pl — opłać abonament` | konto nie ma subskrypcji Paragony.pl | opłać abonament |
| `Subskrypcja Paragony.pl nieaktywna — opłać/odnów abonament` | subskrypcja wygasła | odnów abonament |
| `Brak dostępnych użyć e-paragonów (paczka wyczerpana)` | limit e-paragonów w okresie wyczerpany | dokup pakiet e-paragonów |

Gdzie opłacić: sekcja **Płatności** na koncie Paragony.pl; konta prowadzone przez
Fakturownię opłacają pakiety w panelu Fakturowni. Rozliczany jest **wystawiony e-paragon** —
zlecenia zakończone błędem i anulowane nie pomniejszają limitu.

## Operacje na istniejącym zleceniu

| Żądanie | Komunikat / kod | Przyczyna |
|---------|-----------------|-----------|
| `DELETE …/:id` | `422`, `Niedozwolone przejście statusu paragonu (<stary> → cancelled)` | zlecenie już zafiskalizowane — nie da się anulować ([cykl życia](03-domena.md#statusy-zlecenia)) |
| `DELETE …/:id` | `200`, `status` bez zmian | zlecenie już było `cancelled`/`error` — anulowanie jest idempotentne |
| `GET/DELETE …/:id` | `404` | zlecenie nie istnieje (albo żądanie poszło na złą subdomenę) |

<a name="wysylka-mailem-bledy"></a>
## Wysyłka e-paragonu mailem

Katalog odpowiedzi endpointu [`send_by_email`](04-endpointy.md#wysylka-mailem):

| Komunikat / kod | Przyczyna | Rozwiązanie |
|-----------------|-----------|-------------|
| `422`, `E-paragon nie został jeszcze wystawiony` | status zlecenia dochodzący (`to_print`/`printing`/`er_pending`/`er_fail`) | poczekaj na webhook ze statusem `er_printed` i spróbuj ponownie |
| `422`, `To zlecenie nie ma i nie będzie mieć e-paragonu` | status końcowy bez e-paragonu (`printed`/`er_fatal`/`error`/`cancelled`) | ponowienie bezcelowe — e-paragon dla tego zlecenia nigdy nie powstanie |
| `422`, `Nieprawidłowy adres e-mail` | `buyer_email` błędny składniowo | popraw adres |
| `422`, `Brak adresu e-mail nabywcy — podaj go w żądaniu` | zlecenie nie ma adresu doręczenia, żądanie też go nie podało | podaj `buyer_email` w żądaniu |
| `422`, `Wyczerpano limit wysyłek e-paragonu dla tego zlecenia (5)` | zlecenie zużyło wszystkie 5 wysyłek ([limit](04-endpointy.md#wysylka-mailem)) | ponowienie bezcelowe — limit nie odnawia się; przekaż `view_url` innym kanałem |
| `429`, `Zbyt wiele prób wysyłki, spróbuj ponownie za chwilę` | anty-spam limit wywołań | odczekaj i ponów |
| `404` | zlecenie nie istnieje | sprawdź `id` i subdomenę konta |

## Drukarki

| Komunikat / kod | Przyczyna | Rozwiązanie |
|-----------------|-----------|-------------|
| `422` z `{"default_mode":[…]}` | `default_mode` spoza `print`/`e_receipt` | popraw wartość |

## Webhooki (Twój odbiornik)

| Objaw | Przyczyna | Rozwiązanie |
|-------|-----------|-------------|
| podpis JWT się nie zgadza | weryfikujesz innym sekretem niż `secret_token` connectora | sekretu nie da się odczytać — jeśli go nie masz, ustaw nowy (`PATCH` connectora) |
| `bh mismatch` | hash liczony z reserializowanego JSON-a zamiast surowych bajtów | licz `bh` z surowego body — [weryfikacja podpisu](05-webhooki.md#weryfikacja-podpisu) |
| webhooki nie przychodzą w ogóle | connector nieaktywny, URL nieosiągalny z internetu, odbiornik nie odpowiada 2xx | sprawdź connector (`GET /connect/connectors/paragony-<vendor>.json`), logi swojego serwera; przetestuj lokalnie przez tunel |
| zdarzenia `printer:*` przychodzą, statusy zleceń — nie | sufiks `code` connectora ≠ `vendor` zleceń (statusy idą wyłącznie na connector `paragony-<vendor>`; zdarzenia drukarek na wszystkie) | wyrównaj `code` z vendorem — [routing zdarzeń](05-webhooki.md#routing-zdarzen) |
| status „stoi” w `er_pending`/`er_fail` | dostarczanie e-paragonu w toku/ponawiane | to stany przejściowe — rozstrzygną się w `er_printed`/`er_fatal`; dla długo wiszących zleceń odpytaj `GET …/:id.json` |
