import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron';
import type {
  IpcMainEvent,
  IpcMainInvokeEvent,
  MenuItemConstructorOptions,
  OpenDialogOptions,
} from 'electron';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { inflateRawSync } from 'node:zlib';
import { normalizeOutlookMsgPayload, parseOutlookMsgBuffer } from './msgParser.js';
import {
  acquireRecordLock,
  changeSqliteDirectory,
  closeSqlitePersistence,
  createLocalStorageBackup,
  getPersistedRecordSnapshot,
  getRecordLock,
  getSqliteStatus,
  heartbeatRecordLock,
  initializeSqlitePersistence,
  listLocalBackups,
  loadPersistedRecordsSnapshot,
  getPersistedRecordsTokenSnapshot,
  migrateLocalStorageSnapshot,
  releaseRecordLock,
  resetSqliteDirectory,
  restoreLocalBackup,
  savePersistedRecord,
  savePersistedRecordIfUnchanged,
  setDatabaseConnectivityIssueNotifier,
} from './sqlitePersistence.js';
import { spawn } from 'node:child_process';
import { tmpdir, userInfo } from 'node:os';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isDev = !app.isPackaged;
const devServerUrl = process.env.VITE_DEV_SERVER_URL ?? 'http://localhost:5173';
const appIconPath = path.join(__dirname, '../build/icon/traccion-icon-256.ico');
const splashHtmlPath = path.join(__dirname, '../build/icon/splash.html');
const splashMinimumVisibleMs = 1_400;
const splashMaximumVisibleMs = 25_000;

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

function createSplashWindow(): BrowserWindow {
  const splashWindow = new BrowserWindow({
    width: 460,
    height: 360,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    closable: true,
    frame: false,
    show: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    title: 'Cargando TrAccion',
    backgroundColor: '#0F1F2A',
    icon: appIconPath,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  splashWindow.center();
  splashWindow.loadFile(splashHtmlPath).catch(() => undefined);

  return splashWindow;
}

function waitForSplashPaint(splashWindow: BrowserWindow, timeoutMs = 700): Promise<void> {
  if (splashWindow.isDestroyed()) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) {
        return;
      }
      settled = true;
      setTimeout(resolve, 60);
    };

    const timeout = setTimeout(finish, timeoutMs);
    splashWindow.webContents.once('did-finish-load', () => {
      clearTimeout(timeout);
      finish();
    });
    splashWindow.webContents.once('did-fail-load', () => {
      clearTimeout(timeout);
      finish();
    });
  });
}

function closeSplashAndShowMain(
  splashWindow: BrowserWindow | null,
  mainWindow: BrowserWindow,
): void {
  if (!mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
  }

  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.close();
  }
}

function showMainAfterSplash(
  splashWindow: BrowserWindow | null,
  mainWindow: BrowserWindow,
  splashStartedAt: number,
): void {
  const elapsedMs = Date.now() - splashStartedAt;
  const remainingMs = Math.max(0, splashMinimumVisibleMs - elapsedMs);

  setTimeout(() => closeSplashAndShowMain(splashWindow, mainWindow), remainingMs);
}

