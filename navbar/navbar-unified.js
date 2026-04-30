(function initGlobalFontScale() {
    const STORAGE_KEY = 'tamanho-fonte-global';
    const DEFAULT_SIZE = 16;
    const MIN_SIZE = DEFAULT_SIZE;
    const MAX_SIZE = DEFAULT_SIZE + 10;

    function clampSize(value) {
        const num = parseFloat(value);
        if (!Number.isFinite(num)) return DEFAULT_SIZE;
        return Math.min(MAX_SIZE, Math.max(MIN_SIZE, Math.round(num)));
    }

    function readSavedSize() {
        try {
            return clampSize(localStorage.getItem(STORAGE_KEY));
        } catch (error) {
            return DEFAULT_SIZE;
        }
    }

    function applySize(size) {
        const safeSize = clampSize(size);
        const scale = safeSize / DEFAULT_SIZE;
        const root = document.documentElement;
        root.style.setProperty('--tamanho-fonte', `${safeSize}px`);
        root.style.setProperty('--font-base-default', String(DEFAULT_SIZE));
        root.style.setProperty('--font-base-global', `${safeSize}px`);
        root.style.setProperty('--font-scale-global', String(scale));
        root.dataset.fontSizeGlobal = String(safeSize);
        return safeSize;
    }

    function persistSize(size) {
        try {
            localStorage.setItem(STORAGE_KEY, String(size));
        } catch (error) {}
    }

    const api = {
        storageKey: STORAGE_KEY,
        defaultSize: DEFAULT_SIZE,
        minSize: MIN_SIZE,
        maxSize: MAX_SIZE,
        getSize() {
            return clampSize(getComputedStyle(document.documentElement).getPropertyValue('--font-base-global') || readSavedSize());
        },
        setSize(nextSize) {
            const applied = applySize(nextSize);
            persistSize(applied);
            window.dispatchEvent(new CustomEvent('globalfont:changed', { detail: { size: applied, scale: applied / DEFAULT_SIZE } }));
            return applied;
        },
        reset() {
            return this.setSize(DEFAULT_SIZE);
        },
        clamp(size) {
            return clampSize(size);
        }
    };

    window.GlobalFontScale = api;
    applySize(readSavedSize());

    window.addEventListener('storage', (event) => {
        if (event.key !== STORAGE_KEY) return;
        applySize(readSavedSize());
    });
})();



