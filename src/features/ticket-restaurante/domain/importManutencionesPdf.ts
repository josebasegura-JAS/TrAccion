import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import type { TicketPerson } from './ticketRestaurante';
import { importTicketManutenciones, type TicketManutencionPreviewRow } from './importManutenciones';

/** Extracts rows from text-based GastosManutencion_RelExternas reports. */
export async function importTicketManutencionesPdf(
  buffer: ArrayBuffer,
  ticketPeople: readonly TicketPerson[],
): Promise<TicketManutencionPreviewRow[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const document = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
  const rows: string[][] = [
    ['Empleado/a', 'Nombre', 'Id Hoja', 'Fecha Gasto', 'Importe', 'Repartido Entre', 'Nombre repartido'],
  ];
  let finished = false;
  try {
    for (let pageNumber = 1; pageNumber <= document.numPages && !finished; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const lines: Array<{ y: number; parts: Array<{ x: number; text: string }> }> = [];
      for (const item of content.items) {
        if (!('str' in item) || !item.str.trim()) continue;
        const x = item.transform[4];
        const y = item.transform[5];
        let line = lines.find((candidate) => Math.abs(candidate.y - y) < 2.5);
        if (!line) {
          line = { y, parts: [] };
          lines.push(line);
        }
        line.parts.push({ x, text: item.str.trim() });
      }
      lines.sort((a, b) => b.y - a.y);
      for (const line of lines) {
        const parts = line.parts.sort((a, b) => a.x - b.x);
        const full = parts.map((part) => part.text).join(' ');
        if (/^relaciones externas\b/i.test(full.trim())) {
          finished = true;
          break;
        }
        if (/fecha contabilizaci[oó]n|empleado\/a|id hoja|p[aá]g\s*\.|gastos de manutenci[oó]n|GastosManutencion_RelExternas|^fecha\s*:/i.test(full)) continue;
        const cells = Array.from({ length: 7 }, () => '');
        for (const part of parts) {
          const column = part.x < 190 ? 0 : part.x < 395 ? 1 : part.x < 450 ? 2 : part.x < 545 ? 3 : part.x < 605 ? 4 : part.x < 640 ? 5 : 6;
          cells[column] = [cells[column], part.text].filter(Boolean).join(' ');
        }
        if (!/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(cells[3]) && !/^\d[\d.]*$/.test(cells[0]) && !/^\d[\d.]*$/.test(cells[5])) continue;
        rows.push(cells);
      }
    }
  } finally {
    await document.destroy();
  }
  if (rows.length === 1) {
    throw new Error('No se han reconocido filas de manutención. Comprueba que el PDF tiene texto seleccionable y el formato esperado.');
  }
  return importTicketManutenciones(rows, ticketPeople);
}
