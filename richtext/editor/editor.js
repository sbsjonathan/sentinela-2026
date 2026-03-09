// editor.js - Script otimizado para gerenciar o editor de texto com toggles

class EditorManager {
    constructor() {
        this.editorContainer = null;
        this.editorElement = null;
        this.currentTextBlock = null;
        this.isLoaded = false;
        this.cleanupInputTimeout = null;
        this.touchStartY = 0;
        this.lastEditorScrollTop = 0;
        this.forceVisibleTimeout = null;
        this.globalTouchStartY = 0;
        this.bindedGlobalTouchStart = null;
        this.bindedGlobalTouchMove = null;
        this.bindedWindowScroll = null;
        this.bindedSelectAllShortcut = null;
        this.isTouchInsideEditor = false;
        this.init();
    }

    async init() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.loadEditor());
        } else {
            this.loadEditor();
        }
    }

    async loadEditor() {
        try {
            const editorArea = document.querySelector('.editor-area');
            if (!editorArea) {
                throw new Error('Container do editor não encontrado.');
            }

            // Cria o container do editor
            this.editorContainer = document.createElement('div');
            this.editorContainer.className = 'editor-wrapper';
            editorArea.appendChild(this.editorContainer);

            // Cria estrutura
            this.createEditorStructure();

            // Setup
            this.setupEditor();
            this.setupEventListeners();
            this.updateStats();
            
            this.isLoaded = true;
            console.log('✅ Editor carregado com sucesso');
            
        } catch (error) {
            console.error('❌ Erro ao carregar o editor:', error);
            this.showFallback();
        }
    }

    createEditorStructure() {
        // Container principal (NÃO é contenteditable)
        this.editorElement = document.createElement('div');
        this.editorElement.id = 'text-editor';
        this.editorElement.className = 'editor-content';
        this.editorElement.setAttribute('data-placeholder', 'Digite seu texto aqui...');
        
        // Primeiro bloco de texto
        this.currentTextBlock = this.createTextBlock();
        this.editorElement.appendChild(this.currentTextBlock);
        
        this.editorContainer.appendChild(this.editorElement);
        
    }

    createTextBlock() {
        const block = document.createElement('div');
        block.className = 'text-block';
        block.contentEditable = true;
        block.setAttribute('spellcheck', 'true');
        block.setAttribute('autocapitalize', 'sentences');
        block.setAttribute('autocorrect', 'on');
        return block;
    }

    setupEditor() {
        this.updatePlaceholder();
        setTimeout(() => this.currentTextBlock.focus(), 100);
    }

    setupEventListeners() {
        if (!this.editorElement) return;

        // === Observer para mudanças estruturais (listas, etc) ===
        const observer = new MutationObserver(() => {
            this.updatePlaceholder();
            this.updateStats();
        });
        
        observer.observe(this.editorElement, {
            childList: true,
            subtree: true,
            characterData: true
        });

        // === NOVO: Clique em qualquer área vazia do editor ===
        this.editorElement.addEventListener('click', (e) => {
            // Se clicou diretamente no container do editor (área vazia)
            if (e.target === this.editorElement) {
                e.preventDefault();
                
                // Encontra o último text-block ou cria um novo se necessário
                const textBlocks = this.editorElement.querySelectorAll('.text-block');
                let targetBlock = null;
                
                if (textBlocks.length > 0) {
                    // Usa o último bloco de texto disponível
                    targetBlock = textBlocks[textBlocks.length - 1];
                } else {
                    // Cria um novo bloco se não existir nenhum
                    targetBlock = this.createTextBlock();
                    this.editorElement.appendChild(targetBlock);
                }
                
                // Foca no bloco e posiciona o cursor no final
                this.currentTextBlock = targetBlock;
                targetBlock.focus();
                
                // Posiciona o cursor no final do conteúdo
                const range = document.createRange();
                const sel = window.getSelection();
                range.selectNodeContents(targetBlock);
                range.collapse(false);
                sel.removeAllRanges();
                sel.addRange(range);
            }
        });

        // Eventos delegados otimizados
        this.editorElement.addEventListener('input', (e) => {
            if (e.target.classList.contains('text-block')) {
                this.handleInput(e);
            }
        });
        
        this.editorElement.addEventListener('keydown', (e) => {
            if (e.target.classList.contains('text-block')) {
                this.handleTextBlockKeydown(e);
            }
        });
        
        this.editorElement.addEventListener('focus', (e) => {
            if (e.target.classList.contains('text-block')) {
                e.target.classList.add('focused');
                this.currentTextBlock = e.target;
            }
        }, true);
        
        this.editorElement.addEventListener('blur', (e) => {
            if (e.target.classList.contains('text-block')) {
                e.target.classList.remove('focused');
                this.cleanTextBlock(e.target);
                this.scheduleEmptyBlockRemoval(e.target);
            }
        }, true);
        

        this.editorElement.addEventListener('touchstart', (e) => this.handleEditorTouchStart(e), { passive: true });
        this.editorElement.addEventListener('touchmove', (e) => this.handleEditorTouchMove(e), { passive: true });
        this.editorElement.addEventListener('scroll', () => this.handleEditorScroll(), { passive: true });

        // Fallback iOS/WebKit: gesto global de puxar para baixo também deve revelar barras.
        this.bindedGlobalTouchStart = (e) => this.handleGlobalTouchStart(e);
        this.bindedGlobalTouchMove = (e) => this.handleGlobalTouchMove(e);
        this.bindedWindowScroll = () => this.handleWindowScroll();

        document.addEventListener('touchstart', this.bindedGlobalTouchStart, { passive: true, capture: true });
        document.addEventListener('touchmove', this.bindedGlobalTouchMove, { passive: true, capture: true });
        window.addEventListener('scroll', this.bindedWindowScroll, { passive: true });

        // Permite selecionar TODO o conteúdo (text-blocks + toggles) com Ctrl/Cmd + A.
        // Sem isso, cada contenteditable filho seleciona apenas o próprio bloco.
        this.bindedSelectAllShortcut = (e) => this.handleSelectAllShortcut(e);
        document.addEventListener('keydown', this.bindedSelectAllShortcut, true);

        document.addEventListener('selectionchange', () => this.handleSelectionChange());
    }

    handleEditorTouchStart(e) {
        this.touchStartY = e.touches?.[0]?.clientY || 0;
        this.lastEditorScrollTop = this.editorElement?.scrollTop || 0;
    }

    handleEditorTouchMove(e) {
        if (!this.editorElement) return;

        const currentY = e.touches?.[0]?.clientY || 0;
        const deltaY = currentY - this.touchStartY;

        // Qualquer gesto de puxar para baixo deve ressurgir a barra.
        if (deltaY > 6) {
            this.revealTopToolbar();
            this.revealBottomNavbar();
        }
    }

    handleEditorScroll() {
        if (!this.editorElement) return;

        const currentScrollTop = this.editorElement.scrollTop;
        const isPullingDown = currentScrollTop < this.lastEditorScrollTop;

        if (isPullingDown) {
            this.revealTopToolbar();
            this.revealBottomNavbar();
        }

        this.lastEditorScrollTop = currentScrollTop;
    }

    handleGlobalTouchStart(e) {
        this.globalTouchStartY = e.touches?.[0]?.clientY || 0;
        const target = e.target;
        this.isTouchInsideEditor = !!(target && (target.closest?.('.editor-area') || this.editorElement?.contains(target)));
    }

    handleGlobalTouchMove(e) {
        if (!this.isTouchInsideEditor) return;

        const currentY = e.touches?.[0]?.clientY || 0;
        const deltaY = currentY - this.globalTouchStartY;

        // No iPhone, no fundo do editor o gesto pode não gerar scroll imediato;
        // por isso qualquer arraste para baixo dentro da área do editor já revela barras.
        if (deltaY > 6) {
            this.revealTopToolbar();
            this.revealBottomNavbar();
        }
    }

    handleWindowScroll() {
        if (window.scrollY <= 4) {
            this.revealTopToolbar();
            this.revealBottomNavbar();
        }
    }

    revealTopToolbar() {
        const toolbarShelf = document.getElementById('toolbar-container');
        if (!toolbarShelf) return;

        toolbarShelf.classList.add('force-visible');
        toolbarShelf.style.display = 'flex';
        toolbarShelf.style.visibility = 'visible';
        toolbarShelf.style.opacity = '1';
        toolbarShelf.style.top = '0';

        if (this.forceVisibleTimeout) {
            clearTimeout(this.forceVisibleTimeout);
        }

        this.forceVisibleTimeout = setTimeout(() => {
            toolbarShelf.classList.remove('force-visible');
            toolbarShelf.style.removeProperty('display');
            toolbarShelf.style.removeProperty('visibility');
            toolbarShelf.style.removeProperty('opacity');
            toolbarShelf.style.removeProperty('top');
        }, 600);
    }

    revealBottomNavbar() {
        if (window.UnifiedNavbar?.get) {
            const navbar = window.UnifiedNavbar.get();
            navbar?.show?.();
        }
    }

    // ======= HANDLERS PRINCIPAIS ======= //
    
    handleInput(e) {
        this.cleanTextBlock(e.target);
        
        // Debounce para limpeza de blocos vazios
        clearTimeout(this.cleanupInputTimeout);
        this.cleanupInputTimeout = setTimeout(() => {
            this.cleanEmptyTextBlocks();
        }, 1000);
        
        this.updateStats();
        this.updatePlaceholder();
    }
    
    handleTextBlockKeydown(e) {
        if (e.key === 'Backspace') {
            const sel = window.getSelection();
            if (!sel.rangeCount || !sel.isCollapsed) return;
            
            const range = sel.getRangeAt(0);
            const textBlock = e.target;
            
            if (this.isCursorAtStart(textBlock, range)) {
                e.preventDefault();
                this.handleBackspaceAtStart(textBlock);
            }
        }
    }

    isCursorAtStart(textBlock, range) {
        if (range.startOffset !== 0) return false;
        
        // Verifica se está no início absoluto do bloco
        const container = range.startContainer;
        return container === textBlock || 
               container === textBlock.firstChild || 
               (container.nodeType === Node.TEXT_NODE && container.parentElement === textBlock);
    }

    handleBackspaceAtStart(textBlock) {
        const prevElement = textBlock.previousElementSibling;
        if (!prevElement) return;
        
        if (prevElement.classList.contains('toggle')) {
            const lastEditable = this.findLastEditableInToggle(prevElement);
            if (lastEditable) {
                this.focusAtEnd(lastEditable);
                this.removeTextBlock(textBlock);
            }
        } else if (prevElement.classList.contains('text-block')) {
            this.mergeTextBlocks(prevElement, textBlock);
        }
    }

    mergeTextBlocks(targetBlock, sourceBlock) {
        const cursorPosition = targetBlock.textContent.length;
        const content = sourceBlock.innerHTML.trim();
        
        if (content) {
            targetBlock.innerHTML += content;
        }
        
        this.removeTextBlock(sourceBlock);
        this.currentTextBlock = targetBlock;
        this.focusAtPosition(targetBlock, cursorPosition);
    }

    findLastEditableInToggle(toggle) {
        const expanded = toggle.querySelector('.toggle-content.visible');
        if (expanded) {
            const editables = Array.from(toggle.querySelectorAll('[contenteditable="true"]'));
            return editables.pop();
        }
        return toggle.querySelector('.toggle-title');
    }

    handleSelectionChange() {
        // Plugins específicos cuidam de seus próprios estados
        // Atualiza placeholder quando houver mudança de seleção
        this.updatePlaceholder();
    }

    handleSelectAllShortcut(e) {
        if (!this.editorElement) return;

        const isSelectAll = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a';
        if (!isSelectAll) return;

        const target = e.target;
        if (!target || !this.editorElement.contains(target)) return;

        e.preventDefault();

        const range = document.createRange();
        range.selectNodeContents(this.editorElement);

        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
    }

    // ======= LIMPEZA CONSOLIDADA ======= //
    
    cleanTextBlock(block) {
        const content = block.innerHTML.trim();
        
        // Remove apenas casos óbvios de conteúdo vazio
        if (content === '<br>' || content === '&nbsp;' || content === '') {
            if (!block.textContent.trim()) {
                block.innerHTML = '';
            }
        }
    }

    isBlockEmpty(block) {
        const html = block.innerHTML.trim();
        const text = block.textContent.trim();
        
        return !text || 
               html === '' || 
               html === '<br>' || 
               html === '&nbsp;' ||
               /^<div>\s*(<br>)?\s*<\/div>$/.test(html);
    }

    cleanEmptyTextBlocks() {
        const textBlocks = this.editorElement.querySelectorAll('.text-block');
        if (textBlocks.length <= 1) return;
        
        textBlocks.forEach(block => {
            if (this.isBlockEmpty(block) && block !== document.activeElement) {
                block.remove();
            }
        });
        
        this.ensureMinimumTextBlock();
    }

    scheduleEmptyBlockRemoval(block) {
        const blocks = this.editorElement.querySelectorAll('.text-block');
        
        if (blocks.length > 1 && this.isBlockEmpty(block) && block !== document.activeElement) {
            setTimeout(() => {
                if (block.parentElement && this.isBlockEmpty(block)) {
                    this.removeTextBlock(block);
                }
            }, 50);
        }
    }

    removeTextBlock(textBlock) {
        if (this.currentTextBlock === textBlock) {
            const next = textBlock.nextElementSibling;
            const prev = textBlock.previousElementSibling;
            
            if (next?.classList.contains('text-block')) {
                this.currentTextBlock = next;
            } else if (prev?.classList.contains('text-block')) {
                this.currentTextBlock = prev;
            } else {
                this.currentTextBlock = null;
            }
        }
        
        textBlock.remove();
        this.ensureMinimumTextBlock();
        this.updateStats();
        this.updatePlaceholder();
    }

    ensureMinimumTextBlock() {
        const textBlocks = this.editorElement.querySelectorAll('.text-block');
        
        if (textBlocks.length === 0) {
            const newBlock = this.createTextBlock();
            this.editorElement.appendChild(newBlock);
            this.currentTextBlock = newBlock;
            setTimeout(() => newBlock.focus(), 0);
        }
    }

    // ======= INSERÇÃO DE ELEMENTOS ======= //
    
    insertElement(element) {
        this.cleanEmptyTextBlocks();
        
        const editor = this.editorElement;
        const isEditorEmpty = 
            editor.children.length === 1 &&
            editor.firstElementChild.classList.contains('text-block') &&
            this.isBlockEmpty(editor.firstElementChild);

        if (isEditorEmpty) {
            editor.firstElementChild.replaceWith(element);
            const toggleTitle = element.querySelector('.toggle-title');
            if (toggleTitle) this.focusAndPrime(toggleTitle);
        } else {
            this.insertAtCursor(element);
        }
        
        this.updateStats();
        this.updatePlaceholder();
    }

    insertAtCursor(element) {
        const selection = window.getSelection();
        
        if (!selection.rangeCount) {
            if (this.currentTextBlock) {
                this.currentTextBlock.after(element);
            }
            return;
        }
        
        const range = selection.getRangeAt(0);
        const textBlock = this.findContainingTextBlock(range.commonAncestorContainer);
        
        if (textBlock) {
            const afterContent = this.extractContentAfterCursor(textBlock, range);
            textBlock.after(element);
            
            if (afterContent?.trim() && !this.isContentEmpty(afterContent)) {
                const newBlock = this.createTextBlock();
                newBlock.innerHTML = afterContent;
                element.after(newBlock);
            }
        } else {
            this.editorElement.appendChild(element);
        }
        
        const toggleTitle = element.querySelector('.toggle-title');
        if (toggleTitle) this.focusAndPrime(toggleTitle);
    }

    findContainingTextBlock(node) {
        let current = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
        
        while (current && !current.classList?.contains('text-block')) {
            current = current.parentElement;
        }
        
        return current?.classList?.contains('text-block') ? current : null;
    }

    extractContentAfterCursor(textBlock, range) {
        const extractRange = range.cloneRange();
        extractRange.selectNodeContents(textBlock);
        extractRange.setStart(range.endContainer, range.endOffset);
        
        const fragment = extractRange.extractContents();
        const div = document.createElement('div');
        div.appendChild(fragment);
        
        return div.innerHTML;
    }

    isContentEmpty(html) {
        const div = document.createElement('div');
        div.innerHTML = html;
        return !div.textContent.trim();
    }

    createTextBlockAfterElement(element) {
        const newBlock = this.createTextBlock();
        element.after(newBlock);
        this.focusAndPrime(newBlock);
        this.currentTextBlock = newBlock;
        return newBlock;
    }

    // ======= FOCO E NAVEGAÇÃO ======= //

    focusAndPrime(element, callback) {
        if (!element) return;
        
        setTimeout(() => {
            element.focus();
            const range = document.createRange();
            range.selectNodeContents(element);
            range.collapse(false);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
            
            if (callback && document.activeElement === element) {
                callback();
            }
        }, 0);
    }

    focusAtPosition(element, position) {
        if (!element) return;
        
        setTimeout(() => {
            element.focus();
            const walker = document.createTreeWalker(
                element,
                NodeFilter.SHOW_TEXT,
                null,
                false
            );
            
            let node;
            let charCount = 0;
            
            while (node = walker.nextNode()) {
                const nextCount = charCount + node.length;
                if (position <= nextCount) {
                    const range = document.createRange();
                    range.setStart(node, position - charCount);
                    range.collapse(true);
                    const sel = window.getSelection();
                    sel.removeAllRanges();
                    sel.addRange(range);
                    return;
                }
                charCount = nextCount;
            }
            
            this.focusAtEnd(element);
        }, 0);
    }

    focusAtEnd(element) {
        this.focusAndPrime(element);
    }

    focus() {
        const target = this.currentTextBlock || this.editorElement.querySelector('.text-block');
        if (target) target.focus();
    }

    // ======= UTILITÁRIOS ======= //

    updatePlaceholder() {
        // Remove placeholder se houver:
        // 1. Qualquer texto
        // 2. Qualquer lista (ul/ol) mesmo vazia
        // 3. Qualquer toggle
        // 4. Qualquer imagem
        
        const hasText = this.editorElement.textContent.trim().length > 0;
        const hasList = this.editorElement.querySelector('ul, ol') !== null;
        const hasToggle = this.editorElement.querySelector('.toggle') !== null;
        const hasImage = this.editorElement.querySelector('img') !== null;
        
        // Mostra placeholder apenas se NÃO tiver nenhum desses elementos
        const isEmpty = !hasText && !hasList && !hasToggle && !hasImage;
        
        this.editorElement.classList.toggle('is-empty', isEmpty);
    }

    updateStats() {
        // Contador removido por decisão de UX.
    }

    showFallback() {
        if (this.editorContainer) {
            this.editorContainer.innerHTML = `
                <div style="padding: 20px; text-align: center; color: #999;">
                    ⚠️ Erro ao carregar o editor
                    <br><br>
                    <textarea style="width: 100%; height: 200px; border: 1px solid #ddd; 
                              border-radius: 4px; padding: 10px;" 
                              placeholder="Editor alternativo..."></textarea>
                </div>
            `;
        }
    }

    destroy() {
        if (this.cleanupInputTimeout) {
            clearTimeout(this.cleanupInputTimeout);
        }
        if (this.forceVisibleTimeout) {
            clearTimeout(this.forceVisibleTimeout);
        }

        if (this.bindedGlobalTouchStart) {
            document.removeEventListener('touchstart', this.bindedGlobalTouchStart, { capture: true });
        }
        if (this.bindedGlobalTouchMove) {
            document.removeEventListener('touchmove', this.bindedGlobalTouchMove, { capture: true });
        }
        this.isTouchInsideEditor = false;
        if (this.bindedWindowScroll) {
            window.removeEventListener('scroll', this.bindedWindowScroll);
        }
    }
}

// Inicializa o gerenciador do editor
const editor = new EditorManager();
window.editor = editor;
