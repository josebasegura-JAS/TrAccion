import { describe, expect, it } from 'vitest';
import { buildEspecialMailDraft, buildEspecialRecipient, decodeMimeWords, stripHtmlToText, cleanEventFromSubject, getDateParts, normalizeDateInput, normalizeTimeInput, detectYearFromText } from './especiales';

describe('T7B: interpretación de mensajes de Especiales', () => {
  it('decodifica asuntos MIME con UTF-8 y Latin-1', () => {
    expect(decodeMimeWords('=?UTF-8?B?Q2FuY2nDs24=?=')).toBe('Canción');
    expect(decodeMimeWords('=?ISO-8859-1?Q?Canci=F3n?=')).toBe('Canción');
  });
  it('descarta contenido de scripts y estilos al extraer texto', () => {
    const text = stripHtmlToText('<style>hidden</style><script>danger</script><p>Evento &amp; concierto</p>');
    expect(text).toBe('Evento & concierto');
  });
  it('elimina prefijos, fecha y hora del nombre del evento', () => {
    expect(cleanEventFromSubject('Servicio Especial - BEC - domingo 14/06/2026 20:30 h')).toBe('BEC');
  });
  it('escapa texto del evento y ruta, sin trasladar etiquetas activas al borrador', () => {
    const result = buildEspecialMailDraft({ evento: '<script>alert(1)</script>', fecha: '2026-06-14', enlace: 'Evento <b>especial</b>', ruta: 'G:/a&b' }, []);
    expect(result.html).not.toContain('<script>');
    expect(result.html).not.toContain('<b>especial</b>');
    expect(result.html).toContain('&lt;script&gt;');
    expect(result.html).toContain('G:/a&amp;b');
  });
  it('excluye destinatarios inválidos y bajas lógicas del borrador', () => {
    const stamp = '2026-01-01T00:00:00.000Z';
    const valid = buildEspecialRecipient({ name: 'Persona', email: 'test@example.invalid', type: 'cc' }, stamp, 'a');
    const result = buildEspecialMailDraft({ evento: 'Evento' }, [valid, { ...valid, id: 'b', email: 'invalid', type: 'to' }, { ...valid, id: 'c', deletedAt: stamp }]);
    expect(result.to).toEqual([]);
    expect(result.cc).toEqual([valid.email]);
  });
  it('interpreta fecha bisiesta válida y devuelve vacío para texto sin fecha u hora', () => {
    expect(getDateParts('2024-02-29')).toEqual({ year: '2024', weekDay: 'JUEVES', longDate: '29 DE FEBRERO' });
    expect(getDateParts('sin fecha')).toEqual({ year: '', weekDay: '', longDate: '' });
    expect(normalizeDateInput('sin fecha')).toBe('');
    expect(normalizeTimeInput('sin hora')).toBe('');
  });
  it('detecta año largo o abreviado sin inventarlo cuando falta', () => {
    expect(detectYearFromText('Evento 2027')).toBe('2027');
    expect(detectYearFromText('14/06/26')).toBe('2026');
    expect(detectYearFromText('Evento')).toBe('');
  });
});
