# Webhooki

Paragony.pl powiadamia Twój system o zmianach **statusów zleceń** i o zmianach **drukarek**
POST-ami na zarejestrowany przez Ciebie adres URL. To zalecany sposób śledzenia zleceń —
zamiast odpytywania.

<a name="rejestracja-webhookow-connector"></a>
## Rejestracja webhooków (connector)

Webhook konfiguruje się, tworząc na koncie **connector** typu `paragony/callback`:

| Pole | Opis |
|------|------|
| `kind` | dosłownie `"paragony/callback"` |
| `code` | **`"paragony-<vendor>"`** — sufiks **musi** być równy wartości `vendor` z Twoich zleceń (po tym Paragony.pl znajduje webhook dla zlecenia). Używasz kilku vendorów → utwórz osobny connector dla każdego |
| `url` | pełny adres Twojej aplikacji, na który mają trafić webhooki |
| `secret_token` | sekret do podpisywania webhooków (HMAC). **Ustal go sam (np. 40 losowych znaków hex) i zapisz — patrz niżej** |
| `active` | czy connector aktywny (domyślnie `true`) |

```shell
# utworzenie (dla zleceń z vendor="mojsklep" code musi być "paragony-mojsklep")
curl -s https://moja-firma.paragony.pl/connect/connectors.json \
  -H "Authorization: Bearer ${JWT}" \
  -H 'Content-Type: application/json' \
  -d '{ "connector": { "kind": "paragony/callback", "code": "paragony-mojsklep",
                       "url": "https://api.mojafirma.pl/webhooki/paragony",
                       "secret_token": "WYGENEROWANY_SEKRET" } }'
# → 201 z obiektem connectora (bez secret_token)

# podgląd / zmiana / usunięcie
curl -s https://moja-firma.paragony.pl/connect/connectors/paragony-mojsklep.json \
  -H "Authorization: Bearer ${JWT}"
# PATCH z body {"connector": {"url": "...", "secret_token": "..."}} → 200
# DELETE → 204
```

⚠️ **`secret_token` jest tylko do zapisu** — odpowiedzi API zwracają najwyżej maskowany
podgląd (`secret_token_info`, pierwszy i dwa ostatnie znaki), nigdy pełną wartość.
Zapisz go u siebie w momencie ustawiania; zgubiony sekret można tylko zmienić
(`PATCH` z nowym `secret_token`).

Connector można też skonfigurować w interfejsie WWW konta (sekcja konektorów/integracji).

Connector dostaje zdarzenia **od momentu utworzenia** — wcześniejszych zdarzeń (w tym
istniejących drukarek) nie wysyłamy. Stan początkowy drukarek pobierz
`GET /printers.json`, a webhooków `printer:*` używaj do utrzymywania go na bieżąco.

<a name="routing-zdarzen"></a>
## Routing zdarzeń — który connector co dostaje

| Zdarzenie | Trafia na |
|-----------|-----------|
| `print_request:update`, `print_request:email` | **wyłącznie jeden** connector — ten o code `paragony-<vendor>` równym vendorowi zlecenia. Brak takiego connectora = webhook **nie zostaje wysłany** — bez błędu przy tworzeniu zlecenia; statusy sprawdzisz wtedy tylko `GET /print_requests/:id.json` |
| `printer:create/update/destroy` | **wszystkie** aktywne connectory konta — drukarki są wspólne dla konta, nie per vendor |

Dlatego connector `paragony-<vendor>` rejestruj **przed** pierwszym zleceniem z danym
vendorem.

## Format webhooka

Każdy webhook to `POST` na `url` connectora, `Content-Type: application/json`, z kopertą:

```text
{ "kind": "<typ zdarzenia>", "<nazwa obiektu>": { <obiekt> } }
```

