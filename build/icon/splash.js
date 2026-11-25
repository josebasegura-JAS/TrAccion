(() => {
  const started = new Map();
  const completedStatuses = new Set(['done', 'error']);
  const allSteps = () => Array.from(document.querySelectorAll('.step'));

  function iconFor(status) {
    if (status === 'active') return '<span class="spinner"></span>';
    if (status === 'done') return '✓';
    if (status === 'error') return '×';
    return '•';
  }

  function refreshProgress() {
    const steps = allSteps();
    const finished = steps.filter((step) => completedStatuses.has(step.dataset.status)).length;
    const pct = steps.length > 0 ? Math.round((finished / steps.length) * 100) : 0;
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');
    if (progressBar) progressBar.style.width = `${pct}%`;
    if (progressText) progressText.textContent = `${pct}%`;
  }

  window.__traccionSplashUpdate = ({ step, status, detail }) => {
    let target = document.querySelector(`[data-step="${step}"]`);
    if (!target && step === 'current') target = document.querySelector('.step.active');
    if (!target) return;

    target.classList.remove('pending', 'active', 'done', 'error');
    target.classList.add(status);
    target.dataset.status = status;

    const icon = target.querySelector('.icon');
    if (icon) icon.innerHTML = iconFor(status);

    if (status === 'active' && !started.has(target.dataset.step)) {
      started.set(target.dataset.step, Date.now());
    }
    if (completedStatuses.has(status)) {
      started.delete(target.dataset.step);
    }

    let detailNode = target.querySelector('.detail');
    if (detail) {
      if (!detailNode) {
        detailNode = document.createElement('div');
        detailNode.className = 'detail';
        target.appendChild(detailNode);
      }
      detailNode.textContent = detail;
    } else if (detailNode && status === 'done') {
      detailNode.remove();
    }

    refreshProgress();
  };

  let startupState = 'normal';
  function showStartupMessage(state, message) {
    if (startupState === 'closing' && state !== 'closing') return;
    startupState = state;
    const actions = document.getElementById('startupFailureActions');
    const detail = document.getElementById('startupFailureMessage');
    const card = document.querySelector('.splash-card');
    const button = document.getElementById('closeFailedStartup');
    if (actions) actions.hidden = false;
    if (detail) detail.textContent = message;
    if (card) card.setAttribute('aria-busy', state === 'fatal' ? 'false' : 'true');
    if (button) {
      button.disabled = state === 'closing';
      button.textContent = state === 'slow' ? 'Solicitar cierre seguro' : state === 'closing' ? 'Cierre solicitado' : 'Cerrar TrAcción';
    }
  }

  window.__traccionSplashShowFatal = () => showStartupMessage('fatal',
    'No se han podido preparar los servicios necesarios. Puedes cerrar TrAcción y volver a abrirla cuando hayas comprobado la conexión.');
  window.__traccionSplashShowSlow = () => {
    if (startupState !== 'normal') return;
    showStartupMessage('slow', 'El arranque está tardando más de lo habitual. Comprueba el cable y la conexión a la carpeta compartida. Puedes seguir esperando o solicitar el cierre cuando termine la operación pendiente.');
  };
  window.__traccionSplashShowClosing = () => showStartupMessage('closing',
    'Cierre solicitado. Se espera a que finalice la operación pendiente para no interrumpir SQLite. No se iniciará otra conexión ni se abrirá el dashboard.');
  const closeButton = document.getElementById('closeFailedStartup');
  if (closeButton) closeButton.addEventListener('click', () => window.close());
  // El renderer puede avisar incluso cuando el proceso principal no atiende
  // su temporizador. No implica que SQLite haya terminado ni autoriza matarlo.
  window.setTimeout(() => window.__traccionSplashShowSlow(), 30_000);

  const first = document.querySelector('[data-step="electron"]');
  if (first) {
    first.dataset.status = 'active';
    started.set('electron', Date.now());
  }
  refreshProgress();

  window.setInterval(() => {
    allSteps().forEach((step) => {
      const at = started.get(step.dataset.step);
      const elapsed = step.querySelector('.elapsed');
      if (!elapsed) return;
      if (!at) {
        elapsed.textContent = '';
        return;
      }
      const seconds = Math.max(0, Math.floor((Date.now() - at) / 1000));
      elapsed.textContent = seconds > 0 ? `${seconds}s` : '';
    });
  }, 250);
})();