const NAVBAR_SCRIPT_SRC = (() => {
    const current = document.currentScript && document.currentScript.src;
    if (current) return current;

    const scripts = Array.from(document.scripts || []);
    const ownScript = scripts.find(script => /navbar-unified\.js(?:\?|#|$)/.test(script.src || ''));
    return ownScript ? ownScript.src : '';
})();

function getProjectRootURL() {
    try {
        if (NAVBAR_SCRIPT_SRC) {
            // navbar-unified.js fica dentro de /navbar/.
            // Subir um nível a partir dele leva à raiz real do projeto,
            // mesmo no GitHub Pages, Koder ou subpastas.
            return new URL('../', NAVBAR_SCRIPT_SRC).href;
        }
    } catch (error) {}

    const originPath = window.location.origin + window.location.pathname;
    const knownFolders = ['/biblia/', '/richtext/', '/sentinela/', '/save/', '/navbar/'];
    const lower = originPath.toLowerCase();

    for (const folder of knownFolders) {
        const index = lower.indexOf(folder);
        if (index !== -1) {
            return originPath.slice(0, index + 1);
        }
    }

    return new URL('./', window.location.href).href;
}

function joinProjectPath(relativePath) {
    return new URL(relativePath.replace(/^\/+/, ''), getProjectRootURL()).href;
}


function isIndexPageNavbar() {
    const path = window.location.pathname.toLowerCase();
    return path.includes('index.html') || path === '/' || path.endsWith('/');
}

function buildIndexEmBreveURL(semana) {
    const url = new URL('index.html', getProjectRootURL());
    if (semana) url.searchParams.set('semana', semana);
    url.searchParams.set('estado', 'em-breve');
    return url.href;
}

function formatSemanaNavbar(semana) {
    const normalized = normalizeSemana(semana);
    if (!normalized) return '';
    const [dia, mes] = normalized.split('-');
    return dia + '/' + mes;
}

function installIndexEmBreveStyles() {
    if (document.getElementById('navbarSentinelaEmBreveStyles')) return;

    const style = document.createElement('style');
    style.id = 'navbarSentinelaEmBreveStyles';
    style.textContent = `
        body.sentinela-em-breve-mode { min-height: 100dvh; }

        #navbarSentinelaEmBreve {
            min-height: calc(100dvh - 96px);
            padding: max(26px, env(safe-area-inset-top)) 18px calc(96px + env(safe-area-inset-bottom));
            box-sizing: border-box;
            display: flex;
            align-items: center;
            justify-content: center;
            background: color-mix(in srgb, var(--cor-global, #2a7d7d) 6%, #f5f6f7);
            color: #1f2933;
        }

        [data-theme="dark"] #navbarSentinelaEmBreve,
        .dark #navbarSentinelaEmBreve {
            background: color-mix(in srgb, var(--cor-global, #2a7d7d) 10%, #050505);
            color: #f2f2f7;
        }

        .navbar-sentinela-embreve-card {
            width: min(420px, 100%);
            border-radius: 26px;
            padding: 26px 22px 24px;
            text-align: center;
            background: color-mix(in srgb, #fff 88%, var(--cor-global, #2a7d7d) 12%);
            box-shadow: 0 14px 42px rgba(0,0,0,.12), 0 0 0 .5px rgba(0,0,0,.08);
        }

        [data-theme="dark"] .navbar-sentinela-embreve-card,
        .dark .navbar-sentinela-embreve-card {
            background: color-mix(in srgb, #1c1c1e 82%, var(--cor-global, #2a7d7d) 18%);
            box-shadow: 0 14px 42px rgba(0,0,0,.42), 0 0 0 .5px rgba(255,255,255,.10);
        }

        .navbar-sentinela-embreve-kicker {
            margin: 0 0 8px;
            font-size: 12px;
            font-weight: 700;
            letter-spacing: .08em;
            text-transform: uppercase;
            color: color-mix(in srgb, var(--cor-global, #2a7d7d) 72%, #555);
        }

        .navbar-sentinela-embreve-title {
            margin: 0;
            font-size: calc(25px * var(--font-scale-global, 1));
            line-height: 1.12;
            font-weight: 800;
        }

        .navbar-sentinela-embreve-text {
            margin: 13px 0 0;
            font-size: calc(15px * var(--font-scale-global, 1));
            line-height: 1.45;
            opacity: .76;
        }

        .navbar-sentinela-embreve-week {
            display: inline-flex;
            margin-top: 18px;
            padding: 8px 12px;
            border-radius: 999px;
            font-size: 13px;
            font-weight: 700;
            background: color-mix(in srgb, var(--cor-global, #2a7d7d) 14%, transparent);
            color: color-mix(in srgb, var(--cor-global, #2a7d7d) 72%, #111);
        }

        [data-theme="dark"] .navbar-sentinela-embreve-week,
        .dark .navbar-sentinela-embreve-week {
            color: color-mix(in srgb, var(--cor-global, #2a7d7d) 70%, #fff);
            background: color-mix(in srgb, var(--cor-global, #2a7d7d) 22%, transparent);
        }
    `;
    document.head.appendChild(style);
}

function renderIndexEmBreveFallback(semana) {
    if (!document.body) return false;

    let host = document.getElementById('navbarSentinelaEmBreve');
    if (!host) {
        host = document.createElement('section');
        host.id = 'navbarSentinelaEmBreve';
        host.setAttribute('aria-live', 'polite');
        const firstVisible = Array.from(document.body.children).find((el) => {
            if (!el || !el.tagName) return false;
            const tag = el.tagName.toLowerCase();
            if (tag === 'script' || tag === 'style') return false;
            if (el.classList?.contains('bottom-navbar')) return false;
            return true;
        });
        document.body.insertBefore(host, firstVisible || document.body.firstChild);
    }

    const semanaLabel = formatSemanaNavbar(semana);
    host.innerHTML = `
        <div class="navbar-sentinela-embreve-card">
            <p class="navbar-sentinela-embreve-kicker">A Sentinela</p>
            <h1 class="navbar-sentinela-embreve-title">Estudo em breve</h1>
            <p class="navbar-sentinela-embreve-text">O artigo dessa semana ainda não está disponível neste projeto.</p>
            ${semanaLabel ? '<span class="navbar-sentinela-embreve-week">Semana de ' + semanaLabel + '</span>' : ''}
        </div>
    `;

    return true;
}

function callIndexEmBreveHook(semana) {
    const detail = {
        semana,
        artigoURL: joinProjectPath('sentinela/artigos/' + semana + '.html')
    };

    window.dispatchEvent(new CustomEvent('sentinela:em-breve', { detail }));

    const candidates = [
        window.mostrarEstudoEmBreve,
        window.mostrarSentinelaEmBreve,
        window.renderEstudoEmBreve,
        window.renderSentinelaEmBreve,
        window.desenharEstudoEmBreve,
        window.carousel?.mostrarEstudoEmBreve,
        window.carousel?.mostrarSentinelaEmBreve,
        window.carousel?.renderEstudoEmBreve,
        window.carousel?.desenharEstudoEmBreve
    ];

    for (const fn of candidates) {
        if (typeof fn !== 'function') continue;
        try {
            fn.call(window.carousel || window, semana, detail);
            return true;
        } catch (error) {}
    }

    return false;
}

function setupIndexEmBreveState() {
    const params = new URLSearchParams(window.location.search);
    const estado = String(params.get("estado") || params.get("modo") || "").toLowerCase();
    if (!["em-breve", "embreve", "em_breve"].includes(estado)) return;
    if (!isIndexPageNavbar()) return;

    const semana = normalizeSemana(params.get("semana")) || detectSemanaAtualNavbar();
    window.semanaAtual = semana;
    window.__SENTINELA_EM_BREVE_REQUEST__ = { semana };

    try {
        localStorage.setItem("semanaAtual", semana);
        localStorage.setItem("semana-atual", semana);
    } catch (error) {}

    window.dispatchEvent(new CustomEvent("sentinela:em-breve", {
        detail: { semana, artigoURL: joinProjectPath("sentinela/artigos/" + semana + ".html") }
    }));
}

function normalizeSemana(value) {
    const match = String(value || '').match(/\b(\d{2}-\d{2})\b/);
    return match ? match[1] : '';
}

function calcularSemanaAtualNavbar() {
    const hoje = new Date();
    const diaDaSemana = hoje.getDay();
    const diasParaSegunda = diaDaSemana === 0 ? -6 : 1 - diaDaSemana;
    const segundaFeira = new Date(hoje);
    segundaFeira.setDate(hoje.getDate() + diasParaSegunda);
    segundaFeira.setHours(0, 0, 0, 0);

    const dia = String(segundaFeira.getDate()).padStart(2, '0');
    const mes = String(segundaFeira.getMonth() + 1).padStart(2, '0');
    return `${dia}-${mes}`;
}

function detectSemanaAtualNavbar() {
    const fromWindow = normalizeSemana(window.semanaAtual);
    if (fromWindow) return fromWindow;

    const urlParams = new URLSearchParams(window.location.search);
    const fromQuery = normalizeSemana(urlParams.get('semana'));
    if (fromQuery) return fromQuery;

    const fromPath = normalizeSemana(window.location.pathname);
    if (fromPath) return fromPath;

    try {
        const saved = normalizeSemana(localStorage.getItem('semanaAtual') || localStorage.getItem('semana-atual'));
        if (saved) return saved;
    } catch (error) {}

    return calcularSemanaAtualNavbar();
}

async function urlExiste(url) {
    try {
        const response = await fetch(url, {
            method: "GET",
            cache: "no-store",
            credentials: "same-origin"
        });

        if (!response.ok) return false;

        const finalURL = String(response.url || "").toLowerCase();
        if (finalURL.includes("/404") || finalURL.endsWith("404.html")) return false;

        const html = await response.text();
        const sample = html.slice(0, 7000).toLowerCase();

        if (sample.includes("page not found") || sample.includes("file not found")) return false;
        if (sample.includes("github pages") && sample.includes("404")) return false;

        return /data-estudo=["\x27]?\d{2}-\d{2}/i.test(html)
            || /<title>\s*a sentinela\s*<\/title>/i.test(html)
            || /--cor-principal-estudo/i.test(html);
    } catch (error) {
        return false;
    }
}

class UnifiedNavbar {
    constructor() {
        this.navbar = null;
        this.lastScrollY = 0;
        this.scrollThreshold = 50;
        this.hideTimeout = null;
        this.isHidden = false;
        this.scrollDirection = 'up';
        this.touchStartY = 0;
        this.consecutiveScrollDown = 0;
        this.isKeyboardOpen = false;
        this.baseViewportHeight = 0;
        this.keyboardHeightThreshold = 120;
        this.currentPage = this.detectCurrentPage();
        
        this.init();
    }

    init() {
        this.addBodyClass();
        this.createNavbar();
        this.updateActiveState();
        this.updateSaveButtonVisual();
        this.setupScrollBehavior();
        this.setupKeyboardBehavior();
        this.setupNavigation();
        this.finishInitialPaint();
    }

    finishInitialPaint() {
        if (!this.navbar) return;

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                this.navbar.classList.remove('booting');
            });
        });
    }

    detectCurrentPage() {
        const path = window.location.pathname.toLowerCase();
        
        if (path.includes('index.html') || path === '/' || path.endsWith('/')) {
            return 'home';
        }
        if (path.includes('biblia') || path.includes('livro') || path.includes('capitulo')) {
            return 'bible';
        }
        if (path.includes('richtext') || path.includes('anotacoes') || path.includes('container')) {
            return 'notes';
        }
        if (path.includes('sentinela') || path.includes('em-breve')) {
            return 'watchtower';
        }
        if (path.includes('save') || path.includes('auth')) {
            return 'save';
        }
        
        return 'home';
    }

    calcularSemanaAtual() {
        return calcularSemanaAtualNavbar();
    }

    createNavbar() {
        const existingNav = document.querySelector('.bottom-navbar');
        if (existingNav && this.isReusableNavbar(existingNav)) {
            existingNav.classList.add('booting');
            this.navbar = existingNav;
            return;
        }

        if (existingNav) {
            existingNav.remove();
        }

        document.body.insertAdjacentHTML('beforeend', this.buildNavbarHTML());
        this.navbar = document.querySelector('.bottom-navbar');
    }

    isReusableNavbar(navbar) {
        if (!navbar) return false;
        const items = navbar.querySelectorAll('.navbar-item[data-page]');
        return items.length === 5;
    }

    buildNavbarHTML() {
        return `
            <nav class="bottom-navbar booting" data-context="navbar-context-${this.currentPage}">
                <a href="#" class="navbar-item" data-page="home" onclick="irParaHome(event)">
                    <div class="navbar-icon icon-home"></div>
                    <span class="navbar-label">Início</span>
                </a>
                
                <a href="#" class="navbar-item" data-page="bible" onclick="irParaBiblia(event)">
                    <div class="navbar-icon icon-bible"></div>
                    <span class="navbar-label">Bíblia</span>
                </a>
                
                <a href="#" class="navbar-item" data-page="notes" onclick="irParaAnotacoes(event)">
                    <div class="navbar-icon icon-notes"></div>
                    <span class="navbar-label">Anotações</span>
                </a>
                
                <a href="#" class="navbar-item" data-page="watchtower" onclick="irParaSentinela(event)">
                    <div class="navbar-icon icon-watchtower"></div>
                    <span class="navbar-label">A Sentinela</span>
                </a>
                
                <a href="#" class="navbar-item" data-page="save" onclick="irParaSalvar(event)">
                    <div class="navbar-icon icon-save"></div>
                    <span class="navbar-label">Salvar</span>
                </a>
            </nav>
        `;
    }

    getSemanaParam() {
        return `?semana=${detectSemanaAtualNavbar()}`;
    }

    getBasePath() {
        return getProjectRootURL();
    }

    setupScrollBehavior() {
        if (this.shouldKeepNavbarFixed()) {
            this.showNavbar();
            return;
        }

        this.setupScrollHandlers();
        this.setupTouchBehavior();
    }

    shouldKeepNavbarFixed() {
        return ['notes', 'save'].includes(this.currentPage);
    }

    setupScrollHandlers() {
        window.addEventListener('scroll', () => this.onScroll(), { passive: true });
    }

    onScroll() {
        if (this.isKeyboardOpen) {
            return;
        }

        const currentScrollY = window.scrollY;
        
        if (currentScrollY > this.lastScrollY && currentScrollY > 10) {
            this.hideNavbar();
        } else {
            this.showNavbar();
        }

        this.lastScrollY = currentScrollY <= 0 ? 0 : currentScrollY;
    }

    setupTouchBehavior() {
        let touchStartY = 0;
        let touchEndY = 0;

        document.addEventListener('touchstart', (e) => {
            touchStartY = e.changedTouches[0].screenY;
        }, { passive: true });

        document.addEventListener('touchend', (e) => {
            touchEndY = e.changedTouches[0].screenY;
        }, { passive: true });
    }

    hideNavbar() {
        if (!this.isHidden && this.navbar) {
            this.navbar.classList.add('hidden');
            this.isHidden = true;
        }
    }

    showNavbar() {
        if (this.isKeyboardOpen) {
            return;
        }

        if (this.isHidden && this.navbar) {
            this.navbar.classList.remove('hidden');
            this.isHidden = false;
            clearTimeout(this.hideTimeout);
        }
    }

    setupKeyboardBehavior() {
        if (!window.visualViewport) {
            this.setupKeyboardFocusFallback();
            return;
        }

        this.baseViewportHeight = window.visualViewport.height;

        const onViewportResize = () => {
            const currentViewportHeight = window.visualViewport.height;

            if (currentViewportHeight > this.baseViewportHeight) {
                this.baseViewportHeight = currentViewportHeight;
            }

            const viewportReduction = this.baseViewportHeight - currentViewportHeight;
            const keyboardOpen = viewportReduction > this.keyboardHeightThreshold;

            this.toggleKeyboardState(keyboardOpen);
        };

        window.visualViewport.addEventListener('resize', onViewportResize);
        window.visualViewport.addEventListener('scroll', onViewportResize);

        this.setupKeyboardFocusFallback();
    }

    setupKeyboardFocusFallback() {
        document.addEventListener('focusin', (event) => {
            const element = event.target;
            if (!element) return;

            const tagName = element.tagName;
            const isEditable = element.isContentEditable || tagName === 'INPUT' || tagName === 'TEXTAREA';

            if (isEditable) {
                this.toggleKeyboardState(true);
            }
        });

        document.addEventListener('focusout', () => {
            if (window.visualViewport) {
                requestAnimationFrame(() => {
                    const viewportReduction = this.baseViewportHeight - window.visualViewport.height;
                    const keyboardOpen = viewportReduction > this.keyboardHeightThreshold;
                    this.toggleKeyboardState(keyboardOpen);
                });
                return;
            }

            this.toggleKeyboardState(false);
        });
    }

    toggleKeyboardState(isOpen) {
        if (this.isKeyboardOpen === isOpen) {
            return;
        }

        this.isKeyboardOpen = isOpen;

        if (isOpen) {
            this.hideNavbar();
            return;
        }

        this.showNavbar();
    }

    setupNavigation() {
        if (!this.navbar) return;

        this.navbar.addEventListener('click', (e) => {
            const item = e.target.closest('.navbar-item');
            if (!item) return;

            const href = item.getAttribute('href');
            if (href && href !== '#') {
                return;
            }
        });
    }

    detectCurrentWeek() {
        return detectSemanaAtualNavbar();
    }

    updateActiveState() {
        if (!this.navbar) return;

        const items = this.navbar.querySelectorAll('.navbar-item');
        items.forEach(item => {
            item.classList.remove('active');
        });

        const activeItem = this.navbar.querySelector(`[data-page="${this.currentPage}"]`);
        if (activeItem) {
            activeItem.classList.add('active');
        }

        this.navbar.setAttribute('data-context', `navbar-context-${this.currentPage}`);
    }

    addBodyClass() {
        document.body.classList.add('with-bottom-navbar');
    }

    updateSaveButtonVisual() {
        const savedUser = localStorage.getItem('supabase_user');
        const saveButton = this.navbar?.querySelector('[data-page="save"]');
        
        if (savedUser && saveButton) {
            saveButton.classList.add('logged-in');
        } else if (saveButton) {
            saveButton.classList.remove('logged-in');
        }
    }

    onLoginSuccess(userData) {
        const saveButton = this.navbar?.querySelector('[data-page="save"]');
        if (saveButton) {
            saveButton.classList.add('logged-in');
        }
    }

    onLogout() {
        localStorage.removeItem('supabase_user');
        localStorage.removeItem('last_login');
        
        const saveButton = this.navbar?.querySelector('[data-page="save"]');
        if (saveButton) {
            saveButton.classList.remove('logged-in');
        }
    }

    setActivePage(page) {
        this.currentPage = page;
        this.updateActiveState();
    }

    show() {
        this.showNavbar();
    }

    hide() {
        this.hideNavbar();
    }

    destroy() {
        if (this.navbar) {
            this.navbar.remove();
            this.navbar = null;
        }
        clearTimeout(this.hideTimeout);
        document.body.classList.remove('with-bottom-navbar');
    }

    getSemanaCalculada() {
        return this.calcularSemanaAtual();
    }
}

