# Konto i uwierzytelnianie

## Założenie konta

Konto zakładasz jednym żądaniem — **na hoście `app.paragony.pl`**:

```shell
curl -s https://app.paragony.pl/account/accounts.json \
  -H 'Content-Type: application/json' \
  -d '{
    "account": { "prefix": "moja-firma" },
    "user":    { "email": "integracje@mojafirma.pl",
                 "password": "TwojeSilneHaslo!",
                 "password_confirmation": "TwojeSilneHaslo!" }
  }'
```

Odpowiedź `201 Created` (najważniejsze pola):

```json
{
  "prefix": "moja-firma",
  "product_app": "fiskator",
  "user": {
    "login": "integracje@mojafirma.pl",
    "email": "integracje@mojafirma.pl",
    "api_token": "intm..."
  }
}
```

- `prefix` — subdomena konta; od teraz całe API wołasz na `https://moja-firma.paragony.pl`.
- `user.api_token` — token API. **Zapisz go od razu.**
- Konto można też założyć przez formularz na [paragony.pl](https://paragony.pl) — wtedy token
  utworzysz później (patrz niżej).

## Token API — skąd go wziąć

Surowy token jest zwracany **wyłącznie w momencie utworzenia** — przy rejestracji konta
(pole `user.api_token` powyżej) albo przy tworzeniu nowego tokena. Nie ma sposobu na
ponowne odczytanie: zgubiony token usuwasz i tworzysz nowy. Metadane istniejących tokenów
(bez sekretów) daje [`GET /account/api_tokens.json`](04-endpointy.md#lista-tokenow).

Nowy token utworzysz w interfejsie WWW konta (sekcja tokenów API) albo przez API —
`POST /account/api_tokens.json`, uwierzytelnione [JWT-em](#uwierzytelnianie-żądań--jwt)
podpisanym dowolnym już posiadanym tokenem (np. tym z rejestracji konta):

```shell
curl -s https://moja-firma.paragony.pl/account/api_tokens.json \
  -H "Authorization: Bearer ${JWT}" \
  -H 'Content-Type: application/json' \
  -d '{ "api_token": { "name": "moj-system", "for_account": true } }'
```

Odpowiedź `201` zawiera pole `token`.

Utwórz token z `for_account: true` — nie jest przypisany do użytkownika i nie zostanie
usunięty z konta przy odpinaniu Twojego usera.

## Uwierzytelnianie żądań — JWT

Przy każdym żądaniu **generujesz krótkotrwały JWT podpisany swoim api_tokenem** i wysyłasz go
w standardowym nagłówku:

```
Authorization: Bearer <jwt>
```

Reguły budowy JWT:

- algorytm **HS256**; **sekretem HMAC jest surowy token API**;
- payload: `{ "key": "<fingerprint>", "exp": <unix timestamp> }`, gdzie
  **`key` = pierwsze 16 znaków hex z SHA-256 surowego tokena**;
- `exp` — krótki czas życia (rekomendowane ~300 s);
- segmenty JWT kodowane **base64url bez paddingu** (standardowy JWT).

### Ruby (gem [`jwt`](https://rubygems.org/gems/jwt))

```ruby
require "jwt"
require "digest"

jwt = JWT.encode({ key: Digest::SHA256.hexdigest(api_token)[0, 16],
                   exp: Time.now.to_i + 300 }, api_token, "HS256")
# request["Authorization"] = "Bearer #{jwt}"
```

### Node.js (pakiet [`jsonwebtoken`](https://www.npmjs.com/package/jsonwebtoken))

```js
import jwt from "jsonwebtoken";
import crypto from "node:crypto";

const key = crypto.createHash("sha256").update(apiToken).digest("hex").slice(0, 16);
const token = jwt.sign({ key }, apiToken, { algorithm: "HS256", expiresIn: 300 });
// headers.Authorization = `Bearer ${token}`;
```

### curl

`curl` sam nie policzy JWT — wygeneruj go i podstaw:

```shell
JWT=$(ruby -rjwt -rdigest -e 't = ENV.fetch("PARAGONY_API_TOKEN")
  puts JWT.encode({key: Digest::SHA256.hexdigest(t)[0,16], exp: Time.now.to_i + 300}, t, "HS256")')

curl -s "https://moja-firma.paragony.pl/printers.json" \
  -H "Authorization: Bearer ${JWT}"
```

### Wypróbuj bez pisania kodu

W [referencji API](api.md) wklej swój `api_token` w polu nad Swagger UI — JWT dla każdego
żądania „Try it out” zostanie policzony automatycznie w przeglądarce, zgodnie z regułami
budowy JWT opisanymi wyżej.

!!! warning
    Nie wklejaj tam produkcyjnego `api_token` na współdzielonym albo publicznie dostępnym
    komputerze. Token trafia wyłącznie do `sessionStorage` tej karty (znika po jej zamknięciu),
    ale strona jest hostowana na publicznie osiągalnym portalu — każdy, kto ma dostęp do tej
    samej przeglądarki przed zamknięciem karty, mógłby go odczytać z narzędzi deweloperskich.

### Najczęstsze błędy uwierzytelnienia

| Objaw | Przyczyna |
|-------|-----------|
| `401` `{"error":"login_required"}` | brak nagłówka `Authorization`, format inny niż `Bearer <jwt>` albo JWT niepoprawny: zły podpis (inny sekret), złe `key`, wygasły `exp`, uszkodzona struktura. Odpowiedź nie niesie przyczyny — diagnozuj regułami budowy JWT wyżej |
| odpowiedź HTML zamiast JSON | żądanie poszło na `paragony.pl` albo złą subdomenę |