function createWindow(
  splashWindow: BrowserWindow | null = null,
  splashStartedAt = Date.now(),
): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1180,
    minHeight: 720,
    title: 'TrAccion',
    backgroundColor: '#D9EDF2',
    icon: appIconPath,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl);
    const isAllowedDevNavigation = isDev && navigationUrl.startsWith(devServerUrl);
    const isAllowedPackagedNavigation = !isDev && parsedUrl.protocol === 'file:';

    if (!isAllowedDevNavigation && !isAllowedPackagedNavigation) {
      event.preventDefault();
    }
  });

  createContextMenu(mainWindow);

  setDatabaseConnectivityIssueNotifier((payload) => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('database:connectivity-issue', payload);
    }
  });

  let hasRequestedMainWindowShow = false;
  const requestMainWindowShow = (): void => {
    if (hasRequestedMainWindowShow || mainWindow.isDestroyed()) {
      return;
    }

    hasRequestedMainWindowShow = true;
    clearTimeout(forceShowTimer);
    showMainAfterSplash(splashWindow, mainWindow, splashStartedAt);
  };

  const forceShowTimer: ReturnType<typeof setTimeout> = setTimeout(
    requestMainWindowShow,
    splashMaximumVisibleMs,
  );

  const onBootVisible = (event: IpcMainEvent): void => {
    if (event.sender !== mainWindow.webContents) {
      return;
    }

    requestMainWindowShow();
  };

  const onRendererReady = (event: IpcMainEvent): void => {
    if (event.sender !== mainWindow.webContents) {
      return;
    }

    requestMainWindowShow();
  };

  ipcMain.on('app:boot-visible', onBootVisible);
  ipcMain.on('app:renderer-ready', onRendererReady);

  mainWindow.once('closed', () => {
    clearTimeout(forceShowTimer);
    ipcMain.removeListener('app:boot-visible', onBootVisible);
    ipcMain.removeListener('app:renderer-ready', onRendererReady);
    setDatabaseConnectivityIssueNotifier(null);
  });

  if (isDev) {
    mainWindow.loadURL(devServerUrl).catch(() => {
      clearTimeout(forceShowTimer);
      showMainAfterSplash(splashWindow, mainWindow, splashStartedAt);
    });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html')).catch(() => {
      clearTimeout(forceShowTimer);
      showMainAfterSplash(splashWindow, mainWindow, splashStartedAt);
    });
  }

  return mainWindow;
}

interface ZipEntryContent {
  fileName: string;
  content: Buffer;
}

function findEndOfCentralDirectory(buffer: Buffer): number {
  for (let index = buffer.length - 22; index >= 0; index -= 1) {
    if (buffer.readUInt32LE(index) === 0x06054b50) {
      return index;
    }
  }

  throw new Error('El DOCX no contiene un directorio ZIP válido.');
}

function readZipEntry(buffer: Buffer, targetFileName: string): ZipEntryContent | null {
  const eocdOffset = findEndOfCentralDirectory(buffer);
  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);
  let offset = centralDirectoryOffset;

  for (let entryIndex = 0; entryIndex < entryCount; entryIndex += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error('Estructura ZIP no válida.');
    }

    const compressionMethod = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const fileName = buffer.toString('utf8', offset + 46, offset + 46 + fileNameLength);

    if (fileName === targetFileName) {
      if (buffer.readUInt32LE(localHeaderOffset) !== 0x04034b50) {
        throw new Error('Cabecera local ZIP no válida.');
      }

      const localFileNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
      const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
      const dataStart = localHeaderOffset + 30 + localFileNameLength + localExtraLength;
      const compressed = buffer.subarray(dataStart, dataStart + compressedSize);

      if (compressionMethod === 0) {
        return { fileName, content: compressed };
      }

      if (compressionMethod === 8) {
        return { fileName, content: inflateRawSync(compressed) };
      }

      throw new Error(`Método de compresión DOCX no soportado: ${compressionMethod}.`);
    }

    offset += 46 + fileNameLength + extraLength + commentLength;
  }

  return null;
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function extractTextFromDocxBuffer(buffer: Buffer): string {
  const documentEntry = readZipEntry(buffer, 'word/document.xml');
  if (!documentEntry) {
    throw new Error('El DOCX no contiene word/document.xml.');
  }

  const xml = documentEntry.content.toString('utf8');
  return decodeXmlEntities(
    xml
      .replace(/<w:tab\s*\/?>/g, '\t')
      .replace(/<w:br\s*\/?>/g, '\n')
      .replace(/<\/w:p>/g, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/\r/g, '')
      .split('\n')
      .map((line) => line.replace(/[ \t]+/g, ' ').trim())
      .filter(Boolean)
      .join('\n'),
  );
}