async function irParaHome(event) {
    event.preventDefault();
    
    const currentPath = window.location.pathname.toLowerCase();
    
    if (currentPath.includes('index.html') || currentPath === '/' || currentPath.endsWith('/')) {
        if (window.carousel && window.carousel.currentSlide !== 3) {
            window.carousel.goToSlide(3, true);
        }
        return;
    }
    
    const basePath = getBasePath();
    window.location.href = `${basePath}index.html`;
}

async function irParaBiblia(event) {
    event.preventDefault();
    
    const basePath = getBasePath();
    const currentPath = window.location.pathname.toLowerCase();
    
    if (currentPath.includes('biblia') || currentPath.includes('livro') || currentPath.includes('capitulo')) {
        window.location.href = `${basePath}biblia/biblia.html?from=navbar`;
    } 
    else {
        window.location.href = `${basePath}biblia/biblia.html`;
    }
}

async function irParaAnotacoes(event) {
    event.preventDefault();
    
    const currentPath = window.location.pathname.toLowerCase();
    if (currentPath.includes('richtext') || currentPath.includes('anotacoes') || currentPath.includes('container')) {
        return;
    }
    
    const basePath = getBasePath();
    const semanaParam = getSemanaParam();
    window.location.href = `${basePath}richtext/container.html${semanaParam}`;
}

