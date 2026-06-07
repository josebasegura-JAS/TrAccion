import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron';
import type { MenuItemConstructorOptions, OpenDialogOptions } from 'electron';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { normalizeOutlookMsgPayload, parseOutlookMsgBuffer } from './msgParser.js';
import {
  acquireRecordLock,
  changeSqliteDirectory,
  closeSqlitePersistence,
  createLocalStorageBackup,
  getRecordLock,
  getSqliteStatus,
  heartbeatRecordLock,
  initializeSqlitePersistence,
  loadPersistedRecordsSnapshot,
  getPersistedRecordsTokenSnapshot,
  migrateLocalStorageSnapshot,
  releaseRecordLock,
  resetSqliteDirectory,
  savePersistedRecord,
} from './sqlitePersistence.js';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isDev = !app.isPackaged;
const devServerUrl = process.env.VITE_DEV_SERVER_URL ?? 'http://localhost:5173';
const appIconPath = path.join(__dirname, '../build/icon/traccion-icon-256.ico');

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
      preload: path.join(__dirname, 'preload.cjs'),
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

function powerShellStringLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function vbsStringLiteral(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function buildOutlookDraftPowerShellScript(payloadPath: string): string {
  return [
    "$ErrorActionPreference = 'Stop'",
    `$payload = Get-Content -LiteralPath ${powerShellStringLiteral(payloadPath)} -Raw -Encoding UTF8 | ConvertFrom-Json`,
    '$outlook = New-Object -ComObject Outlook.Application',
    '$mail = $outlook.CreateItem(0)',
    '$mail.BodyFormat = 2',
    '$mail.Subject = [string]$payload.subject',
    '$mail.To = [string]$payload.to',
    '$mail.CC = [string]$payload.cc',
    '$mail.HTMLBody = [string]$payload.html',
    '$mail.Display() | Out-Null',
    "Write-Output 'OK_DRAFT_DISPLAYED'",
  ].join('\n');
}

function buildOutlookDraftVbs(payloadPath: string): string {
  const jsonPath = vbsStringLiteral(payloadPath);
  return [
    'Option Explicit',
    'Dim Stream, Json, Payload, OutlookApp, Mail',
    'Set Stream = CreateObject("ADODB.Stream")',
    'Stream.Type = 2',
    'Stream.Charset = "utf-8"',
    'Stream.Open',
    `Stream.LoadFromFile ${jsonPath}`,
    'Json = Stream.ReadText',
    'Stream.Close',
    'Set Payload = ParseJsonObject(Json)',
    'Set OutlookApp = CreateObject("Outlook.Application")',
    'Set Mail = OutlookApp.CreateItem(0)',
    'Mail.BodyFormat = 2',
    'Mail.Subject = Payload("subject")',
    'Mail.To = Payload("to")',
    'Mail.CC = Payload("cc")',
    'Mail.HTMLBody = Payload("html")',
    'Mail.Display',
    '',
    'Function ParseJsonObject(ByVal Text)',
    '  Dim ScriptControl',
    '  Set ScriptControl = CreateObject("MSScriptControl.ScriptControl")',
    '  ScriptControl.Language = "JScript"',
    '  Set ParseJsonObject = ScriptControl.Eval("(" & Text & ")")',
    'End Function',
  ].join('\r\n');
}

async function withOutlookDraftTempFiles<T>(
  payload: OutlookDraftPayload,
  extension: 'ps1' | 'vbs',
  buildScript: (payloadPath: string) => string,
  runScript: (scriptPath: string) => Promise<T>,
): Promise<T> {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'traccion-especiales-'));
  const payloadPath = path.join(tempRoot, `${randomUUID()}.json`);
  const scriptPath = path.join(tempRoot, `${randomUUID()}.${extension}`);
  const serializedPayload = JSON.stringify({
    subject: payload.subject,
    html: payload.html,
    to: payload.to.join(';'),
    cc: payload.cc.join(';'),
  });

  try {
    await writeFile(payloadPath, serializedPayload, 'utf8');
    await writeFile(scriptPath, buildScript(payloadPath), 'utf8');
    return await runScript(scriptPath);
  } finally {
    await rm(tempRoot, { force: true, recursive: true });
  }
}