function normalizeDocxTextPayload(payload: unknown): Buffer {
  if (payload instanceof ArrayBuffer) {
    return Buffer.from(payload);
  }

  if (ArrayBuffer.isView(payload)) {
    return Buffer.from(payload.buffer, payload.byteOffset, payload.byteLength);
  }

  throw new Error('Contenido DOCX no válido.');
}

interface OutlookDraftPayload {
  subject: string;
  html: string;
  to: string[];
  cc: string[];
}

interface OutlookCalendarPayload {
  subject: string;
  date: string;
  startTime: string;
  endTime: string;
  requiredAttendees: string[];
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
    subject.length > 255 ||
    html.length > 100_000 ||
    to.length > 200 ||
    cc.length > 200
  ) {
    return null;
  }

  return { subject, html, to, cc };
}

function normalizeOutlookCalendarPayload(value: unknown): OutlookCalendarPayload | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Partial<OutlookCalendarPayload>;
  const subject = typeof candidate.subject === 'string' ? candidate.subject.trim() : '';
  const date = typeof candidate.date === 'string' ? candidate.date.trim() : '';
  const startTime = typeof candidate.startTime === 'string' ? candidate.startTime.trim() : '';
  const endTime = typeof candidate.endTime === 'string' ? candidate.endTime.trim() : '';
  const requiredAttendees = normalizeRecipientList(candidate.requiredAttendees);

  if (
    !subject ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !/^\d{2}:\d{2}$/.test(startTime) ||
    !/^\d{2}:\d{2}$/.test(endTime) ||
    subject.length > 255 ||
    requiredAttendees.length > 200
  ) {
    return null;
  }

  return { subject, date, startTime, endTime, requiredAttendees };
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

function buildOutlookCalendarPowerShellScript(payloadPath: string): string {
  return [
    "$ErrorActionPreference = 'Stop'",
    `$payload = Get-Content -LiteralPath ${powerShellStringLiteral(payloadPath)} -Raw -Encoding UTF8 | ConvertFrom-Json`,
    '$outlook = New-Object -ComObject Outlook.Application',
    '$appointment = $outlook.CreateItem(1)',
    '$appointment.Subject = [string]$payload.subject',
    '$appointment.Start = [datetime]::ParseExact(([string]$payload.date + \' \' + [string]$payload.startTime), \'yyyy-MM-dd HH:mm\', $null)',
    '$appointment.End = [datetime]::ParseExact(([string]$payload.date + \' \' + [string]$payload.endTime), \'yyyy-MM-dd HH:mm\', $null)',
    '$appointment.MeetingStatus = 1',
    'foreach ($attendee in @($payload.requiredAttendees)) { if ([string]$attendee) { $appointment.Recipients.Add([string]$attendee) | Out-Null } }',
    '$appointment.Display() | Out-Null',
    "Write-Output 'OK_APPOINTMENT_DISPLAYED'",
  ].join('\n');
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

async function withOutlookCalendarTempFiles<T>(
  payload: OutlookCalendarPayload,
  buildScript: (payloadPath: string) => string,
  runScript: (scriptPath: string) => Promise<T>,
): Promise<T> {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'traccion-actas-calendar-'));
  const payloadPath = path.join(tempRoot, `${randomUUID()}.json`);
  const scriptPath = path.join(tempRoot, `${randomUUID()}.ps1`);
  const serializedPayload = JSON.stringify(payload);

  try {
    await writeFile(payloadPath, serializedPayload, 'utf8');
    await writeFile(scriptPath, buildScript(payloadPath), 'utf8');
    return await runScript(scriptPath);
  } finally {
    await rm(tempRoot, { force: true, recursive: true });
  }
}

