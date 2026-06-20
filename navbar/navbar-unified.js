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
        try { localStorage.setItem(STORAGE_KEY, String(size)); } catch (error) {}
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

window.getGlobalWeek = function(paramValue) {
    if (paramValue && /\b(\d{2}-\d{2})\b/.test(String(paramValue))) {
        return String(paramValue).match(/\b(\d{2}-\d{2})\b/)[1];
    }
    if (window.semanaAtual && /\b(\d{2}-\d{2})\b/.test(String(window.semanaAtual))) {
        return String(window.semanaAtual).match(/\b(\d{2}-\d{2})\b/)[1];
    }
    const params = new URLSearchParams(window.location.search);
    const param = params.get('semana');
    if (param && /\b(\d{2}-\d{2})\b/.test(String(param))) {
        return String(param).match(/\b(\d{2}-\d{2})\b/)[1];
    }
    const hoje = new Date();
    const dia = hoje.getDay();
    const diff = dia === 0 ? -6 : 1 - dia;
    const segunda = new Date(hoje);
    segunda.setDate(hoje.getDate() + diff);
    const dd = String(segunda.getDate()).padStart(2, '0');
    const mm = String(segunda.getMonth() + 1).padStart(2, '0');
    return `${dd}-${mm}`;
};

const NAVBAR_SCRIPT_SRC = (() => {
    const current = document.currentScript && document.currentScript.src;
    if (current) return current;
    const scripts = Array.from(document.scripts ||[]);
    const ownScript = scripts.find(script => /navbar-unified\.js(?:\?|#|$)/.test(script.src || ''));
    return ownScript ? ownScript.src : '';
})();

function getProjectRootURL() {
    try {
        if (NAVBAR_SCRIPT_SRC) {
            return new URL('../', NAVBAR_SCRIPT_SRC).href;
        }
    } catch (error) {}

    const originPath = window.location.origin + window.location.pathname;
    const knownFolders =['/biblia/', '/richtext/', '/sentinela/', '/save/', '/navbar/'];
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
        this.isHidden = false;
        this.isKeyboardOpen = false;
        this.editableFocado = false;
        this.currentPage = this.detectCurrentPage();
        this._syncRaf = 0;
        this._metricsRaf = 0;
        this._resizeObserver = null;
        this._metricsListeners = [];
        
        this.init();
    }

    init() {
        this.addBodyClass();
        this.createNavbar();
        this.setupBottomMetrics();
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
        if (path.includes('index.html') || path === '/' || path.endsWith('/')) return 'home';
        if (path.includes('biblia') || path.includes('livro') || path.includes('capitulo')) return 'bible';
        if (path.includes('richtext') || path.includes('anotacoes') || path.includes('container')) return 'notes';
        if (path.includes('sentinela') || path.includes('em-breve')) return 'watchtower';
        if (path.includes('save') || path.includes('auth')) return 'save';
        return 'home';
    }

    createNavbar() {
        const existingNav = document.querySelector('.bottom-navbar');
        if (existingNav && this.isReusableNavbar(existingNav)) {
            existingNav.classList.add('booting');
            this.navbar = existingNav;
            return;
        }

        if (existingNav) existingNav.remove();
        document.body.insertAdjacentHTML('beforeend', this.buildNavbarHTML());
        this.navbar = document.querySelector('.bottom-navbar');
    }

    isReusableNavbar(navbar) {
        if (!navbar) return false;
        return navbar.querySelectorAll('.navbar-item[data-page]').length === 5;
    }

    getFallbackNavbarHeight() {
        return document.body.classList.contains('is-pwa') ? 52 : 70;
    }

    measureElementHeight(element, fallback = 0) {
        if (!element) return fallback;
        const rect = element.getBoundingClientRect();
        const height = Math.round(rect.height || 0);
        return height > 0 ? height : fallback;
    }

    setupBottomMetrics() {
        this.syncBottomMetrics(true);

        const sync = () => this.syncBottomMetrics();
        window.addEventListener('resize', sync, { passive: true });
        window.addEventListener('orientationchange', sync, { passive: true });
        this._metricsListeners.push(['resize', sync], ['orientationchange', sync]);

        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', sync, { passive: true });
            window.visualViewport.addEventListener('scroll', sync, { passive: true });
        }

        if ('ResizeObserver' in window) {
            this._resizeObserver = new ResizeObserver(sync);
            if (this.navbar) this._resizeObserver.observe(this.navbar);
            const toolbar = document.getElementById('kbdToolbar');
            if (toolbar) this._resizeObserver.observe(toolbar);
        }
    }

    syncBottomMetrics(immediate = false) {
        const apply = () => {
            this._metricsRaf = 0;
            const root = document.documentElement;
            const navHeight = this.measureElementHeight(this.navbar, this.getFallbackNavbarHeight());
            const toolbar = document.getElementById('kbdToolbar');
            const toolbarHeight = this.measureElementHeight(toolbar, 68);
            const reservedToolbarMode = this.isToolbarReservedMode();
            const navVisible = Boolean(this.navbar && !this.isHidden && !this.isKeyboardOpen && !reservedToolbarMode);
            const navReserved = Boolean(this.navbar && !this.isKeyboardOpen && !reservedToolbarMode);
            const occupiedBottom = navVisible ? navHeight : 0;
            const layoutBottom = navReserved ? navHeight : 0;

            root.style.setProperty('--navbar-real-height', `${navHeight}px`);
            root.style.setProperty('--navbar-occupied-bottom', `${occupiedBottom}px`);
            root.style.setProperty('--navbar-layout-bottom', `${layoutBottom}px`);
            root.style.setProperty('--kbd-toolbar-real-height', `${toolbarHeight}px`);

            document.body.classList.toggle('navbar-is-visible', navVisible);
            document.body.classList.toggle('navbar-is-hidden', !navVisible);
        };

        if (immediate) {
            apply();
            return;
        }

        if (this._metricsRaf) return;
        this._metricsRaf = requestAnimationFrame(apply);
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

    setupScrollBehavior() {
        window.addEventListener('scroll', () => this.onScroll(), { passive: true });
    }

    onScroll() {
        if (this.isKeyboardOpen) return;
        const currentScrollY = window.scrollY;
        if (currentScrollY > this.lastScrollY && currentScrollY > 10) {
            this.hideNavbar('scroll');
        } else {
            this.showNavbar();
        }
        this.lastScrollY = currentScrollY <= 0 ? 0 : currentScrollY;
    }

    hideNavbar(reason = 'scroll') {
        if (reason === 'scroll' && !document.documentElement.dataset.programYear && ['home', 'notes', 'save'].includes(this.currentPage)) {
            return;
        }
        if (!this.isHidden && this.navbar) {
            this.navbar.classList.add('hidden');
            this.isHidden = true;
        }
    }

    showNavbar() {
        if (this.isKeyboardOpen) return;
        if (this.isToolbarReservedMode()) {
            this.syncBottomMetrics();
            return;
        }
        if (this.isHidden && this.navbar) {
            this.navbar.classList.remove('hidden');
            this.isHidden = false;
        }
    }

    isReaderMode() {
        return document.body.classList.contains('leitor-keep-toolbar');
    }

    isZombieToolbarMode() {
        return document.body.classList.contains('zombie-toolbar-active');
    }

    isToolbarReservedMode() {
        return this.isReaderMode() || this.isZombieToolbarMode();
    }

    keyboardOpenByViewport() {
        if (this.editableFocado) return true;
        if (window.visualViewport) {
            return (window.innerHeight - window.visualViewport.height) > 120;
        }
        return this.isKeyboardOpen;
    }

    syncBottomUI() {
        if (this._syncRaf) return;
        this._syncRaf = requestAnimationFrame(() => {
            this._syncRaf = 0;
            this.isKeyboardOpen = this.keyboardOpenByViewport();
            if (this.isKeyboardOpen || this.isToolbarReservedMode()) {
                this.hideNavbar('keyboard');
            } else {
                this.showNavbar();
            }
            this.syncBottomMetrics();
        });
    }

    setupKeyboardBehavior() {
        const sync = () => this.syncBottomUI();

        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', sync, { passive: true });
            window.visualViewport.addEventListener('scroll', sync, { passive: true });
        }

        document.addEventListener('focusin', (e) => {
            const tag = e.target.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable) {
                this.editableFocado = true;
                this.isKeyboardOpen = true;
                this.hideNavbar('keyboard');
                this.syncBottomMetrics();
            }
        });

        document.addEventListener('focusout', () => {
            this.editableFocado = false;
            setTimeout(sync, 60);
        });

        const bodyObserver = new MutationObserver(sync);
        bodyObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });

        sync();
    }

    setupNavigation() {
        if (!this.navbar) return;
        this.navbar.addEventListener('click', (e) => {
            const item = e.target.closest('.navbar-item');
            if (!item) return;
            const href = item.getAttribute('href');
            if (href && href !== '#') return;
        });
    }

    updateActiveState() {
        if (!this.navbar) return;
        const items = this.navbar.querySelectorAll('.navbar-item');
        items.forEach(item => item.classList.remove('active'));
        const activeItem = this.navbar.querySelector(`[data-page="${this.currentPage}"]`);
        if (activeItem) activeItem.classList.add('active');
        this.navbar.setAttribute('data-context', `navbar-context-${this.currentPage}`);
    }

    addBodyClass() {
        document.body.classList.add('with-bottom-navbar');
        if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true) {
            document.body.classList.add('is-pwa');
        }
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
        if (saveButton) saveButton.classList.add('logged-in');
    }

    onLogout() {
        localStorage.removeItem('supabase_user');
        localStorage.removeItem('last_login');
        const saveButton = this.navbar?.querySelector('[data-page="save"]');
        if (saveButton) saveButton.classList.remove('logged-in');
    }

    setActivePage(page) {
        this.currentPage = page;
        this.updateActiveState();
    }

    destroy() {
        if (this._resizeObserver) {
            this._resizeObserver.disconnect();
            this._resizeObserver = null;
        }

        for (const [eventName, handler] of this._metricsListeners) {
            window.removeEventListener(eventName, handler);
        }
        this._metricsListeners = [];

        if (this.navbar) {
            this.navbar.remove();
            this.navbar = null;
        }
        document.body.classList.remove('with-bottom-navbar', 'navbar-is-visible', 'navbar-is-hidden');
        const root = document.documentElement;
        root.style.removeProperty('--navbar-real-height');
        root.style.removeProperty('--navbar-occupied-bottom');
        root.style.removeProperty('--navbar-layout-bottom');
        root.style.removeProperty('--kbd-toolbar-real-height');
    }
}

