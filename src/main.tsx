import React from 'react';
import ReactDOM from 'react-dom/client';
import { AppBootScreen } from './components/AppBootScreen';
import { DatabaseLockQuickActionsPortal } from './components/ajustes/DatabaseLockQuickActionsPortal';
import { TaskCriterionBridge } from './features/criterios-rrll/components/TaskCriterionBridge';
import {
  hydrateLocalStorageFromSqlite,
  reportStartupHydrationResult,
} from './services/persistence';
import { getDirtyEditorCount } from './services/dirtyEditors';
import { recordPerformanceMetric } from './services/performanceMetrics';
import './styles.css';
import './dashboard-overrides.css';
import './responsive-overrides.css';

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
          <h1 className="mb-2 text-lg font-semibold">No se ha podido arrancar TrAcción</h1>
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

type AppModule = typeof import('./App');

async function renderApp(appModulePromise: Promise<AppModule> = import('./App')): Promise<void> {
  const { App } = await appModulePromise;

  root.render(
    <React.StrictMode>
      <>
        <App />
        <DatabaseLockQuickActionsPortal />
        <TaskCriterionBridge />
      </>
    </React.StrictMode>,
  );

  await waitForNextPaint();
  notifyRendererReady();
}

async function startApp(): Promise<void> {
  const startupStartedAt = performance.now();
  renderBootScreen('Inicializando base de datos...');
  await waitForNextPaint();
  notifyBootVisible();
  // Prepara el bundle principal en paralelo con SQLite. La interfaz no se
  // renderiza hasta que la hidratación termina, por lo que se conservan las
  // mismas garantías de arranque y fuente única de verdad.
  const appImportStartedAt = performance.now();
  const appModulePromise = import('./App');
  void appModulePromise.then(() => {
    recordPerformanceMetric('arranque', 'Preparación de módulos', performance.now() - appImportStartedAt);
  });

  const hydrationStartedAt = performance.now();
  const hydrationResult = await hydrateLocalStorageFromSqlite();
  recordPerformanceMetric('arranque', 'Hidratación SQLite', performance.now() - hydrationStartedAt);
  reportStartupHydrationResult(hydrationResult);
  renderBootScreen('Preparando módulos...');
  await renderApp(appModulePromise);
  recordPerformanceMetric('arranque', 'Arranque hasta interfaz lista', performance.now() - startupStartedAt);
}

startApp().catch((error: unknown) => {
  console.warn(
    'No se ha podido completar el arranque SQLite; se renderiza en modo bloqueado.',
    error,
  );
  renderBootScreen('SQLite no disponible. Abriendo TrAcción en modo bloqueado...');
  renderApp().catch((renderError: unknown) => {
    console.error('No se ha podido arrancar TrAcción.', renderError);
    renderFatalError(renderError);
  });
});

window.addEventListener('beforeunload', (event) => {
  const dirtyEditors = getDirtyEditorCount();
  if (dirtyEditors === 0) {
    return;
  }

  event.preventDefault();
  event.returnValue = `Hay ${dirtyEditors} formulario${dirtyEditors > 1 ? 's' : ''} con cambios sin guardar. ¿Cerrar de todas formas?`;
});
