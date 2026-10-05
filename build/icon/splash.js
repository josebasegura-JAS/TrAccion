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
    const pct = Math.round((finished / steps.length) * 100);
    document.getElementById('progressBar').style.width = `${pct}%`;
    document.getElementById('progressText').textContent = `${pct}%`;
  }

  window.__traccionSplashUpdate = ({ step, status, detail }) => {
    let target = document.querySelector(`[data-step="${step}"]`);
    if (!target && step === 'current') target = document.querySelector('.step.active');
    if (!target) return;

    target.classList.remove('pending', 'active', 'done', 'error');
    target.classList.add(status);
    target.dataset.status = status;
    target.querySelector('.icon').innerHTML = iconFor(status);

    if (status === 'active' && !started.has(target.dataset.step)) started.set(target.dataset.step, Date.now());
    if (completedStatuses.has(status)) started.delete(target.dataset.step);

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

  const first = document.querySelector('[data-step="electron"]');
  first.dataset.status = 'active';
  started.set('electron', Date.now());
  refreshProgress();

  setInterval(() => {
    allSteps().forEach((step) => {
      const at = started.get(step.dataset.step);
      const elapsed = step.querySelector('.elapsed');
      if (!at || !elapsed) {
        if (elapsed) elapsed.textContent = '';
        return;
      }
      const seconds = Math.max(0, Math.floor((Date.now() - at) / 1000));
      elapsed.textContent = seconds > 0 ? `${seconds}s` : '';
    });
  }, 250);
})();
