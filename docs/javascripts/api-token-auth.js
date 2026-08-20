/**
 * Automatyczne uwierzytelnianie JWT dla Swagger UI (referencja API, docs/api.md).
 *
 * Kontrakt JWT (docs/02-konto-i-uwierzytelnianie.md): HS256, sekret HMAC = surowy
 * api_token, payload {"key": <pierwsze 16 znaków hex SHA-256(api_token)>, "exp": <unix ts>},
 * TTL ~300 s. Token wygasa szybciej niż trwa sesja "Try it out" w Swagger UI, więc jednorazowe
 * "Authorize" nie wystarczy — JWT trzeba liczyć na nowo przy KAŻDYM żądaniu.
 *
 * mkdocs-swagger-ui-tag nie udostępnia w konfiguracji opcji requestInterceptor, więc zamiast
 * tego podmieniamy fetch wewnątrz iframe'a ze Swagger UI (ten sam origin co strona hosta,
 * więc dostęp do contentWindow jest legalny). Wewnątrz zbundlowanego swagger-ui-bundle.js
 * wywołania sieciowe idą przez gołe wywołanie `fetch(...)` (nie przez zapamiętaną referencję),
 * więc podmiana `contentWindow.fetch` po załadowaniu iframe'a przechwytuje również żądania
 * wysyłane z panelu "Try it out".
 *
 * Surowy api_token trzymamy w sessionStorage (nie localStorage) — ten portal jest publicznie
 * osiągalny (GitHub Pages), więc token ma zniknąć wraz z zamknięciem karty, a nie przeżywać
 * między wizytami na dysku użytkownika.
 */