async function irParaHome(event) {
    if (event) event.preventDefault();
    if (isIndexPageNavbar()) {
        if (window.carousel && window.carousel.currentSlide !== 3) {
            window.carousel.goToSlide(3, true);
        }
        return;
    }
    window.location.href = joinProjectPath('index.html');
}

async function irParaBiblia(event) {
    if (event) event.preventDefault();
    const currentPath = window.location.pathname.toLowerCase();
    if (currentPath.includes('biblia') || currentPath.includes('livro') || currentPath.includes('capitulo')) {
        window.location.href = joinProjectPath('biblia/biblia.html?from=navbar');
    } else {
        window.location.href = joinProjectPath('biblia/biblia.html');
    }
}

async function irParaAnotacoes(event) {
    if (event) event.preventDefault();
    const currentPath = window.location.pathname.toLowerCase();
    if (currentPath.includes('richtext') || currentPath.includes('anotacoes') || currentPath.includes('container')) return;
    window.location.href = joinProjectPath(`richtext/container.html?semana=${window.getGlobalWeek()}`);
}

function ddmmParaISO(ddmm) {
    const m = String(ddmm || "").match(/(\d{2})-(\d{2})/);
    if (!m) return "";
    const dia = parseInt(m[1], 10);
    const mes = parseInt(m[2], 10) - 1;
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    let melhor = null;
    let menor = Infinity;
    for (let dy = -1; dy <= 1; dy++) {
        const d = new Date(hoje.getFullYear() + dy, mes, dia);
        const diff = Math.abs(d.getTime() - hoje.getTime());
        if (diff < menor) { menor = diff; melhor = d; }
    }
    const yyyy = melhor.getFullYear();
    const mm = String(mes + 1).padStart(2, "0");
    const dd = String(dia).padStart(2, "0");
    return yyyy + "-" + mm + "-" + dd;
}

