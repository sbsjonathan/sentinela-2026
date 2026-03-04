// leitor.js - Plugin de Modo Leitura com detecção de referências bíblicas

class LeitorPlugin {
    constructor() {
        this.name = 'leitor';
        this.slotId = 6;
        this.isReadOnly = false;
        this.leitorBtn = null;
        this.editor = null;
        this.processedNodes = new WeakSet();
        this._retryMs = 100;
        
        // Padrão regex para detectar referências bíblicas (melhorado para detectar "gen 1:1")
        this.regexBiblico = /\b([1-3]?\s?[A-Za-zêÊãÃíÍóÓâÂéÉôÔúÚçÇáÁ]+\.?)\s*(\d{1,3})[:;]\s*([\d,\s\-–—]+(?:\s?[;]\s?[\d,\s\-–—]+)*)/gi;
        
        this.autoRegister();
    }

    autoRegister() {
        this.waitForDependency('toolbar', () => this.waitForSlotAndRegister());
    }

    waitForDependency(dependency, callback) {
        const check = () => {
            if (window[dependency]) {
                callback();
            } else {
                setTimeout(check, this._retryMs);
            }
        };
        check();
    }

    waitForSlotAndRegister() {
        const slotEl = document.getElementById(`plugin-slot-${this.slotId}`);
        if (slotEl) {
            this.register();
        } else {
            setTimeout(() => this.waitForSlotAndRegister(), this._retryMs);
        }
    }

    register() {
        const pluginHTML = `
            <div class="leitor-plugin">
                <button class="leitor-btn" id="leitor-plugin-btn" title="Modo Bíblia" aria-label="Alternar Modo Bíblia">
                    <svg class="leitor-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
                        <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
                    </svg>
                </button>
            </div>
        `;

        const success = window.toolbar.registerPlugin(this.name, this.slotId, this, pluginHTML);
        if (!success) {
            setTimeout(() => this.register(), this._retryMs);
            return;
        }

        this.leitorBtn = document.getElementById('leitor-plugin-btn');
        this.setupButtonEvents();
        
        this.waitForDependency('editor', () => {
            this.connectToEditor();
            this.waitForBibleSystem();
        });
    }

