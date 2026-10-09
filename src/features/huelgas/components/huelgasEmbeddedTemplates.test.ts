import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import {
  EMBEDDED_HUELGA_TEMPLATES,
  embeddedTemplateForDate,
} from './huelgasEmbeddedTemplates';

describe('plantillas Excel de comunicaciones de Huelgas', () => {
  it('genera un XLSX válido para los siete circuitos aunque una plantilla embebida esté dañada', async () => {
    const entries = Object.entries(EMBEDDED_HUELGA_TEMPLATES);
    expect(entries).toHaveLength(7);

    for (const [circuito, template] of entries) {
      const buffer = await embeddedTemplateForDate(template, '2026-10-09');
      const bytes = new Uint8Array(buffer);

      expect(bytes.byteLength, circuito).toBeGreaterThan(1_000);
      expect(Array.from(bytes.slice(0, 2)), circuito).toEqual([0x50, 0x4b]);

      // En Vitest/Node, JSZip puede rechazar un ArrayBuffer procedente del entorno
      // simulado aunque sus bytes sean correctos. Uint8Array es un tipo soportado
      // de forma estable y valida exactamente el mismo contenido XLSX.
      const zip = await JSZip.loadAsync(bytes);
      expect(zip.file('[Content_Types].xml'), circuito).not.toBeNull();
      expect(zip.folder('xl'), circuito).not.toBeNull();
    }
  });
});
