import { describe, expect, it } from 'vitest';
import { updateParitariaSummaryDocumentXml } from './paritariaSummaryWord.js';

const paragraph = (text: string) => `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`;
const cell = (text: string) => `<w:tc>${paragraph(text)}</w:tc>`;
const row = (...cells: string[]) => `<w:tr>${cells.join('')}</w:tr>`;
const table = (...rows: string[]) => `<w:tbl>${rows.join('')}</w:tbl>`;

function documentWith2026(): string {
  return `<w:document><w:body>${table(
    row(cell('2024')),
    row(cell('24-PE-AR-050'), cell('11/07/2024'), cell('Orden del día.'), cell('Varios.')),
    row(cell(''), cell('Punto anterior'), cell('')),
    row(cell('2026')),
    row(cell('26-PE-AR-013'), cell('13/03/2026'), cell('Orden del día.'), cell('Varios.')),
    row(cell(''), cell('Interpretación artículo 26'), cell('')),
    row(cell(''), cell(''), cell('')),
  )}</w:body></w:document>`;
}

describe('updateParitariaSummaryDocumentXml', () => {
  it('añade una sesión al final del año existente y antes de las filas vacías', () => {
    const result = updateParitariaSummaryDocumentXml(documentWith2026(), {
      code: '26-PE-AR-099',
      date: '2026-10-06',
      points: ['Primer punto', 'Segundo punto'],
    });
    expect(result.alreadyPresent).toBe(false);
    expect(result.xml).toContain('26-PE-AR-099');
    expect(result.xml).toContain('06/10/2026');
    expect(result.xml).toContain('Primer punto');
    expect(result.xml).toContain('Segundo punto');
    expect(result.xml.indexOf('26-PE-AR-013')).toBeLessThan(result.xml.indexOf('26-PE-AR-099'));
  });

  it('no duplica una sesión ya incluida', () => {
    const result = updateParitariaSummaryDocumentXml(documentWith2026(), {
      code: '26-PE-AR-013',
      date: '2026-03-13',
      points: ['No debe añadirse'],
    });
    expect(result.alreadyPresent).toBe(true);
  });

  it('crea el bloque de un año nuevo al final', () => {
    const result = updateParitariaSummaryDocumentXml(documentWith2026(), {
      code: '27-PE-AR-001',
      date: '2027-01-15',
      points: ['Primer punto 2027'],
    });
    expect(result.alreadyPresent).toBe(false);
    expect(result.xml).toContain('2027');
    expect(result.xml).toContain('27-PE-AR-001');
    expect(result.xml.indexOf('2026')).toBeLessThan(result.xml.indexOf('2027'));
  });
});
