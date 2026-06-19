import ExcelJS from 'exceljs';

import type { Employee } from '../../plantilla/domain/employee';
import type { TeletrabajoSolicitud } from './solicitud';
import { buildStableExportFilename } from '../../../shared/export/tableExport';

const YES = 'SI';
const NO = 'NO';
const ROTIS_FONT = 'TrueRotisSemiSansLightTwo';
const SOFT_GREEN = '#E2F0D9';
const SOFT_RED = '#FFC7CE';
const SOFT_RED_TEXT = '#9C0006';
const SOFT_GREEN_TEXT = '#006100';

function toExcelColor(hex: string): { argb: string } {
  return { argb: `FF${hex.replace('#', '').toUpperCase()}` };
}

function normalizeWorkbookBuffer(buffer: ArrayBuffer | ArrayBufferView): ArrayBuffer {
  if (buffer instanceof ArrayBuffer) {
    return buffer;
  }

  const copy = new Uint8Array(buffer.byteLength);
  copy.set(new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength));
  return copy.buffer;
}

function normalizeEmployeeKey(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  const numeric = Number(trimmed.replace(/\D/g, ''));
  if (Number.isFinite(numeric) && numeric > 0) {
    return String(numeric);
  }

  return trimmed.toLocaleLowerCase('es-ES');
}

function buildEmployeeMap(employees: readonly Employee[]): Map<string, Employee> {
  const employeesById = new Map<string, Employee>();

  employees
    .filter((employee) => !employee.deletedAt)
    .forEach((employee) => {
      const rawKey = employee.empleado.trim();
      const normalizedKey = normalizeEmployeeKey(employee.empleado);

      if (rawKey) {
        employeesById.set(rawKey, employee);
      }
      if (normalizedKey) {
        employeesById.set(normalizedKey, employee);
      }
    });

  return employeesById;
}

function findEmployee(employeesById: Map<string, Employee>, empleado: string): Employee | undefined {
  return employeesById.get(empleado.trim()) ?? employeesById.get(normalizeEmployeeKey(empleado));
}

function hasDia(solicitud: TeletrabajoSolicitud, dia: 'martes' | 'miercoles' | 'jueves'): string {
  return solicitud.diasTeletrabajo.includes(dia) ? 'X' : '';
}

function buildTitle(rows: readonly TeletrabajoSolicitud[], selectedPeriodo?: string): string {
  const periodo = selectedPeriodo?.trim();
  if (periodo) {
    return `Solicitudes Teletrabajo periodo ${periodo}`;
  }

  const periodos = Array.from(new Set(rows.map((row) => row.periodo.trim()).filter(Boolean)));
  if (periodos.length === 1) {
    return `Solicitudes Teletrabajo periodo ${periodos[0]}`;
  }

  return 'Solicitudes Teletrabajo';
}

function setValidationCellStyle(cell: ExcelJS.Cell, value: boolean): void {
  cell.value = value ? YES : NO;
  cell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: toExcelColor(value ? SOFT_GREEN : SOFT_RED),
  };
  cell.font = {
    name: ROTIS_FONT,
    size: 11,
    bold: true,
    color: toExcelColor(value ? SOFT_GREEN_TEXT : SOFT_RED_TEXT),
  };
  cell.alignment = { horizontal: 'center', vertical: 'middle' };
  cell.border = buildDottedBorder();
}

function setManualValidationCellStyle(cell: ExcelJS.Cell): void {
  cell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: toExcelColor(SOFT_GREEN),
  };
  cell.font = { name: ROTIS_FONT, size: 11 };
  cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  cell.border = buildDottedBorder();
}

function setAnoAnteriorCellStyle(cell: ExcelJS.Cell, value: string): void {
  const isPreviousTeletrabajo = value === YES;
  cell.value = value;
  cell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: toExcelColor(isPreviousTeletrabajo ? SOFT_RED : SOFT_GREEN),
  };
  cell.font = {
    name: ROTIS_FONT,
    size: 11,
    color: toExcelColor(isPreviousTeletrabajo ? SOFT_RED_TEXT : SOFT_GREEN_TEXT),
  };
  cell.alignment = { horizontal: 'center', vertical: 'middle' };
  cell.border = buildDottedBorder();
}

function buildDottedBorder(): Partial<ExcelJS.Borders> {
  return {
    top: { style: 'dotted' },
    left: { style: 'dotted' },
    bottom: { style: 'dotted' },
    right: { style: 'dotted' },
  };
}

async function openWorkbookInExcel(
  buffer: ArrayBuffer | ArrayBufferView,
  filename: string,
): Promise<void> {
  const openExcelWorkbook = window.traccion?.openExcelWorkbook;

  if (!openExcelWorkbook) {
    throw new Error('La apertura directa en Excel no está disponible en este entorno.');
  }

  const result = await openExcelWorkbook(normalizeWorkbookBuffer(buffer), filename);
  if (!result.ok) {
    throw new Error(result.message || 'No se ha podido abrir el Excel generado.');
  }
}

