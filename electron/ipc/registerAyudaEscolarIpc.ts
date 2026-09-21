import { BrowserWindow, dialog, ipcMain, type OpenDialogOptions } from 'electron';
import { spawn } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

interface SchoolHelpInspection {
  senderName: string;
  senderEmail: string;
  subject: string;
  receivedAt: string;
  attachments: Array<{ name: string; size: number }>;
}

interface SchoolHelpResult {
  ok: boolean;
  message: string;
  inspection?: SchoolHelpInspection;
  files?: Array<{ originalName: string; savedName: string; savedPath: string }>;
}

interface SchoolHelpArchivePayload {
  fileName: string;
  buffer: ArrayBuffer;
  basePath: string;
  employeeName: string;
}

function sanitizeFileStem(value: string): string {
  return value
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '')
    .trim()
    .slice(0, 120) || 'Persona';
}

function isArrayBufferLike(value: unknown): value is ArrayBuffer {
  return value instanceof ArrayBuffer || ArrayBuffer.isView(value);
}

async function runPowerShellJson(script: string, args: string[]): Promise<unknown> {
  const stamp = `${Date.now()}-${Math.round(Math.random() * 1_000_000)}`;
  const scriptPath = path.join(tmpdir(), `traccion-school-help-${stamp}.ps1`);
  await writeFile(scriptPath, script, 'utf8');
  try {
    const output = await new Promise<string>((resolve, reject) => {
      const child = spawn('powershell.exe', [
        '-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, ...args,
      ]);
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8'); });
      child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8'); });
      child.on('error', reject);
      child.on('close', (code) => {
        if (code === 0) resolve(stdout.trim());
        else reject(new Error(stderr.trim() || stdout.trim() || `PowerShell terminó con código ${code ?? 'desconocido'}.`));
      });
    });
    return output ? JSON.parse(output) : null;
  } finally {
    await rm(scriptPath, { force: true });
  }
}

const SCHOOL_HELP_INSPECT_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
$msgPath = $args[0]
$outlook = New-Object -ComObject Outlook.Application
$mail = $outlook.Session.OpenSharedItem($msgPath)
try {
  $smtp = [string]$mail.SenderEmailAddress
  try {
    if ([string]$mail.SenderEmailType -eq 'EX') {
      $exUser = $mail.Sender.GetExchangeUser()
      if ($null -ne $exUser -and $exUser.PrimarySmtpAddress) { $smtp = [string]$exUser.PrimarySmtpAddress }
    }
  } catch {}
  $attachments = @()
  for ($i = 1; $i -le $mail.Attachments.Count; $i++) {
    $att = $mail.Attachments.Item($i)
    $attachments += [PSCustomObject]@{ name = [string]$att.FileName; size = [int64]$att.Size }
  }
  [PSCustomObject]@{
    senderName = [string]$mail.SenderName
    senderEmail = $smtp
    subject = [string]$mail.Subject
    receivedAt = if ($mail.ReceivedTime) { $mail.ReceivedTime.ToString('o') } else { '' }
    attachments = $attachments
  } | ConvertTo-Json -Depth 5 -Compress
} finally {
  try { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($mail) } catch {}
  try { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($outlook) } catch {}
}
`;

const SCHOOL_HELP_ARCHIVE_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
$msgPath = $args[0]
$basePath = $args[1]
$stem = $args[2]
$outlook = New-Object -ComObject Outlook.Application
$mail = $outlook.Session.OpenSharedItem($msgPath)
try {
  if (-not (Test-Path -LiteralPath $basePath)) { New-Item -ItemType Directory -Path $basePath -Force | Out-Null }
  $blocked = @('.exe','.com','.bat','.cmd','.ps1','.vbs','.js','.jse','.msi','.scr','.pif')
  $saved = @()
  $nextIndex = 1
  $escapedStem = [Regex]::Escape($stem)
  Get-ChildItem -LiteralPath $basePath -File -ErrorAction SilentlyContinue | ForEach-Object {
    $baseName = [IO.Path]::GetFileNameWithoutExtension($_.Name)
    if ($baseName -eq $stem) { $nextIndex = [Math]::Max($nextIndex, 2) }
    elseif ($baseName -match ('^' + $escapedStem + ' (\d+)$')) { $nextIndex = [Math]::Max($nextIndex, ([int]$Matches[1]) + 1) }
  }
  for ($i = 1; $i -le $mail.Attachments.Count; $i++) {
    $att = $mail.Attachments.Item($i)
    $original = [string]$att.FileName
    $ext = [IO.Path]::GetExtension($original)
    if ($blocked -contains $ext.ToLowerInvariant()) { continue }
    do {
      $suffix = if ($nextIndex -eq 1) { '' } else { ' ' + $nextIndex }
      $savedName = $stem + $suffix + $ext
      $savedPath = Join-Path $basePath $savedName
      $nextIndex++
    } while (Test-Path -LiteralPath $savedPath)
    $att.SaveAsFile($savedPath)
    $saved += [PSCustomObject]@{ originalName = $original; savedName = $savedName; savedPath = $savedPath }
  }
  $saved | ConvertTo-Json -Depth 4 -Compress
} finally {
  try { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($mail) } catch {}
  try { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($outlook) } catch {}
}
`;

