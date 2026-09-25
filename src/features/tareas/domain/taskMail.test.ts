import { describe, expect, it } from 'vitest';
import { formatImportedTaskMail, normalizeTaskMailBody } from './taskMail';

describe('taskMail', () => {
  it('construye un correo legible con cabecera y contenido', () => {
    const result = formatImportedTaskMail({
      senderName: 'María López',
      senderEmail: 'maria@example.com',
      subject: 'Cambio de jornada',
      date: '2026-09-25T08:14:00+02:00',
      body: 'Buenos días,\r\n\r\nNecesitamos revisar el cambio.',
      htmlBody: '',
    });

    expect(result).toContain('De: María López <maria@example.com>');
    expect(result).toContain('Asunto: Cambio de jornada');
    expect(result).toContain('Contenido:\nBuenos días,\n\nNecesitamos revisar el cambio.');
  });

  it('limpia HTML manteniendo párrafos básicos', () => {
    expect(normalizeTaskMailBody('<p>Hola&nbsp;equipo</p><p>Segundo párrafo<br>línea 2</p>'))
      .toBe('Hola equipo\nSegundo párrafo\nlínea 2');
  });

  it('funciona aunque el mensaje no tenga cuerpo', () => {
    expect(formatImportedTaskMail({
      senderName: '',
      senderEmail: 'persona@example.com',
      subject: 'Sin cuerpo',
      date: '',
      body: '',
      htmlBody: '',
    })).toBe('De: persona@example.com\nAsunto: Sin cuerpo');
  });
});
