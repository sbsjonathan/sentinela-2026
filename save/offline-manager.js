class OfflineManager {
    constructor() {
        this.cacheName = 'reuniao-offline-v1';
        this.btnDownload = document.getElementById('btn-offline-download');
        this.btnDelete = document.getElementById('btn-offline-delete');
        this.progressBar = document.getElementById('offline-progress-bar');
        this.progressFill = document.getElementById('offline-progress-fill');
        this.statusText = document.getElementById('offline-status-text');
        
        this.bibleBooks = [
            "genesis","exodo","levitico","numeros","deuteronomio","josue","juizes","rute",
            "1samuel","2samuel","1reis","2reis","1cronicas","2cronicas","esdras","neemias",
            "ester","jo","salmos","proverbios","eclesiastes","canticos","isaias","jeremias",
            "lamentacoes","ezequiel","daniel","oseias","joel","amos","obadias","jonas",
            "miqueias","naum","habacuque","sofonias","ageu","zacarias","malaquias","mateus",
            "marcos","lucas","joao","atos","romanos","1corintios","2corintios","galatas",
            "efesios","filipenses","colossenses","1tessalonicenses","2tessalonicenses",
            "1timoteo","2timoteo","tito","filemon","hebreus","tiago","1pedro","2pedro",
            "1joao","2joao","3joao","judas","apocalipse"
        ];

        this.init();
    }

    init() {
        if (!this.btnDownload || !this.btnDelete) return;
        this.checkStatus();
        this.btnDownload.addEventListener('click', () => this.startDownload());
        this.btnDelete.addEventListener('click', () => this.deleteCache());
    }

    async checkStatus() {
        const hasCache = await caches.has(this.cacheName);
        if (hasCache) {
            this.btnDownload.style.display = 'none';
            this.btnDelete.style.display = 'block';
            this.progressBar.style.display = 'none';
            this.statusText.textContent = 'Pacote offline disponível no dispositivo.';
            this.statusText.style.color = 'var(--text-success)';
        } else {
            this.btnDownload.style.display = 'block';
            this.btnDelete.style.display = 'none';
            this.progressBar.style.display = 'none';
            this.statusText.textContent = 'Baixe o pacote para economizar dados móveis.';
            this.statusText.style.color = 'var(--text-subtitle)';
        }
    }

    getWeeksToCache() {
        const weeks = [];
        const today = new Date();
        const dayOfWeek = today.getDay();
        const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        
        const baseMonday = new Date(today);
        baseMonday.setDate(today.getDate() + daysToMonday);
        baseMonday.setHours(0, 0, 0, 0);

        const offsets = [-7, 0, 7, 14];
        
        offsets.forEach(offset => {
            const targetDate = new Date(baseMonday);
            targetDate.setDate(targetDate.getDate() + offset);
            const d = String(targetDate.getDate()).padStart(2, '0');
            const m = String(targetDate.getMonth() + 1).padStart(2, '0');
            weeks.push(`${d}-${m}`);
        });

        return weeks;
    }

    buildUrlsToCache() {
        const urls = [
            '../',
            '../index.html',
            '../styles.css',
            '../main.js',
            '../manifest.json',
            '../navbar/navbar-unified.css',
            '../navbar/navbar-unified.js',
            '../biblia/biblia.html',
            '../biblia/capitulo.html',
            '../biblia/stylebbl.css',
            '../biblia/scriptbbl-container.js',
            '../biblia/abrev.js',
            '../richtext/container.html',
            '../richtext/editor.css',
            '../richtext/barra.css',
            '../richtext/perf-low.css',
            '../richtext/editor.js',
            '../richtext/barra.js',
            '../richtext/liquid-glass.js',
            '../richtext/cache-r.js',
            '../richtext/perf-profile.js',
            '../richtext/plugin/undo.js',
            '../richtext/plugin/negrita.js',
            '../richtext/plugin/negrita.css',
            '../richtext/plugin/bullet.js',
            '../richtext/plugin/bullet.css',
            '../richtext/plugin/cores.js',
            '../richtext/plugin/cores.css',
            '../richtext/plugin/font.js',
            '../richtext/plugin/font.css',
            '../richtext/plugin/leitor.js',
            '../richtext/plugin/leitor.css',
            '../sentinela/style.css',
            '../sentinela/imagem.js',
            '../sentinela/mark.js',
            '../sentinela/menu/menu.css',
            '../sentinela/menu/menu.js',
            '../sentinela/menu/imagem.js',
            '../sentinela/imagem/swiper-zoom.css',
            '../sentinela/imagem/swiper-zoom.js',
            '../sentinela/clickable/clickable.css',
            '../sentinela/clickable/clickable.js',
            '../sentinela/clickable/cache.js',
            '../sentinela/clickable/agente_perguntas.js',
            '../sentinela/clickable/agente_recap.js',
            '../sentinela/clickable/agente-obj.js',
            '../sentinela/clickable/agente-sub.js',
            '../sentinela/clickable/agente-modal/agente-modal.css',
            '../sentinela/clickable/agente-modal/agente-modal.js'
        ];

        this.bibleBooks.forEach(book => {
            urls.push(`../sentinela/biblia/data/${book}.json`);
        });

        const weeks = this.getWeeksToCache();
        weeks.forEach(week => {
            urls.push(`../sentinela/artigos/${week}.html`);
            for (let i = 1; i <= 6; i++) {
                urls.push(`../sentinela/imagem/semanas/${week}/img${i}.png`);
                urls.push(`../sentinela/imagem/semanas/${week}/leg${i}.txt`);
            }
        });

        return urls;
    }

    async startDownload() {
        this.btnDownload.disabled = true;
        this.btnDownload.textContent = 'Baixando...';
        this.progressBar.style.display = 'block';
        this.progressFill.style.width = '0%';
        this.statusText.textContent = 'Preparando download...';
        this.statusText.style.color = 'var(--text-subtitle)';

        const urls = this.buildUrlsToCache();
        let downloaded = 0;
        const total = urls.length;
        
        try {
            await caches.delete(this.cacheName);
            const cache = await caches.open(this.cacheName);

            for (const url of urls) {
                try {
                    const response = await fetch(url);
                    if (response.ok) {
                        await cache.put(url, response);
                    }
                } catch (e) {
                }
                
                downloaded++;
                const percent = Math.round((downloaded / total) * 100);
                this.progressFill.style.width = `${percent}%`;
                this.statusText.textContent = `Baixando arquivos... ${percent}%`;
            }

            this.btnDownload.textContent = 'Baixar Pacote Offline';
            this.btnDownload.disabled = false;
            this.checkStatus();

        } catch (error) {
            this.statusText.textContent = 'Erro ao baixar pacote offline.';
            this.statusText.style.color = 'var(--text-error)';
            this.btnDownload.textContent = 'Baixar Pacote Offline';
            this.btnDownload.disabled = false;
            await caches.delete(this.cacheName);
        }
    }

    async deleteCache() {
        this.btnDelete.disabled = true;
        this.btnDelete.textContent = 'Apagando...';
        
        try {
            await caches.delete(this.cacheName);
            setTimeout(() => {
                this.btnDelete.textContent = 'Apagar Dados Offline';
                this.btnDelete.disabled = false;
                this.checkStatus();
            }, 500);
        } catch (error) {
            this.btnDelete.textContent = 'Apagar Dados Offline';
            this.btnDelete.disabled = false;
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.OfflineManagerInstance = new OfflineManager();
});