// feedback.js - Gerenciador visual de status (desacoplado)

class FeedbackManager {
    constructor() {
        this.statusDiv = null;
        this.hideTimeout = null;
        this.init();
    }

    init() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.setup());
        } else {
            this.setup();
        }
    }

    setup() {
        // Encontra a div do balãozinho no HTML
        this.statusDiv = document.getElementById('save-status');
        
        // Se a div não existir no HTML, ele cria automaticamente
        if (!this.statusDiv) {
            this.statusDiv = document.createElement('div');
            this.statusDiv.id = 'save-status';
            this.statusDiv.className = 'save-status';
            document.body.appendChild(this.statusDiv);
        }

        // Fica "ouvindo" os eventos que os outros scripts disparam
        window.addEventListener('editor:save-status', (e) => {
            this.showFeedback(e.detail.message, e.detail.type, e.detail.duration);
        });
        
        console.log('💬 Feedback visual carregado e ouvindo eventos.');
    }

    showFeedback(message, type, duration) {
        if (!this.statusDiv) return;

        // Limpa o tempo anterior para um balão não atropelar o outro
        clearTimeout(this.hideTimeout);

        this.statusDiv.textContent = message;
        this.statusDiv.className = `save-status show ${type}`;

        // Se tiver duração, esconde depois do tempo. Se não, fica na tela.
        if (duration) {
            this.hideTimeout = setTimeout(() => {
                this.statusDiv.classList.remove('show');
            }, duration);
        }
    }
}

// Inicializa o sistema de feedback
window.FeedbackManager = new FeedbackManager();