Pole `kind` koperty pozwala rozróżnić rodzaje zdarzeń
([routing zdarzeń](#routing-zdarzen)). Nieznane typy loguj i potwierdzaj 200 — z czasem
dochodzą nowe rodzaje zdarzeń.

### `print_request:update` — zmiana statusu zlecenia

```json
{ "kind": "print_request:update",
  "print_request": { "id": 987, "external_id": "21f65a83-51e0-11ee-a237-a1c5a4e9c123", "status": "er_pending" } }
```

a dla wystawionego e-paragonu (status `er_printed`) — **zawsze razem z linkiem**:

```json
{ "kind": "print_request:update",
  "print_request": { "id": 987, "external_id": "21f65a83-51e0-11ee-a237-a1c5a4e9c123",
                     "status": "er_printed",
                     "view_url": "https://moja-firma.paragony.pl/iB000002Ef4c…" } }
```

- `id` to identyfikator zlecenia w Paragony.pl, `external_id` — identyfikator dokumentu
  w Twoim systemie (ten ze zlecenia).
- `status` — [cykl życia zlecenia](03-domena.md#statusy-zlecenia).
- `view_url` — publiczny link do e-paragonu, obecny wyłącznie przy
  `status="er_printed"` ([e-paragon](03-domena.md#e-paragon)).
- Nieudaną wysyłkę e-paragonu mailem ([`send_by_email`](04-endpointy.md#wysylka-mailem))
  sygnalizuje osobne zdarzenie, [`print_request:email`](#print-request-email).

<a name="print-request-email"></a>
### `print_request:email` — nieudana wysyłka e-paragonu mailem

```json
{ "kind": "print_request:email",
  "print_request": { "id": 987, "external_id": "21f65a83-51e0-11ee-a237-a1c5a4e9c123",
    "email_delivery": { "email": "nabywca@example.com", "email_status": "failed",
                        "email_error": "Mailbox does not exist" } } }
```

- Wysyłany wyłącznie po nieudanej próbie wysyłki maila — każda kolejna nieudana próba
  (np. po ponowieniu przez [`send_by_email`](04-endpointy.md#wysylka-mailem)) to kolejne
  zdarzenie. Dla `queued` i `sent` webhooka nie ma: udaną wysyłkę potwierdzasz przez
  `email_status` w [`email_delivery`](04-endpointy.md#status-zlecenia).
- `email_error` — powód niepowodzenia zgłoszony przez serwer pocztowy.

### `printer:create` / `printer:update` / `printer:destroy` — zmiany drukarek

```json
{ "kind": "printer:update",
  "printer": { "id": 42, "uid": "ABC123", "model": "Posnet Thermal", "name": "Kasa 1",
               "deleted": false, "footer_text": "Dziękujemy za zakupy!",
               "connection_method": "usb", "default_mode": "e_receipt",
               "e_receipt": true, "e_receipt_configured": true } }
```

`printer:destroy` niesie minimalny obiekt `{ "id": 42, "uid": "ABC123" }`.
Utrzymuj u siebie cache listy drukarek po `id`/`uid`, jeśli pokazujesz je użytkownikom.

## Weryfikacja podpisu

Każdy webhook ma nagłówek:

```
Authorization: Bearer <jwt>
```

JWT jest podpisany **HS256 sekretem `secret_token` Twojego connectora** i niesie claimy:

| Claim | Znaczenie | Jak weryfikować |
|-------|-----------|-----------------|
| `bh` | `base64url(SHA256(surowe body żądania))`, bez paddingu | policz hash z **dokładnie odebranych bajtów** i porównaj |
| `exp` / `iat` | okno ważności (5 minut) | odrzuć wygasłe |
| `htm` | metoda (`"POST"`) | sprawdź |
| `htu` | URL connectora | informacyjnie, możesz sprawdzić czy się zgadza |

⚠️ **`bh` licz z treści body** (bajty, które przyszły w żądaniu — np. `request.raw_post`),
przed deserializacją.

Weryfikacja krok po kroku: (1) zweryfikuj JWT sekretem connectora (podpis + `exp`),
(2) porównaj `bh` z hashem surowego body, (3) dopiero teraz parsuj JSON i przetwarzaj.
Żądania bez poprawnego podpisu odrzucaj 401.

### Ruby (gem [`jwt`](https://rubygems.org/gems/jwt), np. wewnątrz akcji Rails)

```ruby
require "jwt"
require "base64"
require "openssl"

# zwraca payload JWT; przy niepoprawnym podpisie podnosi wyjątek
def verify_webhook!(authorization_header, raw_body, secret)
  token = authorization_header.to_s.sub(/\ABearer\s+/i, "")
  payload, = JWT.decode(token, secret, true, algorithm: "HS256") # podpis + exp
  bh = Base64.urlsafe_encode64(OpenSSL::Digest::SHA256.digest(raw_body), padding: false)
  raise "bh mismatch (zmienione body)" unless OpenSSL.secure_compare(bh, payload["bh"].to_s)

  payload
end

# w akcji: verify_webhook!(request.headers["Authorization"], request.raw_post, SECRET)
```

### Node.js (pakiet [`jsonwebtoken`](https://www.npmjs.com/package/jsonwebtoken))

```js
import jwt from "jsonwebtoken";
import crypto from "node:crypto";

function verifyWebhook(authorizationHeader, rawBodyBuffer, secret) {
  const token = String(authorizationHeader || "").replace(/^Bearer\s+/i, "");
  const payload = jwt.verify(token, secret, { algorithms: ["HS256"] }); // podpis + exp
  const bh = Buffer.from(crypto.createHash("sha256").update(rawBodyBuffer).digest("base64url"));
  const given = Buffer.from(String(payload.bh || ""));
  if (bh.length !== given.length || !crypto.timingSafeEqual(bh, given)) {
    throw new Error("bh mismatch (zmienione body)");
  }
  return payload;
}
```

## Kontrakt dostarczania — co musi robić Twój odbiornik

- **Odpowiadaj kodem 2xx**. Body jest ignorowane.
- **Przetwarzaj idempotentnie.** Webhooki nie mają identyfikatora zdarzenia — projektuj
  odbiornik tak, żeby powtórzona dostawa była nieszkodliwa (np. „ustaw status X dla
  zlecenia `id`” zamiast „zwiększ licznik”). Paragony.pl wysyła webhook przy **zmianie**
  stanu, więc powtórka niesie ten sam stan.
- Odbiornik musi być osiągalny z internetu po HTTPS. Do testów lokalnych wystaw go
  tunelem (np. `cloudflared`, `ngrok`) i ustaw adres tunelu jako `url` connectora.
