import { Buffer } from 'node:buffer';

type MsgReaderFileData = {
  subject?: unknown;
  body?: unknown;
  bodyHTML?: unknown;
  html?: unknown;
  senderName?: unknown;
  senderEmail?: unknown;
  messageDeliveryTime?: unknown;
  deliveryTime?: unknown;
  creationTime?: unknown;
};

type MsgReaderInstance = {
  getFileData: () => MsgReaderFileData | null | undefined;
};

type MsgReaderConstructor = new (buffer: Uint8Array) => MsgReaderInstance;

type MsgReaderModule = {
  MsgReader?: MsgReaderConstructor;
  default?: MsgReaderConstructor | { MsgReader?: MsgReaderConstructor };
};

export interface ParsedOutlookMsgData {
  subject: string;
  body: string;
  htmlBody: string;
  senderName: string;
  senderEmail: string;
  date: string;
}

export interface ParsedOutlookMsgResult {
  ok: boolean;
  message?: string;
  data?: ParsedOutlookMsgData;
}

function stringify(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function readMsgTextPayload(buffer: Buffer): string {
  const latin1 = buffer.toString('latin1');
  const utf16 = buffer.toString('utf16le');
  return `${latin1}\n${utf16}`.replace(/\0/g, ' ');
}

function normalizePlainText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function isReadableMsgLine(line: string): boolean {
  const text = line.replace(/\0/g, ' ').replace(/\s+/g, ' ').trim();
  if (text.length < 3 || text.length > 500) {
    return false;
  }
  if (hasMsgStructuralNoise(text) || hasForbiddenControlCharacter(text)) {
    return false;
  }
  const printable = countReadableMsgCharacters(text);
  const lettersOrNumbers = countLettersOrNumbers(text);
  return printable / text.length >= 0.8 && lettersOrNumbers >= Math.max(2, Math.floor(text.length * 0.25));
}

function countReadableMsgCharacters(text: string): number {
  let count = 0;
  for (const char of text) {
    if (isLetterOrNumber(char) || isAllowedMsgPunctuation(char)) {
      count += 1;
    }
  }

  return count;
}

function countLettersOrNumbers(text: string): number {
  let count = 0;
  for (const char of text) {
    if (isLetterOrNumber(char)) {
      count += 1;
    }
  }

  return count;
}

function isLetterOrNumber(char: string): boolean {
  return /[\p{L}\p{N}]/u.test(char);
}

function isAllowedMsgPunctuation(char: string): boolean {
  return " \t.,;:¿?¡!@<>()[]\\/-_'\"áéíóúÁÉÍÓÚñÑüÜ€%".includes(char);
}

function hasForbiddenControlCharacter(text: string): boolean {
  for (const char of text) {
    const code = char.charCodeAt(0);
    if (code === 0xfffd || code <= 0x08 || code === 0x0b || code === 0x0c || (code >= 0x0e && code <= 0x1f) || (code >= 0x7f && code <= 0x9f)) {
      return true;
    }
  }

  return false;
}

function hasMsgStructuralNoise(text: string): boolean {
  const lower = text.toLowerCase();
  return lower.includes('__substg') || lower.includes('root entry') || lower.includes('þÿ') || lower.includes('ÿÿ');
}

function extractReadableMsgBody(value: string, subject = ''): string {
  const normalized = value.replace(/\0/g, ' ').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const subjectKey = normalizePlainText(subject);
  const acceptedLines: string[] = [];
  const seen = new Set<string>();

  for (const rawLine of normalized.split('\n')) {
    const line = rawLine.replace(/\s+/g, ' ').trim();
    if (!isReadableMsgLine(line)) {
      continue;
    }
    const lineKey = normalizePlainText(line);
    if (!lineKey || seen.has(lineKey) || (subjectKey && lineKey === subjectKey)) {
      continue;
    }
    seen.add(lineKey);
    acceptedLines.push(line);
    if (acceptedLines.join('\n').length > 6000) {
      break;
    }
  }

  return acceptedLines.join('\n').trim();
}

async function loadMsgReader(): Promise<MsgReaderConstructor> {
  const moduleValue = (await import('@kenjiuno/msgreader')) as MsgReaderModule;
  const defaultValue = moduleValue.default;
  const reader =
    moduleValue.MsgReader ??
    (typeof defaultValue === 'function' ? defaultValue : defaultValue?.MsgReader);

  if (!reader) {
    throw new Error('No se ha podido cargar @kenjiuno/msgreader.');
  }

  return reader;
}

function parseWithFallback(buffer: Buffer): ParsedOutlookMsgResult {
  const text = readMsgTextPayload(buffer);
  const subject = (text.match(/(?:subject|asunto)\s*[:=]\s*([^\r\n]{3,200})/i) || [])[1] || '';
  const senderName = (text.match(/(?:from|de)\s*[:=]\s*([^\r\n<]{3,120})/i) || [])[1] || '';
  const senderEmail = (text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i) || [])[0] || '';
  const date = (text.match(/(?:sent|fecha)\s*[:=]\s*([^\r\n]{4,80})/i) || [])[1] || '';
  const cleanSubject = subject.trim();
  const body = extractReadableMsgBody(text, cleanSubject);

  return {
    ok: Boolean(cleanSubject || body),
    data: {
      subject: cleanSubject,
      body,
      htmlBody: '',
      senderName: senderName.trim(),
      senderEmail: senderEmail.trim(),
      date: date.trim(),
    },
  };
}

export async function parseOutlookMsgBuffer(buffer: Buffer): Promise<ParsedOutlookMsgResult> {
  try {
    const MsgReader = await loadMsgReader();
    const data = new MsgReader(new Uint8Array(buffer)).getFileData() || {};

    return {
      ok: true,
      data: {
        subject: stringify(data.subject),
        body: extractReadableMsgBody(stringify(data.body), stringify(data.subject)),
        htmlBody: stringify(data.bodyHTML) || stringify(data.html),
        senderName: stringify(data.senderName),
        senderEmail: stringify(data.senderEmail),
        date:
          stringify(data.messageDeliveryTime) ||
          stringify(data.deliveryTime) ||
          stringify(data.creationTime),
      },
    };
  } catch (error) {
    console.warn('Parser .msg avanzado falló, usando fallback básico:', error);
    return parseWithFallback(buffer);
  }
}

export function normalizeOutlookMsgPayload(payload: unknown): Buffer | null {
  if (payload instanceof Uint8Array) {
    return Buffer.from(payload);
  }

  if (payload instanceof ArrayBuffer) {
    return Buffer.from(new Uint8Array(payload));
  }

  if (payload && typeof payload === 'object') {
    const candidate = payload as { type?: unknown; data?: unknown };
    if (candidate.type === 'Buffer' && Array.isArray(candidate.data)) {
      return Buffer.from(candidate.data);
    }
  }

  return null;
}
