(() => {
  const states = new Map();
  const messageNode = document.getElementById('bootMessage');

  const messages = {
    electron: 'Iniciando TrAcción…',
    persistence: 'Cargando motor de datos…',
    database: 'Conectando y verificando la base de datos…',
    services: 'Preparando servicios internos…',
    interface: 'Cargando datos e interfaz…',
  };

  const priority = ['interface', 'database', 'services', 'persistence', 'electron'];

  function refreshMessage() {
    if (!messageNode) return;

    const errorStep = priority.find((step) => states.get(step)?.status === 'error');
    if (errorStep) {
      const state = states.get(errorStep);
      messageNode.classList.add('error');
      messageNode.textContent = state.detail || 'Se ha producido un problema durante el arranque.';
      return;
    }

    messageNode.classList.remove('error');
    const activeStep = priority.find((step) => states.get(step)?.status === 'active');
    messageNode.textContent = activeStep
      ? messages[activeStep]
      : 'Preparando interfaz…';
  }

  window.__traccionSplashUpdate = ({ step, status, detail }) => {
    states.set(step, { status, detail });
    refreshMessage();
  };

  states.set('electron', { status: 'active' });
  refreshMessage();
})();
