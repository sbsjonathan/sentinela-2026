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
    const scripts = Array.from(document.scripts || []);
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
        if (['notes', 'save'].includes(this.currentPage)) {
            this.showNavbar();
            return;
        }
        window.addEventListener('scroll', () => this.onScroll(), { passive: true });
    }

    onScroll() {
        if (this.isKeyboardOpen) return;
        const currentScrollY = window.scrollY;
        if (currentScrollY > this.lastScrollY && currentScrollY > 10) {
            this.hideNavbar();
        } else {
            this.showNavbar();
        }
        this.lastScrollY = currentScrollY <= 0 ? 0 : currentScrollY;
    }

    hideNavbar() {
        if (!this.isHidden && this.navbar) {
            this.navbar.classList.add('hidden');
            this.isHidden = true;
        }
    }

    showNavbar() {
        if (this.isKeyboardOpen) return;
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
            if (isEditable) this.toggleKeyboardState(true);
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
        if (this.isKeyboardOpen === isOpen) return;
        this.isKeyboardOpen = isOpen;
        if (isOpen) {
            this.hideNavbar();
        } else {
            this.showNavbar();
        }
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
        if (this.navbar) {
            this.navbar.remove();
            this.navbar = null;
        }
        clearTimeout(this.hideTimeout);
        document.body.classList.remove('with-bottom-navbar');
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
    const artigoURL = joinProjectPath("sentinela/artigos/" + semana + ".html");
    const fallbackURL = buildIndexEmBreveURL(semana);

    if (window.location.pathname.toLowerCase().endsWith("/" + semana + ".html")) return false;

    if (await urlExiste(artigoURL)) {
        window.location.href = artigoURL;
        return false;
    }

    window.location.href = fallbackURL;
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