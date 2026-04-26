document.addEventListener('DOMContentLoaded', () => {
    const semana = window.semanaAtual;
    if (!semana) {
        return;
    }

    const placeholders = document.querySelectorAll('[class^="imagem"]');

    placeholders.forEach(placeholder => {
        const id = placeholder.className.replace('imagem', '');
        if (!id || isNaN(id)) {
            return;
        }

        const basePath = `imagem/semanas/${semana}/`;
        const imgPath = `${basePath}img${id}.png`;
        const legPath = `${basePath}leg${id}.txt`;

        fetch(legPath)
            .then(response => {
                if (response.ok) {
                    return response.text();
                }
                return '';
            })
            .then(legendaText => {
                const figure = document.createElement('figure');
                figure.className = 'figura-container';

                const img = document.createElement('img');
                img.src = imgPath;
                img.alt = legendaText.trim();

                img.onerror = () => {
                    placeholder.innerHTML = `<div class="figura-erro">Imagem para '${semana}' (img${id}.png) não encontrada.</div>`;
                };

                img.addEventListener('click', () => {
                    if (typeof window.abrirZoom === 'function') {
                        window.abrirZoom(img);
                    }
                });

                figure.appendChild(img);

                if (legendaText && legendaText.trim() !== '') {
                    const figcaption = document.createElement('figcaption');
                    figcaption.className = 'figura-legenda';
                    figcaption.textContent = legendaText.trim();
                    figure.appendChild(figcaption);
                }

                placeholder.replaceWith(figure);
            })
            .catch(error => {
                placeholder.innerHTML = `<div class="figura-erro">Erro de rede ao carregar imagem ${id}</div>`;
            });
    });

    (function bindFigureImagesToZoomModal() {
        function isInsideZoomModal(el) {
            return !!el.closest('#zoom-container');
        }

        document.addEventListener('click', (e) => {
            const img = e.target && e.target.closest ? e.target.closest('figure img') : null;
            if (!img) return;
            if (isInsideZoomModal(img)) return;

            if (typeof window.abrirZoom !== 'function') {
                return;
            }

            if (!img.alt || !img.alt.trim()) {
                const fig = img.closest('figure');
                const cap = fig ? fig.querySelector('figcaption') : null;
                const txt = cap && cap.textContent ? cap.textContent.trim() : '';
                if (txt) img.alt = txt;
            }

            window.abrirZoom(img);
        }, true);
    })();

    (function normalizarFigureClasses() {
        function isInsideZoomModal(el) {
            return !!el.closest('#zoom-container');
        }

        function aplicarClasses(fig) {
            if (!fig || !(fig instanceof Element)) return;
            if (isInsideZoomModal(fig)) return;

            if (!fig.classList.contains('figura-container')) {
                fig.classList.add('figura-container');
            }

            const cap = fig.querySelector('figcaption');
            if (cap && !cap.classList.contains('figura-legenda')) {
                cap.classList.add('figura-legenda');
            }
        }

        document.querySelectorAll('figure').forEach(aplicarClasses);

        const obs = new MutationObserver((mutations) => {
            for (const m of mutations) {
                for (const node of m.addedNodes) {
                    if (!(node instanceof Element)) continue;

                    if (node.matches && node.matches('figure')) aplicarClasses(node);
                    if (node.querySelectorAll) node.querySelectorAll('figure').forEach(aplicarClasses);
                }
            }
        });

        obs.observe(document.body, { childList: true, subtree: true });
    })();
});