export async function exportTeletrabajoDireccionToExcel({
  rows,
  employees,
  periodo,
}: {
  rows: readonly TeletrabajoSolicitud[];
  employees: readonly Employee[];
  periodo?: string;
}): Promise<void> {
  const generatedAt = new Date();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'TrAccion';
  workbook.created = generatedAt;
  workbook.modified = generatedAt;

  const worksheet = workbook.addWorksheet('Teletrabajo Dirección', {
    views: [{ state: 'frozen', ySplit: 5 }],
  });
  const employeesById = buildEmployeeMap(employees);

  worksheet.columns = [
    { key: 'nivel', width: 2.27 },
    { key: 'empleado', width: 8.27 },
    { key: 'nombre', width: 30 },
    { key: 'puesto', width: 36 },
    { key: 'direccion', width: 26.82 },
    { key: 'martes', width: 6.09 },
    { key: 'miercoles', width: 8.09 },
    { key: 'jueves', width: 5.63 },
    { key: 'periodo', width: 10.45 },
    { key: 'cumplimiento', width: 13.82 },
    { key: 'informe', width: 11.09 },
    { key: 'anoAnterior', width: 14 },
    { key: 'validacionJefatura', width: 16.18 },
    { key: 'validacionDireccion', width: 38.54 },
    { key: 'validacionSeptiembre', width: 31.36 },
    { key: 'peticionMartes', width: 8.27 },
    { key: 'peticionMiercoles', width: 8.09 },
    { key: 'peticionJueves', width: 5.63 },
    { key: 'cambiosFueraPlazo', width: 52.09 },
    { key: 'observaciones', width: 40.73 },
  ];

  worksheet.mergeCells('B2:D2');
  const titleCell = worksheet.getCell('B2');
  titleCell.value = buildTitle(rows, periodo);
  titleCell.font = { name: 'Calibri', size: 11, bold: false };
  titleCell.alignment = { horizontal: 'left', vertical: 'middle' };
  worksheet.getRow(2).height = 20.5;

  worksheet.mergeCells('B4:C4');
  worksheet.mergeCells('D4:E4');
  worksheet.mergeCells('F4:H4');
  worksheet.mergeCells('P4:R4');

  worksheet.getCell('B4').value = 'Solicitante';
  worksheet.getCell('D4').value = 'Puesto de Trabajo';
  worksheet.getCell('F4').value = 'Petición original';
  worksheet.getCell('I4').value = 'Periodo 2025-2026';
  worksheet.getCell('J4').value = 'Cumplimiento Condiciones Presencialidad';
  worksheet.getCell('K4').value = 'Informe Favorable';
  worksheet.getCell('L4').value = 'Año Anterior Teletrabajado';
  worksheet.getCell('M4').value = 'Validación Jefatura de Unidad a Repetir ';
  worksheet.getCell('N4').value = 'Validación ordinaria de la Dirección ';
  worksheet.getCell('O4').value = 'Validación 22 septiembre 2022';
  worksheet.getCell('P4').value = 'Petición II';
  worksheet.getCell('S4').value = 'Cambios fuera de plazo ordinario';
  worksheet.getCell('T4').value = 'Observaciones';

  worksheet.getRow(5).values = [
    '',
    'Nº Empl',
    'Nombre',
    'Detalle',
    'Dirección',
    'Martes',
    'Miércoles',
    'Jueves',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    'Martes',
    'Miércoles',
    'Jueves',
    '',
    '',
  ];

  worksheet.getRow(4).height = 42.5;

  [4, 5].forEach((rowNumber) => {
    const row = worksheet.getRow(rowNumber);
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      if (colNumber === 1) {
        return;
      }
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: toExcelColor('#FF0000'),
      };
      cell.font = { name: ROTIS_FONT, size: 11, bold: true };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = buildDottedBorder();
    });
  });

  rows.forEach((solicitud, index) => {
    const employee = findEmployee(employeesById, solicitud.empleado);
    const rowNumber = 6 + index;
    const row = worksheet.getRow(rowNumber);

    row.values = [
      employee?.nivelRetributivo ?? '',
      solicitud.empleado,
      solicitud.nombreApellidos,
      solicitud.puestoNomina,
      employee?.direccionOrganizativa ?? '',
      hasDia(solicitud, 'martes'),
      hasDia(solicitud, 'miercoles'),
      hasDia(solicitud, 'jueves'),
      solicitud.periodo,
      '',
      '',
      solicitud.tipoSolicitud === 'renovacion' ? YES : NO,
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      solicitud.observaciones,
    ];

    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      cell.font = { name: ROTIS_FONT, size: 11 };
      cell.alignment = {
        horizontal: [1, 2, 6, 7, 8, 9, 12].includes(colNumber) ? 'center' : 'left',
        vertical: 'middle',
        wrapText: true,
      };
    });

    setValidationCellStyle(row.getCell(10), solicitud.revisado);
    setValidationCellStyle(row.getCell(11), solicitud.validacionJefatura);
    setAnoAnteriorCellStyle(row.getCell(12), solicitud.tipoSolicitud === 'renovacion' ? YES : NO);
    [13, 14, 15].forEach((columnNumber) => setManualValidationCellStyle(row.getCell(columnNumber)));
  });

  worksheet.autoFilter = {
    from: 'B5',
    to: 'T5',
  };

  const buffer = await workbook.xlsx.writeBuffer();
  await openWorkbookInExcel(buffer, buildStableExportFilename('teletrabajo-direccion', generatedAt));
}
