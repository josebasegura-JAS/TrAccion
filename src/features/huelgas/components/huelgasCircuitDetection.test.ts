import { describe, expect, it } from 'vitest';
import { ensureDefaultZonas } from './huelgasZones';
import { detectZone } from './useHuelgaIncrementalResponseCollection';

function generatedFileName(pattern: string): string {
  return pattern.replace('{{FECHA_HUELGA_ARCHIVO}}', '17-03-2026');
}

describe('detección automática del circuito en Excel de huelgas', () => {
  it('reconoce los siete nombres exactos que TrAcción genera y adjunta a los correos', () => {
    const zonas = ensureDefaultZonas([]);

    for (const zona of zonas) {
      const fileName = generatedFileName(zona.plantillaExcelNombrePatron);
      expect(detectZone(fileName, '', '', zonas)?.id, fileName).toBe(zona.id);
    }
  });

  it('tolera prefijos de prueba y el orden LINEA_GMO sin perder el circuito actual', () => {
    const zonas = ensureDefaultZonas([]);
    const expected = zonas.find((zona) => zona.nombre === 'GMO y Línea');

    expect(expected).toBeDefined();
    expect(detectZone('PRUEBA_FICTICIA_LINEA_GMO.xlsx', '', '', zonas)?.id).toBe(expected?.id);
    expect(detectZone('PRUEBA_FICTICIA_GMO_LINEA.xlsx', '', '', zonas)?.id).toBe(expected?.id);
  });

  it('integra el nombre histórico SSCC en el bloque actual GMO y Línea', () => {
    const zonas = ensureDefaultZonas([]);
    const expected = zonas.find((zona) => zona.nombre === 'GMO y Línea');

    expect(expected).toBeDefined();
    expect(detectZone('PRUEBA_FICTICIA_SSCC.xlsx', '', '', zonas)?.id).toBe(expected?.id);
    expect(detectZone('SSCC - Seguimiento huelga 17-03-2026.xlsx', '', '', zonas)?.id).toBe(expected?.id);
  });
});
