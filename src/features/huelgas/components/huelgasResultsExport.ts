import type { Huelga } from './huelgasPageModel';
import type { HuelgaResponseCollection } from './huelgasResponseCollection';
import {
  HUELGA_PERIOD_LABELS,
  formatSeguimiento,
  huelgaExecutiveSummary,
  type HuelgaResultPeriod,
  type HuelgaResults,
} from './huelgasResults';

const PERIODS: HuelgaResultPeriod[] = ['noche', 'manana', 'tarde', 'global'];
const RED = 'FFB91C2C';
const DARK = 'FF1F2937';
const LIGHT = 'FFF3F4F6';
const WHITE = 'FFFFFFFF';
const GREEN = 'FF217346';

function fileDate(fecha: string): string {
  const [year, month, day] = fecha.split('-');
  return `${day}-${month}-${year}`;
}

function download(buffer: ArrayBuffer, fileName: string) {
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(href);
}

export async function downloadHuelgaResultsWorkbook(
  huelga: Huelga,
  collection: HuelgaResponseCollection,
  results: HuelgaResults,
): Promise<void> {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'TrAcción';
  workbook.created = new Date();

  const summary = workbook.addWorksheet('Resumen', {
    views: [{ state: 'frozen', ySplit: 5 }],
    properties: { defaultRowHeight: 20 },
  });
  summary.columns = [
    { key: 'a', width: 24 },
    { key: 'b', width: 18 },
    { key: 'c', width: 18 },
    { key: 'd', width: 18 },
    { key: 'e', width: 18 },
    { key: 'f', width: 20 },
  ];
  summary.mergeCells('A1:F1');
  summary.getCell('A1').value = 'RESULTADOS DE HUELGA · TRACCIÓN';
  summary.getCell('A1').font = { bold: true, size: 16, color: { argb: WHITE } };
  summary.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: RED } };
  summary.getCell('A1').alignment = { vertical: 'middle' };
  summary.getRow(1).height = 30;
  summary.mergeCells('A2:F2');
  summary.getCell('A2').value = `Fecha: ${huelga.fecha} · Convocantes: ${huelga.sindicatos.join(' · ')}`;
  summary.getCell('A2').font = { bold: true, color: { argb: DARK } };
  summary.mergeCells('A3:F3');
  summary.getCell('A3').value = `Datos validados / actualizados: ${new Date(collection.updatedAt).toLocaleString('es-ES')}`;
  summary.getCell('A3').font = { italic: true, color: { argb: 'FF6B7280' } };

  const headerRow = summary.getRow(5);
  headerRow.values = ['Corte', 'Con turno', 'Huelga', 'Trabajan', 'SS.MM.', 'Seguimiento'];
  headerRow.font = { bold: true, color: { argb: WHITE } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: DARK } };
  headerRow.alignment = { horizontal: 'center' };

  let rowIndex = 6;
  for (const period of PERIODS) {
    const result = results[period];
    const row = summary.getRow(rowIndex);
    row.values = [
      HUELGA_PERIOD_LABELS[period],
      result.totals.personasTurno,
      result.totals.personasHuelga,
      result.totals.personasTrabajan,
      result.totals.serviciosMinimos,
      result.hasData ? result.totals.seguimiento / 100 : null,
    ];
    row.getCell(6).numFmt = '0.0%';
    if (period === 'global') {
      row.font = { bold: true };
      row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT } };
    }
    rowIndex += 1;
  }

  rowIndex += 1;
  for (const period of PERIODS) {
    const result = results[period];
    if (!result.hasData) continue;
    summary.mergeCells(`A${rowIndex}:F${rowIndex}`);
    summary.getCell(`A${rowIndex}`).value = `${HUELGA_PERIOD_LABELS[period]} · ${huelgaExecutiveSummary(result)}`;
    summary.getCell(`A${rowIndex}`).alignment = { wrapText: true, vertical: 'top' };
    summary.getCell(`A${rowIndex}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } };
    summary.getCell(`A${rowIndex}`).border = {
      left: { style: 'thin', color: { argb: RED } },
    };
    summary.getRow(rowIndex).height = 34;
    rowIndex += 2;
  }

  const byArea = workbook.addWorksheet('Resultados por área', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  byArea.columns = [
    { header: 'Corte', key: 'period', width: 14 },
    { header: 'Área / circuito', key: 'area', width: 34 },
    { header: 'Con turno', key: 'turno', width: 14 },
    { header: 'SS.MM.', key: 'minimos', width: 12 },
    { header: 'Trabajan', key: 'trabajan', width: 12 },
    { header: 'Huelga', key: 'huelga', width: 12 },
    { header: 'Seguimiento', key: 'seguimiento', width: 16 },
  ];
  byArea.getRow(1).font = { bold: true, color: { argb: WHITE } };
  byArea.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: RED } };
  byArea.autoFilter = { from: 'A1', to: 'G1' };

  for (const period of PERIODS) {
    for (const area of results[period].areas) {
      const row = byArea.addRow({
        period: HUELGA_PERIOD_LABELS[period],
        area: area.nombre,
        turno: area.personasTurno,
        minimos: area.serviciosMinimos,
        trabajan: area.personasTrabajan,
        huelga: area.personasHuelga,
        seguimiento: area.seguimiento / 100,
      });
      row.getCell(7).numFmt = '0.0%';
    }
  }
  byArea.getColumn(7).font = { color: { argb: GREEN } };

  const detail = workbook.addWorksheet('Detalle validado', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  detail.columns = [
    { header: 'Circuito', key: 'zona', width: 30 },
    { header: 'Turno', key: 'turno', width: 12 },
    { header: 'Colectivo', key: 'colectivo', width: 30 },
    { header: 'Con turno', key: 'personasTurno', width: 13 },
    { header: 'SS.MM.', key: 'serviciosMinimos', width: 12 },
    { header: 'Trabajan', key: 'trabajan', width: 12 },
    { header: 'Huelga', key: 'huelga', width: 12 },
    { header: 'Seguimiento', key: 'seguimiento', width: 16 },
    { header: 'Validado', key: 'reviewed', width: 12 },
  ];
  detail.getRow(1).font = { bold: true, color: { argb: WHITE } };
  detail.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: RED } };
  detail.autoFilter = { from: 'A1', to: 'I1' };

  for (const response of Object.values(collection.responses)) {
    for (const item of response.generalDetail ?? []) {
      const turno = item.personasTurno.hombres + item.personasTurno.mujeres;
      const minimos = item.serviciosMinimos.hombres + item.serviciosMinimos.mujeres;
      const trabajan = item.trabajan.hombres + item.trabajan.mujeres;
      const huelgaCount = item.huelga.hombres + item.huelga.mujeres;
      const seguimiento = turno > 0 ? huelgaCount / turno : 0;
      const row = detail.addRow({
        zona: response.zonaNombre,
        turno: HUELGA_PERIOD_LABELS[item.turno],
        colectivo: item.colectivo,
        personasTurno: turno,
        serviciosMinimos: minimos,
        trabajan,
        huelga: huelgaCount,
        seguimiento,
        reviewed: response.reviewed ? 'Sí' : 'No',
      });
      row.getCell(8).numFmt = '0.0%';
    }
  }

  for (const worksheet of workbook.worksheets) {
    worksheet.eachRow((row) => {
      row.alignment = { ...row.alignment, vertical: 'middle' };
    });
  }

  const generated = await workbook.xlsx.writeBuffer();
  download(
    generated as ArrayBuffer,
    `Resultados huelga ${fileDate(huelga.fecha)}.xlsx`,
  );
}

export function resultLabelForExport(results: HuelgaResults, period: HuelgaResultPeriod): string {
  const result = results[period];
  return result.hasData ? formatSeguimiento(result.totals.seguimiento) : 'Sin datos';
}
