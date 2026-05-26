const CACHE_NAME = 'reuniao-cache-v3';

self.addEventListener('install', event => {
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(cacheNames => Promise.all(cacheNames.map(cacheName => cacheName !== CACHE_NAME ? caches.delete(cacheName) : null)))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    if (event.request.method !== 'GET' || !url.protocol.startsWith('http')) return;

    if (url.origin.includes('supabase.co') || url.origin.includes('workers.dev')) return;

    event.respondWith((async () => {
        try {
            const response = await fetch(event.request);
            if (response && (response.ok || response.type === 'opaque')) {
                const cache = await caches.open(CACHE_NAME);
                await cache.put(event.request, response.clone());
            }
            return response;
        } catch (err) {
            const cached = await caches.match(event.request, { ignoreSearch: true });
            if (cached) return cached;
            if (event.request.mode === 'navigate') {
                const index = await caches.match(new URL('index.html', self.registration.scope).href, { ignoreSearch: true });
                if (index) return index;
            }
            throw err;
        }
    })());
});

self.addEventListener('message', async event => {
    if (!event.data) return;

    if (event.data.action === 'START_DOWNLOAD') {
        try {
            const assets = await buildDownloadList();
            const cache = await caches.open(CACHE_NAME);
            const failures = [];
            let loaded = 0;
            const total = assets.length;

            for (const asset of assets) {
                try {
                    const request = asset.external
                        ? new Request(asset.url, { mode: 'no-cors' })
                        : new Request(asset.url, { credentials: 'same-origin', cache: 'reload' });
                    const response = await fetch(request);
                    if (!response || (!response.ok && response.type !== 'opaque')) {
                        throw new Error(response ? String(response.status) : 'sem resposta');
                    }
                    await cache.put(request, response.clone());
                } catch (err) {
                    failures.push({ url: asset.url, critical: asset.critical, message: err && err.message ? err.message : 'erro' });
                }
                loaded++;
                postToSource(event, { type: 'DOWNLOAD_PROGRESS', loaded, total });
            }

            const criticalFailures = failures.filter(item => item.critical);
            if (criticalFailures.length) {
                postToSource(event, { type: 'DOWNLOAD_ERROR', failures: criticalFailures.slice(0, 12), totalFailures: criticalFailures.length });
                return;
            }

            postToSource(event, { type: 'DOWNLOAD_COMPLETE', warnings: failures.slice(0, 12), totalWarnings: failures.length });
        } catch (err) {
            postToSource(event, { type: 'DOWNLOAD_ERROR', failures: [{ url: '', critical: true, message: err && err.message ? err.message : 'erro' }], totalFailures: 1 });
        }
    }

    if (event.data.action === 'CLEAR_CACHE') {
        await caches.delete(CACHE_NAME);
        postToSource(event, { type: 'CACHE_CLEARED' });
    }
});

function postToSource(event, data) {
    if (event.source && event.source.postMessage) event.source.postMessage(data);
}

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

function asset(path, critical = true) {
    const external = /^https?:\/\//i.test(path);
    const url = external ? path : new URL(path, self.registration.scope).href;
    return { url, critical, external };
}