async function irParaSentinela(event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }

    let semana = window.getGlobalWeek();

    if (isIndexPageNavbar() && window.carousel) {
        semana = window.carousel.getVisibleWeek();
    }

    window.semanaAtual = semana;

    const iso = ddmmParaISO(semana);
    if (!iso) {
        window.location.href = joinProjectPath("index.html");
        return false;
    }

    if (window.location.pathname.toLowerCase().endsWith("/estudo.html") && window.location.search.indexOf("d=" + iso) !== -1) {
        return false;
    }

    window.location.href = joinProjectPath("sentinela/artigos/estudo.html?d=" + iso);
    return false;
}

window.irParaSentinelaAcao = function(semanaParam) {
    if (semanaParam) {
        window.semanaAtual = semanaParam;
    }
    irParaSentinela(null);
};

async function irParaSalvar(event) {
    if (event) event.preventDefault();
    const currentPath = window.location.pathname.toLowerCase();
    if (currentPath.includes('save') || currentPath.includes('auth')) return;
    window.location.href = joinProjectPath('save/auth-supabase.html');
}

window.UnifiedNavbar = {
    instance: null,
    init(options = {}) {
        if (this.instance) this.instance.destroy();
        this.instance = new UnifiedNavbar(options);
        return this.instance;
    },
    get() {
        return this.instance;
    },
    setActivePage(page) {
        if (this.instance) this.instance.setActivePage(page);
    }
};

function bootUnifiedNavbarWhenPossible() {
    if (!document.body) {
        document.addEventListener('DOMContentLoaded', bootUnifiedNavbarWhenPossible, { once: true });
        return;
    }
    if (!window.UnifiedNavbar.instance) {
        window.UnifiedNavbar.init();
    }
}

bootUnifiedNavbarWhenPossible();

let lastTouchEnd = 0;
document.addEventListener('touchend', function (event) {
    const now = (new Date()).getTime();
    if (now - lastTouchEnd <= 300) {
        event.preventDefault();
    }
    lastTouchEnd = now;
}, false);

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        const swPath = joinProjectPath('sw.js');
        navigator.serviceWorker.register(swPath).catch(() => {});
    });
}