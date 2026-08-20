/**
 * Doprowadza wynik żądania „Try it out" do widoku (referencja API, docs/api.md).
 *
 * Między przyciskiem Execute i blokiem „Server response" Swagger UI wstawia bloki Curl
 * i Request URL — razem ok. 500 px. Kod statusu i ciało odpowiedzi lądują więc pod krawędzią
 * okna, a użytkownik widzi same nagłówki sekcji i czyta to jako brak odpowiedzi. Swagger UI
 * siedzi w iframe (mkdocs-swagger-ui-tag) i nie może przewinąć okna rodzica, więc przewijamy
 * z tej strony.
 */
(function () {
  "use strict";

  // Przyklejony nagłówek Material (2.4rem = 48 px) zasłania górę strony — plus margines,
  // żeby nagłówek bloku odpowiedzi nie kleił się do krawędzi.
  var HEADER_OFFSET = 72;
  var RESPONSE_SELECTOR = ".live-responses-table";

  // Element leży w dokumencie iframe'a, a przewijamy okno rodzica — pozycję liczymy
  // względem strony hosta.
  function pageOffsetTop(iframe, element) {
    var iframeTop = iframe.getBoundingClientRect().top + window.scrollY;
    var scrolledInside = iframe.contentDocument.documentElement.scrollTop;
    return iframeTop + element.getBoundingClientRect().top + scrolledInside;
  }

  function scrollIntoParentView(iframe, element) {
    // Wysokość iframe'a rośnie asynchronicznie (ResizeObserver w iframe wywołuje tę globalną
    // funkcję wtyczki). Bez wymuszenia pomiar trafia w obszar wciąż przycięty starą wysokością.
    if (typeof window.update_swagger_ui_iframe_height === "function") {
      window.update_swagger_ui_iframe_height(iframe.id);
    }

    var top = pageOffsetTop(iframe, element);
    var bottom = top + element.getBoundingClientRect().height;
    // Wynik w całości widoczny — nie ruszamy strony pod użytkownikiem.
    if (top >= window.scrollY + HEADER_OFFSET && bottom <= window.scrollY + window.innerHeight) {
      return;
    }

    window.scrollTo({ top: Math.max(0, top - HEADER_OFFSET), behavior: "smooth" });
  }

  // Ten sam blok odpowiedzi bywa dorysowywany w środku (najpierw stan „loading", potem wynik),
  // więc celem jest blok zawierający dodany węzeł albo blok dodany w całości.
  function responseBlockFor(node) {
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return null;
    }
    return node.closest(RESPONSE_SELECTOR) || node.querySelector(RESPONSE_SELECTOR);
  }

  function observeResponses(iframe) {
    var root = iframe.contentDocument.querySelector("#swagger-ui");
    if (!root || iframe.dataset.responseVisibilitySetUp) {
      return;
    }
    iframe.dataset.responseVisibilitySetUp = "true";

    var scheduled = false;
    new MutationObserver(function (mutations) {
      var block = null;
      mutations.forEach(function (mutation) {
        Array.prototype.forEach.call(mutation.addedNodes, function (node) {
          block = block || responseBlockFor(node);
        });
      });
      if (!block || scheduled) {
        return;
      }

      // Jedno przewinięcie na serię mutacji, po odrysowaniu — inaczej mierzymy stan „loading".
      scheduled = true;
      requestAnimationFrame(function () {
        scheduled = false;
        scrollIntoParentView(iframe, block);
      });
    }).observe(root, { childList: true, subtree: true });
  }

  function setUpResponseVisibility() {
    var iframe = document.querySelector(".swagger-ui-iframe");
    // Strona bez wstrzykniętego Swagger UI — nic do zrobienia.
    if (!iframe) {
      return;
    }
    iframe.addEventListener("load", function () {
      try {
        observeResponses(iframe);
      } catch (err) {
        // Inny origin (np. podgląd z file://) — brak dostępu do contentDocument jest oczekiwany.
        console.warn("swagger-response-visibility: brak dostępu do zawartości iframe'a", err);
      }
    });
  }

  // document$ to obserwowalna strona z nawigacją mkdocs-material — ten sam mechanizm,
  // którego używa api-token-auth.js.
  if (window.document$) {
    document$.subscribe(setUpResponseVisibility);
  } else {
    document.addEventListener("DOMContentLoaded", setUpResponseVisibility);
  }
})();
