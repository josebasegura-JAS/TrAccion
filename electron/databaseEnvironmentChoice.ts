/**
 * Startup-only environment chooser. A frameless modal is deliberately not
 * used: the normal Windows close button and keyboard navigation stay usable.
 * No SQLite or renderer IPC is initialized while this window is displayed.
 */
import { BrowserWindow } from 'electron';

export type StartupEnvironmentChoice = 'production' | 'test' | null;

const HTML = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>TrAcción · Entorno de trabajo</title>
<style>
:root{font-family:system-ui,Segoe UI,Arial,sans-serif;color:#203144;background:#f4f7fa}
*{box-sizing:border-box}body{margin:0;padding:30px 32px}
h1{font-size:21px;margin:0 0 12px;font-weight:750}p{color:#5d6b7a;font-size:13px;line-height:1.55;margin:0 0 20px}
a{display:block;text-decoration:none;text-align:center;outline-offset:3px}
.primary{background:#c92337;color:white;border-radius:10px;font-size:16px;font-weight:700;padding:14px;margin-bottom:14px}
.primary:hover,.primary:focus-visible{background:#a81b2d}
.secondary{font-size:12px;color:#54718d;padding:8px;margin:auto;width:max-content;text-decoration:underline;text-underline-offset:3px}
.secondary:hover,.secondary:focus-visible{color:#1b4e7d}
.cancel{font-size:12px;color:#788797;padding:9px;margin:10px auto 0;width:max-content}
.note{border-top:1px solid #dfe5eb;padding-top:14px;margin-top:18px;font-size:12px;color:#617182}
</style></head><body>
<h1>TrAcción</h1><p>Selecciona el entorno con el que quieres trabajar.</p>
<a class="primary" href="https://traccion-startup.invalid/production">Entrar en Producción</a>
<a class="secondary" href="https://traccion-startup.invalid/test">Abrir entorno de pruebas</a>
<a class="cancel" href="https://traccion-startup.invalid/cancel">Cancelar</a>
<p class="note">El entorno de pruebas utiliza una base de datos independiente. Nunca se copiarán los datos de producción.</p>
</body></html>`;

export function promptDatabaseEnvironment(): Promise<StartupEnvironmentChoice> {
  return new Promise((resolve, reject) => {
    const window = new BrowserWindow({
      width: 460, height: 395, minWidth: 460, minHeight: 395,
      resizable: false, maximizable: false, minimizable: false,
      autoHideMenuBar: true, show: false, title: 'TrAcción · Entorno de trabajo',
      backgroundColor: '#f4f7fa',
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
    let settled = false;
    const finish = (choice: StartupEnvironmentChoice) => {
      if (settled) return;
      settled = true;
      resolve(choice);
      if (!window.isDestroyed()) window.close();
    };
    window.webContents.on('will-navigate', (event, target) => {
      event.preventDefault();
      const prefix = 'https://traccion-startup.invalid/';
      if (!target.startsWith(prefix)) return;
      const choice = target.slice(prefix.length);
      if (choice === 'production' || choice === 'test') finish(choice);
      else if (choice === 'cancel') finish(null);
    });
    window.once('ready-to-show', () => window.show());
    window.once('closed', () => finish(null));
    void window.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(HTML))
      .catch((error: unknown) => {
        if (settled) return;
        settled = true;
        if (!window.isDestroyed()) window.close();
        reject(error);
      });
  });
}