async function irParaSentinela(event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }

    const semana = normalizeSemana(window.carousel?.getCurrentSlideConfig?.()?.parametro)
        || normalizeSemana(window.carousel?.semanas?.[window.carousel?.currentSlide]?.parametro)
        || detectSemanaAtualNavbar();

    window.semanaAtual = semana;

    if (isIndexPageNavbar() && typeof window.carousel?.verificarESentinela === "function") {
        await window.carousel.verificarESentinela(semana);
        return false;
    }

    const artigoURL = joinProjectPath("sentinela/artigos/" + semana + ".html");
    const fallbackURL = buildIndexEmBreveURL(semana);

    const currentPath = window.location.pathname.toLowerCase();
    if (currentPath.includes("/sentinela/artigos/") && currentPath.endsWith("/" + semana + ".html")) {
        return false;
    }

    if (await urlExiste(artigoURL)) {
        window.location.href = artigoURL;
        return false;
    }

    window.location.href = fallbackURL;
    return false;
}

async function irParaSalvar(event) {
    event.preventDefault();
    
    const currentPath = window.location.pathname.toLowerCase();
    if (currentPath.includes('save') || currentPath.includes('auth')) {
        return;
    }
    
    const basePath = getBasePath();
    window.location.href = `${basePath}save/auth-supabase.html`;
}

