import React from 'react';
import ReactDOM from 'react-dom/client';
import { AppBootScreen } from './components/AppBootScreen';
import {
  hydrateLocalStorageFromSqlite,
  reportStartupHydrationResult,
} from './services/persistence';
import './styles.css';

function waitForNextPaint(): Promise<void> {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => resolve());
    });
  });
}

function notifyRendererReady(): void {
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      window.traccion?.notifyRendererReady?.();
    });
  });
}

function notifyBootVisible(): void {
  window.traccion?.notifyBootVisible?.();
}

const root = ReactDOM.createRoot(document.getElementById('root')!);

function renderBootScreen(message?: string): void {
  root.render(
    <React.StrictMode>
      <AppBootScreen message={message} />
    </React.StrictMode>,
  );
}

async function renderApp(): Promise<void> {
  const { App } = await import('./App');

  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );

  notifyRendererReady();
}

async function startApp(): Promise<void> {
  renderBootScreen('Inicializando base de datos...');
  await waitForNextPaint();
  notifyBootVisible();
  const hydrationResult = await hydrateLocalStorageFromSqlite();
  reportStartupHydrationResult(hydrationResult);
  renderBootScreen('Preparando módulos...');
  await renderApp();
}

startApp().catch((error: unknown) => {
  console.warn(
    'No se ha podido completar el arranque hidratado; se renderiza con localStorage.',
    error,
  );
  renderBootScreen('Preparando arranque alternativo...');
  renderApp().catch((renderError: unknown) => {
    console.error('No se ha podido arrancar TrAccion.', renderError);
    window.traccion?.notifyRendererReady?.();
  });
});
