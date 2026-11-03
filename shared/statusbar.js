/* Give iOS a real opaque edge on internal screens, even when safe-area-top is 0.
 * Metadata alone does not control the native status-area blur in installed PWAs.
 */
(function initStatusBar() {
    'use strict';
    const root = document.documentElement;
    if (window.AppStatusBar?.documentRoot === root) {
        window.AppStatusBar.refresh();
        return;
    }

    const source = document.currentScript?.src || Array.from(document.scripts)
        .find(script => /\/shared\/statusbar\.js(?:[?#]|$)/.test(script.src))?.src;
    if (!source) return;
    const project = new URL('../', source);
    const home = location.origin === project.origin &&
        [project.pathname, new URL('index.html', project).pathname].includes(location.pathname);
    const path = location.pathname.slice(project.pathname.length);
    const surface = path.startsWith('biblia/') ? 'bible' :
        path.startsWith('richtext/') ? 'notes' :
        path.startsWith('save/') ? 'save' :
        path.startsWith('sentinela/artigos/') ? 'article' :
        path === 'atualizar.html' ? 'recovery' : 'default';
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const standalone = window.matchMedia('(display-mode: standalone)');
    let bodyObserver;

    function mount() {
        if (document.documentElement !== root || !document.body) return;
        bodyObserver?.disconnect();
        if (root.dataset.nativeStatusbar !== 'solid') return;
        if (!document.getElementById('app-solid-statusbar')) {
            const strip = document.createElement('div');
            strip.id = 'app-solid-statusbar';
            strip.setAttribute('aria-hidden', 'true');
            document.body.prepend(strip);
        }
    }

    function refresh() {
        if (document.documentElement !== root) return;
        const metas = [...document.head.querySelectorAll('meta[name="apple-mobile-web-app-status-bar-style"]')];
        const meta = metas.shift() || document.createElement('meta');
        metas.forEach(duplicate => duplicate.remove());
        meta.name = 'apple-mobile-web-app-status-bar-style';
        meta.content = home ? 'black-translucent' : 'default';
        if (!meta.isConnected) document.head.append(meta);
        root.dataset.appStatusbar = home ? 'home' : 'solid';
        root.dataset.statusbarSurface = surface;
        if (!home && ios && (navigator.standalone === true || standalone.matches)) {
            // Set this in the head so the header reserves its inset before paint.
            root.dataset.nativeStatusbar = 'solid';
            mount();
            if (!document.body && !bodyObserver) {
                bodyObserver = new MutationObserver(mount);
                bodyObserver.observe(root, { childList: true });
            }
        } else {
            delete root.dataset.nativeStatusbar;
            document.getElementById('app-solid-statusbar')?.remove();
        }
    }

    window.AppStatusBar = { documentRoot: root, refresh };
    refresh();
    window.addEventListener('pageshow', refresh);
    standalone.addEventListener('change', refresh);
})();