async function runOutlookPowerShell(payload: OutlookDraftPayload): Promise<void> {
  await withOutlookDraftTempFiles(
    payload,
    'ps1',
    buildOutlookDraftPowerShellScript,
    async (scriptPath) => {
      await new Promise<void>((resolve, reject) => {
        const child = spawn(
          'powershell.exe',
          ['-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-File', scriptPath],
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
              stderr.trim() ||
                stdout.trim() ||
                `PowerShell terminó con código ${code ?? 'desconocido'}.`,
            ),
          );
        });
      });
    },
  );
}

async function runOutlookVbs(payload: OutlookDraftPayload): Promise<void> {
  await withOutlookDraftTempFiles(payload, 'vbs', buildOutlookDraftVbs, async (scriptPath) => {
    await new Promise<void>((resolve, reject) => {
      const child = spawn('cscript.exe', ['//NoLogo', scriptPath], { windowsHide: true });
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
          return;
        }
        reject(
          new Error(
            stderr.trim() ||
              stdout.trim() ||
              `cscript terminó con código ${code ?? 'desconocido'}.`,
          ),
        );
      });
    });
  });
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

function normalizeDocxOutputPayload(payload: unknown): { buffer: Buffer; fileName: string } {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Documento Word no válido.');
  }

  const candidate = payload as { buffer?: unknown; fileName?: unknown };
  if (typeof candidate.fileName !== 'string' || !candidate.fileName.trim()) {
    throw new Error('Nombre del documento Word no válido.');
  }

  const fileName = path
    .basename(candidate.fileName)
    .replace(/[<>:"/\\|?*]/g, '_')
    .split('')
    .map((character) => (character.charCodeAt(0) < 32 ? '_' : character))
    .join('');
  const rawBuffer = candidate.buffer;
  if (rawBuffer instanceof ArrayBuffer) {
    return { buffer: Buffer.from(rawBuffer), fileName };
  }

  if (ArrayBuffer.isView(rawBuffer)) {
    return {
      buffer: Buffer.from(rawBuffer.buffer, rawBuffer.byteOffset, rawBuffer.byteLength),
      fileName,
    };
  }

  throw new Error('Contenido del documento Word no válido.');
}

async function openTeletrabajoWord(payload: unknown): Promise<{ ok: boolean; message: string }> {
  try {
    const { buffer, fileName } = normalizeDocxOutputPayload(payload);
    const directory = await mkdtemp(path.join(tmpdir(), 'traccion-teletrabajo-'));
    const filePath = path.join(
      directory,
      fileName.toLowerCase().endsWith('.docx') ? fileName : `${fileName}.docx`,
    );
    await writeFile(filePath, buffer);
    const openError = await shell.openPath(filePath);

    if (openError) {
      return { ok: false, message: openError };
    }

    return { ok: true, message: 'Word abierto para revisión.' };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'No se ha podido abrir el Word generado.',
    };
  }
}

function assertDocxPath(filePath: string): void {
  if (path.extname(filePath).toLowerCase() !== '.docx') {
    throw new Error('La ruta configurada debe apuntar a un archivo DOCX.');
  }
}


function normalizeRecordLockPayload(payload: unknown): { module: string; recordId: string } | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const candidate = payload as { module?: unknown; recordId?: unknown };
  if (typeof candidate.module !== 'string' || typeof candidate.recordId !== 'string') {
    return null;
  }

  const moduleName = candidate.module.trim();
  const recordId = candidate.recordId.trim();
  if (!moduleName || !recordId) {
    return null;
  }

  return { module: moduleName, recordId };
}

