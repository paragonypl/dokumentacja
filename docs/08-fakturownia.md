# Integracja przez API Fakturowni

Paragon wystawiasz w [Fakturowni](https://fakturownia.pl) i tam zlecasz jego fiskalizację —
jako e-paragon albo paragon papierowy. Do fiskalizacji wymagana jest drukarka fiskalna
połączona z Fakturownią za pomocą modułu [Paragony.pl](https://paragony.pl/); instrukcja
konfiguracji dostępna jest
[tutaj](https://pomoc.fakturownia.pl/45289196-Paragony-pl-2-5-1-modul-do-wydrukow-fiskalnych-instalacja-i-czynnosci-poinstalacyjne).

Działające przykłady wywołania API Fakturowni znajdują się też w systemie Fakturownia
(po zalogowaniu) w menu <b>Ustawienia > API</b> oraz na stronie: https://paragony.pl/api
oraz https://fakturownia.pl/api

<a name="token"></a>

## API token

`API_TOKEN` token trzeba pobrać z ustawień aplikacji: `Ustawienia -> Ustawienia konta -> Integracja -> Kod autoryzacyjny API`

<a name="examples"></a>
## Przykłady

<a name="f1"></a>
### Pobranie listy paragonów

```shell
curl https://PREFIX.fakturownia.pl/invoices.json -H 'Authorization: Bearer __API_TOKEN__'
```

```shell
curl 'https://PREFIX.fakturownia.pl/invoices.json?kind=receipt' -H 'Authorization: Bearer __API_TOKEN__'
```

### Pobranie szczegółowych danych jednego paragonu

```shell
curl https://PREFIX.fakturownia.pl/invoices/_ID_.json -H 'Authorization: Bearer __API_TOKEN__'
```

W polu `e_receipt_view_url` zostanie zwrócony link do e-Paragonu (jeśli e-Paragon został utworzony do danego paragonu).

### Dodanie nowego paragonu

```shell
curl https://PREFIX.fakturownia.pl/invoices.json \
  -H 'Authorization: Bearer __API_TOKEN__' \
  -H 'Content-Type: application/json' \
  -d '{
    "invoice": {
      "kind":"receipt",
      "number": null,
      "sell_date": "2025-05-16",
      "issue_date": "2025-05-16",
      "payment_to": "2025-05-23",
      "seller_name": "Seller1 SA",
      "seller_tax_no": "6272616681",
      "buyer_name": "Client1 SA",
      "buyer_tax_no": "6272616682",
      "buyer_email" : "buyer@testemail.pl",
      "positions":[
        {"name":"Produkt A1", "tax":23, "total_price_gross":10.23, "quantity":1},
        {"name":"Produkt A2", "tax":0, "total_price_gross":50, "quantity":2}
      ]
    }
  }'
```

<a name="automatyczna-fiskalizacja"></a>
Po utworzeniu paragonu, w odpowiedzi zwracany jest jego  `_ID_` - aby wygenerować e-paragon wywołujemy poniższe zapytanie. Fiskalizacja może również zostać zautomatyzowana poprzez [Ustawienia Fakturowni](https://pomoc.fakturownia.pl/179236547-Automatyczna-fiskalizacja-paragonow-po-utworzeniu-przez-API).

Do wystawienia e-paragonu `buyer_email` jest wymagany.


```shell
curl 'https://PREFIX.fakturownia.pl/invoices/fiscal_print?fiskator_name=_PRINTER_ID_&id=_ID_&mode=e-receipt' -H 'Authorization: Bearer __API_TOKEN__'
```

`_PRINTER_ID_` należy pobrać ze strony: https://PREFIX.fakturownia.pl/printers.json

Jeśli `fiskator_name` nie zostanie przesłane, zlecenie fiskalizacji zostanie wysłane do domyślnej drukarki określanej zgodnie z opisaną [tutaj](https://pomoc.fakturownia.pl/177648728-Ustawienie-domyslnej-drukarki-fiskalnej-) logiką.

`mode` może przyjmować wartości:
- `e-receipt` - e-paragon
- `print` - wydruk paragonu papierowego

Po wygenerowaniu e-paragonu przez drukarkę, dostanie on unikalny URL postaci:  
https://PREFIX.paragony.pl/iB000002Ef4cSVbaNyYupWFpwe33DDW (ten url przypisany jest do danego paragonu w Fakturowni w polu `e_receipt_view_url`)

<a name="wysylka-e-paragonu"></a>
Po wygenerowaniu e-paragonu, można zlecić jego wysyłkę mailową przesyłając żądanie wysyłki mailowej paragonu o danym `_ID_`, do którego został wygenerowany:

```shell
curl 'https://PREFIX.fakturownia.pl/invoices/_ID_/send_by_email.json' -H 'Authorization: Bearer __API_TOKEN__'
```

Wysyłka e-paragonu mailem może również zostać zautomatyzowana w [Ustawieniach Fakturowni](https://pomoc.fakturownia.pl/179433234-Automatyczne-wysylanie-e-paragonow-e-mailem).

Link do e-paragonu można pobrać do swojej aplikacji, [pobierając dane paragonu](#f1) o danym `_ID_` (pole `e_receipt_view_url`), jest on również zwracany przez webhook `invoice:update`.

Webhook `invoice:update` można skonfigurować w Ustawienia > Ustawienia konta > Integracja w Fakturowni, lub przez API. Opis Webhooków można znaleźć w [artykule](https://pomoc.fakturownia.pl/1239014-Integracja-danych-z-Fakturowni-za-pomoca-webhookow), przykłady wywołań API dla webhooków można znaleźć w [dokumentacji Fakturowni](https://github.com/fakturownia/api?tab=readme-ov-file#webhooks).

Link do e-paragonu dostępny jest również w publicznym podglądzie paragonu `view_url`, który zwracany jest w odpowiedzi po wystawieniu paragonu w Fakturowni. Kiedy e-paragon do danego paragonu zostanie wygenerowany, w podglądzie pojawi się przycisk „Zobacz e-Paragon”.

Zalecanym sposobem uzyskania `e_receipt_view_url` są webhooki - w przypadku wyłączonej drukarki fiskalnej / problemów z połączeniem internetowym na drukarce, e-paragon zostanie wystawiony dopiero po ponownym połączeniu z drukarką, nie od razu po zleceniu jego fiskalizacji w Fakturowni. Webhook `invoice:update` zwróci link do e-paragonu, kiedy tylko on zostanie wystawiony.

## FAQ

### Jak przekazać e-paragon Klientowi?

Zleć wysyłkę mailową (`POST /invoices/_ID_/send_by_email.json`) albo pobierz link
`e_receipt_view_url` i przekaż go własnym kanałem — patrz [wysyłka e-paragonu](#wysylka-e-paragonu).
