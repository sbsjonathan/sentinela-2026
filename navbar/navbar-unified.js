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
        this.createNavbar();
        this.setupScrollBehavior();
        this.setupKeyboardBehavior();
        this.setupNavigation();
        
        setTimeout(() => {
            this.updateActiveState();
            this.updateSaveButtonVisual();
        }, 100);
        
        this.addBodyClass();
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
        if (existingNav) {
            existingNav.remove();
        }

        const navbarHTML = `
            <nav class="bottom-navbar" data-context="navbar-context-${this.currentPage}">
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

        document.body.insertAdjacentHTML('beforeend', navbarHTML);
        this.navbar = document.querySelector('.bottom-navbar');
    }

    getSemanaParam() {
        if (window.semanaAtual) {
            return `?semana=${window.semanaAtual}`;
        }

        const urlParams = new URLSearchParams(window.location.search);
        const semanaURL = urlParams.get('semana');
        if (semanaURL) {
            return `?semana=${semanaURL}`;
        }

        const semanaCalculada = this.calcularSemanaAtual();
        return `?semana=${semanaCalculada}`;
    }

    getBasePath() {
        // LÓGICA SIMPLIFICADA PARA KODER:
        // Se o nome do arquivo for index.html (e estivermos na raiz), usamos ./
        // Qualquer outro arquivo do seu projeto (container.html, biblia.html, etc) 
        // está dentro de pastas, então usamos ../
        
        const path = window.location.pathname;
        
        // Verifica se termina exatamente com index.html ou é apenas uma barra /
        if (path.endsWith('index.html') || path.endsWith('/')) {
            return './';
        }
        
        return '../';
    }

    setupScrollBehavior() {
        if (this.currentPage === 'notes') {
            return;
        }

        this.setupScrollHandlers();
        this.setupTouchBehavior();
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
        const urlParams = new URLSearchParams(window.location.search);
        const semanaURL = urlParams.get('semana');
        if (semanaURL) {
            return semanaURL;
        }

        if (window.semanaAtual) {
            return window.semanaAtual;
        }

        return this.calcularSemanaAtual();
    }

    showFeedback(item, type) {
        item.classList.remove('loading', 'success', 'error');
        item.classList.add(type);
        
        if (type !== 'loading') {
            setTimeout(() => {
                item.classList.remove(type);
            }, 600);
        }
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
            activeItem.style.color = '#6B46C1';
            
            if (this.currentPage === 'watchtower') {
                const icon = activeItem.querySelector('.navbar-icon');
                if (icon) {
                    icon.style.filter = 'brightness(0) saturate(100%) invert(35%) sepia(95%) saturate(1347%) hue-rotate(248deg) brightness(89%) contrast(90%)';
                }
            }
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
    event.preventDefault();

    const currentPath = window.location.pathname.toLowerCase();
    if (currentPath.includes('sentinela') && !currentPath.includes('em-breve')) {
        return;
    }

    // SEMPRE usa a semana atual no formato DD-MM (segunda-feira da semana).
    // Isso evita que a navbar herde a semana do `?semana=` quando você está na página de anotações.
    const hoje = new Date();
    const diaDaSemana = hoje.getDay(); // 0 = Domingo, 1 = Segunda, etc.
    const diasParaSegunda = diaDaSemana === 0 ? -6 : 1 - diaDaSemana;

    const segundaFeira = new Date(hoje);
    segundaFeira.setDate(hoje.getDate() + diasParaSegunda);
    segundaFeira.setHours(0, 0, 0, 0);

    const dia = String(segundaFeira.getDate()).padStart(2, '0');
    const mes = String(segundaFeira.getMonth() + 1).padStart(2, '0');
    const semana = `${dia}-${mes}`;

    // Mantém disponível globalmente para outras rotas/uso futuro.
    window.semanaAtual = semana;

    const basePath = getBasePath();
    window.location.href = `${basePath}sentinela/${semana}.html`;
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
    const path = window.location.pathname;
    
    // Se o arquivo for index.html, assume que está na raiz
    if (path.endsWith('index.html') || path.endsWith('/')) {
        return './';
    }
    
    // Se for QUALQUER outro arquivo (container.html, biblia.html, etc),
    // assumimos que está dentro de uma pasta (ex: richtext, biblia)
    // e precisamos voltar um nível.
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
    const semanaCalculada = `${dia}-${mes}`;
    
    return `?semana=${semanaCalculada}`;
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

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.UnifiedNavbar.init();
    });
} else {
    window.UnifiedNavbar.init();
}

let lastTouchEnd = 0;
document.addEventListener('touchend', function (event) {
    const now = (new Date()).getTime();
    if (now - lastTouchEnd <= 300) {
        event.preventDefault();
    }
    lastTouchEnd = now;
}, false);