async function runOutlookCalendarPowerShell(payload: OutlookCalendarPayload): Promise<void> {
  await withOutlookCalendarTempFiles(payload, buildOutlookCalendarPowerShellScript, async (scriptPath) => {
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
        reject(new Error('Outlook no respondió al intentar crear la cita.'));
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
        if (code === 0 && stdout.includes('OK_APPOINTMENT_DISPLAYED')) {
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
  });
}

async function createOutlookCalendar(payload: unknown): Promise<OutlookDraftResult> {
  if (process.platform !== 'win32') {
    return { ok: false, message: 'La automatización de Outlook solo está disponible en Windows.' };
  }

  const safePayload = normalizeOutlookCalendarPayload(payload);
  if (!safePayload) {
    return { ok: false, message: 'Faltan datos obligatorios para crear la cita de Outlook.' };
  }

  try {
    await runOutlookCalendarPowerShell(safePayload);
    return { ok: true, message: 'Cita creada en Outlook.' };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'No se ha podido crear la cita de Outlook.',
    };
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

function normalizeExcelWorkbookPayload(payload: unknown): { buffer: Buffer; fileName: string } {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Libro Excel no válido.');
  }

  const candidate = payload as { buffer?: unknown; fileName?: unknown };
  if (typeof candidate.fileName !== 'string' || !candidate.fileName.trim()) {
    throw new Error('Nombre del Excel no válido.');
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

  throw new Error('Contenido del Excel no válido.');
}

async function openExcelWorkbook(payload: unknown): Promise<{ ok: boolean; message: string }> {
  try {
    const { buffer, fileName } = normalizeExcelWorkbookPayload(payload);
    const directory = await mkdtemp(path.join(tmpdir(), 'traccion-excel-'));
    const filePath = path.join(
      directory,
      fileName.toLowerCase().endsWith('.xlsx') ? fileName : `${fileName}.xlsx`,
    );
    await writeFile(filePath, buffer);
    const openError = await shell.openPath(filePath);

    if (openError) {
      return { ok: false, message: openError };
    }

    return { ok: true, message: 'Excel abierto para revisión.' };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'No se ha podido abrir el Excel generado.',
    };
  }
}

function assertDocxPath(filePath: string): void {
  if (path.extname(filePath).toLowerCase() !== '.docx') {
    throw new Error('La ruta configurada debe apuntar a un archivo DOCX.');
  }
}

const allowedTaskDocumentExtensions = new Set([
  '.doc',
  '.docx',
  '.pdf',
  '.xls',
  '.xlsx',
  '.xlsm',
  '.msg',
  '.eml',
  '.txt',
  '.rtf',
  '.odt',
  '.ods',
  '.ppt',
  '.pptx',
]);

function assertAllowedTaskDocumentPath(filePath: string): void {
  if (!allowedTaskDocumentExtensions.has(path.extname(filePath).toLowerCase())) {
    throw new Error('Tipo de documento no permitido para abrir desde TrAccion.');
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

async function selectTaskDocumentPaths(event: IpcMainInvokeEvent): Promise<string[] | null> {
  const browserWindow = BrowserWindow.fromWebContents(event.sender);
  const options: OpenDialogOptions = {
    title: 'Seleccionar documento para vincular a la tarea',
    properties: ['openFile', 'multiSelections'],
  };
  const result = browserWindow
    ? await dialog.showOpenDialog(browserWindow, options)
    : await dialog.showOpenDialog(options);

  return result.canceled ? null : result.filePaths;
}

async function openTaskDocumentPath(filePath: unknown): Promise<{ ok: boolean; message: string }> {
  if (typeof filePath !== 'string' || !filePath.trim()) {
    return { ok: false, message: 'Ruta de documento no válida.' };
  }

  const normalizedPath = filePath.trim();

  try {
    assertAllowedTaskDocumentPath(normalizedPath);
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Tipo de documento no permitido.',
    };
  }

  const openError = await shell.openPath(normalizedPath);
  if (openError) {
    return { ok: false, message: openError };
  }

  return { ok: true, message: 'Documento abierto.' };
}

function registerIpcHandlers(): void {
  ipcMain.handle('app:get-windows-user', () => {
    try {
      return userInfo().username || 'Usuario local';
    } catch {
      return 'Usuario local';
    }
  });

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

  ipcMain.handle('database:list-local-backups', () => listLocalBackups());

  ipcMain.handle('database:restore-local-backup', (_event, payload: unknown) => {
    if (!payload || typeof payload !== 'object') {
      return restoreLocalBackup('');
    }

    const candidate = payload as { id?: unknown };
    return restoreLocalBackup(typeof candidate.id === 'string' ? candidate.id : '');
  });

  ipcMain.handle('database:load-persisted-records', () => loadPersistedRecordsSnapshot());

  ipcMain.handle('database:get-persisted-record', (_event, payload: unknown) => {
    if (!payload || typeof payload !== 'object') {
      return { status: getSqliteStatus(), record: null };
    }

    const candidate = payload as { key?: unknown };
    if (typeof candidate.key !== 'string' || !candidate.key.trim()) {
      return { status: getSqliteStatus(), record: null };
    }

    return getPersistedRecordSnapshot(candidate.key);
  });

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

  ipcMain.handle('database:save-local-storage-record-if-unchanged', (_event, payload: unknown) => {
    if (!payload || typeof payload !== 'object') {
      return {
        ok: false,
        status: getSqliteStatus(),
        currentUpdatedAt: null,
        message: 'Payload de guardado inválido.',
      };
    }

    const candidate = payload as { key?: unknown; value?: unknown; expectedUpdatedAt?: unknown };
    if (
      typeof candidate.key !== 'string' ||
      typeof candidate.value !== 'string' ||
      (typeof candidate.expectedUpdatedAt !== 'string' && candidate.expectedUpdatedAt !== null)
    ) {
      return {
        ok: false,
        status: getSqliteStatus(),
        currentUpdatedAt: null,
        message: 'Payload de guardado inválido.',
      };
    }

    return savePersistedRecordIfUnchanged({
      key: candidate.key,
      value: candidate.value,
      expectedUpdatedAt: candidate.expectedUpdatedAt,
    });
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

  ipcMain.handle('tasks:select-document', (event) => selectTaskDocumentPaths(event));

  ipcMain.handle('tasks:open-document', (_event, filePath: unknown) =>
    openTaskDocumentPath(filePath),
  );

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

  ipcMain.handle('licencias-sin-sueldo:select-template', async (event) => {
    const browserWindow = BrowserWindow.fromWebContents(event.sender);
    const options: OpenDialogOptions = {
      title: 'Seleccionar plantilla de Licencia sin sueldo',
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

  ipcMain.handle('licencias-sin-sueldo:read-template', async (_event, filePath: string) => {
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

  ipcMain.handle('excel:open-workbook', async (_event, payload: unknown) =>
    openExcelWorkbook(payload),
  );

  ipcMain.handle('especiales:create-outlook-draft', async (_event, payload: unknown) =>
    createOutlookDraft(payload),
  );

  ipcMain.handle('actas:create-outlook-calendar', async (_event, payload: unknown) =>
    createOutlookCalendar(payload),
  );

  ipcMain.handle('docx:extract-text', async (_event, payload: unknown) => {
    try {
      return { ok: true, text: extractTextFromDocxBuffer(normalizeDocxTextPayload(payload)) };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : 'No se ha podido leer el documento Word.',
      };
    }
  });

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
  const splashStartedAt = Date.now();
  const splashWindow = createSplashWindow();
  await waitForSplashPaint(splashWindow);
  await initializeSqlitePersistence();
  registerIpcHandlers();
  createWindow(splashWindow, splashStartedAt);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

let isQuitAfterSqlitePersistenceClosed = false;

app.on('before-quit', (event) => {
  if (isQuitAfterSqlitePersistenceClosed) {
    return;
  }

  event.preventDefault();
  closeSqlitePersistence()
    .catch((error: unknown) => {
      console.warn('No se ha podido crear la copia de cierre antes de salir.', error);
    })
    .finally(() => {
      isQuitAfterSqlitePersistenceClosed = true;
      app.quit();
    });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