    setupButtonEvents() {
        this.leitorBtn.addEventListener('click', (e) => {
            e.preventDefault();
            this.toggleReadOnly();
        });

        this.leitorBtn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.toggleReadOnly();
        }, { passive: false });
    }

    connectToEditor() {
        this.editor = window.editor;
        console.log('📖 Plugin Leitor conectado ao editor');
    }

    waitForBibleSystem() {
        const check = () => {
            if (window.abrirModalBibl && window.setupBblLinkListeners) {
                console.log('✅ Sistema bíblico detectado pelo Leitor');
            } else {
                setTimeout(check, 200);
            }
        };
        check();
    }

    toggleReadOnly() {
        this.isReadOnly = !this.isReadOnly;
        
        if (this.isReadOnly) {
            this.enableReadOnly();
        } else {
            this.disableReadOnly();
        }
    }

    enableReadOnly() {
        console.log('📖 Modo Bíblia ativado');
        
        // Adiciona classe ao botão
        this.leitorBtn.classList.add('active');
        
        // Adiciona classe ao editor
        this.editor.editorElement.classList.add('read-only-mode');
        document.body.classList.add('editor-read-only');
        
        // Desabilita todos os elementos editáveis
        const editables = this.editor.editorElement.querySelectorAll('[contenteditable="true"]');
        editables.forEach(element => {
            element.setAttribute('contenteditable', 'false');
            element.classList.add('read-only');
        });
        
        // Esconde botões do toggle
        const addChildBtns = this.editor.editorElement.querySelectorAll('.add-child-btn');
        addChildBtns.forEach(btn => {
            btn.style.display = 'none';
        });
        
        // Desabilita setas dos toggles
        const arrowWrappers = this.editor.editorElement.querySelectorAll('.arrow-wrapper');
        arrowWrappers.forEach(arrow => {
            arrow.style.pointerEvents = 'none';
            arrow.style.opacity = '0.5';
        });
        
        // Remove foco
        if (document.activeElement) {
            document.activeElement.blur();
        }
        
        // Processa referências bíblicas
        this.processAllContent();
        
        // Mostra indicador
        this.showReadOnlyIndicator();
    }

    disableReadOnly() {
        console.log('✏️ Modo edição ativado');
        
        // Remove links ANTES de restaurar editabilidade
        this.removeAllLinks();
        
        // Remove classe do botão
        this.leitorBtn.classList.remove('active');
        
        // Remove classes do editor
        this.editor.editorElement.classList.remove('read-only-mode');
        document.body.classList.remove('editor-read-only');
        
        // Restaura elementos editáveis
        const editables = this.editor.editorElement.querySelectorAll('[contenteditable="false"].read-only');
        editables.forEach(element => {
            element.setAttribute('contenteditable', 'true');
            element.classList.remove('read-only');
        });
        
        // Mostra botões do toggle
        const addChildBtns = this.editor.editorElement.querySelectorAll('.add-child-btn');
        addChildBtns.forEach(btn => {
            btn.style.display = '';
        });
        
        // Restaura setas dos toggles
        const arrowWrappers = this.editor.editorElement.querySelectorAll('.arrow-wrapper');
        arrowWrappers.forEach(arrow => {
            arrow.style.pointerEvents = '';
            arrow.style.opacity = '';
        });
    }

    processAllContent() {
        const editorEl = this.editor.editorElement;
        
        // Processa text-blocks
        const textBlocks = editorEl.querySelectorAll('.text-block');
        textBlocks.forEach(block => {
            this.processTextBlock(block);
        });

        // Processa toggles
        const toggleTitles = editorEl.querySelectorAll('.toggle-title');
        const toggleContents = editorEl.querySelectorAll('.content-invisible');
        
        toggleTitles.forEach(el => this.processTextBlock(el));
        toggleContents.forEach(el => this.processTextBlock(el));
    }

    processTextBlock(element) {
        if (!element || this.processedNodes.has(element)) return;
        
        // Processa o texto usando TreeWalker (seguro para estrutura)
        const walker = document.createTreeWalker(
            element,
            NodeFilter.SHOW_TEXT,
            {
                acceptNode: (node) => {
                    if (node.parentElement?.classList?.contains('bbl')) {
                        return NodeFilter.FILTER_REJECT;
                    }
                    return NodeFilter.FILTER_ACCEPT;
                }
            },
            false
        );

        const nodesToProcess = [];
        let node;
        while (node = walker.nextNode()) {
            if (node.textContent.trim()) {
                nodesToProcess.push(node);
            }
        }

        // Processa cada nó de texto
        nodesToProcess.forEach(textNode => {
            this.processTextNode(textNode);
        });

        this.processedNodes.add(element);
    }

    processTextNode(textNode) {
        const text = textNode.textContent;
        const matches = [];
        let match;

        // Reseta o regex
        this.regexBiblico.lastIndex = 0;
        
        while ((match = this.regexBiblico.exec(text)) !== null) {
            matches.push({
                index: match.index,
                length: match[0].length,
                text: match[0]
            });
        }

        if (matches.length === 0) return;

        // Processa de trás para frente
        const parent = textNode.parentNode;
        let currentNode = textNode;

        for (let i = matches.length - 1; i >= 0; i--) {
            const matchInfo = matches[i];
            const before = currentNode.textContent.substring(0, matchInfo.index);
            const reference = currentNode.textContent.substring(matchInfo.index, matchInfo.index + matchInfo.length);
            const after = currentNode.textContent.substring(matchInfo.index + matchInfo.length);

            // Cria o link
            const link = document.createElement('span');
            link.className = 'bbl';
            link.textContent = reference;
            link.setAttribute('data-ref', reference);

            // Configura eventos do link
            if (window.setupBblLinkListeners) {
                window.setupBblLinkListeners(link);
            }

            // Reconstrói o nó
            const afterNode = document.createTextNode(after);
            parent.insertBefore(afterNode, currentNode.nextSibling);
            parent.insertBefore(link, afterNode);
            
            currentNode.textContent = before;
            
            // Para próxima iteração
            if (i > 0) {
                currentNode = document.createTextNode(before + after);
                parent.replaceChild(currentNode, currentNode);
            }
        }
    }

    removeAllLinks() {
        const editorEl = this.editor.editorElement;
        const links = editorEl.querySelectorAll('.bbl');
        
        links.forEach(link => {
            const textNode = document.createTextNode(link.textContent);
            link.parentNode.replaceChild(textNode, link);
        });

        // Normaliza nós de texto
        const editables = editorEl.querySelectorAll('.text-block, .toggle-title, .content-invisible');
        editables.forEach(element => {
            element.normalize();
        });

        // Limpa nós processados
        this.processedNodes = new WeakSet();
    }

    showReadOnlyIndicator() {
        let indicator = document.getElementById('read-only-indicator');
        if (!indicator) {
            indicator = document.createElement('div');
            indicator.id = 'read-only-indicator';
            indicator.className = 'read-only-indicator';
            indicator.innerHTML = '📖 Modo Bíblia';
            document.body.appendChild(indicator);
        }
        
        setTimeout(() => {
            indicator.classList.add('show');
        }, 10);
        
        // Fade out após 1 segundo
        setTimeout(() => {
            indicator.classList.add('fade-out');
        }, 1000);
        
        setTimeout(() => {
            indicator.classList.remove('show', 'fade-out');
        }, 1500);
    }

    destroy() {
        if (this.isReadOnly) {
            this.disableReadOnly();
        }
        
        const indicator = document.getElementById('read-only-indicator');
        if (indicator) {
            indicator.remove();
        }
        
        this.processedNodes = new WeakSet();
    }
}

// Inicializa o plugin
const leitorPlugin = new LeitorPlugin();