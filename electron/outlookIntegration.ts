import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

/**
 * Automatización de Outlook para Especiales (borradores de correo) y Actas
 * (citas de calendario), vía PowerShell con fallback a VBS. Extraído de
 * main.ts: es un bloque autocontenido que solo necesita el payload de
 * entrada, sin depender del ciclo de vida de la app ni de otros módulos.
 */
interface OutlookDraftAttachment {
  fileName: string;
  buffer: Buffer;
}

interface OutlookDraftPayload {
  subject: string;
  html: string;
  to: string[];
  cc: string[];
  bcc: string[];
  attachments: OutlookDraftAttachment[];
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


function normalizeOutlookDraftAttachments(value: unknown): OutlookDraftAttachment[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.slice(0, 10).flatMap((item) => {
    if (!item || typeof item !== 'object') {
      return [];
    }

    const candidate = item as { fileName?: unknown; buffer?: unknown };
    if (typeof candidate.fileName !== 'string' || !candidate.fileName.trim()) {
      return [];
    }

    const fileName = path
      .basename(candidate.fileName)
      .replace(/[<>:"/\\|?*]/g, '_')
      .split('')
      .map((character) => (character.charCodeAt(0) < 32 ? '_' : character))
      .join('');

    const rawBuffer = candidate.buffer;
    if (rawBuffer instanceof ArrayBuffer) {
      return [{ fileName, buffer: Buffer.from(rawBuffer) }];
    }

    if (ArrayBuffer.isView(rawBuffer)) {
      return [
        {
          fileName,
          buffer: Buffer.from(rawBuffer.buffer, rawBuffer.byteOffset, rawBuffer.byteLength),
        },
      ];
    }

    return [];
  });
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
  const bcc = normalizeRecipientList(candidate.bcc);
  const attachments = normalizeOutlookDraftAttachments((candidate as { attachments?: unknown }).attachments);

  if (
    subject.length > 255 ||
    html.length > 100_000 ||
    to.length > 200 ||
    cc.length > 200 ||
    bcc.length > 200 ||
    (!subject && !html && attachments.length === 0)
  ) {
    return null;
  }

  return { subject, html, to, cc, bcc, attachments };
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
    '$mail.BCC = [string]$payload.bcc',
    '$mail.HTMLBody = [string]$payload.html',
    'foreach ($attachment in @($payload.attachments)) { if ([string]$attachment.path) { $mail.Attachments.Add([string]$attachment.path) | Out-Null } }',
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
    'Mail.BCC = Payload("bcc")',
    'Mail.HTMLBody = Payload("html")',
    'Dim Attachments, AttachmentIndex',
    'Set Attachments = Payload("attachments")',
    'For AttachmentIndex = 0 To Attachments.length - 1',
    '  If Attachments(AttachmentIndex).path <> "" Then Mail.Attachments.Add Attachments(AttachmentIndex).path',
    'Next',
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
  const attachmentPayload: Array<{ fileName: string; path: string }> = [];
  for (const attachment of payload.attachments) {
    const attachmentPath = path.join(tempRoot, attachment.fileName);
    await writeFile(attachmentPath, attachment.buffer);
    attachmentPayload.push({ fileName: attachment.fileName, path: attachmentPath });
  }
  const serializedPayload = JSON.stringify({
    subject: payload.subject,
    html: payload.html,
    to: payload.to.join(';'),
    cc: payload.cc.join(';'),
    bcc: payload.bcc.join(';'),
    attachments: attachmentPayload,
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

export async function createOutlookCalendar(payload: unknown): Promise<OutlookDraftResult> {
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

export async function createOutlookDraft(payload: unknown): Promise<OutlookDraftResult> {
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
