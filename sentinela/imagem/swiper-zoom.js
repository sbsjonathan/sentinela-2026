// swiper-zoom.js - Versão FINAL com fechamento suave + deslizar para baixo + INÉRCIA

class ZoomModal {
    constructor() {
        this.container = null; this.header = null; this.content = null; this.footer = null;
        this.image = null; this.closeBtn = null; this.scale = 1; this.translateX = 0; this.translateY = 0;
        this.maxScale = 4; this.minScale = 1; this.initialDistance = 0; this.lastScale = 1;
        this.lastTranslateX = 0; this.lastTranslateY = 0; this.initialTranslateX = 0;
        this.initialTranslateY = 0; this.startX = 0; this.startY = 0; this.focusX = 0; this.focusY = 0;
        this.isMultiTouch = false; this.multiTouchEndTime = 0; this.touchTolerance = 200;
        this.tapStartTime = 0; this.isDragging = false; this.headerVisible = true;
        this.hideTimeout = null; this.savedScrollY = 0;
        
        // Propriedades para o deslizar para baixo
        this.isDismissing = false; this.dismissThreshold = 100; 
        this.dismissStartY = 0; this.dismissCurrentY = 0; this.dismissOpacity = 1;
        
        // Propriedades para INÉRCIA (extraídas do arquivo de inspiração)
        this.rafId = null; this.velocityX = 0; this.velocityY = 0; this.trackingPoints = [];
        this.FRICTION = 0.96; this.MIN_VELOCITY = 0.3; this.MAX_VELOCITY = 35; this.VELOCITY_MULTIPLIER = 15;
        
        this.init();
    }

    init() {
        this.container = document.getElementById('zoom-container');
        this.header = this.container?.querySelector('.zoom-header');
        this.content = this.container?.querySelector('.zoom-content');
        this.footer = this.container?.querySelector('.zoom-footer');
        this.closeBtn = this.container?.querySelector('.zoom-btn-fechar');
        if (!this.container) { return; }
        this.setupEventListeners();
        window.abrirZoom = (img) => this.open(img);
    }

    setupEventListeners() {
        if (this.closeBtn) { this.closeBtn.addEventListener('click', () => this.close()); }
        this.content.addEventListener('touchstart', (e) => this.onTouchStart(e), { passive: false });
        this.content.addEventListener('touchmove', (e) => this.onTouchMove(e), { passive: false });
        this.content.addEventListener('touchend', (e) => this.onTouchEnd(e), { passive: false });
    }

    open(imgElement) {
        if (!imgElement) return;

        this.savedScrollY = window.scrollY;
        this.reset();
        this.showHeader();
        
        // Garantir que o fundo seja preto desde o início
        this.container.style.backgroundColor = 'black';
        
        this.image = document.createElement('img');
        this.image.className = 'zoom-image';
        this.image.src = imgElement.src;
        this.image.alt = imgElement.alt || '';
        if (this.footer) { this.footer.textContent = this.image.alt; }

        this.image.classList.add('zoom-enter');
        
        this.content.innerHTML = '';
        this.content.appendChild(this.image);

        document.body.style.top = `-${this.savedScrollY}px`;
        document.body.classList.add('zoom-active');
        this.container.classList.add('active');

        requestAnimationFrame(() => {
            if (!this.image) return;
            this.image.classList.add('transition-active');
            this.image.classList.remove('zoom-enter');
        });
        
        setTimeout(() => {
            if (this.image) {
                this.image.classList.remove('transition-active');
            }
        }, 300);

        this.startAutoHide();
    }

    close() {
        if (!this.image) return;

        // Para a inércia se estiver rodando
        this.stopInertia();

        // 1. Inicia a animação da imagem (fade/zoom out)
        this.image.classList.add('transition-active');
        this.image.classList.add('zoom-exit');
        
        // 2. Inicia a animação do fundo preto (fade out) AO MESMO TEMPO
        this.container.classList.remove('active');

        // 3. Esconde as barras para não ficarem visíveis durante a animação
        this.hideHeader();
        clearTimeout(this.hideTimeout);

        // 4. ESPERA a transição terminar (300ms) para então limpar tudo e restaurar o scroll
        setTimeout(() => {
            document.body.classList.remove('zoom-active');
            document.body.style.top = '';
            window.scrollTo(0, this.savedScrollY);

            this.content.innerHTML = '';
            if (this.footer) { this.footer.textContent = ''; }
            this.image = null;
        }, 400); // Duração da animação
    }
    
