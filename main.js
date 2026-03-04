// main.js - Carrossel Dinâmico Automático (7 semanas)

class CarouselManager {
    constructor() {
        this.currentSlide = 3; // Em um array de 7 (-3 a +3), o índice 3 é SEMPRE a semana atual
        this.totalSlides = 7;
        this.slides =[];
        this.slidesWrapper = null;
        this.indicators = null;
        this.semanas =[];
        this.semanaAtual = null; // Parâmetro DD-MM da semana atual
        
        this.mesesPtBr =[
            "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", 
            "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
        ];
        
        this.init();
    }

    async init() {
        try {
            // 1. Gera as semanas dinamicamente baseadas na data de hoje
            this.gerarSemanasDinamicas();
            
            // 2. Cria os slides no HTML
            this.createSlides();
            
            // 3. Configura os botões e touch
            this.setupNavigation();
            
            // 4. Inicia o carrossel na semana atual (índice 3)
            this.goToSlide(this.currentSlide, false);
            
            // 5. Atualiza o texto do cabeçalho
            this.updateSemanaDisplay();
            
            console.log('✅ Carrossel dinâmico inicializado na semana:', this.semanaAtual);
            
        } catch (error) {
            console.error('❌ Erro ao inicializar carrossel:', error);
            this.showError();
        }
    }

    gerarSemanasDinamicas() {
        const hoje = new Date();
        
        // Encontra a data da última segunda-feira
        const diaDaSemana = hoje.getDay(); // 0 = Domingo, 1 = Segunda, etc.
        const diasParaSegunda = diaDaSemana === 0 ? -6 : 1 - diaDaSemana;
        
        const segundaAtual = new Date(hoje);
        segundaAtual.setDate(hoje.getDate() + diasParaSegunda);
        segundaAtual.setHours(0, 0, 0, 0); // Zera as horas para evitar bugs de fuso horário

        // Define a string da semana atual (DD-MM) para referência
        const diaAtualFormatado = String(segundaAtual.getDate()).padStart(2, '0');
        const mesAtualFormatado = String(segundaAtual.getMonth() + 1).padStart(2, '0');
        this.semanaAtual = `${diaAtualFormatado}-${mesAtualFormatado}`;
        window.semanaAtual = this.semanaAtual;

        this.semanas =[];

        // Loop para gerar 3 semanas antes, a atual (0), e 3 semanas depois
        for (let i = -3; i <= 3; i++) {
            const dataSegunda = new Date(segundaAtual);
            dataSegunda.setDate(dataSegunda.getDate() + (i * 7));
            
            const dataDomingo = new Date(dataSegunda);
            dataDomingo.setDate(dataDomingo.getDate() + 6);

            // Formata o parâmetro DD-MM
            const paramDia = String(dataSegunda.getDate()).padStart(2, '0');
            const paramMes = String(dataSegunda.getMonth() + 1).padStart(2, '0');
            const parametro = `${paramDia}-${paramMes}`;

            // Cria o título legível (Ex: "23 de Fevereiro - 1 de Março" ou "6-12 de Abril")
            let titulo = "";
            if (dataSegunda.getMonth() === dataDomingo.getMonth()) {
                titulo = `${dataSegunda.getDate()}-${dataDomingo.getDate()} de ${this.mesesPtBr[dataSegunda.getMonth()]}`;
            } else {
                titulo = `${dataSegunda.getDate()} de ${this.mesesPtBr[dataSegunda.getMonth()]} - ${dataDomingo.getDate()} de ${this.mesesPtBr[dataDomingo.getMonth()]}`;
            }

            this.semanas.push({
                semana: titulo,
                parametro: parametro,
                titulo: titulo
            });
        }
        
        console.log('🗓️ Semanas geradas:', this.semanas);
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

        console.log(`📱 7 slides criados dinamicamente`);
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

        this.slidesWrapper.addEventListener('click', (e) => {
            const link = e.target.closest('a[data-semana]');
            if (link) {
                e.preventDefault();
                const semana = link.getAttribute('data-semana');
                this.verificarESentinela(semana);
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

    async verificarESentinela(semana) {
        try {
            const response = await fetch(`sentinela/${semana}.html`, { method: 'HEAD' });
            if (response.ok) {
                window.location.href = `sentinela/${semana}.html`;
            } else {
                this.mostrarEmBreveInline(semana);
            }
        } catch (error) {
            this.mostrarEmBreveInline(semana);
        }
    }

    mostrarEmBreveInline(semana) {
        const [dia, mes] = semana.split('-');
        const semanaFormatada = `${dia}/${mes}`;
        
        const emBreveHTML = `
            <!DOCTYPE html>
            <html lang="pt-BR">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
                <title>Estudo Em Breve</title>
                <style>
                    body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%); margin: 0; padding: 20px; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
                    .container { background: white; border-radius: 20px; box-shadow: 0 20px 60px rgba(0,0,0,0.1); padding: 40px; text-align: center; max-width: 400px; width: 100%; position: relative; overflow: hidden; }
                    .container::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 4px; background: linear-gradient(90deg, #3F3C6D, #667eea); }
                    .icone { font-size: 4rem; margin-bottom: 20px; opacity: 0.8; }
                    .titulo { font-size: 1.8rem; font-weight: 600; color: #375255; margin-bottom: 15px; }
                    .semana { font-size: 1.1rem; color: #6B46C1; font-weight: 500; margin-bottom: 25px; }
                    .mensagem { color: #666; line-height: 1.6; margin-bottom: 30px; }
                    .botoes { display: flex; flex-direction: column; gap: 15px; }
                    .botao { background: #375255; color: white; padding: 16px 24px; border-radius: 12px; text-decoration: none; font-weight: 600; display: flex; align-items: center; justify-content: center; gap: 8px; }
                    .botao-reload { background: #6b7280; border: none; font-size: 16px; cursor: pointer;}
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="icone">📖</div>
                    <h1 class="titulo">Estudo Em Breve</h1>
                    <p class="semana">Semana de ${semanaFormatada}</p>
                    <p class="mensagem">O estudo de <strong>A Sentinela</strong> para esta semana ainda não foi publicado.</p>
                    <div class="botoes">
                        <a href="index.html" class="botao">← Voltar ao Índice</a>
                        <button onclick="window.location.reload()" class="botao botao-reload">🔄 Verificar Novamente</button>
                    </div>
                </div>
            </body>
            </html>
        `;
        document.open();
        document.write(emBreveHTML);
        document.close();
    }

    getCurrentWeek() { return this.semanaAtual; }
    getCurrentSlideConfig() { return this.semanas[this.currentSlide]; }
    forceGoToWeek(semanaParametro) {
        const index = this.semanas.findIndex(config => config.parametro === semanaParametro);
        if (index !== -1) { this.goToSlide(index); return true; }
        return false;
    }
}

// Inicialização Direta (Sem precisar do arquivo dias-config.js)
document.addEventListener('DOMContentLoaded', () => {
    window.carousel = new CarouselManager();
});

// Métodos globais
window.goToWeek = (semana) => window.carousel ? window.carousel.forceGoToWeek(semana) : false;
window.getCurrentWeek = () => window.carousel ? window.carousel.getCurrentWeek() : null;