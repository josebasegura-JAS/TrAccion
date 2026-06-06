import { app, BrowserWindow, dialog, ipcMain, Menu } from 'electron';
import type { MenuItemConstructorOptions, OpenDialogOptions } from 'electron';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isDev = !app.isPackaged;
const devServerUrl = process.env.VITE_DEV_SERVER_URL ?? 'http://localhost:5173';
const appIconPath = path.join(__dirname, '../build/icon/traccion-icon.ico');

function createContextMenu(mainWindow: BrowserWindow): void {
  mainWindow.webContents.on('context-menu', (_event, params) => {
    const template: MenuItemConstructorOptions[] = [
      { role: 'cut', enabled: params.isEditable },
      { role: 'copy', enabled: params.selectionText.length > 0 },
      { role: 'paste', enabled: params.isEditable },
      { type: 'separator' },
      { role: 'selectAll' },
    ];

    Menu.buildFromTemplate(template).popup({ window: mainWindow });
  });
}

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1180,
    minHeight: 720,
    title: 'TrAccion',
    backgroundColor: '#D9EDF2',
    icon: appIconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  createContextMenu(mainWindow);

  if (isDev) {
    mainWindow.loadURL(devServerUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

interface OutlookDraftPayload {
  subject: string;
  html: string;
  to: string[];
  cc: string[];
}

interface OutlookDraftResult {
  ok: boolean;
  message: string;
}

function normalizeRecipientList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item).trim())
      .filter(Boolean)
      .slice(0, 200);
  }

  if (typeof value === 'string') {
    return value
      .split(/[;,]/)
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 200);
  }

  return [];
}

function normalizeMailDraftPayload(value: unknown): OutlookDraftPayload | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Partial<OutlookDraftPayload> & { htmlBody?: unknown };
  const subject = typeof candidate.subject === 'string' ? candidate.subject.trim() : '';
  const htmlSource = typeof candidate.html === 'string' ? candidate.html : candidate.htmlBody;
  const html = typeof htmlSource === 'string' ? htmlSource : '';
  const to = normalizeRecipientList(candidate.to);
  const cc = normalizeRecipientList(candidate.cc);

  if (
    !subject ||
    !html ||
    !to.length ||
    subject.length > 255 ||
    html.length > 100_000 ||
    to.length > 200 ||
    cc.length > 200
  ) {
    return null;
  }

  return { subject, html, to, cc };
}

function psLiteral(value: string): string {
  return `'${String(value || '').replace(/'/g, "''")}'`;
}

function buildOutlookDraftPowerShellScript(payload: OutlookDraftPayload): string {
  return [
    "$ErrorActionPreference = 'Stop'",
    "$outlook = New-Object -ComObject Outlook.Application",
    '$mail = $outlook.CreateItem(0)',
    '$mail.BodyFormat = 2',
    `$mail.Subject = ${psLiteral(payload.subject)}`,
    `$mail.To = ${psLiteral(payload.to.join(';'))}`,
    `$mail.CC = ${psLiteral(payload.cc.join(';'))}`,
    `$mail.HTMLBody = ${psLiteral(payload.html)}`,
    '$mail.Display()',
    "Write-Output 'OK_DRAFT_DISPLAYED'",
  ].join('\n');
}

function buildOutlookDraftVbs(payload: OutlookDraftPayload): string {
  const escapeVbs = (value: string) => String(value || '').replace(/"/g, '""');
  return [
    'Set OutlookApp = CreateObject("Outlook.Application")',
    'Set Mail = OutlookApp.CreateItem(0)',
    'Mail.BodyFormat = 2',
    `Mail.Subject = "${escapeVbs(payload.subject)}"`,
    `Mail.To = "${escapeVbs(payload.to.join(';'))}"`,
    payload.cc.length ? `Mail.CC = "${escapeVbs(payload.cc.join(';'))}"` : '',
    `Mail.HTMLBody = "${escapeVbs(payload.html)}"`,
    'Mail.Display',
  ]
    .filter(Boolean)
    .join('\r\n');
}

async function runOutlookPowerShell(payload: OutlookDraftPayload): Promise<void> {
  const script = buildOutlookDraftPowerShellScript(payload);
  const encoded = Buffer.from(script, 'utf16le').toString('base64');

  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
      { windowsHide: true },
    );
    let stderr = '';
    let stdout = '';
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      child.kill();
      reject(new Error('Outlook no respondió al intentar crear el borrador.'));
    }, 15_000);

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      if (code === 0 && stdout.includes('OK_DRAFT_DISPLAYED')) {
        resolve();
        return;
      }
      reject(
        new Error(
          stderr.trim() || stdout.trim() || `PowerShell terminó con código ${code ?? 'desconocido'}.`,
        ),
      );
    });
  });
}

