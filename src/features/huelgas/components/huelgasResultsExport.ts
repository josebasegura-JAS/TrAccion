import type { Cell, Row, Worksheet } from 'exceljs';
import type { Huelga } from './huelgasPageModel';
import type {
  HuelgaGeneralShift,
  HuelgaResponseCollection,
} from './huelgasResponseCollection';
import { HUELGA_PERIOD_LABELS, type HuelgaResultPeriod } from './huelgasResults';

const PERIODS: HuelgaResultPeriod[] = ['noche', 'manana', 'tarde', 'global'];
const BLUE = 'FFD9EAF7';
const GOLD = 'FFFFC000';
const SUBHEADER = 'FFF2F2F2';
const TOTAL = 'FFE6B8B7';
const WHITE = 'FFFFFFFF';
const DARK = 'FF1F2937';
const BORDER = 'FF6B7280';
const RED = 'FFB91C2C';

export type HuelgaSexValues = {
  hombres: number;
  mujeres: number;
  total: number;
};

export type HuelgaExcelResultRow = {
  colectivo: string;
  personasTurno: HuelgaSexValues;
  trabajan: HuelgaSexValues;
  huelga: HuelgaSexValues;
  serviciosMinimos: HuelgaSexValues;
  seguimiento: HuelgaSexValues;
};

type MutableResultRow = Omit<HuelgaExcelResultRow, 'seguimiento'>;

function values(hombres = 0, mujeres = 0): HuelgaSexValues {
  return { hombres, mujeres, total: hombres + mujeres };
}

function percentage(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}

function addValues(target: HuelgaSexValues, hombres: number, mujeres: number) {
  target.hombres += hombres;
  target.mujeres += mujeres;
  target.total += hombres + mujeres;
}

function makeRow(colectivo: string): MutableResultRow {
  return {
    colectivo,
    personasTurno: values(),
    trabajan: values(),
    huelga: values(),
    serviciosMinimos: values(),
  };
}

export function buildHuelgaExcelRows(
  collection: HuelgaResponseCollection,
  period: HuelgaResultPeriod,
): HuelgaExcelResultRow[] {
  const rows = new Map<string, MutableResultRow>();

  for (const response of Object.values(collection.responses)) {
    for (const item of response.generalDetail ?? []) {
      if (period !== 'global' && item.turno !== period) continue;
      const key = item.colectivo.trim() || response.zonaNombre;
      const row = rows.get(key) ?? makeRow(key);
      addValues(row.personasTurno, item.personasTurno.hombres, item.personasTurno.mujeres);
      addValues(row.trabajan, item.trabajan.hombres, item.trabajan.mujeres);
      addValues(row.huelga, item.huelga.hombres, item.huelga.mujeres);
      addValues(row.serviciosMinimos, item.serviciosMinimos.hombres, item.serviciosMinimos.mujeres);
      rows.set(key, row);
    }
  }

  return Array.from(rows.values()).map((row) => ({
    ...row,
    seguimiento: {
      hombres: percentage(row.huelga.hombres, row.personasTurno.hombres),
      mujeres: percentage(row.huelga.mujeres, row.personasTurno.mujeres),
      total: percentage(row.huelga.total, row.personasTurno.total),
    },
  }));
}

function totalRow(rows: HuelgaExcelResultRow[]): HuelgaExcelResultRow {
  const total = makeRow('TOTALES');
  for (const row of rows) {
    addValues(total.personasTurno, row.personasTurno.hombres, row.personasTurno.mujeres);
    addValues(total.trabajan, row.trabajan.hombres, row.trabajan.mujeres);
    addValues(total.huelga, row.huelga.hombres, row.huelga.mujeres);
    addValues(total.serviciosMinimos, row.serviciosMinimos.hombres, row.serviciosMinimos.mujeres);
  }
  return {
    ...total,
    seguimiento: {
      hombres: percentage(total.huelga.hombres, total.personasTurno.hombres),
      mujeres: percentage(total.huelga.mujeres, total.personasTurno.mujeres),
      total: percentage(total.huelga.total, total.personasTurno.total),
    },
  };
}

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

function thinBorder(cell: Cell) {
  cell.border = {
    top: { style: 'thin', color: { argb: BORDER } },
    left: { style: 'thin', color: { argb: BORDER } },
    bottom: { style: 'thin', color: { argb: BORDER } },
    right: { style: 'thin', color: { argb: BORDER } },
  };
}

