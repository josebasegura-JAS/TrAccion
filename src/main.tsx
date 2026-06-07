import React from 'react';
import ReactDOM from 'react-dom/client';
import { hydrateLocalStorageFromSqlite } from './services/persistence';
import './styles.css';

function notifyRendererReady(): void {
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      window.traccion?.notifyRendererReady?.();
    });
  });
}

async function renderApp(): Promise<void> {
  const { App } = await import('./App');

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );

  notifyRendererReady();
}

async function startApp(): Promise<void> {
  await hydrateLocalStorageFromSqlite();
  await renderApp();
}

startApp().catch((error: unknown) => {
  console.warn(
    'No se ha podido completar el arranque hidratado; se renderiza con localStorage.',
    error,
  );
  renderApp().catch((renderError: unknown) => {
    console.error('No se ha podido arrancar TrAccion.', renderError);
    window.traccion?.notifyRendererReady?.();
  });
});
