document.addEventListener('DOMContentLoaded', () => {
    const FLAG_KEY = 'reuniao-offline-baixado';
    const btnToggle = document.getElementById('btn-offline-toggle');
    const progressContainer = document.getElementById('offline-progress-container');
    const progressFill = document.getElementById('offline-progress-fill');
    const progressText = document.getElementById('offline-progress-text');
    const offlineHint = document.querySelector('.offline-section p');

    if (!btnToggle) return;

    function readFlag() {
        try { return localStorage.getItem(FLAG_KEY) === '1'; } catch (e) { return false; }
    }

    function writeFlag(value) {
        try {
            if (value) localStorage.setItem(FLAG_KEY, '1');
            else localStorage.removeItem(FLAG_KEY);
        } catch (e) {}
    }

    let isDownloaded = readFlag();

    function updateBtnUI() {
        if (isDownloaded) {
            btnToggle.innerHTML = '🗑️ Apagar Dados Offline';
            btnToggle.classList.remove('btn-secondary');
            btnToggle.classList.add('btn-danger');
            if (offlineHint) offlineHint.textContent = '✓ Disponível offline. Você pode ler a Bíblia e a Sentinela sem internet.';
        } else {
            btnToggle.innerHTML = '⬇️ Baixar App para Modo Offline';
            btnToggle.classList.add('btn-secondary');
            btnToggle.classList.remove('btn-danger');
            if (offlineHint) offlineHint.textContent = 'Baixe a Bíblia, App e a Sentinela da semana para ler sem internet.';
        }
    }

    function setDownloaded(value) {
        isDownloaded = value;
        writeFlag(value);
        updateBtnUI();
    }

    function requestCacheStatus() {
        return new Promise((resolve) => {
            if (!('serviceWorker' in navigator)) { resolve(null); return; }
            navigator.serviceWorker.ready.then((reg) => {
                const sw = reg.active || navigator.serviceWorker.controller;
                if (!sw) { resolve(null); return; }
                let settled = false;
                const finish = (val) => { if (!settled) { settled = true; resolve(val); } };
                const timer = setTimeout(() => finish(null), 1500);
                const channel = new MessageChannel();
                channel.port1.onmessage = (event) => {
                    clearTimeout(timer);
                    const data = event.data;
                    finish(data && data.type === 'CACHE_STATUS' ? data : null);
                };
                try {
                    sw.postMessage({ action: 'CACHE_STATUS' }, [channel.port2]);
                } catch (e) {
                    clearTimeout(timer);
                    finish(null);
                }
            }).catch(() => resolve(null));
        });
    }

    async function reconcileWithCache() {
        const status = await requestCacheStatus();
        if (!status) return;
        if (isDownloaded) {
            if (!status.hasCache) setDownloaded(false);
        } else if (status.complete) {
            setDownloaded(true);
        }
    }

    btnToggle.addEventListener('click', async () => {
        if (!('serviceWorker' in navigator)) {
            alert('Seu navegador não suporta o modo offline.');
            return;
        }

        if (!isDownloaded && !navigator.onLine) {
            alert('Você precisa de internet para fazer o download dos arquivos.');
            return;
        }

        const registration = await navigator.serviceWorker.ready;
        if (!registration.active) {
            alert('Sistema offline iniciando... Tente novamente em alguns segundos.');
            return;
        }

        if (isDownloaded) {
            if (confirm('Tem certeza que deseja apagar os arquivos offline para liberar espaço no aparelho? (Suas anotações locais não serão perdidas)')) {
                registration.active.postMessage({ action: 'CLEAR_CACHE' });
                btnToggle.disabled = true;
                btnToggle.innerHTML = 'Apagando...';
            }
        } else {
            progressContainer.style.display = 'block';
            progressText.style.display = 'block';
            progressFill.style.width = '0%';
            progressText.textContent = '0%';
            btnToggle.disabled = true;
            btnToggle.innerHTML = 'Baixando...';
            registration.active.postMessage({ action: 'START_DOWNLOAD' });
        }
    });

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.addEventListener('message', (event) => {
            const data = event.data;
            if (!data) return;
            if (data.type === 'DOWNLOAD_PROGRESS') {
                const percent = data.total ? Math.round((data.loaded / data.total) * 100) : 0;
                progressFill.style.width = `${percent}%`;
                progressText.textContent = `${percent}% (${data.loaded}/${data.total})`;
            } else if (data.type === 'DOWNLOAD_COMPLETE') {
                progressContainer.style.display = 'none';
                progressText.style.display = 'none';
                btnToggle.disabled = false;
                setDownloaded(true);
                alert('Download concluído! Agora você pode abrir e ler a Sentinela e a Bíblia sem internet (Modo Avião).');
            } else if (data.type === 'DOWNLOAD_ERROR') {
                progressContainer.style.display = 'none';
                progressText.style.display = 'none';
                btnToggle.disabled = false;
                alert('Erro ao baixar alguns arquivos. Verifique sua conexão e tente novamente.');
            } else if (data.type === 'CACHE_CLEARED') {
                btnToggle.disabled = false;
                setDownloaded(false);
            }
        });
    }

    updateBtnUI();
    reconcileWithCache();
});