async function withTemporaryMsg(
  fileName: string,
  buffer: ArrayBuffer,
  action: (msgPath: string) => Promise<unknown>,
): Promise<unknown> {
  const safeName = path.basename(fileName || 'correo.msg').replace(/[^A-Za-z0-9._ -]/g, '_');
  if (path.extname(safeName).toLowerCase() !== '.msg') throw new Error('El correo debe estar en formato .msg.');
  const tempDirectory = path.join(tmpdir(), `traccion-school-help-${Date.now()}-${Math.round(Math.random() * 1_000_000)}`);
  await mkdir(tempDirectory, { recursive: true });
  const msgPath = path.join(tempDirectory, safeName);
  await writeFile(msgPath, Buffer.from(buffer));
  try { return await action(msgPath); }
  finally { await rm(tempDirectory, { recursive: true, force: true }); }
}

async function inspectSchoolHelpMessage(fileName: string, buffer: ArrayBuffer): Promise<SchoolHelpResult> {
  if (process.platform !== 'win32') return { ok: false, message: 'La lectura de Outlook solo está disponible en Windows.' };
  if (!isArrayBufferLike(buffer)) return { ok: false, message: 'El contenido del correo no es válido.' };
  try {
    const data = await withTemporaryMsg(fileName, buffer, (msgPath) => runPowerShellJson(SCHOOL_HELP_INSPECT_SCRIPT, [msgPath]));
    if (!data || typeof data !== 'object') throw new Error('Outlook no ha devuelto datos del mensaje.');
    const raw = data as Record<string, unknown>;
    const attachmentValue = raw.attachments;
    const attachmentArray = Array.isArray(attachmentValue) ? attachmentValue : attachmentValue ? [attachmentValue] : [];
    const inspection: SchoolHelpInspection = {
      senderName: String(raw.senderName ?? '').trim(),
      senderEmail: String(raw.senderEmail ?? '').trim(),
      subject: String(raw.subject ?? '').trim(),
      receivedAt: String(raw.receivedAt ?? '').trim(),
      attachments: attachmentArray.map((item) => {
        const attachment = item as Record<string, unknown>;
        return { name: String(attachment.name ?? 'adjunto'), size: Number(attachment.size ?? 0) };
      }),
    };
    return { ok: true, message: 'Correo leído correctamente.', inspection };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'No se ha podido leer el correo de Outlook.' };
  }
}

async function archiveSchoolHelpMessage(payload: SchoolHelpArchivePayload): Promise<SchoolHelpResult> {
  if (process.platform !== 'win32') return { ok: false, message: 'El archivado de Outlook solo está disponible en Windows.' };
  if (!payload || typeof payload.fileName !== 'string' || !isArrayBufferLike(payload.buffer) || typeof payload.basePath !== 'string' || typeof payload.employeeName !== 'string') {
    return { ok: false, message: 'Datos de archivado no válidos.' };
  }
  const basePath = payload.basePath.trim();
  if (!basePath) return { ok: false, message: 'Configura primero la carpeta de Ayuda escolar.' };
  const employeeName = sanitizeFileStem(payload.employeeName);
  try {
    const raw = await withTemporaryMsg(payload.fileName, payload.buffer, (msgPath) => runPowerShellJson(SCHOOL_HELP_ARCHIVE_SCRIPT, [msgPath, basePath, employeeName]));
    const list = raw == null ? [] : Array.isArray(raw) ? raw : [raw];
    const files = list.map((item) => {
      const file = item as Record<string, unknown>;
      return { originalName: String(file.originalName ?? ''), savedName: String(file.savedName ?? ''), savedPath: String(file.savedPath ?? '') };
    }).filter((file) => file.savedPath);
    if (!files.length) return { ok: false, message: 'El correo no contiene adjuntos archivables.' };
    return { ok: true, message: 'Documentación archivada correctamente.', files };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'No se ha podido guardar la documentación.' };
  }
}

export function registerAyudaEscolarIpc(): void {
  ipcMain.handle('ayuda-escolar:select-folder', async (event) => {
    const browserWindow = BrowserWindow.fromWebContents(event.sender);
    const options: OpenDialogOptions = { title: 'Seleccionar carpeta de Ayuda escolar', properties: ['openDirectory', 'createDirectory'] };
    const result = browserWindow ? await dialog.showOpenDialog(browserWindow, options) : await dialog.showOpenDialog(options);
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });
  ipcMain.handle('ayuda-escolar:inspect-message', async (_event, fileName: string, buffer: ArrayBuffer) => inspectSchoolHelpMessage(fileName, buffer));
  ipcMain.handle('ayuda-escolar:archive-message', async (_event, payload: SchoolHelpArchivePayload) => archiveSchoolHelpMessage(payload));
}
