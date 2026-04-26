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
        if (path.includes('/biblia/') || path.includes('livro') || path.includes('capitulo')) {
            return 'bible';
        }
        if (path.includes('/richtext/') || path.includes('container.html')) {
            return 'notes';
        }
        if (path.includes('/sentinela/artigos/')) {
            return 'watchtower';
        }
        if (path.includes('/save/')) {
            return 'save';
        }
        
        return 'home';
    }

    calcularSemanaAtual() {
        const hoje = new Date();
        const diaDaSemana = hoje.getDay();
        const diasParaSegunda = diaDaSemana === 0 ? -6 : 1 - diaDaSemana;
        
        const segundaFeira = new Date(hoje);
        segundaFeira.setDate(hoje.getDate() + diasParaSegunda);
        
        const dia = String(segundaFeira.getDate()).padStart(2, '0');
        const mes = String(segundaFeira.getMonth() + 1).padStart(2, '0');
        
        return `${dia}-${mes}`;
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

    getSemanaCalculada() {
        return this.calcularSemanaAtual();
    }
}

async function irParaHome(event) {
    event.preventDefault();
    const currentPath = window.location.pathname.toLowerCase();
    if (currentPath.endsWith('index.html') || currentPath.endsWith('/') || !currentPath.includes('.html')) {
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
    if (currentPath.includes('/biblia/')) {
        window.location.href = `${basePath}biblia/biblia.html?from=navbar`;
    } else {
        window.location.href = `${basePath}biblia/biblia.html`;
    }
}

async function irParaAnotacoes(event) {
    event.preventDefault();
    const currentPath = window.location.pathname.toLowerCase();
    if (currentPath.includes('/richtext/')) {
        return;
    }
    const basePath = getBasePath();
    const semanaParam = getSemanaParam();
    window.location.href = `${basePath}richtext/container.html${semanaParam}`;
}

async function irParaSentinela(event) {
    event.preventDefault();
    const currentPath = window.location.pathname.toLowerCase();
    
    if (currentPath.includes('/artigos/') && !currentPath.includes('em-breve')) {
        return;
    }

    let semana = window.semanaAtual;
    if (!semana) {
        const urlParams = new URLSearchParams(window.location.search);
        semana = urlParams.get('semana');
    }
    
    if (!semana) {
        const hoje = new Date();
        const diaDaSemana = hoje.getDay();
        const diasParaSegunda = diaDaSemana === 0 ? -6 : 1 - diaDaSemana;
        const segundaFeira = new Date(hoje);
        segundaFeira.setDate(hoje.getDate() + diasParaSegunda);
        segundaFeira.setHours(0, 0, 0, 0);
        const dia = String(segundaFeira.getDate()).padStart(2, '0');
        const mes = String(segundaFeira.getMonth() + 1).padStart(2, '0');
        semana = `${dia}-${mes}`;
    }

    window.semanaAtual = semana;
    const basePath = getBasePath();
    window.location.href = `${basePath}sentinela/artigos/${semana}.html`;
}

async function irParaSalvar(event) {
    event.preventDefault();
    const currentPath = window.location.pathname.toLowerCase();
    if (currentPath.includes('/save/')) {
        return;
    }
    const basePath = getBasePath();
    window.location.href = `${basePath}save/auth-supabase.html`;
}

function getBasePath() {
    const path = window.location.pathname.toLowerCase();
    if (path.endsWith('index.html') || path.endsWith('/') || path.indexOf('.html') === -1) {
        return './';
    }
    if (path.includes('/sentinela/artigos/')) {
        return '../../';
    }
    return '../';
}

function getSemanaParam() {
    if (window.semanaAtual) {
        return `?semana=${window.semanaAtual}`;
    }
    const urlParams = new URLSearchParams(window.location.search);
    const semanaURL = urlParams.get('semana');
    if (semanaURL) {
        return `?semana=${semanaURL}`;
    }
    const hoje = new Date();
    const diaDaSemana = hoje.getDay();
    const diasParaSegunda = diaDaSemana === 0 ? -6 : 1 - diaDaSemana;
    const segundaFeira = new Date(hoje);
    segundaFeira.setDate(hoje.getDate() + diasParaSegunda);
    const dia = String(segundaFeira.getDate()).padStart(2, '0');
    const mes = String(segundaFeira.getMonth() + 1).padStart(2, '0');
    return `?semana=${dia}-${mes}`;
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

bootUnifiedNavbarWhenPossible();

let lastTouchEnd = 0;
document.addEventListener('touchend', function (event) {
    const now = (new Date()).getTime();
    if (now - lastTouchEnd <= 300) {
        event.preventDefault();
    }
    lastTouchEnd = now;
}, false);
