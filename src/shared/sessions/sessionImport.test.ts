import { describe, expect, it } from 'vitest';
import { parseSessionImportText } from './sessionImport';

describe('T5: importación histórica de Comité y Paritaria', () => {
  it('mantiene separadas las sesiones, sus tareas y sus claves de enlace', () => {
    const result = parseSessionImportText('2025\nCE-01\n12/03\nOrden del día\n1. Jornada laboral\n2. Uniformidad\nCP-02\n15/04/25\n• Interpretación del convenio');
    expect(result.sessions.map(s => [s.kind, s.draft.date, s.draft.code])).toEqual([
      ['comite', '2025-03-12', 'CE-01'], ['paritaria', '2025-04-15', 'CP-02'],
    ]);
    expect(result.tasks.map(t => t.draft.titulo)).toEqual(['Jornada laboral', 'Uniformidad', 'Interpretación del convenio']);
    expect(result.sessions.flatMap(s => s.taskExternalKeys)).toEqual(result.tasks.map(t => t.externalKey));
    expect(new Set(result.tasks.map(t => t.externalKey)).size).toBe(3);
    expect(result.tasks.every(t => t.draft.estado === 'cerrada' && t.draft.fase === 'cerrada')).toBe(true);
    expect(result.tasks.map(t => t.draft.origen)).toEqual(['Comité de Empresa', 'Comité de Empresa', 'Comisión Paritaria']);
  });

  it('normaliza espacios, numeración y duplicados sin crear tareas adicionales', () => {
    const result = parseSessionImportText('2026\r\nCE.03\r\n7-2\r\nOrden del día:\r\n• Revisión\u00a0 salarial\r\n2) revisión salarial\r\nAnexos\r\n- Prevención\r\n');
    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0].draft.code).toBe('CE-03');
    expect(result.sessions[0].draft.date).toBe('2026-02-07');
    expect(result.tasks.map(t => t.draft.titulo)).toEqual(['Revisión salarial', 'Prevención']);
  });

  it.each(['comite', 'paritaria'] as const)('usa el tipo de importación elegido para códigos PE: %s', kind => {
    const result = parseSessionImportText('2026\nPE-07\n03/06\nPlan de formación', kind);
    expect(result.sessions[0].kind).toBe(kind);
    expect(result.sessions[0].externalKey).toBe(kind + ':PE-07:2026-06-03');
    expect(result.tasks[0].draft.observaciones).toContain('punto 1');
  });

  it('descarta sesiones sin puntos y no convierte líneas huérfanas en tareas', () => {
    const result = parseSessionImportText('Texto inicial\n2025\nCE-01\n12/01\nAnexo\n2026\nTexto sin sesión\nCP-02\n14/02\nRevisión de turnos');
    expect(result.sessions.map(s => s.draft.code)).toEqual(['CP-02']);
    expect(result.tasks).toHaveLength(1);
    expect(result.ignoredLines).toEqual(['Texto inicial', 'Texto sin sesión']);
  });

  it.each(['00/03', '12/13', '32/01'])('no crea una sesión con día o mes fuera de rango: %s', date => {
    const result = parseSessionImportText('2026\nCE-01\n' + date + '\nRevisión de jornada');
    expect(result.sessions).toEqual([]);
    expect(result.tasks).toEqual([]);
  });

  it('produce las mismas claves al repetir una importación histórica', () => {
    const text = '2024\nCP-01\n02/05\nAcuerdo de jornada\nPrevención';
    expect(parseSessionImportText(text)).toEqual(parseSessionImportText(text));
  });
});