    reset() { 
        this.scale = 1; this.translateX = 0; this.translateY = 0; this.lastScale = 1; 
        this.lastTranslateX = 0; this.lastTranslateY = 0; this.isMultiTouch = false; 
        this.multiTouchEndTime = 0; this.headerVisible = true;
        
        // Reset das propriedades de dismiss
        this.isDismissing = false; this.dismissCurrentY = 0; this.dismissOpacity = 1;
        
        // Reset das propriedades de inércia
        this.stopInertia(); this.velocityX = 0; this.velocityY = 0; this.trackingPoints = [];
        
        // Garantir que o fundo seja preto
        if (this.container) {
            this.container.style.backgroundColor = 'black';
        }
    }
    
    updateTransform() { 
        if (this.image) { 
            this.image.style.transform = `translate3d(${this.translateX}px, ${this.translateY}px, 0) scale(${this.scale})`;
        } 
    }

    // Nova função para atualizar transform durante dismiss
    updateDismissTransform() {
        if (this.image && this.isDismissing) {
            const progress = Math.min(this.dismissCurrentY / this.dismissThreshold, 1);
            const opacity = 1 - (progress * 0.7); // Diminui opacidade até 30%
            
            this.image.style.transform = `translate3d(${this.translateX}px, ${this.translateY + this.dismissCurrentY}px, 0) scale(${this.scale})`;
            this.image.style.opacity = opacity;
            this.container.style.backgroundColor = `rgba(0, 0, 0, ${opacity})`;
        }
    }

    // Função para resetar o estado de dismiss
    resetDismiss() {
        if (this.image) {
            this.image.style.opacity = '1';
            this.container.style.backgroundColor = 'black';
            this.updateTransform();
        }
        this.isDismissing = false;
        this.dismissCurrentY = 0;
    }

    // === FUNÇÕES DE INÉRCIA (extraídas do arquivo de inspiração) ===
    stopInertia() {
        if (this.rafId) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
    }

    applyConstraints() {
        if (!this.image || !this.content) return; 
        const containerRect = this.content.getBoundingClientRect(); 
        const imgNaturalWidth = this.image.naturalWidth; 
        const imgNaturalHeight = this.image.naturalHeight; 
        if (imgNaturalWidth === 0) return; 
        const imgAspectRatio = imgNaturalWidth / imgNaturalHeight; 
        const containerAspectRatio = containerRect.width / containerRect.height; 
        let baseWidth, baseHeight; 
        if (imgAspectRatio > containerAspectRatio) { 
            baseWidth = containerRect.width; 
            baseHeight = baseWidth / imgAspectRatio; 
        } else { 
            baseHeight = containerRect.height; 
            baseWidth = baseHeight * imgAspectRatio; 
        } 
        const scaledWidth = baseWidth * this.scale; 
        const scaledHeight = baseHeight * this.scale; 
        
        // SEM elástico - limites rígidos como estava antes
        const maxTranslateX = Math.max(0, (scaledWidth - containerRect.width) / 2);
        const maxTranslateY = Math.max(0, (scaledHeight - containerRect.height) / 2);
        
        this.translateX = Math.max(-maxTranslateX, Math.min(maxTranslateX, this.translateX)); 
        this.translateY = Math.max(-maxTranslateY, Math.min(maxTranslateY, this.translateY)); 
    }

    // Loop de inércia (igual ao arquivo de inspiração)
    inertiaLoop() {
        if (Math.abs(this.velocityX) < this.MIN_VELOCITY && Math.abs(this.velocityY) < this.MIN_VELOCITY) {
            this.velocityX = 0; 
            this.velocityY = 0;
            return;
        }
        
        this.translateX += this.velocityX; 
        this.translateY += this.velocityY;
        this.velocityX *= this.FRICTION; 
        this.velocityY *= this.FRICTION;
        
        this.applyConstraints();
        this.updateTransform();
        
        this.rafId = requestAnimationFrame(() => this.inertiaLoop());
    }

