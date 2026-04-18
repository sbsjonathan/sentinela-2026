(function initOfflineManager() {
    const CACHE_NAME = 'sentinela-offline-v1';
    const MANIFEST_URL = 'offline-manifest.json';
    const STORAGE_FLAG = 'offline-mode-enabled';

    const button = document.getElementById('offline-download-btn');
    const progressBar = document.getElementById('offline-progress-bar');
    const progressText = document.getElementById('offline-progress-text');
    const status = document.getElementById('offline-status');

    if (!button || !progressBar || !progressText || !status) {
        return;
    }

    function setProgress(percent, label) {
        const safe = Math.max(0, Math.min(100, Math.round(percent)));
        progressBar.style.width = `${safe}%`;
        progressText.textContent = label || `${safe}%`;
    }

    function showOfflineState() {
        status.hidden = false;
        button.textContent = '✅ Offline pronto';
    }

    function persistOfflineFlag() {
        try {
            localStorage.setItem(STORAGE_FLAG, JSON.stringify({ enabled: true, at: new Date().toISOString() }));
        } catch (error) {
            console.warn('Não foi possível salvar estado offline:', error);
        }
    }

    function hasOfflineFlag() {
        try {
            const raw = localStorage.getItem(STORAGE_FLAG);
            if (!raw) return false;
            const payload = JSON.parse(raw);
            return Boolean(payload && payload.enabled);
        } catch (error) {
            return false;
        }
    }

    async function loadManifest() {
        const response = await fetch(MANIFEST_URL, { cache: 'no-store' });
        if (!response.ok) {
            throw new Error(`manifest ${response.status}`);
        }
        const manifest = await response.json();
        if (!manifest || !Array.isArray(manifest.assets)) {
            throw new Error('manifest inválido');
        }
        return manifest.assets;
    }

    async function cacheAssetsWithProgress(assets) {
        const cache = await caches.open(CACHE_NAME);
        const allAssets = ['/', ...assets.filter(Boolean)];
        let completed = 0;
        const failures = [];

        for (const asset of allAssets) {
            try {
                const response = await fetch(asset, { cache: 'no-store' });
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }
                await cache.put(asset, response.clone());
            } catch (error) {
                failures.push({ asset, reason: error.message });
            } finally {
                completed += 1;
                const percent = (completed / allAssets.length) * 100;
                setProgress(percent);
            }
        }

        return failures;
    }

    async function handleDownloadOffline() {
        button.disabled = true;
        button.textContent = 'Baixando...';
        setProgress(0, 'Iniciando...');

        try {
            const assets = await loadManifest();
            setProgress(2, 'Preparando arquivos...');

            const failures = await cacheAssetsWithProgress(assets);
            setProgress(100, '100% concluído');

            persistOfflineFlag();
            showOfflineState();

            if (failures.length > 0) {
                progressText.textContent = `100% com ${failures.length} falhas`;
                console.warn('Falhas de cache offline:', failures);
            }
        } catch (error) {
            console.error('Erro no download offline:', error);
            setProgress(0, 'Erro ao baixar');
            button.disabled = false;
            button.textContent = '📥 Tentar novamente';
            return;
        }

        button.disabled = true;
    }

    if (hasOfflineFlag()) {
        setProgress(100, '100% concluído');
        showOfflineState();
        button.disabled = true;
    }

    button.addEventListener('click', handleDownloadOffline);
})();
