import ExcelJS from 'exceljs';

import type { Employee } from '../../plantilla/domain/employee';
import type { TeletrabajoSolicitud } from './solicitud';
import { buildStableExportFilename } from '../../../shared/export/tableExport';

const YES = 'SI';
const NO = 'NO';

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

function buildEmployeeMap(employees: readonly Employee[]): Map<string, Employee> {
  return new Map(
    employees
      .filter((employee) => !employee.deletedAt)
      .map((employee) => [employee.empleado.trim(), employee]),
  );
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

function setBooleanCellStyle(cell: ExcelJS.Cell, value: boolean): void {
  cell.value = value ? YES : NO;
  cell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: toExcelColor(value ? '#C6EFCE' : '#FFC7CE'),
  };
  cell.font = {
    bold: true,
    color: toExcelColor(value ? '#006100' : '#9C0006'),
  };
  cell.alignment = { horizontal: 'center', vertical: 'middle' };
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
    { key: 'nivel', width: 9 },
    { key: 'empleado', width: 12 },
    { key: 'nombre', width: 34 },
    { key: 'puesto', width: 28 },
    { key: 'direccion', width: 28 },
    { key: 'martes', width: 10 },
    { key: 'miercoles', width: 12 },
    { key: 'jueves', width: 10 },
    { key: 'periodo', width: 14 },
    { key: 'cumplimiento', width: 22 },
    { key: 'informe', width: 18 },
    { key: 'anoAnterior', width: 18 },
    { key: 'validacionJefatura', width: 18 },
    { key: 'validacionDireccion', width: 22 },
    { key: 'validacionSeptiembre', width: 18 },
    { key: 'peticionMartes', width: 10 },
    { key: 'peticionMiercoles', width: 12 },
    { key: 'peticionJueves', width: 10 },
    { key: 'cambiosFueraPlazo', width: 24 },
    { key: 'observaciones', width: 42 },
  ];

  worksheet.mergeCells('A2:T2');
  const titleCell = worksheet.getCell('A2');
  titleCell.value = buildTitle(rows, periodo);
  titleCell.font = { bold: true, size: 14 };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  worksheet.getRow(2).height = 24;

  worksheet.mergeCells('A4:E4');
  worksheet.mergeCells('F4:H4');
  worksheet.mergeCells('J4:K4');
  worksheet.mergeCells('P4:R4');
  worksheet.getCell('A4').value = 'Datos de la persona';
  worksheet.getCell('F4').value = 'Días solicitados';
  worksheet.getCell('I4').value = 'Periodo';
  worksheet.getCell('J4').value = 'Revisión RRLL';
  worksheet.getCell('L4').value = 'Año anterior';
  worksheet.getCell('M4').value = 'Jefatura';
  worksheet.getCell('N4').value = 'Dirección';
  worksheet.getCell('O4').value = '22 septiembre';
  worksheet.getCell('P4').value = 'Petición II';
  worksheet.getCell('S4').value = 'Cambios fuera de plazo ordinario';
  worksheet.getCell('T4').value = 'Observaciones';

  const headers = [
    'Nivel',
    'Nº Empleado',
    'Nombre y apellidos',
    'Detalle del puesto',
    'Dirección',
    'Martes',
    'Miércoles',
    'Jueves',
    'Periodo',
    'Cumplimiento Condiciones Presencialidad',
    'Informe Favorable',
    'Año Anterior Teletrabajado',
    'Validación Jefatura',
    'Validación ordinaria de la Dirección',
    'Validación 22 septiembre',
    'Martes',
    'Miércoles',
    'Jueves',
    'Cambios fuera de plazo ordinario',
    'Observaciones',
  ];
  worksheet.getRow(5).values = headers;

  [4, 5].forEach((rowNumber) => {
    const row = worksheet.getRow(rowNumber);
    row.height = rowNumber === 5 ? 34 : 22;
    row.eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: toExcelColor('#D9EAF7'),
      };
      cell.font = { bold: true };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' },
      };
    });
  });

  rows.forEach((solicitud, index) => {
    const employee = employeesById.get(solicitud.empleado.trim());
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

    setBooleanCellStyle(row.getCell(10), solicitud.revisado);
    setBooleanCellStyle(row.getCell(11), solicitud.validacionJefatura);
    setBooleanCellStyle(row.getCell(13), solicitud.validacionJefatura);

    row.eachCell((cell, colNumber) => {
      cell.alignment = {
        horizontal: [1, 2, 6, 7, 8, 9, 10, 11, 12, 13].includes(colNumber) ? 'center' : 'left',
        vertical: 'middle',
        wrapText: true,
      };
      cell.border = {
        top: { style: 'thin', color: toExcelColor('#D9D9D9') },
        left: { style: 'thin', color: toExcelColor('#D9D9D9') },
        bottom: { style: 'thin', color: toExcelColor('#D9D9D9') },
        right: { style: 'thin', color: toExcelColor('#D9D9D9') },
      };
    });
  });

  worksheet.autoFilter = {
    from: 'A5',
    to: 'T5',
  };

  const buffer = await workbook.xlsx.writeBuffer();
  await openWorkbookInExcel(buffer, buildStableExportFilename('teletrabajo-direccion', generatedAt));
}