    onTouchStart(e) { 
        e.preventDefault(); 
        clearTimeout(this.hideTimeout);
        
        // Para a inércia se estiver rodando
        this.stopInertia();
        
        this.isDragging = false; 
        this.tapStartTime = Date.now(); 
        const currentTime = Date.now(); 
        const timeSinceMultiTouchEnd = currentTime - this.multiTouchEndTime; 
        
        if (e.touches.length === 2) { 
            this.isMultiTouch = true; 
            const touch1 = e.touches[0]; 
            const touch2 = e.touches[1]; 
            this.initialDistance = Math.hypot(touch2.clientX - touch1.clientX, touch2.clientY - touch1.clientY); 
            this.lastScale = this.scale; 
            const screenCenterX = (touch1.clientX + touch2.clientX) / 2; 
            const screenCenterY = (touch1.clientY + touch2.clientY) / 2; 
            const containerRect = this.content.getBoundingClientRect(); 
            this.focusX = screenCenterX - containerRect.left - containerRect.width / 2; 
            this.focusY = screenCenterY - containerRect.top - containerRect.height / 2; 
            this.initialTranslateX = this.translateX; 
            this.initialTranslateY = this.translateY; 
        } else if (e.touches.length === 1) { 
            if (timeSinceMultiTouchEnd < this.touchTolerance) return; 
            
            this.startX = e.touches[0].clientX; 
            this.startY = e.touches[0].clientY; 
            this.lastTranslateX = this.translateX; 
            this.lastTranslateY = this.translateY;

            // Inicializar tracking para inércia (igual ao arquivo de inspiração)
            this.trackingPoints = [{
                x: e.touches[0].clientX,
                y: e.touches[0].clientY,
                time: performance.now()
            }];
            this.velocityX = 0; 
            this.velocityY = 0;

            // Inicializar dismiss apenas se a imagem estiver em 100% (scale = 1)
            if (this.scale <= 1.1) { // Pequena tolerância para considerar como 100%
                this.dismissStartY = e.touches[0].clientY;
                this.isDismissing = true;
            }
        } 
    }

    onTouchMove(e) { 
        e.preventDefault(); 
        if (!this.isMultiTouch) { 
            this.isDragging = true; 
        } 
        const currentTime = Date.now(); 
        const timeSinceMultiTouchEnd = currentTime - this.multiTouchEndTime; 
        
        if (e.touches.length === 2 && this.isMultiTouch) { 
            // Reset dismiss se começar zoom
            if (this.isDismissing) {
                this.isDismissing = false;
                this.resetDismiss();
            }
            
            const touch1 = e.touches[0]; 
            const touch2 = e.touches[1]; 
            const currentDistance = Math.hypot(touch2.clientX - touch1.clientX, touch2.clientY - touch1.clientY); 
            const scaleChange = currentDistance / this.initialDistance; 
            const newScale = Math.min(Math.max(this.lastScale * scaleChange, this.minScale), this.maxScale); 
            const scaleDifference = newScale - this.lastScale; 
            this.translateX = this.initialTranslateX - (this.focusX * scaleDifference); 
            this.translateY = this.initialTranslateY - (this.focusY * scaleDifference); 
            this.scale = newScale; 
            this.applyConstraints(); 
            this.updateTransform(); 
        } else if (e.touches.length === 1 && !this.isMultiTouch) { 
            if (timeSinceMultiTouchEnd < this.touchTolerance) return; 
            
            const deltaX = e.touches[0].clientX - this.startX; 
            const deltaY = e.touches[0].clientY - this.startY;
            
            // Atualizar tracking points para inércia (igual ao arquivo de inspiração)
            const currentX = e.touches[0].clientX;
            const currentY = e.touches[0].clientY;
            this.trackingPoints.push({
                x: currentX,
                y: currentY,
                time: performance.now()
            });
            if (this.trackingPoints.length > 5) this.trackingPoints.shift();
            
            // Se está em modo dismiss (scale = 1)
            if (this.isDismissing && this.scale <= 1.1) {
                const dismissDelta = e.touches[0].clientY - this.dismissStartY;
                
                // Só permite movimento para baixo
                if (dismissDelta > 0) {
                    this.dismissCurrentY = dismissDelta;
                    this.updateDismissTransform();
                } else {
                    // Se tentar arrastar para cima, cancela o dismiss
                    this.resetDismiss();
                }
            } else if (this.scale > 1) {
                // Comportamento normal de pan quando com zoom
                this.translateX = this.lastTranslateX + deltaX; 
                this.translateY = this.lastTranslateY + deltaY; 
                this.applyConstraints(); 
                this.updateTransform();
            }
        } 
    }

