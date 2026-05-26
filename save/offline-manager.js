document.addEventListener('DOMContentLoaded', () => {
    const btnToggle = document.getElementById('btn-offline-toggle');
    const progressContainer = document.getElementById('offline-progress-container');
    const progressFill = document.getElementById('offline-progress-fill');
    const progressText = document.getElementById('offline-progress-text');
    
    let isDownloaded = false;

    async function checkCacheStatus() {
        if (!('caches' in window)) return;
        const hasCache = await caches.has('reuniao-cache-v1');
        isDownloaded = hasCache;
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
            if(confirm('Tem certeza que deseja apagar os arquivos offline para liberar espaço no aparelho? (Suas anotações locais não serão perdidas)')) {
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

    navigator.serviceWorker.addEventListener('message', (event) => {
        const data = event.data;
        if (data.type === 'DOWNLOAD_PROGRESS') {
            const percent = Math.round((data.loaded / data.total) * 100);
            progressFill.style.width = `${percent}%`;
            progressText.textContent = `${percent}% (${data.loaded}/${data.total})`;
        } else if (data.type === 'DOWNLOAD_COMPLETE') {
            progressContainer.style.display = 'none';
            progressText.style.display = 'none';
            btnToggle.disabled = false;
            isDownloaded = true;
            updateBtnUI();
            alert('Download concluído! Agora você pode abrir e ler a Sentinela e a Bíblia sem internet (Modo Avião).');
        } else if (data.type === 'DOWNLOAD_ERROR') {
            progressContainer.style.display = 'none';
            progressText.style.display = 'none';
            btnToggle.disabled = false;
            alert('Erro ao baixar alguns arquivos. Verifique sua conexão e tente novamente.');
        } else if (data.type === 'CACHE_CLEARED') {
            btnToggle.disabled = false;
            isDownloaded = false;
            updateBtnUI();
        }
    });

    checkCacheStatus();
});