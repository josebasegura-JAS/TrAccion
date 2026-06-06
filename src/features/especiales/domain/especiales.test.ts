import { describe, expect, it } from 'vitest';
import {
  buildEspecialesHtmlBody,
  buildEspecialesSubject,
  buildEspecialMailDraft,
  buildIntranetParagraphHtml,
  buildTurnosPath,
  detectAutoFields,
  normalizeDateInput,
  normalizeTimeInput,
  splitEspecialRecipients,
  stripIntranetNameFromParagraph,
  type EspecialRecipient,
} from './especiales';

function buildRecipient(overrides: Partial<EspecialRecipient>): EspecialRecipient {
  return {
    id: 'recipient-base',
    name: 'Nombre Base',
    email: 'base@example.com',
    type: 'to',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
    ...overrides,
  };
}

describe('especiales domain', () => {
  it('genera el asunto exacto de RRLL Dashboard', () => {
    expect(buildEspecialesSubject({ msgSubject: 'BEC Alejandro Sanz' })).toBe(
      'Servicio Especial BEC Alejandro Sanz',
    );
  });

  it('genera el cuerpo HTML exacto base con Verdana 11pt y textos de RRLL Dashboard', () => {
    const html = buildEspecialesHtmlBody({
      evento: 'BEC Alejandro Sanz',
      fecha: '2026-06-14',
      enlace: 'BEC Alejandro Sanz Domingo',
      ruta: 'G:\\DC\\PAS_TURNOS_RRLL\\2026\\TURNOS',
      msgSubject: 'BEC Alejandro Sanz',
    });

    expect(html).toContain('font-family: Verdana, Arial, sans-serif; font-size: 11pt;');
    expect(html).toContain('<p>Kaixo,</p>');
    expect(html).toContain(
      'Adjunto acceso a los turnos de conducción de Servicio Especial donde ya están disponibles en la intranet los turnos de conducción de:',
    );
    expect(html).toContain('<p><strong>• Servicio Especial BEC Alejandro Sanz</strong></p>');
    expect(html).toContain(
      'Las personas -> turnos -> trenes -> Invierno -> Servicios Especiales -> 2026',
    );
    expect(html).toContain(
      'Este Servicio Especial aparecerá en la Intranet como: BEC Alejandro Sanz Domingo',
    );
    expect(html).toContain('G:\\DC\\PAS_TURNOS_RRLL\\2026\\TURNOS');
    expect(html).toContain('<p>Ondo izan</p>');
  });

  it('mantiene literal de intranet si ya viene completo y extrae el nombre', () => {
    const literal = 'Este Servicio Especial aparecerá en la Intranet como: BEC Evento Domingo';

    expect(buildIntranetParagraphHtml(literal)).toBe(`<p>${literal}</p>`);
    expect(stripIntranetNameFromParagraph(literal)).toBe('BEC Evento Domingo');
  });

  it('separa Para y CC excluyendo borrados', () => {
    const recipients = [
      buildRecipient({ id: 'to-1', email: 'to@example.com', type: 'to' }),
      buildRecipient({ id: 'cc-1', email: 'cc@example.com', type: 'cc' }),
      buildRecipient({
        id: 'deleted',
        email: 'deleted@example.com',
        type: 'to',
        deletedAt: '2026-01-02T00:00:00.000Z',
      }),
    ];

    expect(splitEspecialRecipients(recipients)).toEqual({
      to: [recipients[0]],
      cc: [recipients[1]],
    });
    expect(buildEspecialMailDraft({ evento: 'Evento' }, recipients)).toMatchObject({
      subject: 'Servicio Especial Evento',
      to: ['to@example.com'],
      cc: ['cc@example.com'],
    });
  });

  it('normaliza fechas, horas y ruta de turnos igual que el módulo antiguo', () => {
    expect(normalizeDateInput('domingo 14 de junio de 2026')).toBe('2026-06-14');
    expect(normalizeDateInput('14/06/26')).toBe('2026-06-14');
    expect(normalizeTimeInput('20.30 h')).toBe('20:30');
    expect(buildTurnosPath('2026')).toBe('G:\\DC\\PAS_TURNOS_RRLL\\2026\\TURNOS');
  });

  it('detecta evento, fecha, hora, ruta y texto de intranet desde texto de mensaje', () => {
    const text = `Servicio Especial: BEC Alejandro Sanz\n14/06/2026\n20:30 h\nEste Servicio Especial aparecerá en la Intranet como: BEC Alejandro Sanz Domingo\nG:\\DC\\PAS_TURNOS_RRLL\\2026\\TURNOS`;
    const auto = detectAutoFields(text, 'Servicio Especial BEC Alejandro Sanz', [text]);

    expect(auto.evento).toBe('BEC Alejandro Sanz');
    expect(auto.fecha).toBe('2026-06-14');
    expect(auto.hora).toBe('20:30');
    expect(auto.enlace).toBe('BEC Alejandro Sanz Domingo');
    expect(auto.ruta).toBe('G:\\DC\\PAS_TURNOS_RRLL\\2026\\TURNOS');
  });
});
