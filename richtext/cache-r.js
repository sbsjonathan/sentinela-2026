class CacheRichText {
  constructor() {
    this.semanaAtual = null;
    this.prefixoCache = 'richtext_cache_';
    this.debugMode = true;
    this.editor = null;
    this.timeout = null;
    this.observer = null;
    this.isApplyingCache = false;
    this.init();
  }

  init() {
    this.semanaAtual = this.obterSemanaURL() || this.obterSemanaAtual();

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.integrarComEditor());
    } else {
      this.integrarComEditor();
    }
  }

  obterSemanaURL() {
    const params = new URLSearchParams(window.location.search);
    return params.get('semana');
  }

  obterSemanaAtual() {
    const hoje = new Date();
    const diaDaSemana = hoje.getDay();
    const diasParaSegunda = diaDaSemana === 0 ? -6 : 1 - diaDaSemana;
    const segundaFeira = new Date(hoje);
    segundaFeira.setDate(hoje.getDate() + diasParaSegunda);
    const dia = String(segundaFeira.getDate()).padStart(2, '0');
    const mes = String(segundaFeira.getMonth() + 1).padStart(2, '0');
    return `${dia}-${mes}`;
  }

  obterChaveCache() {
    return this.prefixoCache + this.semanaAtual;
  }

  obterRaizesEditor() {
    if (!this.editor) return [];
    return Array.from(this.editor.children).filter((node) =>
      node.classList?.contains('node-paragraph') ||
      node.classList?.contains('node-text') ||
      node.classList?.contains('node-toggle')
    );
  }

  exportarTree() {
    if (!this.editor || typeof M6_Tree === 'undefined') return [];
    return this.obterRaizesEditor()
      .map((node) => M6_Tree.toTree(node))
      .filter(Boolean);
  }

  exportarHTML() {
    return this.editor ? this.editor.innerHTML : '';
  }

  salvarCache(conteudo = null) {
    if (!this.semanaAtual || !this.editor) return;

    const html = typeof conteudo === 'string' ? conteudo : this.exportarHTML();
    const tree = this.exportarTree();

    const dados = {
      html,
      tree,
      timestamp: Date.now(),
      versao: '2.0',
      formato: 'v23-tree'
    };

    localStorage.setItem(this.obterChaveCache(), JSON.stringify(dados));
  }

  carregarDados() {
    const cache = localStorage.getItem(this.obterChaveCache());
    if (!cache) return null;

    try {
      return JSON.parse(cache);
    } catch (e) {
      return { html: cache };
    }
  }

  carregarCache() {
    const dados = this.carregarDados();
    if (!dados) return null;
    return typeof dados.html === 'string' ? dados.html : null;
  }

  limparEditor() {
    if (!this.editor) return;
    this.editor.innerHTML = '';
  }

  garantirRaiz() {
    if (!this.editor) return;
    if (this.editor.children.length) return;
    if (typeof M5_Factory !== 'undefined') {
      this.editor.appendChild(M5_Factory.para());
      if (typeof M3_TextModel !== 'undefined') M3_TextModel.syncAll();
    }
  }

  aplicarTree(tree) {
    if (!Array.isArray(tree) || !this.editor || typeof M6_Tree === 'undefined') return false;

    this.limparEditor();

    tree.forEach((item) => {
      const bloco = M6_Tree.fromTree(item, null, false);
      if (bloco) this.editor.appendChild(bloco);
    });

    this.garantirRaiz();
    if (typeof M3_TextModel !== 'undefined') M3_TextModel.syncAll();
    if (typeof M11_Layout !== 'undefined') M11_Layout.schedule(2);
    return true;
  }

  aplicarHTML(html) {
    if (typeof html !== 'string' || !this.editor) return false;

    const trimmed = html.trim();
    if (!trimmed) {
      this.limparEditor();
      this.garantirRaiz();
      if (typeof M11_Layout !== 'undefined') M11_Layout.schedule(2);
      return true;
    }

    const pareceMarkupV23 = /class\s*=\s*["'][^"']*(node-paragraph|node-toggle|node-text)/i.test(trimmed);

    this.limparEditor();

    if (pareceMarkupV23) {
      this.editor.innerHTML = trimmed;
    } else if (typeof M5_Factory !== 'undefined' && typeof M2_Query !== 'undefined') {
      const bloco = M5_Factory.para('');
      const editable = M2_Query.getParC(bloco);
      if (editable) editable.innerHTML = trimmed;
      this.editor.appendChild(bloco);
    } else {
      this.editor.innerHTML = trimmed;
    }

    this.garantirRaiz();
    if (typeof M3_TextModel !== 'undefined') M3_TextModel.syncAll();
    if (typeof M11_Layout !== 'undefined') M11_Layout.schedule(2);
    return true;
  }

  aplicarCacheSalvo() {
    const dados = this.carregarDados();
    if (!dados) return false;

    this.isApplyingCache = true;

    try {
      if (Array.isArray(dados.tree) && dados.tree.length) {
        return this.aplicarTree(dados.tree);
      }

      if (typeof dados.html === 'string') {
        return this.aplicarHTML(dados.html);
      }

      return false;
    } finally {
      this.isApplyingCache = false;
    }
  }

  agendarSalvar() {
    if (this.isApplyingCache) return;
    clearTimeout(this.timeout);
    this.timeout = setTimeout(() => {
      this.salvarCache();
    }, 2000);
  }

  setupObserver() {
    if (!this.editor || this.observer) return;

    this.observer = new MutationObserver(() => {
      if (this.isApplyingCache) return;
      this.agendarSalvar();
    });

    this.observer.observe(this.editor, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['data-open', 'class', 'hidden', 'aria-expanded']
    });
  }

  exporAPI() {
    window.cacheRichText = {
      salvar: () => this.salvarCache(),
      salvarCache: (conteudo) => this.salvarCache(conteudo),
      carregar: () => this.carregarCache(),
      carregarDados: () => this.carregarDados(),
      aplicar: () => this.aplicarCacheSalvo(),
      semanaAtual: () => this.semanaAtual
    };
  }

  integrarComEditor() {
    const editor = document.getElementById('editor');
    const editorPronto =
      editor &&
      typeof M6_Tree !== 'undefined' &&
      typeof M5_Factory !== 'undefined' &&
      typeof M3_TextModel !== 'undefined';

    if (!editorPronto) {
      setTimeout(() => this.integrarComEditor(), 100);
      return;
    }

    this.editor = editor;

    this.aplicarCacheSalvo();

    editor.addEventListener('input', () => {
      this.agendarSalvar();
    });

    editor.addEventListener('blur', () => {
      this.salvarCache();
    });

    window.addEventListener('beforeunload', () => {
      this.salvarCache();
    });

    window.addEventListener('blur', () => {
      this.salvarCache();
    });

    this.setupObserver();
    this.exporAPI();
  }
}

const cacheRichText = new CacheRichText();
window.CacheRichText = CacheRichText;
