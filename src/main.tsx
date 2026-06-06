import React from 'react';
import ReactDOM from 'react-dom/client';
import { hydrateLocalStorageFromSqlite } from './services/persistence';
import './styles.css';

async function startApp(): Promise<void> {
  await hydrateLocalStorageFromSqlite();
  const { App } = await import('./App');

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

startApp().catch((error: unknown) => {
  console.warn(
    'No se ha podido completar el arranque hidratado; se renderiza con localStorage.',
    error,
  );
  import('./App')
    .then(({ App }) => {
      ReactDOM.createRoot(document.getElementById('root')!).render(
        <React.StrictMode>
          <App />
        </React.StrictMode>,
      );
    })
    .catch((renderError: unknown) => {
      console.error('No se ha podido arrancar TrAccion.', renderError);
    });
});
