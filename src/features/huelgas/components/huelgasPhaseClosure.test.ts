import { describe, expect, it } from 'vitest';
import { EMBEDDED_HUELGA_TEMPLATES } from './huelgasEmbeddedTemplates';
import { DEFAULT_HUELGA_ZONE_NAMES } from './huelgasZones';

function normalizeKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-ES')
    .replace(/\s+/g, ' ')
    .trim();
}

describe('Huelgas — cierre de fase comunicaciones', () => {
  it('dispone de una plantilla Excel embebida para cada uno de los siete circuitos', () => {
    const missing = DEFAULT_HUELGA_ZONE_NAMES.filter((name) => !EMBEDDED_HUELGA_TEMPLATES[normalizeKey(name)]);
    expect(missing).toEqual([]);
  });

  it('cada plantilla define un nombre de fichero Excel', () => {
    for (const name of DEFAULT_HUELGA_ZONE_NAMES) {
      const template = EMBEDDED_HUELGA_TEMPLATES[normalizeKey(name)];
      expect(template.fileNamePattern).toMatch(/\.xlsx$/i);
      expect(template.base64.length).toBeGreaterThan(100);
    }
  });
});