(function () {
  function ensureAltModal() {
    if (document.getElementById("alt-modal")) return;

    const modal = document.createElement("div");
    modal.id = "alt-modal";
    modal.innerHTML = `
      <div class="alt-box" role="dialog" aria-modal="true">
        <div class="alt-topo">
          <div class="alt-titulo">Nota de rodapé</div>
          <button class="alt-fechar" aria-label="Fechar">&times;</button>
        </div>
        <div class="alt-corpo">
          <span class="alt-label">DESCRIÇÃO DA IMAGEM:</span>
          <span class="alt-texto"></span>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    document.addEventListener("click", (e) => {
      const m = document.getElementById("alt-modal");
      if (!m || !m.classList.contains("aberto")) return;
      if (!m.contains(e.target) && !e.target.classList.contains("alt-link") && !e.target.classList.contains("footnote-link")) {
        fecharPopover();
      }
    });

    modal.querySelector(".alt-fechar").addEventListener("click", fecharPopover);

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") fecharPopover();
    });
  }

  function abrirPopover({ titulo = "Nota de rodapé", rotulo = "", texto = "" } = {}) {
    ensureAltModal();
    const modal = document.getElementById("alt-modal");

    const t = modal.querySelector(".alt-titulo");
    const label = modal.querySelector(".alt-label");
    const body = modal.querySelector(".alt-texto");

    if (t) t.textContent = titulo;

    if (label) {
      const r = (rotulo || "").trim();
      if (r) {
        label.textContent = r;
        label.style.display = "";
      } else {
        label.textContent = "";
        label.style.display = "none";
      }
    }

    if (body) body.textContent = texto || "";

    const alturaAtualDaTela = window.scrollY + (window.innerHeight / 2);
    modal.style.top = alturaAtualDaTela + "px";

    modal.classList.add("aberto");
  }

  function fecharPopover() {
    const modal = document.getElementById("alt-modal");
    if (!modal || !modal.classList.contains("aberto")) return;
    modal.classList.remove("aberto");
  }

  function aplicarAsteriscoAlt(raiz = document) {
    raiz.querySelectorAll("figure").forEach((fig) => {
      const img = fig.querySelector("img");
      const cap = fig.querySelector("figcaption");
      if (!img || !cap) return;

      const alt = (img.getAttribute("alt") || "").trim();
      if (!alt) return;

      if (cap.querySelector(".alt-link")) return;

      const a = document.createElement("a");
      a.className = "alt-link";
      a.href = "javascript:void(0)";
      a.textContent = "*";
      a.setAttribute("aria-label", "Ver descrição da imagem");

      a.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        abrirPopover({
          titulo: "Nota de rodapé",
          rotulo: "DESCRIÇÃO DA IMAGEM:",
          texto: alt
        });
      });

      cap.appendChild(a);
    });
  }

  // PATCH: Lógica exclusiva para abrir notas do Quadro 1 ocultas no HTML
  function prepararNotasQuadro(raiz = document) {
    const quadros = raiz.querySelectorAll(".quadro1");

    quadros.forEach((quadro) => {
      const linkQuadro = quadro.querySelector(".footnote-link");
      const notaOculta = quadro.querySelector(".quadro1-nota");

      if (linkQuadro && notaOculta) {
        linkQuadro.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation(); 

          abrirPopover({
            titulo: "Nota de rodapé",
            rotulo: "",
            texto: notaOculta.textContent.trim()
          });
        });
      }
    });
  }

  function prepararNotasRodape(raiz = document) {
    const main = raiz.querySelector("main");
    if (!main) return;

    if (!main.querySelector("p.nota-rodape")) return;

    const hr = main.querySelector("hr.linha-divisoria");
    if (!hr) return;

    const notas = [];
    let el = hr.nextElementSibling;
    while (el) {
      if (el.matches && el.matches("p.nota-rodape")) {
        notas.push(el);
      }
      el = el.nextElementSibling;
    }
    if (!notas.length) return;

    const textosNotas = notas.map(p => {
      const clone = p.cloneNode(true);
      const s = clone.querySelector(".simbolo-rodape");
      if (s) s.remove();
      let t = (clone.textContent || "").trim();
      t = t.replace(/^\*\s*/, "").trim();
      return t;
    });

    const recap = main.querySelector(".secao-recapitulacao");
    const boundary = recap && (recap.compareDocumentPosition(hr) & Node.DOCUMENT_POSITION_FOLLOWING) ? recap : hr;

    function permitidoTextNode(node) {
      const p = node.parentElement;
      if (!p) return false;

      if (p.closest("p.nota-rodape")) return false;
      if (p.closest("#alt-modal")) return false;
      if (p.closest("figure figcaption")) return false;
      if (p.closest("a")) return false;
      if (p.closest("script, style")) return false;

      if (boundary) {
        const rel = p.compareDocumentPosition(boundary);
        if (!(rel & Node.DOCUMENT_POSITION_FOLLOWING)) return false; 
      }

      return true;
    }

    let contador = 0;

    const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue || !node.nodeValue.includes("*")) return NodeFilter.FILTER_REJECT;
        return permitidoTextNode(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });

    const toProcess = [];
    let n;
    while ((n = walker.nextNode())) toProcess.push(n);

    const reAsterisco = /\*/g;

    for (const node of toProcess) {
      if (contador >= textosNotas.length) break;

      const s = node.nodeValue;
      if (!s || !s.includes("*")) continue;

      let lastIndex = 0;
      let changed = false;

      const frag = document.createDocumentFragment();
      reAsterisco.lastIndex = 0;

      let m;
      while ((m = reAsterisco.exec(s))) {
        if (contador >= textosNotas.length) break;

        const before = s.slice(lastIndex, m.index);
        if (before) frag.appendChild(document.createTextNode(before));

        const a = document.createElement("a");
        a.href = "javascript:void(0)";
        a.className = "footnote-link";
        a.textContent = "*";
        a.dataset.fn = String(contador); 
        frag.appendChild(a);

        contador++;
        lastIndex = m.index + 1;
        changed = true;
      }

      if (!changed) continue;

      const after = s.slice(lastIndex);
      if (after) frag.appendChild(document.createTextNode(after));

      node.parentNode.replaceChild(frag, node);
    }

    main.addEventListener("click", (e) => {
      const a = e.target.closest && e.target.closest("a.footnote-link");
      if (!a) return;

      e.preventDefault();
      e.stopPropagation();

      const i = parseInt(a.dataset.fn || "-1", 10);
      if (Number.isNaN(i) || i < 0 || i >= textosNotas.length) return;

      abrirPopover({
        titulo: "Nota de rodapé",
        rotulo: "",
        texto: textosNotas[i]
      });
    });
  }

  function runAll() {
    aplicarAsteriscoAlt();
    prepararNotasQuadro();
    prepararNotasRodape();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", runAll);
  } else {
    runAll();
  }

  document.addEventListener("cacheRestored", runAll);
})();