(function () {
  "use strict";

  var TOKEN_STORAGE_KEY = "paragony_api_token";
  var JWT_TTL_SECONDS = 300;

  function utf8Bytes(str) {
    return new TextEncoder().encode(str);
  }

  function base64UrlEncode(buffer) {
    var bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    var binary = "";
    for (var i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  async function sha256HexFingerprint(apiToken) {
    var digest = await crypto.subtle.digest("SHA-256", utf8Bytes(apiToken));
    var hex = Array.prototype.map
      .call(new Uint8Array(digest), function (b) {
        return b.toString(16).padStart(2, "0");
      })
      .join("");
    return hex.slice(0, 16);
  }

  // Liczy świeży JWT natywnym Web Crypto — bez bibliotek zewnętrznych (publiczny portal, CSP).
  async function buildJwt(apiToken) {
    var header = { alg: "HS256", typ: "JWT" };
    var payload = {
      key: await sha256HexFingerprint(apiToken),
      exp: Math.floor(Date.now() / 1000) + JWT_TTL_SECONDS,
    };
    var signingInput =
      base64UrlEncode(utf8Bytes(JSON.stringify(header))) +
      "." +
      base64UrlEncode(utf8Bytes(JSON.stringify(payload)));

    var hmacKey = await crypto.subtle.importKey(
      "raw",
      utf8Bytes(apiToken),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    var signature = await crypto.subtle.sign("HMAC", hmacKey, utf8Bytes(signingInput));
    return signingInput + "." + base64UrlEncode(signature);
  }

  // Łączy nagłówki z `input` (gdy to obiekt Request) i `init`, żeby podmiana Authorization
  // nie zgubiła np. Content-Type ustawionego przez Swagger UI dla żądań z ciałem.
  function mergeHeaders(win, input, init) {
    var headers = new win.Headers();
    if (typeof Request !== "undefined" && input instanceof Request) {
      input.headers.forEach(function (value, key) {
        headers.append(key, value);
      });
    }
    if (init && init.headers) {
      new win.Headers(init.headers).forEach(function (value, key) {
        headers.set(key, value);
      });
    }
    return headers;
  }

  function patchFetch(iframe) {
    var win = iframe.contentWindow;
    if (!win || !win.fetch || win.__apiTokenAuthPatched) {
      return;
    }
    win.__apiTokenAuthPatched = true;
    var nativeFetch = win.fetch.bind(win);

    win.fetch = async function patchedFetch(input, init) {
      var apiToken = sessionStorage.getItem(TOKEN_STORAGE_KEY);
      // Brak tokenu w polu formularza: nie dotykamy nagłówków, request idzie tak jak wysłał go
      // Swagger UI (np. bez auth — pozwala to przetestować endpointy publiczne).
      if (!apiToken) {
        return nativeFetch(input, init);
      }
      try {
        var jwt = await buildJwt(apiToken);
        var headers = mergeHeaders(win, input, init);
        headers.set("Authorization", "Bearer " + jwt);
        var mergedInit = Object.assign({}, init, { headers: headers });
        return nativeFetch(input, mergedInit);
      } catch (err) {
        console.error("api-token-auth: nie udało się wyliczyć JWT, żądanie idzie bez auth", err);
        return nativeFetch(input, init);
      }
    };
  }

  function buildTokenForm() {
    var wrapper = document.createElement("div");
    wrapper.className = "api-token-auth";
    // Kolory z palety Material — automatycznie podążają za jasnym/ciemnym motywem
    // (te same zmienne CSS, których używa reszta strony), bez własnej logiki dark-mode.
    wrapper.style.cssText =
      "margin: 0 0 1rem; padding: 0.8rem 1rem; border: 1px solid var(--md-default-fg-color--lightest);" +
      "border-radius: 0.2rem; background: var(--md-code-bg-color); font-size: 0.7rem;";

    var label = document.createElement("label");
    label.htmlFor = "api-token-auth-input";
    label.style.cssText = "display:block; font-weight:700; margin-bottom:0.3rem;";
    label.textContent = "Token API (dla Swagger UI poniżej)";

    var row = document.createElement("div");
    row.style.cssText = "display:flex; gap:0.5rem; align-items:center; flex-wrap:wrap;";

    var input = document.createElement("input");
    input.id = "api-token-auth-input";
    input.type = "password";
    input.autocomplete = "off";
    input.placeholder = "Wklej tu swój api_token";
    input.style.cssText =
      "flex: 1 1 20rem; padding: 0.3rem 0.5rem; border: 1px solid var(--md-default-fg-color--lighter);" +
      "border-radius: 0.2rem; background: var(--md-default-bg-color); color: var(--md-default-fg-color);";
    input.value = sessionStorage.getItem(TOKEN_STORAGE_KEY) || "";

    var clearButton = document.createElement("button");
    clearButton.type = "button";
    clearButton.textContent = "Wyczyść";
    clearButton.style.cssText =
      "padding: 0.3rem 0.7rem; border-radius: 0.2rem; border: 1px solid var(--md-default-fg-color--lighter);" +
      "background: var(--md-default-bg-color); color: var(--md-default-fg-color); cursor: pointer;";

    input.addEventListener("input", function () {
      if (input.value) {
        sessionStorage.setItem(TOKEN_STORAGE_KEY, input.value);
      } else {
        sessionStorage.removeItem(TOKEN_STORAGE_KEY);
      }
    });
    clearButton.addEventListener("click", function () {
      input.value = "";
      sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    });

    row.appendChild(input);
    row.appendChild(clearButton);

    var info = document.createElement("p");
    info.style.cssText = "margin: 0.5rem 0 0; opacity: 0.8;";
    info.textContent =
      "Token zostaje tylko w tej karcie przeglądarki (sessionStorage, znika po jej zamknięciu). " +
      "Przed każdym „Try it out” poniżej liczymy z niego świeży JWT (ważny ok. 5 minut) i " +
      "dokładamy nagłówek Authorization automatycznie.";

    wrapper.appendChild(label);
    wrapper.appendChild(row);
    wrapper.appendChild(info);
    return wrapper;
  }

  function setUpApiTokenAuth() {
    var iframe = document.querySelector(".swagger-ui-iframe");
    // Strona bez wstrzykniętego Swagger UI (inny tag `swagger-ui` niż w docs/api.md) — nic do zrobienia.
    if (!iframe || iframe.dataset.apiTokenAuthSetUp) {
      return;
    }
    iframe.dataset.apiTokenAuthSetUp = "true";
    iframe.insertAdjacentElement("beforebegin", buildTokenForm());
    iframe.addEventListener("load", function () {
      try {
        patchFetch(iframe);
      } catch (err) {
        // Inny origin (np. podgląd z file://) — brak dostępu do contentWindow jest oczekiwany.
        console.warn("api-token-auth: brak dostępu do zawartości iframe'a Swagger UI", err);
      }
    });
  }

  // document$ to obserwowalna strona z nawigacją mkdocs-material (instant loading) —
  // ten sam mechanizm, którego używa mkdocs-swagger-ui-tag do synchronizacji dark-mode.
  if (window.document$) {
    document$.subscribe(setUpApiTokenAuth);
  } else {
    document.addEventListener("DOMContentLoaded", setUpApiTokenAuth);
  }
})();
