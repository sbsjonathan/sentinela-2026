class CacheRichText {
    constructor() {
        this.semanaAtual = null;
        this.prefixoCache = 'richtext_cache_';
        this.debugMode = true;
        this.init();
    }

    init() {
        this.semanaAtual = this.obterSemanaURL();
        
        if (!this.semanaAtual) {
            this.semanaAtual = this.obterSemanaAtual();
        }

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

    salvarCache(conteudo) {
        if (!this.semanaAtual) return;
        const dados = {
            html: conteudo,
            timestamp: new Date().getTime(),
            versao: '1.0'
        };
        localStorage.setItem(this.obterChaveCache(), JSON.stringify(dados));
    }

    carregarCache() {
        const cache = localStorage.getItem(this.obterChaveCache());
        if (cache) {
            try {
                const dados = JSON.parse(cache);
                return dados.html;
            } catch (e) {
                return null;
            }
        }
        return null;
    }

    integrarComEditor() {
        const editor = document.getElementById('text-editor');
        if (!editor) {
            setTimeout(() => this.integrarComEditor(), 100);
            return;
        }

        const conteudoSalvo = this.carregarCache();
        if (conteudoSalvo) {
            editor.innerHTML = conteudoSalvo;
        }

        let timeout = null;
        editor.addEventListener('input', () => {
            clearTimeout(timeout);
            timeout = setTimeout(() => {
                this.salvarCache(editor.innerHTML);
            }, 2000);
        });

        window.addEventListener('beforeunload', () => {
            this.salvarCache(editor.innerHTML);
        });

        window.addEventListener('blur', () => {
            this.salvarCache(editor.innerHTML);
        });

        window.cacheRichText = {
            salvar: () => this.salvarCache(editor.innerHTML),
            carregar: () => this.carregarCache(),
            semanaAtual: () => this.semanaAtual
        };
    }
}

const cacheRichText = new CacheRichText();
window.CacheRichText = CacheRichText;
