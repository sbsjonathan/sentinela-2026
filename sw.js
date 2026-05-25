const CACHE_NAME = 'reuniao-cache-v1';

self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;
    
    event.respondWith(
        fetch(event.request).then((response) => {
            const resClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
                if (event.request.url.startsWith('http')) {
                    cache.put(event.request, resClone);
                }
            });
            return response;
        }).catch(() => {
            return caches.match(event.request);
        })
    );
});

self.addEventListener('message', async (event) => {
    if (!event.data) return;

    if (event.data.action === 'START_DOWNLOAD') {
        try {
            const urlsToCache = await buildDownloadList();
            const cache = await caches.open(CACHE_NAME);
            
            let loaded = 0;
            const total = urlsToCache.length;

            for (const url of urlsToCache) {
                try {
                    const isExternal = url.startsWith('http');
                    const req = new Request(url, { mode: isExternal ? 'no-cors' : 'cors' });
                    const res = await fetch(req);
                    if (res || isExternal) {
                        await cache.put(req, res);
                    }
                } catch(e) {}
                loaded++;
                event.source.postMessage({ type: 'DOWNLOAD_PROGRESS', loaded, total });
            }
            event.source.postMessage({ type: 'DOWNLOAD_COMPLETE' });
        } catch (err) {
            event.source.postMessage({ type: 'DOWNLOAD_ERROR' });
        }
    } else if (event.data.action === 'CLEAR_CACHE') {
        await caches.delete(CACHE_NAME);
        event.source.postMessage({ type: 'CACHE_CLEARED' });
    }
});

function getSemanaAtual() {
    const hoje = new Date();
    const dia = hoje.getDay();
    const diff = dia === 0 ? -6 : 1 - dia;
    const segunda = new Date(hoje);
    segunda.setDate(hoje.getDate() + diff);
    const dd = String(segunda.getDate()).padStart(2, '0');
    const mm = String(segunda.getMonth() + 1).padStart(2, '0');
    return `${dd}-${mm}`;
}

