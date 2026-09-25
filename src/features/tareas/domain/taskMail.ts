import type { ParsedMsgData } from '../../especiales/domain/especiales';

function decodeHtmlEntities(value: string): string {
  if (typeof document === 'undefined') {
    return value
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'");
  }

  const textarea = document.createElement('textarea');
  textarea.innerHTML = value;
  return textarea.value;
}

export function normalizeTaskMailBody(value: string): string {
  const source = /<[^>]+>/.test(value)
    ? value
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(p|div|li|tr)>/gi, '\n')
        .replace(/<li[^>]*>/gi, '• ')
        .replace(/<[^>]+>/g, ' ')
    : value;

  return decodeHtmlEntities(source)
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function formatMailDate(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return trimmed;

  return parsed.toLocaleString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function buildSender(data: Pick<ParsedMsgData, 'senderName' | 'senderEmail'>): string {
  const name = data.senderName.trim();
  const email = data.senderEmail.trim();
  if (name && email) return `${name} <${email}>`;
  return name || email;
}

export function formatImportedTaskMail(
  data: Pick<ParsedMsgData, 'subject' | 'body' | 'htmlBody' | 'senderName' | 'senderEmail' | 'date'>,
): string {
  const sender = buildSender(data);
  const date = formatMailDate(data.date);
  const subject = data.subject.trim();
  const body = normalizeTaskMailBody(data.body || data.htmlBody);

  const header = [
    sender ? `De: ${sender}` : '',
    date ? `Fecha: ${date}` : '',
    subject ? `Asunto: ${subject}` : '',
  ].filter(Boolean);

  if (!body) return header.join('\n');
  if (!header.length) return body;
  return `${header.join('\n')}\n\nContenido:\n${body}`;
}
