import React from 'react';
import ReactDOM from 'react-dom/client';
import { AppBootScreen } from './components/AppBootScreen';
import {
  flushPendingSqliteWrites,
  getPendingSqliteWriteCount,
  hydrateLocalStorageFromSqlite,
  reportStartupHydrationResult,
} from './services/persistence';
import { flushPendingRecordWrites, getPendingRecordWriteCount } from './services/pendingRecordWrites';
import { getDirtyEditorCount } from './services/dirtyEditors';
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

function renderFatalError(error: unknown): void {
  const message = error instanceof Error ? error.message : 'Error desconocido.';
  root.render(
    <React.StrictMode>
      <div className="flex min-h-screen items-center justify-center bg-metro-app p-6 text-metro-text">
        <section className="max-w-2xl rounded-2xl border border-red-500/50 bg-red-950/30 p-6 text-red-100 shadow-xl" role="alert">
          <h1 className="mb-2 text-lg font-semibold">No se ha podido arrancar TrAccion</h1>
          <p className="mb-3 text-sm text-red-100/85">
            La aplicación ha evitado quedarse en pantalla negra. Revisa la consola o el log de Electron para ver el detalle completo.
          </p>
          <p className="rounded-lg bg-black/20 px-3 py-2 text-xs text-red-50/80">{message}</p>
        </section>
      </div>
    </React.StrictMode>,
  );
  window.traccion?.notifyRendererReady?.();
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

  await waitForNextPaint();
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
  // Flush de writes pendientes en background, después de que la App ya es visible.
  // No bloquea el arranque — el polling lo reintentará si falla.
  void flushPendingSqliteWrites().catch(() => undefined);
  void flushPendingRecordWrites().catch(() => undefined);
}

startApp().catch((error: unknown) => {
  console.warn(
    'No se ha podido completar el arranque hidratado; se renderiza con localStorage.',
    error,
  );
  renderBootScreen('Preparando arranque alternativo...');
  renderApp().catch((renderError: unknown) => {
    console.error('No se ha podido arrancar TrAccion.', renderError);
    renderFatalError(renderError);
  });
});

// Antes de cerrar la ventana, intentar sincronizar cualquier cambio pendiente.
// Si quedan writes pendientes tras el intento, el diálogo nativo de Electron
// da al usuario la oportunidad de cancelar el cierre.
window.addEventListener('beforeunload', (event) => {
  const pending = getPendingSqliteWriteCount() + getPendingRecordWriteCount();
  const dirtyEditors = getDirtyEditorCount();
  if (pending === 0 && dirtyEditors === 0) {
    return;
  }

  if (pending > 0) {
    void flushPendingSqliteWrites().catch(() => undefined);
    void flushPendingRecordWrites().catch(() => undefined);
  }

  event.preventDefault();
  event.returnValue = dirtyEditors > 0
    ? `Hay ${dirtyEditors} formulario${dirtyEditors > 1 ? 's' : ''} con cambios sin guardar. ¿Cerrar de todas formas?`
    : `Hay ${pending} cambio${pending > 1 ? 's' : ''} pendiente${pending > 1 ? 's' : ''} de sincronizar con la base de datos compartida. ¿Cerrar de todas formas?`;
});
