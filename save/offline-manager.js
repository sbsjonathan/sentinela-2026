document.addEventListener('DOMContentLoaded', () => {
    const CACHE_NAME = 'reuniao-cache-v3';
    const btnToggle = document.getElementById('btn-offline-toggle');
    const progressContainer = document.getElementById('offline-progress-container');
    const progressFill = document.getElementById('offline-progress-fill');
    const progressText = document.getElementById('offline-progress-text');

    if (!btnToggle) return;

    let isDownloaded = false;

    async function checkCacheStatus() {
        if (!('caches' in window)) return;
        isDownloaded = await caches.has(CACHE_NAME);
        updateBtnUI();
    }

    function updateBtnUI() {
        if (isDownloaded) {
            btnToggle.innerHTML = '🗑️ Apagar Dados Offline';
            btnToggle.classList.remove('btn-secondary');
            btnToggle.classList.add('btn-danger');
        } else {
            btnToggle.innerHTML = '⬇️ Baixar App para Modo Offline';
            btnToggle.classList.add('btn-secondary');
            btnToggle.classList.remove('btn-danger');
        }
    }

    function showProgress() {
        if (progressContainer) progressContainer.style.display = 'block';
        if (progressText) progressText.style.display = 'block';
        if (progressFill) progressFill.style.width = '0%';
        if (progressText) progressText.textContent = '0%';
    }

    function hideProgress() {
        if (progressContainer) progressContainer.style.display = 'none';
        if (progressText) progressText.style.display = 'none';
    }

    function summarizeFailures(data) {
        const failures = Array.isArray(data.failures) ? data.failures : [];
        const total = data.totalFailures || failures.length;
        if (!failures.length) return 'Erro ao baixar arquivos essenciais. Verifique sua conexão e tente novamente.';
        const lines = failures.slice(0, 6).map(item => {
            try {
                const url = new URL(item.url);
                return url.pathname.replace(/^\//, '');
            } catch (err) {
                return item.url || 'arquivo desconhecido';
            }
        });
        const extra = total > lines.length ? `\n...e mais ${total - lines.length} arquivo(s).` : '';
        return `Não foi possível baixar ${total} arquivo(s) essencial(is):\n\n${lines.join('\n')}${extra}\n\nVerifique se esses arquivos existem no projeto publicado e tente novamente.`;
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
            if (confirm('Tem certeza que deseja apagar os arquivos offline para liberar espaço no aparelho? Suas anotações locais não serão perdidas.')) {
                registration.active.postMessage({ action: 'CLEAR_CACHE' });
                btnToggle.disabled = true;
                btnToggle.innerHTML = 'Apagando...';
            }
        } else {
            showProgress();
            btnToggle.disabled = true;
            btnToggle.innerHTML = 'Baixando...';
            registration.active.postMessage({ action: 'START_DOWNLOAD' });
        }
    });

    navigator.serviceWorker.addEventListener('message', event => {
        const data = event.data || {};

        if (data.type === 'DOWNLOAD_PROGRESS') {
            const percent = Math.round((data.loaded / data.total) * 100);
            if (progressFill) progressFill.style.width = `${percent}%`;
            if (progressText) progressText.textContent = `${percent}% (${data.loaded}/${data.total})`;
        }

        if (data.type === 'DOWNLOAD_COMPLETE') {
            hideProgress();
            btnToggle.disabled = false;
            isDownloaded = true;
            updateBtnUI();
            if (data.totalWarnings) {
                alert(`Download concluído. Alguns arquivos opcionais não foram baixados, mas a Bíblia e os arquivos essenciais ficaram salvos para modo offline.`);
            } else {
                alert('Download concluído! Agora você pode abrir e ler a Bíblia sem internet.');
            }
        }

        if (data.type === 'DOWNLOAD_ERROR') {
            hideProgress();
            btnToggle.disabled = false;
            isDownloaded = false;
            updateBtnUI();
            alert(summarizeFailures(data));
        }

        if (data.type === 'CACHE_CLEARED') {
            btnToggle.disabled = false;
            isDownloaded = false;
            updateBtnUI();
        }
    });

    checkCacheStatus();
});