function registerIpcHandlers(): void {
  ipcMain.handle('database:status', () => getSqliteStatus());

  ipcMain.handle('database:select-directory', async (event) => {
    const browserWindow = BrowserWindow.fromWebContents(event.sender);
    const options: OpenDialogOptions = {
      title: 'Seleccionar carpeta para la base SQLite de TrAccion',
      properties: ['openDirectory', 'createDirectory'],
    };
    const result = browserWindow
      ? await dialog.showOpenDialog(browserWindow, options)
      : await dialog.showOpenDialog(options);

    if (result.canceled) {
      return getSqliteStatus();
    }

    const selectedDirectory = result.filePaths[0];
    if (!selectedDirectory) {
      return getSqliteStatus();
    }

    return changeSqliteDirectory(selectedDirectory);
  });

  ipcMain.handle('database:reset-directory', () => resetSqliteDirectory());

  ipcMain.handle('database:load-persisted-records', () => loadPersistedRecordsSnapshot());

  ipcMain.handle('database:get-persisted-records-token', () => getPersistedRecordsTokenSnapshot());

  ipcMain.handle('database:backup-local-storage', (_event, payload: unknown) => {
    if (
      !payload ||
      typeof payload !== 'object' ||
      !Array.isArray((payload as { records?: unknown }).records)
    ) {
      return getSqliteStatus();
    }

    return createLocalStorageBackup(payload as { records: { key: string; value: string }[] });
  });

  ipcMain.handle('database:migrate-local-storage', (_event, payload: unknown) => {
    if (
      !payload ||
      typeof payload !== 'object' ||
      !Array.isArray((payload as { records?: unknown }).records)
    ) {
      return getSqliteStatus();
    }

    return migrateLocalStorageSnapshot(payload as { records: { key: string; value: string }[] });
  });

  ipcMain.handle('database:save-local-storage-record', (_event, payload: unknown) => {
    if (!payload || typeof payload !== 'object') {
      return getSqliteStatus();
    }

    const candidate = payload as { key?: unknown; value?: unknown };
    if (typeof candidate.key !== 'string' || typeof candidate.value !== 'string') {
      return getSqliteStatus();
    }

    return savePersistedRecord({ key: candidate.key, value: candidate.value });
  });


  ipcMain.handle('recordLock:acquire', (_event, payload: unknown) => {
    const normalized = normalizeRecordLockPayload(payload);
    return normalized
      ? acquireRecordLock(normalized)
      : { ok: false, status: 'error', lock: null, message: 'Identificador de bloqueo inválido.' };
  });

  ipcMain.handle('recordLock:heartbeat', (_event, payload: unknown) => {
    const normalized = normalizeRecordLockPayload(payload);
    return normalized
      ? heartbeatRecordLock(normalized)
      : { ok: false, status: 'error', lock: null, message: 'Identificador de bloqueo inválido.' };
  });

  ipcMain.handle('recordLock:release', (_event, payload: unknown) => {
    const normalized = normalizeRecordLockPayload(payload);
    return normalized
      ? releaseRecordLock(normalized)
      : { ok: false, status: 'error', lock: null, message: 'Identificador de bloqueo inválido.' };
  });

  ipcMain.handle('recordLock:get', (_event, payload: unknown) => {
    const normalized = normalizeRecordLockPayload(payload);
    return normalized
      ? getRecordLock(normalized)
      : { ok: false, status: 'error', lock: null, message: 'Identificador de bloqueo inválido.' };
  });

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

  ipcMain.handle('teletrabajo:open-word', async (_event, payload: unknown) =>
    openTeletrabajoWord(payload),
  );

  ipcMain.handle('especiales:create-outlook-draft', async (_event, payload: unknown) =>
    createOutlookDraft(payload),
  );

  ipcMain.handle('msg:parseOutlookMsg', async (_event, payload: unknown) => {
    try {
      const buffer = normalizeOutlookMsgPayload(payload);
      if (!buffer?.length) {
        return { ok: false, message: 'Contenido .msg no válido.' };
      }

      return parseOutlookMsgBuffer(buffer);
    } catch (error) {
      console.error('Error parseando .msg:', error);
      return { ok: false, message: 'No se ha podido importar el mensaje .msg.' };
    }
  });
}

app.whenReady().then(async () => {
  app.setAppUserModelId('com.metro.rrll.traccion');
  Menu.setApplicationMenu(null);
  await initializeSqlitePersistence();
  registerIpcHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('before-quit', () => {
  closeSqlitePersistence().catch(() => undefined);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