    onTouchEnd(e) { 
        e.preventDefault(); 
        const tapDuration = Date.now() - this.tapStartTime; 
        
        // Verifica se deve fechar por dismiss
        if (this.isDismissing && this.dismissCurrentY > this.dismissThreshold) {
            this.close();
            return;
        }
        
        // Reset dismiss se não fechou
        if (this.isDismissing) {
            this.resetDismiss();
        }
        
        // === LÓGICA DE INÉRCIA (igual ao arquivo de inspiração) ===
        if (!this.isMultiTouch && this.scale > 1 && this.trackingPoints.length >= 2 && e.touches.length === 0) {
            const recent = this.trackingPoints.slice(-4);
            let totalVelX = 0, totalVelY = 0, count = 0;
            
            for (let i = 1; i < recent.length; i++) {
                const dt = recent[i].time - recent[i-1].time;
                if (dt > 0) {
                    totalVelX += (recent[i].x - recent[i-1].x) / dt;
                    totalVelY += (recent[i].y - recent[i-1].y) / dt;
                    count++;
                }
            }
            
            if (count > 0) {
                this.velocityX = Math.max(-this.MAX_VELOCITY, Math.min(this.MAX_VELOCITY, (totalVelX / count) * this.VELOCITY_MULTIPLIER));
                this.velocityY = Math.max(-this.MAX_VELOCITY, Math.min(this.MAX_VELOCITY, (totalVelY / count) * this.VELOCITY_MULTIPLIER));
            }
            
            if (Math.abs(this.velocityX) > this.MIN_VELOCITY || Math.abs(this.velocityY) > this.MIN_VELOCITY) {
                this.rafId = requestAnimationFrame(() => this.inertiaLoop());
            }
        } else {
            this.velocityX = 0;
            this.velocityY = 0;
        }
        
        if (!this.isMultiTouch && !this.isDragging && tapDuration < 250) { 
            if (e.target === this.content || e.target === this.image) { 
                this.toggleHeader(); 
            } 
        } 
        
        if (e.touches.length === 0 && this.isMultiTouch) { 
            this.isMultiTouch = false; 
            this.multiTouchEndTime = Date.now(); 
        } 
        
        if (this.scale < 1.1) { 
            this.scale = 1; 
            this.translateX = 0; 
            this.translateY = 0; 
            this.updateTransform(); 
        } else { 
            this.applyConstraints(); 
            this.updateTransform(); 
        } 
        
        if (e.touches.length === 0) { 
            this.startAutoHide();
            this.trackingPoints = []; // Limpa tracking points
        } 
    }
    
    toggleHeader() { 
        if (this.headerVisible) { 
            this.hideHeader(); 
        } else { 
            this.showHeader(); 
            this.startAutoHide(); 
        } 
    }
    
    showHeader() { 
        if (this.header) { 
            this.header.classList.remove('hidden'); 
        } 
        if (this.footer) { 
            this.footer.classList.remove('hidden'); 
        } 
        this.headerVisible = true; 
    }
    
    hideHeader() { 
        if (this.header) { 
            this.header.classList.add('hidden'); 
        } 
        if (this.footer) { 
            this.footer.classList.add('hidden'); 
        } 
        this.headerVisible = false; 
        clearTimeout(this.hideTimeout); 
    }
    
    startAutoHide() { 
        clearTimeout(this.hideTimeout); 
        if (this.headerVisible) { 
            this.hideTimeout = setTimeout(() => this.hideHeader(), 15000); 
        } 
    }
}

if (document.readyState === 'loading') { 
    document.addEventListener('DOMContentLoaded', () => new ZoomModal()); 
} else { 
    new ZoomModal(); 
}