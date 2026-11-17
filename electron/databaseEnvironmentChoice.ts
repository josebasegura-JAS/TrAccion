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
:root{color-scheme:dark;font-family:Inter,'Segoe UI',system-ui,sans-serif;background:#08111F;color:#F3F4F6}
*{box-sizing:border-box}
html,body{margin:0;width:100%;height:100%;overflow:hidden}
body{padding:24px 28px;background:radial-gradient(circle at 100% 0%,rgba(59,130,246,.10),transparent 65%),#08111F}
h1{font-size:21px;font-weight:750;letter-spacing:.01em;margin:0 0 8px;color:#F3F4F6}
p{color:#CBD5E1;font-size:13px;line-height:1.45;margin:0 0 20px}
a{display:block;text-decoration:none;text-align:center;outline-offset:3px;cursor:pointer}
.primary{background:#DC2626;color:#fff;border-radius:9px;font-size:15px;font-weight:700;padding:13px;margin-bottom:10px}
.primary:hover,.primary:focus-visible{background:#b91c1c}
.secondary{font-size:12px;color:#93C5FD;padding:7px;margin:auto;width:max-content;text-decoration:underline;text-underline-offset:3px}
.secondary:hover,.secondary:focus-visible{color:#bfdbfe}
.cancel{font-size:12px;color:#94A3B8;padding:6px;margin:4px auto 0;width:max-content}
.note{border-top:1px solid #334155;padding-top:13px;margin-top:14px;font-size:11.5px;line-height:1.4;color:#94A3B8}
</style></head><body>
<h1>TrAcción</h1><p>Selecciona el entorno con el que quieres trabajar.</p>
<a class="primary" href="https://traccion-startup.invalid/production">Entrar en Producción</a>
<a class="secondary" href="https://traccion-startup.invalid/test">Abrir entorno de pruebas</a>
<a class="cancel" href="https://traccion-startup.invalid/cancel">Cancelar</a>
<p class="note">El entorno de pruebas utiliza una base independiente, sin copiar información de producción.</p>
</body></html>`;

export function promptDatabaseEnvironment(): Promise<StartupEnvironmentChoice> {
  return new Promise((resolve, reject) => {
    const window = new BrowserWindow({
      width: 455, height: 365, minWidth: 455, minHeight: 365,
      resizable: false, maximizable: false, minimizable: false,
      autoHideMenuBar: true, show: false, title: 'TrAcción · Entorno de trabajo',
      backgroundColor: '#08111F',
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