async function buildDownloadList() {
    const list = [
        asset('', true),
        asset('index.html', true),
        asset('styles.css', true),
        asset('main.js', true),
        asset('manifest.json', true),
        asset('navbar/navbar-unified.css', true),
        asset('navbar/navbar-unified.js', true),
        asset('navbar/network-sensor.js', true),
        asset('save/auth-supabase.html', true),
        asset('save/config.js', true),
        asset('save/supabase.js', true),
        asset('save/unified-load.js', true),
        asset('save/auto-save.js', true),
        asset('save/outros/feedback.js', false),
        asset('save/sentinela-sync.js', true),
        asset('save/asmb-sync.js', true),
        asset('save/offline-manager.js', true),
        asset('richtext/container.html', true),
        asset('richtext/editor.css', true),
        asset('richtext/barra.css', true),
        asset('richtext/perf-low.css', true),
        asset('richtext/editor.js', true),
        asset('richtext/barra.js', true),
        asset('richtext/perf-profile.js', true),
        asset('richtext/cache-r.js', true),
        asset('richtext/liquid-glass.js', true),
        asset('richtext/leitor.js', true),
        asset('richtext/plugin/negrita.css', true),
        asset('richtext/plugin/bullet.css', true),
        asset('richtext/plugin/cores.css', true),
        asset('richtext/plugin/font.css', true),
        asset('richtext/plugin/leitor.css', true),
        asset('richtext/plugin/undo.js', true),
        asset('richtext/plugin/negrita.js', true),
        asset('richtext/plugin/bullet.js', true),
        asset('richtext/plugin/cores.js', true),
        asset('richtext/plugin/font.js', true),
        asset('richtext/plugin/leitor.js', true),
        asset('richtext/biblia/stylebbl.css', true),
        asset('richtext/biblia/abrev.js', true),
        asset('richtext/biblia/scriptbbl-container.js', true),
        asset('sentinela/style.css', true),
        asset('sentinela/imagem.js', true),
        asset('sentinela/mark.js', true),
        asset('sentinela/clickable/clickable.css', true),
        asset('sentinela/clickable/clickable.js', true),
        asset('sentinela/clickable/cache.js', true),
        asset('sentinela/clickable/agente_perguntas.js', true),
        asset('sentinela/clickable/agente_recap.js', true),
        asset('sentinela/clickable/agente-obj.js', true),
        asset('sentinela/clickable/agente-sub.js', true),
        asset('sentinela/clickable/agente-modal/agente-modal.css', true),
        asset('sentinela/clickable/agente-modal/agente-modal.js', true),
        asset('sentinela/menu/menu.css', true),
        asset('sentinela/menu/menu.js', true),
        asset('sentinela/imagem/swiper-zoom.css', true),
        asset('sentinela/imagem/swiper-zoom.js', true),
        asset('sentinela/biblia/abrev.js', true),
        asset('sentinela/biblia/scriptbbl.js', true),
        asset('biblia/biblia.html', true),
        asset('biblia/capitulo.html', true),
        asset('biblia/livro/style-bbl.css', true),
        asset('vendor/swiper/swiper-bundle.min.css', true),
        asset('vendor/swiper/swiper-bundle.min.js', true),
        asset('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2', false),
        asset('https://fonts.googleapis.com/css2?family=Inter:ital,wght@0,400;0,500;0,600;0,700;1,400&family=Noto+Sans:wght@400;700;800&family=Noto+Serif:ital@1&display=swap', false),
        asset('https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400;500;700;800&family=Sumana:wght@400;700&display=swap', false),
        asset('https://cdnjs.cloudflare.com/ajax/libs/Swiper/11.0.5/swiper-bundle.min.js', false),
        asset('https://cdnjs.cloudflare.com/ajax/libs/Swiper/11.0.5/swiper-bundle.min.css', false)
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
        list.push(asset(`biblia/livro/${b.folder}/${b.file}.html`, true));
        list.push(asset(`sentinela/biblia/data/${b.file}.json`, true));
    }

    const semana = getSemanaAtual();
    const sentinelaUrl = `sentinela/artigos/${semana}.html`;
    list.push(asset(sentinelaUrl, false));

    try {
        const res = await fetch(new URL(sentinelaUrl, self.registration.scope).href);
        if (res.ok) {
            const html = await res.text();
            const matches = [...html.matchAll(/class=["']imagem(\d+)["']/g)];
            for (const m of matches) {
                const id = m[1];
                list.push(asset(`sentinela/imagem/semanas/${semana}/img${id}.png`, false));
                list.push(asset(`sentinela/imagem/semanas/${semana}/leg${id}.txt`, false));
            }
        }
    } catch (err) {}

    const seen = new Set();
    return list.filter(item => {
        if (seen.has(item.url)) return false;
        seen.add(item.url);
        return true;
    });
}
