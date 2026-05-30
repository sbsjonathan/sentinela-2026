class CarouselManager {
    constructor() {
        this.currentSlide = 3;
        this.totalSlides = 7;
        this.slides = [];
        this.slidesWrapper = null;
        this.indicators = null;
        this.semanas = [];
        this.semanaAtual = null;
        this.isShowingEmBreve = false;
        
        this.mesesPtBr = [
            "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", 
            "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
        ];
        
        this.init();
    }

    async init() {
        try {
            this.gerarSemanasDinamicas();
            this.createSlides();
            this.setupNavigation();
            this.goToSlide(this.currentSlide, false);
            this.updateSemanaDisplay();
            this.handleInitialURLState();
        } catch (error) {
            this.showError();
        }
    }

    normalizeSemana(value) {
        const match = String(value || '').match(/\b(\d{2}-\d{2})\b/);
        return match ? match[1] : '';
    }

    handleInitialURLState() {
        const params = new URLSearchParams(window.location.search);
        const semanaParam = this.normalizeSemana(params.get('semana'));
        const estado = String(params.get('estado') || params.get('modo') || '').toLowerCase();

        if (semanaParam) {
            this.forceGoToWeek(semanaParam);
        }

        if (['em-breve', 'embreve', 'em_breve'].includes(estado)) {
            const semana = semanaParam || window.getGlobalWeek();
            requestAnimationFrame(() => this.mostrarEmBreveInline(semana));
        }
    }

    gerarSemanasDinamicas() {
        const hoje = new Date();
        const diaDaSemana = hoje.getDay();
        const diasParaSegunda = diaDaSemana === 0 ? -6 : 1 - diaDaSemana;
        
        const segundaAtual = new Date(hoje);
        segundaAtual.setDate(hoje.getDate() + diasParaSegunda);
        segundaAtual.setHours(0, 0, 0, 0);

        const diaAtualFormatado = String(segundaAtual.getDate()).padStart(2, '0');
        const mesAtualFormatado = String(segundaAtual.getMonth() + 1).padStart(2, '0');
        this.semanaAtual = `${diaAtualFormatado}-${mesAtualFormatado}`;
        window.semanaAtual = this.semanaAtual;

        this.semanas = [];

        for (let i = -3; i <= 3; i++) {
            const dataSegunda = new Date(segundaAtual);
            dataSegunda.setDate(dataSegunda.getDate() + (i * 7));
            
            const dataDomingo = new Date(dataSegunda);
            dataDomingo.setDate(dataDomingo.getDate() + 6);

            const paramDia = String(dataSegunda.getDate()).padStart(2, '0');
            const paramMes = String(dataSegunda.getMonth() + 1).padStart(2, '0');
            const parametro = `${paramDia}-${paramMes}`;

            let titulo = "";
            if (dataSegunda.getMonth() === dataDomingo.getMonth()) {
                titulo = `${dataSegunda.getDate()}-${dataDomingo.getDate()} de ${this.mesesPtBr[dataSegunda.getMonth()]}`;
            } else {
                titulo = `${dataSegunda.getDate()} de ${this.mesesPtBr[dataSegunda.getMonth()]} - ${dataDomingo.getDate()} de ${this.mesesPtBr[dataDomingo.getMonth()]}`;
            }

            this.semanas.push({ semana: titulo, parametro, titulo });
        }
    }

    createSlides() {
        this.slidesWrapper = document.getElementById('slides-wrapper');
        this.indicators = document.getElementById('indicators');
        
        if (!this.slidesWrapper) throw new Error('Slides wrapper não encontrado');

        this.slidesWrapper.innerHTML = '';
        if (this.indicators) this.indicators.innerHTML = '';

        this.semanas.forEach((config, index) => {
            this.createSlide(config, index);
            this.createIndicator(index);
        });
    }

    createSlide(config, index) {
        const slide = document.createElement('div');
        slide.className = 'slide';
        slide.innerHTML = `
            <div class="slide-content">
                <h2 class="subtitulo">${config.titulo}</h2>
                <div class="nav-links">
                    <a href="richtext/container.html?semana=${config.parametro}" class="nav-link">
                        <span class="icone">📝</span>
                        Anotações do Discurso
                    </a>
                    <a href="javascript:void(0)" class="nav-link" data-semana="${config.parametro}">
                        <span class="icone">📖</span>
                        Estudo de A Sentinela
                    </a>
                </div>
                <p class="descricao">Semana de ${config.semana}</p>
            </div>
        `;
        this.slidesWrapper.appendChild(slide);
        this.slides.push(slide);
    }

    createIndicator(index) {
        if (!this.indicators) return;
        const indicator = document.createElement('div');
        indicator.className = 'indicator';
        indicator.addEventListener('click', () => this.goToSlide(index));
        this.indicators.appendChild(indicator);
    }

    setupNavigation() {
        const prevBtn = document.getElementById('prev-btn');
        const nextBtn = document.getElementById('next-btn');

        if (prevBtn) prevBtn.addEventListener('click', () => this.previousSlide());
        if (nextBtn) nextBtn.addEventListener('click', () => this.nextSlide());

        this.slidesWrapper.addEventListener('click', async (e) => {
            const link = e.target.closest('a[data-semana]');
            if (link) {
                e.preventDefault();
                const semana = link.getAttribute('data-semana');
                if (window.irParaSentinelaAcao) {
                    window.irParaSentinelaAcao(semana);
                } else {
                    this.verificarESentinela(semana);
                }
            }
        });

        this.setupSwipeNavigation();

        document.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowLeft') this.previousSlide();
            if (e.key === 'ArrowRight') this.nextSlide();
        });
    }

    setupSwipeNavigation() {
        let startX = 0; let startY = 0;
        let endX = 0; let endY = 0;

        this.slidesWrapper.addEventListener('touchstart', (e) => {
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
        }, { passive: true });

        this.slidesWrapper.addEventListener('touchend', (e) => {
            endX = e.changedTouches[0].clientX;
            endY = e.changedTouches[0].clientY;
            
            const deltaX = startX - endX;
            const deltaY = startY - endY;
            
            if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 50) {
                if (deltaX > 0) this.nextSlide();
                else this.previousSlide();
            }
        }, { passive: true });
    }

    goToSlide(index, animate = true) {
        if (index < 0 || index >= this.totalSlides) return;

        this.currentSlide = index;
        const translateX = -index * 100;
        this.slidesWrapper.style.transform = `translateX(${translateX}%)`;
        
        if (!animate) {
            this.slidesWrapper.style.transition = 'none';
            this.slidesWrapper.offsetHeight;
            this.slidesWrapper.style.transition = '';
        }

        this.updateIndicators();
        this.updateSemanaDisplay();
    }

    nextSlide() {
        const nextIndex = (this.currentSlide + 1) % this.totalSlides;
        this.goToSlide(nextIndex);
    }

    previousSlide() {
        const prevIndex = (this.currentSlide - 1 + this.totalSlides) % this.totalSlides;
        this.goToSlide(prevIndex);
    }

    updateIndicators() {
        if (!this.indicators) return;
        const indicators = this.indicators.querySelectorAll('.indicator');
        indicators.forEach((indicator, index) => {
            indicator.classList.toggle('active', index === this.currentSlide);
        });
    }

    updateSemanaDisplay() {
        const semanaDisplay = document.getElementById('semana-display');
        if (semanaDisplay && this.semanas[this.currentSlide]) {
            const config = this.semanas[this.currentSlide];
            semanaDisplay.textContent = config.titulo;
            
            if (config.parametro === this.semanaAtual) {
                semanaDisplay.style.color = '#667eea';
                semanaDisplay.style.fontWeight = '700';
            } else {
                semanaDisplay.style.color = '';
                semanaDisplay.style.fontWeight = '';
            }
        }
    }

    showError() {
        this.slidesWrapper = document.getElementById('slides-wrapper');
        if (this.slidesWrapper) {
            this.slidesWrapper.innerHTML = `
                <div class="slide"><div class="slide-content"><h2 class="subtitulo">Erro ao Carregar</h2></div></div>`;
        }
    }

    getVisibleWeek() {
        return this.normalizeSemana(this.semanas[this.currentSlide]?.parametro) || this.semanaAtual;
    }

    async artigoExiste(url) {
        try {
            const response = await fetch(url, {
                method: 'GET',
                cache: 'no-store',
                credentials: 'same-origin'
            });

            if (!response.ok) return false;

            const finalURL = String(response.url || '').toLowerCase();
            if (finalURL.includes('/404') || finalURL.endsWith('404.html')) return false;

            const html = await response.text();
            const sample = html.slice(0, 7000).toLowerCase();

            if (sample.includes('page not found') || sample.includes('file not found')) return false;
            if (sample.includes('github pages') && sample.includes('404')) return false;

            return /data-estudo=["']?\d{2}-\d{2}/i.test(html)
                || /<title>\s*a sentinela\s*<\/title>/i.test(html)
                || /--cor-principal-estudo/i.test(html);
        } catch (error) {
            return false;
        }
    }

    async verificarESentinela(semana) {
        const semanaNormalizada = this.normalizeSemana(semana) || this.getVisibleWeek();
        const artigoURL = `sentinela/artigos/${semanaNormalizada}.html`;

        if (await this.artigoExiste(artigoURL)) {
            window.location.href = artigoURL;
            return;
        }

        window.location.href = `index.html?semana=${semanaNormalizada}&estado=em-breve`;
    }

    mostrarEmBreveInline(semana) {
        const semanaNormalizada = this.normalizeSemana(semana) || this.getVisibleWeek();
        const [dia, mes] = semanaNormalizada.split('-');
        const semanaFormatada = dia && mes ? `${dia}/${mes}` : '';

        this.isShowingEmBreve = true;
        window.semanaAtual = semanaNormalizada;
        document.title = 'Estudo Em Breve';
        document.body.className = 'with-bottom-navbar sentinela-em-breve-mode';
        
        document.body.innerHTML = `
            <main class="sentinela-embreve-page">
                <section class="sentinela-embreve-card">
                    <div class="sentinela-embreve-icone">📖</div>
                    <h1 class="sentinela-embreve-titulo">Estudo Em Breve</h1>
                    ${semanaFormatada ? `<p class="sentinela-embreve-semana">Semana de ${semanaFormatada}</p>` : ''}
                    <p class="sentinela-embreve-mensagem">O artigo de <strong>A Sentinela</strong> para esta semana ainda não foi publicado.</p>
                    <div class="sentinela-embreve-botoes">
                        <a href="index.html" class="sentinela-embreve-botao">← Voltar ao Início</a>
                        <button type="button" class="sentinela-embreve-botao sentinela-embreve-botao-sec" onclick="window.location.reload()">Verificar novamente</button>
                    </div>
                </section>
            </main>
        `;

        requestAnimationFrame(() => {
            try { window.UnifiedNavbar?.init?.(); } catch (error) {}
        });
    }

    getCurrentWeek() { return this.semanaAtual; }
    getCurrentSlideConfig() { return this.semanas[this.currentSlide]; }
    forceGoToWeek(semanaParametro) {
        const semanaNormalizada = this.normalizeSemana(semanaParametro);
        const index = this.semanas.findIndex(config => config.parametro === semanaNormalizada);
        if (index !== -1) { this.goToSlide(index); return true; }
        return false;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.carousel = new CarouselManager();
});

window.goToWeek = (semana) => window.carousel ? window.carousel.forceGoToWeek(semana) : false;
window.getCurrentWeek = () => window.carousel ? window.carousel.getCurrentWeek() : null;
window.mostrarEstudoEmBreve = (semana) => window.carousel ? window.carousel.mostrarEmBreveInline(semana) : false;
window.verificarESentinela = (semana) => window.carousel ? window.carousel.verificarESentinela(semana) : false;