function styleRange(row: Row, from: number, to: number, fill: string, bold = false) {
  for (let column = from; column <= to; column += 1) {
    const cell = row.getCell(column);
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
    cell.font = { bold, color: { argb: DARK } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    thinBorder(cell);
  }
}

function setSexValues(row: Row, startColumn: number, data: HuelgaSexValues, percent = false) {
  const entries = [data.hombres, data.mujeres, data.total];
  entries.forEach((value, index) => {
    const cell = row.getCell(startColumn + index);
    cell.value = value;
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.numFmt = percent ? '0.00%' : '0';
    thinBorder(cell);
  });
}

function addReportSection(
  worksheet: Worksheet,
  collection: HuelgaResponseCollection,
  period: HuelgaResultPeriod,
  startRow: number,
): number {
  const rows = buildHuelgaExcelRows(collection, period);
  if (rows.length === 0) return startRow;

  const title = period === 'global' ? 'TOTAL ACUMULADO' : `TURNOS DE ${HUELGA_PERIOD_LABELS[period].toUpperCase()}`;
  worksheet.mergeCells(startRow, 1, startRow, 16);
  const titleCell = worksheet.getCell(startRow, 1);
  titleCell.value = title;
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE } };
  titleCell.font = { bold: true, color: { argb: DARK }, size: 11 };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  worksheet.getRow(startRow).height = 22;
  startRow += 1;

  worksheet.mergeCells(startRow, 2, startRow, 4);
  worksheet.mergeCells(startRow, 5, startRow, 7);
  worksheet.mergeCells(startRow, 8, startRow, 10);
  worksheet.mergeCells(startRow, 11, startRow, 13);
  worksheet.mergeCells(startRow, 14, startRow, 16);
  const group = worksheet.getRow(startRow);
  group.getCell(1).value = 'Colectivo';
  group.getCell(2).value = period === 'global' ? 'Pers. con turno N - (M-J-P)-T' : `Pers. con turno de ${HUELGA_PERIOD_LABELS[period].toLowerCase()}`;
  group.getCell(5).value = 'Personas que trabajan';
  group.getCell(8).value = 'Personas que han realizado paro';
  group.getCell(11).value = 'Personas con servicios mínimos';
  group.getCell(14).value = '% secunda el paro';
  styleRange(group, 1, 16, GOLD, true);
  worksheet.getRow(startRow).height = 34;
  startRow += 1;

  const subheader = worksheet.getRow(startRow);
  subheader.getCell(1).value = '';
  [2, 5, 8, 11, 14].forEach((column) => {
    subheader.getCell(column).value = 'Hombres';
    subheader.getCell(column + 1).value = 'Mujeres';
    subheader.getCell(column + 2).value = 'Total';
  });
  styleRange(subheader, 1, 16, SUBHEADER, true);
  startRow += 1;

  for (const data of rows) {
    const row = worksheet.getRow(startRow);
    row.getCell(1).value = data.colectivo;
    row.getCell(1).font = { color: { argb: RED } };
    row.getCell(1).alignment = { vertical: 'middle' };
    thinBorder(row.getCell(1));
    setSexValues(row, 2, data.personasTurno);
    setSexValues(row, 5, data.trabajan);
    setSexValues(row, 8, data.huelga);
    setSexValues(row, 11, data.serviciosMinimos);
    setSexValues(row, 14, data.seguimiento, true);
    startRow += 1;
  }

  const totals = totalRow(rows);
  const totalExcelRow = worksheet.getRow(startRow);
  totalExcelRow.getCell(1).value = 'TOTALES';
  setSexValues(totalExcelRow, 2, totals.personasTurno);
  setSexValues(totalExcelRow, 5, totals.trabajan);
  setSexValues(totalExcelRow, 8, totals.huelga);
  setSexValues(totalExcelRow, 11, totals.serviciosMinimos);
  setSexValues(totalExcelRow, 14, totals.seguimiento, true);
  styleRange(totalExcelRow, 1, 16, TOTAL, true);
  startRow += 1;

  worksheet.mergeCells(startRow, 1, startRow, 16);
  const note = worksheet.getCell(startRow, 1);
  note.value = 'Nota: Dentro del número de personas con turno están incluidos los servicios mínimos';
  note.font = { italic: true, size: 9, color: { argb: DARK } };
  note.alignment = { vertical: 'middle' };
  startRow += 2;

  return startRow;
}

