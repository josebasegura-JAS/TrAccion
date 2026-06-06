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

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isOutlookDraftPayload(value: unknown): value is OutlookDraftPayload {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<OutlookDraftPayload>;
  return (
    typeof candidate.subject === 'string' &&
    typeof candidate.html === 'string' &&
    isStringArray(candidate.to) &&
    isStringArray(candidate.cc) &&
    candidate.subject.length <= 255 &&
    candidate.html.length <= 100_000 &&
    candidate.to.length <= 200 &&
    candidate.cc.length <= 200
  );
}

function sanitizeMailDraft(payload: OutlookDraftPayload): OutlookDraftPayload {
  return {
    subject: payload.subject.trim(),
    html: payload.html,
    to: payload.to.map((recipient) => recipient.trim()).filter(Boolean),
    cc: payload.cc.map((recipient) => recipient.trim()).filter(Boolean),
  };
}

async function createOutlookDraft(payload: unknown): Promise<OutlookDraftResult> {
  if (process.platform !== 'win32') {
    return { ok: false, message: 'La automatización de Outlook solo está disponible en Windows.' };
  }

  if (!isOutlookDraftPayload(payload)) {
    return { ok: false, message: 'Datos de correo no válidos.' };
  }

  const safePayload = sanitizeMailDraft(payload);
  const stamp = `${Date.now()}-${Math.round(Math.random() * 1_000_000)}`;
  const jsonPath = path.join(tmpdir(), `traccion-especiales-${stamp}.json`);
  const scriptPath = path.join(tmpdir(), `traccion-especiales-${stamp}.ps1`);
  const script = `
$ErrorActionPreference = 'Stop'
$payload = Get-Content -Raw -LiteralPath $args[0] | ConvertFrom-Json
$outlook = New-Object -ComObject Outlook.Application
$mail = $outlook.CreateItem(0)
$mail.BodyFormat = 2
$mail.Subject = [string]$payload.subject
$mail.To = [string]::Join(';', @($payload.to))
$mail.CC = [string]::Join(';', @($payload.cc))
$mail.HTMLBody = [string]$payload.html
$mail.Display()
`;

  try {
    await writeFile(jsonPath, JSON.stringify(safePayload), 'utf8');
    await writeFile(scriptPath, script, 'utf8');

    await new Promise<void>((resolve, reject) => {
      const child = spawn('powershell.exe', [
        '-NoProfile',
        '-STA',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        scriptPath,
        jsonPath,
      ]);
      let stderr = '';
      let stdout = '';

      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString('utf8');
      });
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString('utf8');
      });
      child.on('error', reject);
      child.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(
            new Error(
              stderr.trim() ||
                stdout.trim() ||
                `PowerShell terminó con código ${code ?? 'desconocido'}.`,
            ),
          );
        }
      });
    });

    return { ok: true, message: 'Borrador creado en Outlook.' };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido al abrir Outlook.';
    return { ok: false, message };
  } finally {
    await Promise.allSettled([rm(jsonPath, { force: true }), rm(scriptPath, { force: true })]);
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
