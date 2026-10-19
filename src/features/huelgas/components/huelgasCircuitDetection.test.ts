import { describe, expect, it } from 'vitest';
import { ensureDefaultZonas } from './huelgasZones';
import { detectZone } from './useHuelgaIncrementalResponseCollection';
import { INTERNAL_SSGG_ZONE } from './useHuelgaResponseCollection';

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

  it('envía nombres SSCC a Servicios Generales interno y nunca al circuito GMO y Línea', () => {
    const zonas = ensureDefaultZonas([]);
    const expected = INTERNAL_SSGG_ZONE;

    expect(expected).toBeDefined();
    expect(detectZone('PRUEBA_FICTICIA_SSCC.xlsx', '', '', zonas)?.id).toBe(expected?.id);
    expect(detectZone('SSCC - Seguimiento huelga 17-03-2026.xlsx', '', '', zonas)?.id).toBe(expected.id);
    expect(detectZone('PRUEBA_FICTICIA_SSCC(2).xlsx', '', '', zonas)?.id).toBe(expected.id);
    expect(detectZone('Servicios Centrales - Seguimiento huelga.xlsx', '', '', zonas)?.id).toBe(expected.id);
    expect(detectZone('Línea y GMO - Seguimiento huelga.xlsx', '', '', zonas)?.nombre).toBe('GMO y Línea');
  });
});
