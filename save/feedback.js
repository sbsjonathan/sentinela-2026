// Routine saves and automatic reconciliations are silent. Only an unsaved
// on-device draft needs a way to retry or export before leaving the editor.
(() => {
  let notice;

  function hide() { if (notice) notice.hidden = true; }

  window.addEventListener('notes:save-error', () => {
    if (notice) { notice.hidden = false; return; }
    const css = document.createElement('style');
    css.textContent = `
      #notes-save-status[hidden]{display:none!important}
      #notes-save-status{position:fixed;z-index:12080;left:12px;right:12px;top:calc(var(--app-statusbar-height,env(safe-area-inset-top,0px)) + 8px);max-width:480px;margin:auto;padding:9px 12px;border:1px solid #b39a76;border-radius:10px;background:#fff;color:#39333e;box-shadow:0 3px 16px #00000014;font:12px/1.45 system-ui,-apple-system,sans-serif}
      #notes-save-status p{margin:0;font:inherit}
      #notes-save-status .notes-save-actions{display:flex;flex-wrap:wrap;gap:4px 8px;margin-top:6px}
      #notes-save-status button{border:0;border-radius:5px;background:#f2eef6;color:#604184;font:600 12px/1.35 system-ui;padding:8px;min-height:34px;cursor:pointer}
      html[data-theme="dark"] #notes-save-status{background:#252229;color:#eee;border-color:#65596e}
      html[data-theme="dark"] #notes-save-status button{background:#3b3345;color:#e2d3f1}
    `;
    document.head.append(css);
    notice = document.createElement('aside');
    notice.id = 'notes-save-status';
    notice.dataset.type = 'error';
    notice.setAttribute('role', 'status');
    const message = document.createElement('p');
    message.textContent = 'Não foi possível salvar neste aparelho. Mantenha a anotação aberta ou baixe uma cópia.';
    const actions = document.createElement('div');
    actions.className = 'notes-save-actions';
    function action(label, run) {
      const button = document.createElement('button');
      button.type = 'button'; button.textContent = label;
      button.addEventListener('click', run);
      actions.append(button);
    }
    action('Tentar novamente', () => {
      const store = window.cacheRichText;
      const snapshot = store?.flush();
      if (snapshot && store.isStored?.(snapshot)) {
        hide();
        window.AutoSaveManager?.forceAutoSave();
      }
    });
    action('Baixar cópia', () => {
      const store = window.cacheRichText;
      if (store.downloadRecovery) { store.downloadRecovery(); return; }
      // The original editor can still be opened for recovery. Export its
      // in-memory snapshot even if the device cannot write to localStorage.
      const snapshot = store.snapshot();
      const href = URL.createObjectURL(new Blob([JSON.stringify(snapshot.payload)], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = href; link.download = `anotacoes-${store.semanaAtual()}.json`; link.click();
      setTimeout(() => URL.revokeObjectURL(href), 1000);
    });
    action('Fechar aviso', hide);
    notice.append(message, actions);
    document.body.append(notice);
  });
  window.addEventListener('notes:stored', hide);
  window.addEventListener('notes:external-updated', hide);
})();
