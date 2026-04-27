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

        this.lastTapTime = 0;
        this.lastTapX = 0;
        this.lastTapY = 0;
        this.singleTapTimer = null;
        this.transformTimer = null;
        this.doubleTapDelay = 280;
        this.doubleTapDistance = 35;
        this.doubleTapScale = 2.5;

        this.isDismissing = false; this.dismissThreshold = 100;
        this.dismissStartY = 0; this.dismissCurrentY = 0; this.dismissOpacity = 1;

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

        this.stopInertia();

        this.image.classList.add('transition-active');
        this.image.classList.add('zoom-exit');

        this.container.classList.remove('active');

        this.hideHeader();
        clearTimeout(this.hideTimeout);
        clearTimeout(this.singleTapTimer);
        clearTimeout(this.transformTimer);

        setTimeout(() => {
            document.body.classList.remove('zoom-active');
            document.body.style.top = '';
            window.scrollTo(0, this.savedScrollY);

            this.content.innerHTML = '';
            if (this.footer) { this.footer.textContent = ''; }
            this.image = null;
        }, 400);
    }

    reset() {
        this.scale = 1; this.translateX = 0; this.translateY = 0; this.lastScale = 1;
        this.lastTranslateX = 0; this.lastTranslateY = 0; this.isMultiTouch = false;
        this.multiTouchEndTime = 0; this.headerVisible = true;

        this.isDismissing = false; this.dismissCurrentY = 0; this.dismissOpacity = 1;

        this.stopInertia(); this.velocityX = 0; this.velocityY = 0; this.trackingPoints = [];

        clearTimeout(this.singleTapTimer);
        clearTimeout(this.transformTimer);
        this.singleTapTimer = null;
        this.transformTimer = null;
        this.lastTapTime = 0;
        this.lastTapX = 0;
        this.lastTapY = 0;

        if (this.container) {
            this.container.style.backgroundColor = 'black';
        }
    }

    updateTransform() {
        if (this.image) {
            this.image.style.transform = `translate3d(${this.translateX}px, ${this.translateY}px, 0) scale(${this.scale})`;
        }
    }

    animateTransform(duration = 280) {
        if (!this.image) return;

        clearTimeout(this.transformTimer);

        this.image.classList.add('transition-active');
        this.updateTransform();

        this.transformTimer = setTimeout(() => {
            if (this.image) {
                this.image.classList.remove('transition-active');
            }
            this.transformTimer = null;
        }, duration);
    }

    toggleDoubleTapZoom(clientX, clientY) {
        if (!this.image || !this.content) return;

        this.stopInertia();

        if (this.scale > 1.1) {
            this.scale = 1;
            this.translateX = 0;
            this.translateY = 0;
            this.animateTransform();

            this.showHeader();
            this.startAutoHide();
            return;
        }

        const containerRect = this.content.getBoundingClientRect();
        const targetScale = Math.min(this.doubleTapScale, this.maxScale);

        const focusX = clientX - containerRect.left - containerRect.width / 2;
        const focusY = clientY - containerRect.top - containerRect.height / 2;

        const scaleDifference = targetScale - this.scale;

        this.translateX = this.translateX - (focusX * scaleDifference);
        this.translateY = this.translateY - (focusY * scaleDifference);
        this.scale = targetScale;

        this.applyConstraints();
        this.animateTransform();

        this.hideHeader();
    }

    handleTap(e) {
        if (!e.changedTouches || !e.changedTouches[0]) return;
        if (!(e.target === this.content || e.target === this.image)) return;

        const touch = e.changedTouches[0];
        const now = Date.now();
        const x = touch.clientX;
        const y = touch.clientY;

        const timeSinceLastTap = now - this.lastTapTime;
        const distanceFromLastTap = Math.hypot(x - this.lastTapX, y - this.lastTapY);

        if (
            e.target === this.image &&
            timeSinceLastTap > 0 &&
            timeSinceLastTap < this.doubleTapDelay &&
            distanceFromLastTap < this.doubleTapDistance
        ) {
            clearTimeout(this.singleTapTimer);
            this.singleTapTimer = null;
            this.lastTapTime = 0;

            this.toggleDoubleTapZoom(x, y);
            return;
        }

        this.lastTapTime = now;
        this.lastTapX = x;
        this.lastTapY = y;

        clearTimeout(this.singleTapTimer);

        this.singleTapTimer = setTimeout(() => {
            this.toggleHeader();
            this.singleTapTimer = null;
        }, this.doubleTapDelay);
    }

    updateDismissTransform() {
        if (this.image && this.isDismissing) {
            const progress = Math.min(this.dismissCurrentY / this.dismissThreshold, 1);
            const opacity = 1 - (progress * 0.7);

            this.image.style.transform = `translate3d(${this.translateX}px, ${this.translateY + this.dismissCurrentY}px, 0) scale(${this.scale})`;
            this.image.style.opacity = opacity;
            this.container.style.backgroundColor = `rgba(0, 0, 0, ${opacity})`;
        }
    }

    resetDismiss() {
        if (this.image) {
            this.image.style.opacity = '1';
            this.container.style.backgroundColor = 'black';
            this.updateTransform();
        }
        this.isDismissing = false;
        this.dismissCurrentY = 0;
    }

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

        const maxTranslateX = Math.max(0, (scaledWidth - containerRect.width) / 2);
        const maxTranslateY = Math.max(0, (scaledHeight - containerRect.height) / 2);

        this.translateX = Math.max(-maxTranslateX, Math.min(maxTranslateX, this.translateX));
        this.translateY = Math.max(-maxTranslateY, Math.min(maxTranslateY, this.translateY));
    }

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

        this.stopInertia();

        this.isDragging = false;
        this.tapStartTime = Date.now();
        const currentTime = Date.now();
        const timeSinceMultiTouchEnd = currentTime - this.multiTouchEndTime;

        if (e.touches.length === 2) {
            clearTimeout(this.singleTapTimer);
            this.singleTapTimer = null;

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

            this.trackingPoints = [{
                x: e.touches[0].clientX,
                y: e.touches[0].clientY,
                time: performance.now()
            }];
            this.velocityX = 0;
            this.velocityY = 0;

            if (this.scale <= 1.1) {
                this.dismissStartY = e.touches[0].clientY;
                this.isDismissing = true;
            }
        }
    }

    onTouchMove(e) {
        e.preventDefault();
        if (!this.isMultiTouch) {
            this.isDragging = true;
            clearTimeout(this.singleTapTimer);
            this.singleTapTimer = null;
        }
        const currentTime = Date.now();
        const timeSinceMultiTouchEnd = currentTime - this.multiTouchEndTime;

        if (e.touches.length === 2 && this.isMultiTouch) {
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

            const currentX = e.touches[0].clientX;
            const currentY = e.touches[0].clientY;
            this.trackingPoints.push({
                x: currentX,
                y: currentY,
                time: performance.now()
            });
            if (this.trackingPoints.length > 5) this.trackingPoints.shift();

            if (this.isDismissing && this.scale <= 1.1) {
                const dismissDelta = e.touches[0].clientY - this.dismissStartY;

                if (dismissDelta > 0) {
                    this.dismissCurrentY = dismissDelta;
                    this.updateDismissTransform();
                } else {
                    this.resetDismiss();
                }
            } else if (this.scale > 1) {
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

        if (this.isDismissing && this.dismissCurrentY > this.dismissThreshold) {
            this.close();
            return;
        }

        if (this.isDismissing) {
            this.resetDismiss();
        }

        if (!this.isMultiTouch && this.scale > 1 && this.trackingPoints.length >= 2 && e.touches.length === 0) {
            const recent = this.trackingPoints.slice(-4);
            let totalVelX = 0, totalVelY = 0, count = 0;

            for (let i = 1; i < recent.length; i++) {
                const dt = recent[i].time - recent[i - 1].time;
                if (dt > 0) {
                    totalVelX += (recent[i].x - recent[i - 1].x) / dt;
                    totalVelY += (recent[i].y - recent[i - 1].y) / dt;
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
            this.handleTap(e);
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
            this.trackingPoints = [];
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