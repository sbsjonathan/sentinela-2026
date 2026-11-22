(() => {
  'use strict';

  let listeners;
  const cloudMessages = {
    loading: 'Preparando a anotação…',
    offline: 'Sem conexão. A sincronização continua quando a internet voltar.',
    'signed-out': 'Entre na sua conta para sincronizar esta anotação.',
    'local-error': 'A edição ainda não foi salva neste aparelho. Tente novamente.',
    paused: 'A sincronização está pausada.',
    syncing: 'Sincronizando esta semana…',
    error: 'Não foi possível sincronizar. Tente novamente.',
    pending: 'Há alterações para sincronizar.',
    synced: 'Anotação sincronizada.',
    empty: 'Nenhuma anotação desta semana na nuvem.',
    unchecked: 'Pronta para conferir a anotação na nuvem.'
  };

  function openCloud(host, signal) {
    host.innerHTML = `
      <p class="notes-field-label" data-notes-week></p>
      <p class="notes-status" role="status" data-notes-cloud-status></p>
      <button type="button" class="notes-action-primary" data-notes-sync>Sincronizar agora</button>
      <a class="notes-action-primary" href="../save/auth-supabase.html" data-notes-sign-in hidden>Entrar na conta</a>`;
    const week = host.querySelector('[data-notes-week]');
    const status = host.querySelector('[data-notes-cloud-status]');
    const action = host.querySelector('[data-notes-sync]');
    const signIn = host.querySelector('[data-notes-sign-in]');
    const manager = window.AutoSaveManager;
    let requested = false;

    function render() {
      if (signal.aborted) return;
      const state = manager?.getCloudStatus() || 'loading';
      const message = cloudMessages[state];
      if (status.textContent !== message) status.textContent = message;
      const busy = requested || state === 'syncing';
      action.hidden = state === 'signed-out';
      action.disabled = busy || ['offline', 'signed-out', 'loading', 'paused'].includes(state);
      action.setAttribute('aria-busy', String(busy));
      action.textContent = busy ? 'Sincronizando…' : 'Sincronizar agora';
      signIn.hidden = state !== 'signed-out';
      week.textContent = typeof M4A_Placeholder !== 'undefined' ? M4A_Placeholder.main() : '';
    }

    action.addEventListener('click', async () => {
      if (action.disabled) return;
      requested = true;
      render();
      let failed = false;
      try {
        await manager.syncCurrent();
      } catch (_) {
        failed = true;
      } finally {
        requested = false;
        render();
        if (failed && !signal.aborted) status.textContent = cloudMessages.error;
      }
    }, {signal});
    signIn.addEventListener('click', event => {
      if (window.cacheRichText?.canLeave()) return;
      event.preventDefault();
      status.textContent = cloudMessages['local-error'];
    }, {signal});
    for (const name of ['online', 'offline', 'supabaseSessionChanged', 'supabaseLogout',
      'notes:cloud-state', 'notes:stored', 'notes:save-error', 'notes:external-updated']) {
      window.addEventListener(name, render, {signal});
    }
    manager?.ready.then(render);
    render();
  }

  function openPerformance(host, signal) {
    const profile = window.EditorPerfProfile;
    const choices = [
      ['auto', 'Padrão', 'Editor leve com a aura disponível no modo Bíblia.'],
      ['normal', 'Completo', 'Ativa os efeitos visuais do editor.'],
      ['low', 'Econômico', 'Reduz os efeitos visuais e desliga a aura.']
    ];
    host.innerHTML = `<div role="group" aria-label="Perfil de desempenho">${choices.map(([value, label, description]) =>
      `<button type="button" class="notes-setting-option" data-notes-perf="${value}"
          aria-label="${label}" aria-describedby="notes-perf-description-${value}" aria-pressed="${profile.getPreference() === value}">
        <span class="notes-setting-label">${label}</span>
        <span class="notes-setting-description" id="notes-perf-description-${value}">${description}</span>
      </button>`).join('')}</div>
      <p class="notes-status" role="status">O editor reabre ao mudar de perfil.</p>`;
    const status = host.querySelector('[role="status"]');
    host.addEventListener('click', event => {
      const option = event.target.closest('[data-notes-perf]');
      if (!option || option.getAttribute('aria-pressed') === 'true') return;
      if (!window.cacheRichText?.canLeave()) {
        status.textContent = cloudMessages['local-error'];
        return;
      }
      if (!profile.setMode(option.dataset.notesPerf)) {
        status.textContent = 'Não foi possível guardar o perfil neste aparelho.';
      }
    }, {signal});
  }

  window.NotesSettings = {
    open(kind, host) {
      this.close();
      listeners = new AbortController();
      if (kind === 'cloud') openCloud(host, listeners.signal);
      if (kind === 'performance') openPerformance(host, listeners.signal);
    },
    close() {
      listeners?.abort();
      listeners = null;
    }
  };
})();