export async function downloadHuelgaResultsWorkbook(
  huelga: Huelga,
  collection: HuelgaResponseCollection,
): Promise<void> {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'TrAcción';
  workbook.created = new Date();

  const report = workbook.addWorksheet('Seguimiento', {
    properties: { defaultRowHeight: 18 },
    views: [{ state: 'frozen', ySplit: 3, xSplit: 1 }],
    pageSetup: {
      orientation: 'landscape',
      paperSize: 9,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.25, right: 0.25, top: 0.35, bottom: 0.35, header: 0.15, footer: 0.15 },
    },
  });
  report.columns = [
    { width: 24 },
    ...Array.from({ length: 12 }, () => ({ width: 10 })),
    ...Array.from({ length: 3 }, () => ({ width: 11 })),
  ];

  report.mergeCells('A1:P1');
  report.getCell('A1').value = `RESULTADOS HUELGA · ${fileDate(huelga.fecha)} · ${huelga.sindicatos.join(' · ')}`;
  report.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: DARK } };
  report.getCell('A1').font = { bold: true, size: 13, color: { argb: WHITE } };
  report.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
  report.getRow(1).height = 26;
  report.mergeCells('A2:P2');
  report.getCell('A2').value = `Datos validados: ${new Date(collection.updatedAt).toLocaleString('es-ES')}`;
  report.getCell('A2').font = { italic: true, size: 9, color: { argb: DARK } };
  report.mergeCells('A3:P3');
  report.getCell('A3').value = 'Nota: Dentro del número de personas con turno están incluidos los servicios mínimos';
  report.getCell('A3').font = { bold: true, size: 9, color: { argb: DARK } };

  let nextRow = 5;
  for (const period of PERIODS) {
    nextRow = addReportSection(report, collection, period, nextRow);
  }
  report.pageSetup.printArea = `A1:P${Math.max(1, nextRow - 1)}`;

  const detail = workbook.addWorksheet('Detalle validado', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  detail.columns = [
    { header: 'Circuito', key: 'zona', width: 28 },
    { header: 'Turno', key: 'turno', width: 12 },
    { header: 'Colectivo', key: 'colectivo', width: 28 },
    { header: 'Turno H', key: 'turnoH', width: 11 },
    { header: 'Turno M', key: 'turnoM', width: 11 },
    { header: 'Trabajan H', key: 'trabajanH', width: 12 },
    { header: 'Trabajan M', key: 'trabajanM', width: 12 },
    { header: 'Paro H', key: 'huelgaH', width: 10 },
    { header: 'Paro M', key: 'huelgaM', width: 10 },
    { header: 'SS.MM. H', key: 'minimosH', width: 11 },
    { header: 'SS.MM. M', key: 'minimosM', width: 11 },
    { header: '% H', key: 'seguimientoH', width: 10 },
    { header: '% M', key: 'seguimientoM', width: 10 },
    { header: '% Total', key: 'seguimientoTotal', width: 11 },
    { header: 'Validado', key: 'reviewed', width: 11 },
  ];
  const detailHeader = detail.getRow(1);
  detailHeader.font = { bold: true, color: { argb: WHITE } };
  detailHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: DARK } };
  detail.autoFilter = { from: 'A1', to: 'O1' };

  for (const response of Object.values(collection.responses)) {
    for (const item of response.generalDetail ?? []) {
      const turnoTotal = item.personasTurno.hombres + item.personasTurno.mujeres;
      const huelgaTotal = item.huelga.hombres + item.huelga.mujeres;
      const row = detail.addRow({
        zona: response.zonaNombre,
        turno: HUELGA_PERIOD_LABELS[item.turno],
        colectivo: item.colectivo,
        turnoH: item.personasTurno.hombres,
        turnoM: item.personasTurno.mujeres,
        trabajanH: item.trabajan.hombres,
        trabajanM: item.trabajan.mujeres,
        huelgaH: item.huelga.hombres,
        huelgaM: item.huelga.mujeres,
        minimosH: item.serviciosMinimos.hombres,
        minimosM: item.serviciosMinimos.mujeres,
        seguimientoH: percentage(item.huelga.hombres, item.personasTurno.hombres),
        seguimientoM: percentage(item.huelga.mujeres, item.personasTurno.mujeres),
        seguimientoTotal: percentage(huelgaTotal, turnoTotal),
        reviewed: response.reviewed ? 'Sí' : 'No',
      });
      row.getCell(12).numFmt = '0.00%';
      row.getCell(13).numFmt = '0.00%';
      row.getCell(14).numFmt = '0.00%';
    }
  }

  const generated = await workbook.xlsx.writeBuffer();
  download(generated as ArrayBuffer, `Resultados huelga ${fileDate(huelga.fecha)}.xlsx`);
}