async function runOutlookVbs(payload: OutlookDraftPayload): Promise<void> {
  const stamp = `${Date.now()}-${Math.round(Math.random() * 1_000_000)}`;
  const scriptPath = path.join(tmpdir(), `traccion-especiales-${stamp}.vbs`);

  try {
    await writeFile(scriptPath, buildOutlookDraftVbs(payload), 'utf8');
    await new Promise<void>((resolve, reject) => {
      const child = spawn('cscript.exe', ['//NoLogo', scriptPath], { windowsHide: true });
      let stderr = '';

      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString('utf8');
      });
      child.on('error', reject);
      child.on('close', (code) => {
        if (code === 0) {
          resolve();
          return;
        }
        reject(new Error(stderr.trim() || `cscript terminó con código ${code ?? 'desconocido'}.`));
      });
    });
  } finally {
    await rm(scriptPath, { force: true });
  }
}

async function createOutlookDraft(payload: unknown): Promise<OutlookDraftResult> {
  if (process.platform !== 'win32') {
    return { ok: false, message: 'La automatización de Outlook solo está disponible en Windows.' };
  }

  const safePayload = normalizeMailDraftPayload(payload);
  if (!safePayload) {
    return { ok: false, message: 'Faltan datos obligatorios para crear el borrador de Outlook.' };
  }

  try {
    await runOutlookPowerShell(safePayload);
    return { ok: true, message: 'Borrador creado en Outlook.' };
  } catch (powerShellError) {
    try {
      await runOutlookVbs(safePayload);
      return { ok: true, message: 'Borrador creado en Outlook.' };
    } catch (vbsError) {
      const powerShellMessage =
        powerShellError instanceof Error ? powerShellError.message : 'error desconocido';
      const vbsMessage = vbsError instanceof Error ? vbsError.message : 'error desconocido';
      return {
        ok: false,
        message: `Falló PowerShell y fallback VBS: ${powerShellMessage} / ${vbsMessage}`,
      };
    }
  }
}

function assertDocxPath(filePath: string): void {
  if (path.extname(filePath).toLowerCase() !== '.docx') {
    throw new Error('La ruta configurada debe apuntar a un archivo DOCX.');
  }
}

function registerIpcHandlers(): void {
  ipcMain.handle('database:status', () => ({
    ready: false,
    engine: 'better-sqlite3',
    phase: 'prepared',
  }));

  ipcMain.handle('teletrabajo:select-template', async (event) => {
    const browserWindow = BrowserWindow.fromWebContents(event.sender);
    const options: OpenDialogOptions = {
      title: 'Seleccionar plantilla de Teletrabajo',
      properties: ['openFile'],
      filters: [{ name: 'Documento Word', extensions: ['docx'] }],
    };
    const result = browserWindow
      ? await dialog.showOpenDialog(browserWindow, options)
      : await dialog.showOpenDialog(options);

    if (result.canceled) {
      return null;
    }

    return result.filePaths[0] ?? null;
  });

  ipcMain.handle('teletrabajo:read-template', async (_event, filePath: string) => {
    assertDocxPath(filePath);
    const fileBuffer = await readFile(filePath);
    return fileBuffer.buffer.slice(
      fileBuffer.byteOffset,
      fileBuffer.byteOffset + fileBuffer.byteLength,
    );
  });

  ipcMain.handle('especiales:create-outlook-draft', async (_event, payload: unknown) =>
    createOutlookDraft(payload),
  );
}

app.whenReady().then(() => {
  app.setAppUserModelId('com.metro.rrll.traccion');
  Menu.setApplicationMenu(null);
  registerIpcHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