// Lógica de basePath simplificada para funcionar no Koder
function getBasePath() {
    return getProjectRootURL();
}

function getSemanaParam() {
    return `?semana=${detectSemanaAtualNavbar()}`;
}

window.UnifiedNavbar = {
    instance: null,
    
    init(options = {}) {
        if (this.instance) {
            this.instance.destroy();
        }
        this.instance = new UnifiedNavbar(options);
        return this.instance;
    },
    
    get() {
        return this.instance;
    },
    
    setActivePage(page) {
        if (this.instance) {
            this.instance.setActivePage(page);
        }
    },

    getSemanaCalculada() {
        if (this.instance) {
            return this.instance.getSemanaCalculada();
        }
        return null;
    }
};

function bootUnifiedNavbarWhenPossible() {
    if (!document.body) {
        document.addEventListener('DOMContentLoaded', bootUnifiedNavbarWhenPossible, { once: true });
        return;
    }

    if (window.UnifiedNavbar.instance) {
        return;
    }

    window.UnifiedNavbar.init();
}

setupIndexEmBreveState();
bootUnifiedNavbarWhenPossible();

let lastTouchEnd = 0;
document.addEventListener('touchend', function (event) {
    const now = (new Date()).getTime();
    if (now - lastTouchEnd <= 300) {
        event.preventDefault();
    }
    lastTouchEnd = now;
}, false);
