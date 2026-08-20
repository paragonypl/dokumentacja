# Endpointy API

Wszystkie żądania: host `https://<prefix>.paragony.pl`, nagłówek
`Authorization: Bearer <jwt>` ([uwierzytelnianie](02-konto-i-uwierzytelnianie.md)),
ścieżka z sufiksem `.json`, a przy żądaniach z body `Content-Type: application/json`.

| Metoda i ścieżka | Działanie |
|------------------|-----------|
| `POST /print_requests.json` | [utworzenie zleceń fiskalizacji](#tworzenie-zlecenia) |
| `GET /print_requests.json` | [lista zleceń](#lista-zlecen) |
| `GET /print_requests/:id.json` | [status/szczegóły zlecenia](#status-zlecenia) |
| `DELETE /print_requests/:id.json` | [anulowanie zlecenia](#anulowanie) |
| `POST /print_requests/:id/send_by_email.json` | [wysyłka e-paragonu mailem](#wysylka-mailem) |
| `GET /printers.json` | [lista drukarek](#drukarki) |
| `PATCH /printers/:id.json` | [aktualizacja drukarki](#drukarki) |
| `GET/POST/PATCH/DELETE /connect/connectors…` | [webhooki — osobny rozdział](05-webhooki.md) |
| `POST /account/api_tokens.json` | [utworzenie tokena API](02-konto-i-uwierzytelnianie.md#token-api--skąd-go-wziąć) |
| `GET /account/api_tokens.json` | [lista tokenów API](#lista-tokenow) |

<a name="tworzenie-zlecenia"></a>
## Tworzenie zleceń — `POST /print_requests.json`

Dokumenty wysyłasz w tablicy **`print_requests[]`** — można kilka naraz, każdy jest
walidowany niezależnie. Obok tablicy stoją pola wspólne dla całego żądania: `vendor`
i `ptu_letter_in_names`. Opis pól: [Model domeny](03-domena.md#zlecenie-fiskalizacji).

**`vendor`** (wymagany) to identyfikator Twojego systemu (dowolny niepusty, **stabilny**
string; zalecany format `[a-z0-9-]`, np. `mojsklep`). Pełni dwie role:

- **routing webhooków** — statusy zlecenia trafiają wyłącznie na connector
  o code `paragony-<vendor>` ([szczegóły](05-webhooki.md#routing-zdarzen));
- **przestrzeń unikalności** — `external_id` jest unikalny w ramach vendora
  ([szczegóły](03-domena.md#unikalnosc)).

Vendora podajesz dla całego żądania i/lub per dokument (`print_requests[].vendor`
nadpisuje wartość wspólną).

```shell
curl -s https://moja-firma.paragony.pl/print_requests.json \
  -H "Authorization: Bearer ${JWT}" \
  -H 'Content-Type: application/json' \
  -d '{
    "vendor": "mojsklep",
    "print_requests": [
      {
        "external_id": "21f65a83-51e0-11ee-a237-a1c5a4e9c123",
        "mode": "e_receipt",
        "printer_id": 42,
        "system_number": "PAR/10045/2026",
        "order_number": "10045",
        "external_url": "https://sklep.mojafirma.pl/zamowienia/10045",
        "kind": "receipt",
        "buyer": { "name": "Jan Kowalski", "email": "jan@example.com" },
        "positions": [
          { "name": "Kubek ceramiczny", "quantity": "2",
            "price_gross": "24.99", "total_price_gross": "49.98", "tax": "23" },
          { "name": "Dostawa", "quantity": "1", "service": true,
            "price_gross": "12.00", "total_price_gross": "12.00", "tax": "23" }
        ]
      }
    ]
  }'
```

Odpowiedź to **kontrakt pozycyjny**: `print_requests[i]` odpowiedzi odpowiada
`print_requests[i]` żądania — werdykt dopasowujesz po pozycji w tablicy, nie po
identyfikatorach. Element:

- **przyjęty** — pełny obiekt zlecenia (ten sam kształt co
  [`GET /print_requests/:id.json`](#status-zlecenia)); ma `id` (identyfikator zlecenia
  w Paragony.pl — nim odpytujesz status, wraca też w webhookach) i `status`;
- **odrzucony** — `{ "external_id": …, "errors": [komunikaty] }`, bez `id`
  (`external_id: null`, gdy dokumentu nie dało się zidentyfikować — brak `external_id`).

Kod `200` znaczy więc „przynajmniej jeden dokument przyjęty”, nie „wszystkie” — zawsze
przejdź po elementach odpowiedzi.

Odpowiedź `200` (przykład z dwoma dokumentami — pierwszy przyjęty, drugi odrzucony):

```json
{
  "status": "success",
  "message": "Zlecenia fiskalizacji zostały utworzone",
  "print_requests": [
    { "id": 987, "external_id": "21f65a83-51e0-11ee-a237-a1c5a4e9c123",
      "status": "to_print", "vendor": "mojsklep", "printer_id": 42 },
    { "external_id": "9d3070e2-6e2b-4f8a-b64a-0c2f5c6d7a41",
      "errors": ["Brak pozycji na paragonie."] }
  ]
}
```

Przyjęty dokument też trzeba sprawdzić po `status`: zlecenie `mode=e_receipt` na
drukarce bez skonfigurowanych e-paragonów jest przyjmowane od razu ze statusem `error`
([walidacje](03-domena.md#zlecenie-fiskalizacji)) — jako jedyny dokument w żądaniu
da `200`, a dokument nie zostanie zafiskalizowany.

Odpowiedź `422` — żaden dokument nie został przyjęty; kształt elementów ten sam:

```json
{
  "status": "error",
  "message": "Nie udało się utworzyć zleceń wydruków",
  "print_requests": [
    { "external_id": "21f65a83-51e0-11ee-a237-a1c5a4e9c123",
      "errors": ["Brak pozycji na paragonie."] }
  ]
}
```

Błąd całego żądania (np. brak tablicy `print_requests`) nie ma pozycji — wraca jako
`422` z pustą tablicą i przyczyną w `message` (np. `"Brak paragonów do wydruku"`).

Katalog komunikatów: [Błędy](06-bledy.md).

**Kolejność konfiguracji:** zlecenie wymaga istniejącej drukarki na koncie — najpierw
podłącz drukarkę, potem twórz zlecenia. Connector `paragony-<vendor>`
zarejestruj przed pierwszym zleceniem ([routing webhooków](05-webhooki.md#routing-zdarzen)).

**Ponowienie po błędzie sieciowym** opiera się na
[unikalności `external_id`](03-domena.md#unikalnosc): zlecenie już zafiskalizowane
odbije się błędem, a czekające w kolejce zostanie zastąpione. Wyjątkiem jest zlecenie
w statusie `printing` — drukarka już je pobrała, więc zastąpienie anuluje je w API,
ale wydruk może już powstać. Gdy nie znasz `id` po nieudanym żądaniu, sprawdź najpierw
listę (`GET /print_requests.json?system_number=…`) zamiast ponawiać w ciemno.

<a name="przyklad-pelny"></a>
### Przykład pełny — pozostałe pola opcjonalne i rabaty

Ten sam kształt żądania, tym razem z pozostałymi polami opcjonalnymi paragonu
([model domeny](03-domena.md#zlecenie-fiskalizacji)) i dwiema pozycjami z rabatem —
jedną z rabatem kwotowym (`discount`), jedną z procentowym (samo `discount_percent`;
kwotę wylicza API — [pola rabatów](03-domena.md#zlecenie-fiskalizacji)).

```shell
curl -s https://moja-firma.paragony.pl/print_requests.json \
  -H "Authorization: Bearer ${JWT}" \
  -H 'Content-Type: application/json' \
  -d '{
    "vendor": "mojsklep",
    "ptu_letter_in_names": true,
    "print_requests": [
      {
        "external_id": "9d3070e2-6e2b-4f8a-b64a-0c2f5c6d7a41",
        "mode": "print",
        "printer_id": 42,
        "kind": "receipt",
        "currency": "PLN",
        "system_number": "PAR/10046/2026",
        "order_number": "10046",
        "external_url": "https://sklep.mojafirma.pl/zamowienia/10046",
        "payment_type": "card",
        "payment_type_text": "Karta płatnicza",
        "buyer": { "tax_no": "5260001246" },
        "positions": [
          {
            "name": "Zestaw upominkowy XL",
            "short_name": "Zestaw XL",
            "quantity": "1",
            "price_gross": "100.00",
            "total_price_gross": "100.00",
            "tax": "23",
            "discount": "10.00"
          },
          {
            "name": "Świeca zapachowa",
            "quantity": "1",
            "price_gross": "50.00",
            "total_price_gross": "50.00",
            "tax": "23",
            "discount_percent": "20"
          }
        ],
        "price_gross": "130.00"
      }
    ]
  }'
```

**Wariant `kind=vat`** (faktura na drukarce fiskalnej) — podawaj `buyer.tax_no`
(część drukarek odrzuca fakturę bez NIP nabywcy — [błąd NIP](06-bledy.md)); nie
kwalifikuje się do e-paragonu. Rabat (`discount`/`discount_percent`) działa, ale
zachowanie zależy od drukarki klienta — [rabat na fakturze](03-domena.md#rabat-na-fakturze).
Tylko tu działają pola odbiorcy i termin płatności
([model domeny](03-domena.md#zlecenie-fiskalizacji)):

```json
{
  "external_id": "3b8c1a90-2d4e-4c11-9f3a-7e5b6a8d0c22",
  "mode": "print",
  "kind": "vat",
  "system_number": "FV/2001/2026",
  "payment_to": "2026-08-05",
  "recipient_name": "Jan Kowalski",
  "buyer": {
    "name": "Firma ABC Sp. z o.o.",
    "tax_no": "5260001246",
    "address": "ul. Testowa 1, 00-002 Warszawa"
  },
  "positions": [
    { "name": "Usługa konsultingowa", "quantity": "1",
      "price_gross": "246.00", "total_price_gross": "246.00", "tax": "23" }
  ]
}
```

<a name="lista-zlecen"></a>
## Lista zleceń — `GET /print_requests.json`

Zwraca tablicę zleceń (paginacja — [patrz niżej](#paginacja)). Filtrowana parametrami
query-string (można łączyć):

| Parametr | Przykład | Znaczenie |
|----------|----------|-----------|
| `status` | `?status=er_printed` | dokładne dopasowanie do [statusu](03-domena.md#statusy-zlecenia) |
| `mode` | `?mode=e_receipt` | tylko zlecenia danego trybu (`print`/`e_receipt`) |
| `email_status` | `?email_status=failed` | dokładne dopasowanie stanu wysyłki e-paragonu mailem — [`email_delivery.email_status`](#status-zlecenia) |
| `system_number` | `?system_number=PAR%2F10045%2F2026` | dokładne dopasowanie numeru dokumentu (wartość URL-encoded) |
| `order_number` | `?order_number=10045` | dokładne dopasowanie numeru zamówienia |
| `q` | `?q=10045` | dopasowanie częściowe (ILIKE) po `system_number` **lub** `order_number` |
| `created_at_from` / `created_at_to` | `?created_at_from=2026-07-01&created_at_to=2026-07-31` | zakres daty utworzenia zlecenia |
| `print_time_from` / `print_time_to` | `?print_time_from=2026-07-01` | zakres momentu pobrania zlecenia przez drukarkę (przejście w `printing`) |

<a name="status-zlecenia"></a>
## Status zlecenia — `GET /print_requests/:id.json`

`:id` = identyfikator zwrócony przy tworzeniu. Odpowiedź to obiekt zlecenia, m.in.:

```json
{
  "id": 987,
  "external_id": "21f65a83-51e0-11ee-a237-a1c5a4e9c123",
  "status": "er_printed",
  "vendor": "mojsklep",
  "e_receipt": true,
  "printer_id": 42,
  "external_url": "https://sklep.mojafirma.pl/zamowienia/10045",
  "view_url": "https://moja-firma.paragony.pl/iB000002Ef4c…",
  "source_document": { "system_number": "PAR/10045/2026", "order_number": "10045", "positions": [] },
  "email_delivery": {
    "email": "jan@example.com",
    "email_status": "sent",
    "email_error": null,
    "email_sent_at": "2026-07-24T10:15:00+02:00"
  }
}
```

- `status` — [cykl życia](03-domena.md#statusy-zlecenia).
- `e_receipt` — czy zlecenie fiskalizuje e-paragon; odzwierciedla rozstrzygnięty tryb
  zlecenia: `mode` ze zlecenia, w jego braku `default_mode` drukarki, dalej `print`.
  Drukarka ma pole o tej samej nazwie, ale tam znaczy „urządzenie obsługuje e-paragony”.
- `view_url` — publiczny link do e-paragonu; obecny wyłącznie gdy `status=er_printed`
  (jak w [webhooku](05-webhooki.md), tam i tu razem ze statusem).
- `email_delivery` — stan wysyłki e-paragonu mailem, obecny wyłącznie gdy
  `status=er_printed` ([co decyduje o wysyłce](03-domena.md#e-paragon)):
  - `email` — aktualny adres doręczenia (`buyer.email` ze zlecenia albo adres podany
    w [`send_by_email`](#wysylka-mailem)); `null`, gdy zlecenie powstało bez adresu.
  - `email_status` — `null` (nie wysyłano) | `queued` | `sent` | `failed`; przejście na
    `failed` dodatkowo powiadamia webhookiem
    [`print_request:email`](05-webhooki.md#print-request-email).
  - `email_error` — powód nieudanej wysyłki; `null`, gdy ostatnia wysyłka się nie zepsuła.
  - `email_sent_at` — czas ostatniej udanej wysyłki (ISO8601); `null`, dopóki żadna
    wysyłka się nie powiodła.
- `source_document` — zapamiętana treść dokumentu ze zlecenia.
- `404` gdy zlecenie nie istnieje.

Do śledzenia zmian statusów używaj [webhooków](05-webhooki.md); odpytywanie
tego endpointu traktuj jako ostateczność.

<a name="anulowanie"></a>
## Anulowanie — `DELETE /print_requests/:id.json`

- Zlecenie **oczekujące** (`to_print`/`printing`) → zostaje anulowane; odpowiedź `200`
  z obiektem zlecenia, `status` = `cancelled`.
- Zlecenie **zafiskalizowane** (`printed`, `er_*`) → anulować się nie da; odpowiedź `422`
  z komunikatem `Niedozwolone przejście statusu paragonu (printed → cancelled)`.
- Zlecenie już `cancelled`/`error` → `200`, bez zmian.

**„Edycji” zlecenia nie ma.** Zmiana treści dokumentu przed wydrukiem = nowe zlecenie
z tym samym `external_id` (oczekujące stare zostanie zastąpione automatycznie) albo
`DELETE` + nowe zlecenie.

<a name="wysylka-mailem"></a>
## Wysyłka e-paragonu mailem — `POST /print_requests/:id/send_by_email.json`

Działa wyłącznie dla zleceń w statusie `er_printed`
([cykl życia](03-domena.md#statusy-zlecenia)). Wysyłka jest asynchroniczna: każde
wywołanie zleca jeden mail; ponowienie (np. po `email_status=failed`) jest bezpieczne.

**Limit: 5 wysyłek na zlecenie**, licząc wysyłkę automatyczną. Liczone są próby, nie
udane doręczenia — pięć wysyłek na błędny adres wyczerpuje limit tak samo jak pięć
udanych. Limit nie odnawia się; po jego wyczerpaniu żądanie wraca z `422`, a e-paragon
przekazujesz przez `view_url`.

Body opcjonalne — `buyer_email` ustawia adres nabywcy zlecenia na stałe (korekta literówki
albo adres zebrany po fiskalizacji, gdy zlecenie powstało bez `buyer.email`):

```shell
curl -s -X POST https://moja-firma.paragony.pl/print_requests/987/send_by_email.json \
  -H "Authorization: Bearer ${JWT}" \
  -H 'Content-Type: application/json' -H 'Accept: application/json' \
  -d '{ "buyer_email": "poprawiony@example.com" }'
```

Bez `buyer_email` wysyłka idzie na dotychczasowy adres nabywcy. Aktualny adres i stan
ostatniej wysyłki czytasz przez [`email_delivery`](#status-zlecenia) w `GET`; o nieudanej
wysyłce dodatkowo powiadamia webhook [`print_request:email`](05-webhooki.md#print-request-email).

Odpowiedź to koperta `{"status": "…", "message": "…"}`:

- **`200`** — wysyłka zakolejkowana.
- **`404`** — zlecenie nie istnieje.
- **`422`** — wysyłka niemożliwa: zlecenie nie ma (jeszcze) e-paragonu, adresu nabywcy
  brakuje lub jest błędny, albo wyczerpał się limit wysyłek dla tego zlecenia.
- **`429`** — limit wywołań; ponów później.

Komunikaty i co z każdym zrobić: [Błędy — wysyłka e-paragonu mailem](06-bledy.md#wysylka-mailem-bledy).

<a name="drukarki"></a>
## Drukarki

### Lista — `GET /printers.json`

Zwraca tablicę drukarek ([pola](03-domena.md#drukarka)). Z listy bierzesz `id` do
`print_requests[].printer_id`. Filtrowana parametrami query-string:

| Parametr | Przykład | Znaczenie |
|----------|----------|-----------|
| `uid` | `?uid=TEST-PRINTER-1` | dokładne dopasowanie identyfikatora sprzętowego |
| `name` | `?name=Kasa%201` | dokładne dopasowanie nazwy |
| `q` | `?q=kasa` | dopasowanie częściowe (ILIKE) po `uid` **lub** `name` |

Drukarki tworzy i rejestruje aplikacja Paragony.pl zainstalowana przy urządzeniu —
integrator obsługuje istniejące.

### Aktualizacja — `PATCH /printers/:id.json`

`:id` = identyfikator z listy drukarek. Edytowalne są tylko pola opisowe: **`name`,
`footer_text`, `default_mode`, `logo_data`**. Tożsamość i możliwości urządzenia (`uid`, `model`,
`connection_method`, `e_receipt`, `e_receipt_configured`) są **tylko do odczytu** — ustawia
je aplikacja Paragony.pl przy drukarce; pozostałe pola z żądania są ignorowane. Odpowiedź
`200` z pełnym obiektem drukarki ([pola](03-domena.md#drukarka)).

```shell
curl -s -X PATCH https://moja-firma.paragony.pl/printers/42.json \
  -H "Authorization: Bearer ${JWT}" \
  -H 'Content-Type: application/json' \
  -d '{ "printer": { "name": "Kasa 1 — parter", "default_mode": "e_receipt" } }'
```

Logo drukowane na e-paragonie ustawiasz w `logo_data` (plik w base64), a usuwasz
`logo_data: { "delete": true }`:

```shell
curl -s -X PATCH https://moja-firma.paragony.pl/printers/42.json \
  -H "Authorization: Bearer ${JWT}" \
  -H 'Content-Type: application/json' \
  -d '{ "printer": { "logo_data": { "base64_data": "iVBORw0KGgo…",
                                    "file_name": "logo.png",
                                    "content_type": "image/png" } } }'
```

- Błąd walidacji → `422` z mapą `pole → lista komunikatów` (np. `{"default_mode": […]}`).
- Nieznany `id` → `404`.

<a name="lista-tokenow"></a>
## Lista tokenów API — `GET /account/api_tokens.json`

Zwraca tablicę metadanych tokenów, bez sekretów — po co i kiedy jej używać:
[token API](02-konto-i-uwierzytelnianie.md#token-api--skąd-go-wziąć). Domyślnie tokeny
bieżącego użytkownika, `?for_account=yes` — kontowe. Paginacja jak w pozostałych
listach ([szczegóły](#paginacja)).

```json
[
  { "id": 12, "kind": null, "name": "moj-system", "for_account": true,
    "integration_app_code": null, "expires_at": null, "active": true }
]
```

<a name="paginacja"></a>
## Paginacja list

Endpointy listujące zwracają **gołą tablicę JSON** (bez metadanych o liczbie stron),
po **25 elementów** na stronę, sterowane parametrem `?page=N`.

⚠️ Strona **poza zakresem zwraca ostatnią stronę** (niepustą), a nie pustą tablicę.
Pętla „pobieraj aż przyjdzie pusto” nigdy się nie skończy — poprawny warunek stopu to
strona, która nie wniosła żadnych nowych identyfikatorów.