async function buildDownloadList() {
    const basePath = self.registration.scope;
    
    let list = [
        '/',
        'index.html',
        'styles.css',
        'main.js',
        'manifest.json',
        'worker/worker.html',
        'navbar/navbar-unified.css',
        'navbar/navbar-unified.js',
        'save/auth-supabase.html',
        'save/config.js',
        'save/supabase.js',
        'save/sync-bridge.js',
        'save/unified-load.js',
        'save/auto-save.js',
        'save/feedback.js',
        'save/sentinela-sync.js',
        'save/asmb-sync.js',
        'richtext/container.html',
        'richtext/editor.css',
        'richtext/barra.css',
        'richtext/perf-low.css',
        'richtext/editor.js',
        'richtext/barra.js',
        'richtext/perf-profile.js',
        'richtext/cache-r.js',
        'richtext/liquid-glass.js',
        'richtext/leitor.js',
        'sentinela/style.css',
        'sentinela/imagem.js',
        'sentinela/mark.js',
        'sentinela/clickable/clickable.css',
        'sentinela/clickable/clickable.js',
        'sentinela/clickable/cache.js',
        'sentinela/clickable/agente_perguntas.js',
        'sentinela/clickable/agente_recap.js',
        'sentinela/clickable/agente-obj.js',
        'sentinela/clickable/agente-sub.js',
        'sentinela/clickable/agente-modal/agente-modal.css',
        'sentinela/clickable/agente-modal/agente-modal.js',
        'sentinela/menu/menu.css',
        'sentinela/menu/menu.js',
        'sentinela/imagem/swiper-zoom.css',
        'sentinela/imagem/swiper-zoom.js',
        'biblia/biblia.html',
        'biblia/capitulo.html',
        'biblia/abrev.js',
        'biblia/scriptbbl-container.js',
        'biblia/stylebbl.css',
        'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
        'https://cdnjs.cloudflare.com/ajax/libs/Swiper/11.0.5/swiper-bundle.min.js',
        'https://cdnjs.cloudflare.com/ajax/libs/Swiper/11.0.5/swiper-bundle.min.css',
        'https://fonts.googleapis.com/css2?family=Inter:ital,wght@0,400;0,500;0,600;0,700;1,400&family=Noto+Sans:wght@400;700;800&family=Noto+Serif:ital@1&display=swap'
    ];

    const bibleBooks = [
        { folder: '01-genesis', file: 'genesis' }, { folder: '02-exodo', file: 'exodo' },
        { folder: '03-levitico', file: 'levitico' }, { folder: '04-numeros', file: 'numeros' },
        { folder: '05-deuteronomio', file: 'deuteronomio' }, { folder: '06-josue', file: 'josue' },
        { folder: '07-juizes', file: 'juizes' }, { folder: '08-rute', file: 'rute' },
        { folder: '09-1samuel', file: '1samuel' }, { folder: '10-2samuel', file: '2samuel' },
        { folder: '11-1reis', file: '1reis' }, { folder: '12-2reis', file: '2reis' },
        { folder: '13-1cronicas', file: '1cronicas' }, { folder: '14-2cronicas', file: '2cronicas' },
        { folder: '15-esdras', file: 'esdras' }, { folder: '16-neemias', file: 'neemias' },
        { folder: '17-ester', file: 'ester' }, { folder: '18-jo', file: 'jo' },
        { folder: '19-salmos', file: 'salmos' }, { folder: '20-proverbios', file: 'proverbios' },
        { folder: '21-eclesiastes', file: 'eclesiastes' }, { folder: '22-canticos', file: 'canticos' },
        { folder: '23-isaias', file: 'isaias' }, { folder: '24-jeremias', file: 'jeremias' },
        { folder: '25-lamentacoes', file: 'lamentacoes' }, { folder: '26-ezequiel', file: 'ezequiel' },
        { folder: '27-daniel', file: 'daniel' }, { folder: '28-oseias', file: 'oseias' },
        { folder: '29-joel', file: 'joel' }, { folder: '30-amos', file: 'amos' },
        { folder: '31-obadias', file: 'obadias' }, { folder: '32-jonas', file: 'jonas' },
        { folder: '33-miqueias', file: 'miqueias' }, { folder: '34-naum', file: 'naum' },
        { folder: '35-habacuque', file: 'habacuque' }, { folder: '36-sofonias', file: 'sofonias' },
        { folder: '37-ageu', file: 'ageu' }, { folder: '38-zacarias', file: 'zacarias' },
        { folder: '39-malaquias', file: 'malaquias' }, { folder: '40-mateus', file: 'mateus' },
        { folder: '41-marcos', file: 'marcos' }, { folder: '42-lucas', file: 'lucas' },
        { folder: '43-joao', file: 'joao' }, { folder: '44-atos', file: 'atos' },
        { folder: '45-romanos', file: 'romanos' }, { folder: '46-1corintios', file: '1corintios' },
        { folder: '47-2corintios', file: '2corintios' }, { folder: '48-galatas', file: 'galatas' },
        { folder: '49-efesios', file: 'efesios' }, { folder: '50-filipenses', file: 'filipenses' },
        { folder: '51-colossenses', file: 'colossenses' }, { folder: '52-1tessalonicenses', file: '1tessalonicenses' },
        { folder: '53-2tessalonicenses', file: '2tessalonicenses' }, { folder: '54-1timoteo', file: '1timoteo' },
        { folder: '55-2timoteo', file: '2timoteo' }, { folder: '56-tito', file: 'tito' },
        { folder: '57-filemon', file: 'filemon' }, { folder: '58-hebreus', file: 'hebreus' },
        { folder: '59-tiago', file: 'tiago' }, { folder: '60-1pedro', file: '1pedro' },
        { folder: '61-2pedro', file: '2pedro' }, { folder: '62-1joao', file: '1joao' },
        { folder: '63-2joao', file: '2joao' }, { folder: '64-3joao', file: '3joao' },
        { folder: '65-judas', file: 'judas' }, { folder: '66-apocalipse', file: 'apocalipse' }
    ];

    for (const b of bibleBooks) {
        list.push(`biblia/livro/${b.folder}/${b.file}.html`);
        list.push(`sentinela/biblia/data/${b.file}.json`);
    }

    const semana = getSemanaAtual();
    const sentinelaUrl = `sentinela/artigos/${semana}.html`;
    list.push(sentinelaUrl);

    try {
        const res = await fetch(basePath + sentinelaUrl);
        if (res.ok) {
            const html = await res.text();
            const matches = [...html.matchAll(/class=["']imagem(\d+)["']/g)];
            for (let m of matches) {
                let id = m[1];
                list.push(`sentinela/imagem/semanas/${semana}/img${id}.png`);
                list.push(`sentinela/imagem/semanas/${semana}/leg${id}.txt`);
            }
        }
    } catch(e) {}

    return list.map(path => path.startsWith('http') ? path : basePath + path);
}
