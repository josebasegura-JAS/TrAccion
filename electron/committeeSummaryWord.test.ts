import { describe, expect, it } from 'vitest';
import { updateCommitteeSummaryDocumentXml } from './committeeSummaryWord';

const XML = `<?xml version="1.0"?><w:document><w:body><w:tbl><w:tr><w:tc><w:p><w:r><w:t>2026</w:t></w:r></w:p></w:tc></w:tr><w:tr><w:tc><w:p><w:r><w:t>26-PE-AR-0xx</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t></w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Orden del día</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Varios.</w:t></w:r></w:p></w:tc></w:tr><w:tr><w:tc><w:p><w:r><w:t></w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t></w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t></w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t></w:t></w:r></w:p></w:tc></w:tr><w:tr><w:tc><w:p><w:r><w:t>26-PE-AR-046</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>21/07/2026</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Orden del día</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t></w:t></w:r></w:p></w:tc></w:tr><w:tr><w:tc><w:p><w:r><w:t></w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t></w:t></w:r></w:p></w:tc><w:tc><w:p><w:pPr><w:numPr/></w:pPr><w:r><w:t>Turnos PMC 2º reunión</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t></w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>`;

describe('updateCommitteeSummaryDocumentXml', () => {
  it('inserta el nuevo comité tras el placeholder y conserva todos sus puntos', () => {
    const result = updateCommitteeSummaryDocumentXml(XML, {
      code: '26-PE-AR-050',
      date: '2026-10-06',
      points: ['Primer punto', 'Segundo & punto'],
    });
    expect(result.alreadyPresent).toBe(false);
    expect(result.xml).toContain('26-PE-AR-050');
    expect(result.xml).toContain('06/10/2026');
    expect(result.xml).toContain('Primer punto');
    expect(result.xml).toContain('Segundo &amp; punto');
    expect(result.xml.indexOf('26-PE-AR-050')).toBeLessThan(result.xml.indexOf('26-PE-AR-046'));
  });

  it('es idempotente si el código ya existe', () => {
    const once = updateCommitteeSummaryDocumentXml(XML, {
      code: '26-PE-AR-050', date: '2026-10-06', points: ['Uno'],
    });
    const twice = updateCommitteeSummaryDocumentXml(once.xml, {
      code: '26-PE-AR-050', date: '2026-10-06', points: ['Uno'],
    });
    expect(twice.alreadyPresent).toBe(true);
    expect((twice.xml.match(/26-PE-AR-050/g) ?? []).length).toBe(1);
  });
});
