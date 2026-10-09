import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

interface DraftAttachment {
  fileName: string;
  buffer: Buffer;
}

interface DraftPayload {
  subject: string;
  html: string;
  to: string[];
  cc: string[];
  bcc: string[];
  attachments: DraftAttachment[];
}

type DraftResult = { ok: boolean; message: string };

function normalizeRecipients(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean).slice(0, 200);
  }
  if (typeof value === 'string') {
    return value.split(/[;,]/).map((item) => item.trim()).filter(Boolean).slice(0, 200);
  }
  return [];
}

function sanitizeFileName(value: string): string {
  return path
    .basename(value)
    .replace(/[<>:"/\\|?*]/g, '_')
    .split('')
    .map((character) => (character.charCodeAt(0) < 32 ? '_' : character))
    .join('');
}

function toBuffer(value: unknown): Buffer | null {
  if (value instanceof ArrayBuffer) return Buffer.from(value);
  if (ArrayBuffer.isView(value)) {
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  }
  if (value && typeof value === 'object') {
    const candidate = value as { type?: unknown; data?: unknown };
    if (candidate.type === 'Buffer' && Array.isArray(candidate.data)) {
      return Buffer.from(candidate.data);
    }
  }
  return null;
}

function normalizeAttachments(value: unknown): DraftAttachment[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 10).flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const candidate = item as { fileName?: unknown; buffer?: unknown };
    if (typeof candidate.fileName !== 'string' || !candidate.fileName.trim()) return [];
    const buffer = toBuffer(candidate.buffer);
    if (!buffer?.length) return [];
    return [{ fileName: sanitizeFileName(candidate.fileName), buffer }];
  });
}

function normalizePayload(value: unknown): DraftPayload | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as {
    subject?: unknown;
    html?: unknown;
    htmlBody?: unknown;
    to?: unknown;
    cc?: unknown;
    bcc?: unknown;
    attachments?: unknown;
  };
  const subject = typeof candidate.subject === 'string' ? candidate.subject.trim() : '';
  const htmlSource = typeof candidate.html === 'string' ? candidate.html : candidate.htmlBody;
  const html = typeof htmlSource === 'string' ? htmlSource : '';
  const to = normalizeRecipients(candidate.to);
  const cc = normalizeRecipients(candidate.cc);
  const bcc = normalizeRecipients(candidate.bcc);
  const attachments = normalizeAttachments(candidate.attachments);
  if (!subject || !html || to.length === 0 || subject.length > 255 || html.length > 100_000) return null;
  return { subject, html, to, cc, bcc, attachments };
}

function psLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function vbsLiteral(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export function buildOutlook2019PowerShellScript(
  payload: DraftPayload,
  attachmentPaths: string[],
): string {
  const htmlBase64 = Buffer.from(payload.html, 'utf8').toString('base64');
  const lines = [
    "$ErrorActionPreference = 'Stop'",
    '$outlook = New-Object -ComObject Outlook.Application',
    '$mail = $outlook.CreateItem(0)',
    '$mail.BodyFormat = 2',
    `$mail.Subject = ${psLiteral(payload.subject)}`,
    `$mail.To = ${psLiteral(payload.to.join(';'))}`,
    `$mail.CC = ${psLiteral(payload.cc.join(';'))}`,
    `$mail.BCC = ${psLiteral(payload.bcc.join(';'))}`,
    `$mail.HTMLBody = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String(${psLiteral(htmlBase64)}))`,
  ];
  for (const attachmentPath of attachmentPaths) {
    lines.push(`$mail.Attachments.Add(${psLiteral(attachmentPath)}) | Out-Null`);
  }
  lines.push(
    '$mail.Display($false) | Out-Null',
    'Start-Sleep -Milliseconds 300',
    "Write-Output 'OK_DRAFT_DISPLAYED'",
  );
  return lines.join('\n');
}

export function buildOutlook2019VbsScript(
  payload: DraftPayload,
  attachmentPaths: string[],
  htmlPath: string,
): string {
  const lines = [
    'Option Explicit',
    'Dim OutlookApp, Mail, HtmlStream, HtmlBody',
    'Set HtmlStream = CreateObject("ADODB.Stream")',
    'HtmlStream.Type = 2',
    'HtmlStream.Charset = "utf-8"',
    'HtmlStream.Open',
    `HtmlStream.LoadFromFile ${vbsLiteral(htmlPath)}`,
    'HtmlBody = HtmlStream.ReadText',
    'HtmlStream.Close',
    'Set OutlookApp = CreateObject("Outlook.Application")',
    'Set Mail = OutlookApp.CreateItem(0)',
    'Mail.BodyFormat = 2',
    `Mail.Subject = ${vbsLiteral(payload.subject)}`,
    `Mail.To = ${vbsLiteral(payload.to.join(';'))}`,
    `Mail.CC = ${vbsLiteral(payload.cc.join(';'))}`,
    `Mail.BCC = ${vbsLiteral(payload.bcc.join(';'))}`,
    'Mail.HTMLBody = HtmlBody',
  ];
  for (const attachmentPath of attachmentPaths) {
    lines.push(`Mail.Attachments.Add ${vbsLiteral(attachmentPath)}`);
  }
  lines.push('Mail.Display');
  return lines.join('\r\n');
}

async function runPowerShell(script: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const encoded = Buffer.from(script, 'utf16le').toString('base64');
    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
      { windowsHide: true },
    );
    let stdout = '';
    let stderr = '';
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      reject(new Error('Outlook no respondió al intentar abrir el borrador.'));
    }, 15_000);
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8'); });
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8'); });
    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0 && stdout.includes('OK_DRAFT_DISPLAYED')) {
        resolve();
        return;
      }
      reject(new Error(stderr.trim() || stdout.trim() || `PowerShell terminó con código ${code ?? 'desconocido'}.`));
    });
  });
}

async function runVbs(script: string, directory: string): Promise<void> {
  const scriptPath = path.join(directory, 'outlook-draft.vbs');
  const utf16WithBom = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(script, 'utf16le')]);
  await writeFile(scriptPath, utf16WithBom);
  await new Promise<void>((resolve, reject) => {
    const child = spawn('cscript.exe', ['//NoLogo', scriptPath], { windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8'); });
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8'); });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(stderr.trim() || stdout.trim() || `cscript terminó con código ${code ?? 'desconocido'}.`));
    });
  });
}

export async function createOutlookDraftCompat(payloadValue: unknown): Promise<DraftResult> {
  if (process.platform !== 'win32') {
    return { ok: false, message: 'La automatización de Outlook solo está disponible en Windows.' };
  }
  const payload = normalizePayload(payloadValue);
  if (!payload) {
    return { ok: false, message: 'Faltan destinatario, asunto o cuerpo para crear el borrador de Outlook.' };
  }

  const tempRoot = await mkdtemp(path.join(tmpdir(), 'traccion-outlook-'));
  try {
    const attachmentPaths: string[] = [];
    for (const attachment of payload.attachments) {
      const attachmentPath = path.join(tempRoot, attachment.fileName);
      await writeFile(attachmentPath, attachment.buffer);
      attachmentPaths.push(attachmentPath);
    }
    const htmlPath = path.join(tempRoot, 'body.html');
    await writeFile(htmlPath, payload.html, 'utf8');

    const powerShellScript = buildOutlook2019PowerShellScript(payload, attachmentPaths);
    try {
      await runPowerShell(powerShellScript);
      return { ok: true, message: 'Borrador abierto en Outlook.' };
    } catch (powerShellError) {
      const vbsScript = buildOutlook2019VbsScript(payload, attachmentPaths, htmlPath);
      try {
        await runVbs(vbsScript, tempRoot);
        return { ok: true, message: 'Borrador abierto en Outlook.' };
      } catch (vbsError) {
        const first = powerShellError instanceof Error ? powerShellError.message : 'error desconocido';
        const second = vbsError instanceof Error ? vbsError.message : 'error desconocido';
        return { ok: false, message: `No se ha podido abrir Outlook 2019. PowerShell: ${first}. VBS: ${second}.` };
      }
    }
  } finally {
    await rm(tempRoot, { force: true, recursive: true });
  }
}
