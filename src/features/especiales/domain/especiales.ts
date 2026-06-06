export type EspecialRecipientType = 'to' | 'cc';

export interface EspecialServiceDraft {
  evento: string;
  fecha: string;
  hora: string;
  enlace: string;
  ruta: string;
  observaciones: string;
  msgSubject: string;
}

export interface EspecialRecipient {
  id: string;
  name: string;
  email: string;
  type: EspecialRecipientType;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface EspecialRecipientDraft {
  name: string;
  email: string;
  type: EspecialRecipientType;
}

export interface EspecialRecipientsByType {
  to: EspecialRecipient[];
  cc: EspecialRecipient[];
}

export interface EspecialMailDraft {
  subject: string;
  html: string;
  to: string[];
  cc: string[];
}

export interface ParsedMsgData {
  subject: string;
  body: string;
  htmlBody: string;
  senderName: string;
  senderEmail: string;
  date: string;
  evento: string;
  fecha: string;
  hora: string;
  enlace: string;
  intranetName: string;
  intranetParagraph: string;
  ruta: string;
}

export interface ParsedMsgResult {
  ok: boolean;
  message?: string;
  hasMainData?: boolean;
  partial?: boolean;
  data?: ParsedMsgData;
}

export const EMPTY_ESPECIAL_SERVICE_DRAFT: EspecialServiceDraft = {
  evento: '',
  fecha: '',
  hora: '',
  enlace: '',
  ruta: '',
  observaciones: '',
  msgSubject: '',
};

export const EMPTY_ESPECIAL_RECIPIENT_DRAFT: EspecialRecipientDraft = {
  name: '',
  email: '',
  type: 'to',
};

export function normalizeRecipientType(value: unknown): EspecialRecipientType {
  return value === 'cc' ? 'cc' : 'to';
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function buildEspecialRecipient(
  draft: EspecialRecipientDraft,
  now: string,
  id: string,
  previous?: EspecialRecipient,
): EspecialRecipient {
  return {
    id,
    name: draft.name.trim(),
    email: draft.email.trim(),
    type: normalizeRecipientType(draft.type),
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
    deletedAt: previous?.deletedAt ?? null,
  };
}

export function visibleEspecialRecipients(recipients: EspecialRecipient[]): EspecialRecipient[] {
  return recipients.filter((recipient) => !recipient.deletedAt && isValidEmail(recipient.email));
}

export function splitEspecialRecipients(recipients: EspecialRecipient[]): EspecialRecipientsByType {
  return visibleEspecialRecipients(recipients).reduce<EspecialRecipientsByType>(
    (groups, recipient) => ({
      ...groups,
      [recipient.type]: [...groups[recipient.type], recipient],
    }),
    { to: [], cc: [] },
  );
}

export function getEspecialesMailSubject(payload: Partial<EspecialServiceDraft>): string {
  return String(payload.msgSubject || payload.evento || '').trim();
}

export function buildEspecialesBullet(payload: Partial<EspecialServiceDraft>): string {
  const subject = getEspecialesMailSubject(payload);
  return `Servicio Especial ${subject || '[ASUNTO]'}`.trim();
}

export function buildEspecialesSubject(payload: Partial<EspecialServiceDraft>): string {
  return buildEspecialesBullet(payload);
}

export function stripIntranetNameFromParagraph(value: string): string {
  const text = value.replace(/\s+/g, ' ').trim();
  const marker = /(?:^|\b)(?:Este\s+)?Servicio\s+Especial\s+aparecer(?:[aá])?\s+en\s+la\s+Intranet\s+como\s*:\s*/i;
  const match = marker.exec(text);
  return match ? text.slice(match.index + match[0].length).trim() : text;
}

export function buildIntranetParagraphHtml(value: string): string {
  const text = value.replace(/\s+/g, ' ').trim();
  if (!text) {
    return '';
  }

  const hasFullLiteral = /(?:^|\b)(?:Este\s+)?Servicio\s+Especial\s+aparecer(?:[aá])?\s+en\s+la\s+Intranet\s+como\s*:/i.test(
    text,
  );
  const line = hasFullLiteral
    ? text.replace(/^ste\s+Servicio/i, 'Este Servicio')
    : `Este Servicio Especial aparecerá en la Intranet como: ${text}`;

  return `<p>${escapeHtml(line)}</p>`;
}

export function getDateParts(isoDate: string): { year: string; weekDay: string; longDate: string } {
  const match = isoDate.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return { year: '', weekDay: '', longDate: '' };
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  const days = ['DOMINGO', 'LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO'];
  const months = [
    'ENERO',
    'FEBRERO',
    'MARZO',
    'ABRIL',
    'MAYO',
    'JUNIO',
    'JULIO',
    'AGOSTO',
    'SEPTIEMBRE',
    'OCTUBRE',
    'NOVIEMBRE',
    'DICIEMBRE',
  ];

  return {
    year: String(year),
    weekDay: days[date.getUTCDay()],
    longDate: `${String(day).padStart(2, '0')} DE ${months[month - 1]}`,
  };
}

export function detectYearFromText(text: string): string {
  const fourDigitMatch = text.match(/\b(20\d{2})\b/);
  if (fourDigitMatch) {
    return fourDigitMatch[1];
  }

  const shortYearMatch = text.match(/\b\d{1,2}[/ .-]\d{1,2}[/ .-](\d{2})\b/);
  return shortYearMatch ? `20${shortYearMatch[1]}` : '';
}

export function buildTurnosPath(year: string): string {
  const safeYear = year.trim() || String(new Date().getFullYear());
  return `G:\\DC\\PAS_TURNOS_RRLL\\${safeYear}\\TURNOS`;
}

export function buildEspecialesHtmlBody(payload: Partial<EspecialServiceDraft>): string {
  const evento = String(payload.evento || '').trim();
  const fecha = String(payload.fecha || '').trim();
  const intranetRaw = String(payload.enlace || '').replace(/\s+/g, ' ').trim();
  const dateParts = getDateParts(fecha);
  const year =
    dateParts.year || detectYearFromText(`${evento} ${fecha} ${getEspecialesMailSubject(payload)}`) || String(new Date().getFullYear());
  const ruta = String(payload.ruta || '').trim() || buildTurnosPath(year);
  const intranetLine = buildIntranetParagraphHtml(intranetRaw);

  return [
    '<div style="font-family: Verdana, Arial, sans-serif; font-size: 11pt;">',
    '<p>Kaixo,</p>',
    '<p>Adjunto acceso a los turnos de conducción de Servicio Especial donde ya están disponibles en la intranet los turnos de conducción de:</p>',
    `<p><strong>• ${escapeHtml(buildEspecialesBullet(payload))}</strong></p>`,
    `<p>Los turnos están en: Las personas -> turnos -> trenes -> Invierno -> Servicios Especiales -> ${escapeHtml(year)}</p>`,
    intranetLine,
    '<p>Así mismo, tenéis los turnos de MTEs en Excel con la tabla de % Parada SIN del servicio especial a realizar. Se encuentra en el siguiente directorio común que tenéis acceso:</p>',
    `<p>${escapeHtml(ruta)}</p>`,
    '<p>Ondo izan</p>',
    '</div>',
  ].join('');
}

export function buildEspecialMailDraft(
  event: Partial<EspecialServiceDraft>,
  recipients: EspecialRecipient[],
): EspecialMailDraft {
  const groups = splitEspecialRecipients(recipients);
  return {
    subject: buildEspecialesSubject(event),
    html: buildEspecialesHtmlBody(event),
    to: groups.to.map((recipient) => recipient.email),
    cc: groups.cc.map((recipient) => recipient.email),
  };
}

export function normalizeDateInput(raw: string): string {
  const value = raw.trim();
  const iso = value.match(/\b(\d{4})[/ .-](\d{1,2})[/ .-](\d{1,2})\b/);
  if (iso) {
    return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
  }

  const es = value.match(/\b(\d{1,2})[/ .-](\d{1,2})[/ .-](\d{2,4})\b/);
  if (es) {
    const year = es[3].length === 2 ? `20${es[3]}` : es[3];
    return `${year}-${es[2].padStart(2, '0')}-${es[1].padStart(2, '0')}`;
  }

  const months: Record<string, string> = {
    enero: '01',
    febrero: '02',
    marzo: '03',
    abril: '04',
    mayo: '05',
    junio: '06',
    julio: '07',
    agosto: '08',
    septiembre: '09',
    setiembre: '09',
    octubre: '10',
    noviembre: '11',
    diciembre: '12',
  };
  const longEs = value.match(
    /(?:\b(?:lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\b\s+)?(\d{1,2})\s+de\s+([a-záéíóúñ]+)\s+de\s+(\d{2,4})/i,
  );
  if (!longEs) {
    return '';
  }

  const monthName = normalizePlainText(longEs[2]);
  const month = months[monthName];
  if (!month) {
    return '';
  }

  const year = longEs[3].length === 2 ? `20${longEs[3]}` : longEs[3];
  return `${year}-${month}-${longEs[1].padStart(2, '0')}`;
}

export function normalizeTimeInput(raw: string): string {
  const match = raw.trim().match(/\b(\d{1,2})\s*[:.]\s*(\d{2})\s*h?\b/i);
  if (!match) {
    return '';
  }
  return `${match[1].padStart(2, '0')}:${match[2]}`;
}

export function decodeMimeWords(value: string): string {
  const normalized = value.replace(/=\?iso[\s_-]*8859[\s_-]*1\?/gi, '=?iso-8859-1?');

  return normalized
    .replace(/=\?([^?]+)\?([bBqQ])\?([^?]*)\?=/g, (_all, charsetRaw: string, encRaw: string, contentRaw: string) => {
      const charset = charsetRaw.trim().toLowerCase().replace(/\s+/g, '').replace(/_/g, '-');
      const encoding = encRaw.toUpperCase();
      const content = contentRaw || '';
      try {
        const bytes = encoding === 'B' ? decodeBase64Bytes(content) : decodeQBytes(content);
        const normalizedCharset = charset.includes('8859-1') ? 'iso-8859-1' : 'utf-8';
        return new TextDecoder(normalizedCharset).decode(bytes);
      } catch {
        return content.replace(/_/g, ' ');
      }
    })
    .replace(/\?=Q$/i, '')
    .trim();
}

export function stripHtmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<\/(?:p|div|br|li|tr|td|th|h[1-6])\s*>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function cleanEventFromSubject(subject: string): string {
  return subject
    .replace(/\b(?:servicio\s+especial|concierto|evento)\b/gi, ' ')
    .replace(/\b(?:lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\b/gi, ' ')
    .replace(/\b\d{1,2}[/ .-]\d{1,2}[/ .-]\d{2,4}\b/g, ' ')
    .replace(/\b\d{1,2}\s+de\s+[a-záéíóúñ]+\s+de\s+\d{2,4}\b/gi, ' ')
    .replace(/\b\d{1,2}(?::|\.)\d{2}\s*h?\b/gi, ' ')
    .replace(/[|,–—,-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeDetectionText(value: string): string {
  return value
    .split('\u0000').join(' ')
    .replace(/\r/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function extractIntranetParagraph(text: string): string {
  const normalized = normalizeDetectionText(text);
  const marker = /(?:^|\b)(?:Este\s+)?Servicio\s+Especial\s+aparecer(?:[aá])?\s+en\s+la\s+Intranet\s+como\s*:\s*/i;
  const match = marker.exec(normalized);
  if (!match) {
    return '';
  }

  const literalStart = match.index;
  const afterMarker = normalized.slice(match.index + match[0].length);
  const stopMatch =
    /(?:\n|\s)+(?:[A-Za-z]:\\|\\\\)/.exec(afterMarker) ||
    /(?:\n\s*\n|\n|\s{3,})(?:El\s+servicio\s+especial|El\s+PMC|La\s+publicaci[oó]n|Se\s+confirmar[aá]|Los\s+gr[aá]ficos|Un\s+saludo|$)/i.exec(
      afterMarker,
    ) ||
    /\s+(?:El\s+servicio\s+especial|El\s+PMC|La\s+publicaci[oó]n|Se\s+confirmar[aá]|Los\s+gr[aá]ficos|Un\s+saludo)\b/i.exec(
      afterMarker,
    );
  const valueCandidate = stopMatch ? afterMarker.slice(0, stopMatch.index) : afterMarker.slice(0, 180);
  const cleanValue = valueCandidate
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[.;,–—-]+$/g, '')
    .trim();
  if (!isCleanIntranetCandidate(cleanValue)) {
    return '';
  }

  const prefix = normalized
    .slice(literalStart, match.index + match[0].length)
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^ste\s+Servicio/i, 'Este Servicio')
    .trim();

  return `${prefix} ${cleanValue}`
    .replace(/\s+/g, ' ')
    .replace(/^ste\s+Servicio/i, 'Este Servicio')
    .trim();
}

export function extractIntranetServiceName(text: string): string {
  return stripIntranetNameFromParagraph(extractIntranetParagraph(text));
}

export function detectAutoFields(
  text: string,
  subject: string,
  extraSources: string[] = [],
): Pick<ParsedMsgData, 'evento' | 'fecha' | 'hora' | 'enlace' | 'intranetName' | 'intranetParagraph' | 'ruta'> {
  const source = normalizeDetectionText(text);
  const eventMatch = source.match(/(?:servicio\s+especial|concierto|evento)\s*[:-]?\s*([^\n\r]{4,120})/i);
  const dateMatch = source.match(
    /(?:\b(?:lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\b\s*)?(\d{1,2}[/ .-]\d{1,2}[/ .-]\d{2,4}|\d{1,2}\s+de\s+[a-záéíóúñ]+\s+de\s+\d{2,4})/i,
  );
  const timeMatch = source.match(/\b(\d{1,2}(?::|\.)\d{2}\s*h?)\b/i);
  const uncMatch = source.match(/(?:[A-Za-z]:\\|\\\\)[^\n\r;,"<>]+/);
  const fallbackEvent = cleanEventFromSubject(subject);
  const sources = extraSources.length ? extraSources : [source];
  const intranetParagraph = extractFirstIntranetParagraph(sources);
  const intranetName = stripIntranetNameFromParagraph(intranetParagraph);

  return {
    evento: eventMatch ? cleanEventFromSubject(eventMatch[1]) : fallbackEvent,
    fecha: dateMatch ? normalizeDateInput(dateMatch[1]) : '',
    hora: timeMatch ? normalizeTimeInput(timeMatch[1]) : '',
    enlace: intranetName,
    intranetName,
    intranetParagraph,
    ruta: uncMatch ? uncMatch[0].trim() : '',
  };
}

export async function parseOutlookMsg(file: File): Promise<ParsedMsgResult> {
  if (!/\.msg$/i.test(file.name || '')) {
    return { ok: false, message: 'Selecciona un archivo .msg válido.' };
  }

  try {
    const buffer = await file.arrayBuffer();
    const rawIntranetParagraph = extractIntranetParagraphFromMsgBuffer(buffer);
    const rawIntranetName = stripIntranetNameFromParagraph(rawIntranetParagraph);
    const rawUtf16Text = decodeArrayBuffer(buffer, 'utf-16le');
    const rawLatin1Text = decodeArrayBuffer(buffer, 'iso-8859-1');
    const subject = decodeMimeWords(extractMsgSubject(rawUtf16Text, rawLatin1Text, file.name));
    const body = decodeMimeWords(rawUtf16Text || rawLatin1Text);
    const htmlBody = '';
    const senderEmail = extractFirstEmail(`${rawUtf16Text}\n${rawLatin1Text}`);
    const htmlText = stripHtmlToText(htmlBody);
    const safeDetectionSources = [body, htmlText, rawUtf16Text, rawLatin1Text, subject].filter(Boolean);
    const textForDetection = `${subject}\n${body}\n${htmlText}`;
    const auto = detectAutoFields(textForDetection, subject, safeDetectionSources);

    if (rawIntranetParagraph && !auto.intranetParagraph) {
      auto.intranetParagraph = rawIntranetParagraph;
    }
    if (rawIntranetName && !auto.intranetName) {
      auto.intranetName = rawIntranetName;
      auto.enlace = rawIntranetName;
    }

    const hasMainData = Boolean(auto.evento && auto.fecha && auto.hora);
    const hasSomeMainData = [auto.evento, auto.fecha, auto.hora].filter(Boolean).length > 0;

    return {
      ok: Boolean(subject || body || htmlBody),
      hasMainData,
      partial: !hasMainData && hasSomeMainData,
      data: {
        subject,
        body,
        htmlBody,
        senderName: '',
        senderEmail,
        date: '',
        ...auto,
      },
    };
  } catch {
    return { ok: false, message: 'No se ha podido importar el mensaje .msg.' };
  }
}

function extractFirstIntranetParagraph(sources: string[]): string {
  for (const source of sources) {
    const value = extractIntranetParagraph(source);
    if (value) {
      return value;
    }
  }
  return '';
}

function extractIntranetParagraphFromMsgBuffer(buffer: ArrayBuffer): string {
  const decoders = ['utf-16le', 'utf-8', 'iso-8859-1'];
  for (const encoding of decoders) {
    const value = extractIntranetParagraph(decodeArrayBuffer(buffer, encoding));
    if (value) {
      return value;
    }
  }
  return '';
}

function decodeArrayBuffer(buffer: ArrayBuffer, encoding: string): string {
  try {
    return new TextDecoder(encoding).decode(buffer);
  } catch {
    return '';
  }
}

function extractMsgSubject(utf16Text: string, latin1Text: string, fileName: string): string {
  const combined = `${utf16Text}\n${latin1Text}`;
  const explicit = combined.match(/(?:subject|asunto)\s*[:=]\s*([^\r\n]{3,200})/i);
  if (explicit) {
    return explicit[1].trim();
  }

  const fromFileName = fileName.replace(/\.msg$/i, '').replace(/[_-]+/g, ' ').trim();
  return fromFileName;
}

function extractFirstEmail(value: string): string {
  return value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? '';
}

function isCleanIntranetCandidate(value: string): boolean {
  const text = value.trim();
  if (!text || text.length < 4 || text.length > 140) {
    return false;
  }
  if (hasForbiddenControlCharacter(text)) {
    return false;
  }
  if (hasForbiddenStructuralCharacter(text)) {
    return false;
  }
  const readable = (text.match(/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9]/g) || []).length;
  return readable / text.length >= 0.55;
}


function hasForbiddenControlCharacter(text: string): boolean {
  for (const char of text) {
    const code = char.charCodeAt(0);
    if (code === 0xfffd || code <= 0x08 || code === 0x0b || code === 0x0c || (code >= 0x0e && code <= 0x1f)) {
      return true;
    }
  }

  return false;
}

function hasForbiddenStructuralCharacter(text: string): boolean {
  return text.includes('{') || text.includes('}') || text.includes('[') || text.includes(']') || text.includes(String.fromCharCode(0x7f));
}

function normalizePlainText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function decodeQBytes(content: string): Uint8Array {
  const replaced = content.replace(/_/g, ' ');
  const bytes: number[] = [];
  for (let index = 0; index < replaced.length; index += 1) {
    if (replaced[index] === '=' && /[0-9A-Fa-f]{2}/.test(replaced.slice(index + 1, index + 3))) {
      bytes.push(parseInt(replaced.slice(index + 1, index + 3), 16));
      index += 2;
    } else {
      bytes.push(replaced.charCodeAt(index) & 0xff);
    }
  }
  return new Uint8Array(bytes);
}

function decodeBase64Bytes(content: string): Uint8Array {
  const binary = atob(content.replace(/\s+/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index) & 0xff;
  }
  return bytes;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
