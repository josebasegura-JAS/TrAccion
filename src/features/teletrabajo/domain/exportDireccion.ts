import ExcelJS from 'exceljs';

import type { Employee } from '../../plantilla/domain/employee';
import { evaluateTeletrabajoAntiguedad } from './antiguedad';
import { buildGruposCoberturaByIdMap, type GrupoCobertura } from './gruposCobertura';
import type { TeletrabajoPuesto } from './puestosTeletrabajo';
import { normalizeTeletrabajoPuesto } from './puestosTeletrabajo';
import {
  buildPuestosByKey,
  buildSolicitudPeriodoPuestoDiaKey,
  buildSolicitudesByPeriodoPuestoCount,
  evaluateTeletrabajoPresencialidad,
} from './semaforo';
import { TELETRABAJO_DIAS, type TeletrabajoSolicitud } from './solicitud';
import { buildStableExportFilename } from '../../../shared/export/tableExport';

const YES = 'SI';
const NO = 'NO';
const ROTIS_FONT = 'TrueRotisSemiSansLightTwo';
const SOFT_GREEN = '#E2F0D9';
const SOFT_RED = '#FFC7CE';
const SOFT_YELLOW = '#FFF2CC';
const SOFT_RED_TEXT = '#9C0006';
const SOFT_GREEN_TEXT = '#006100';
const SOFT_YELLOW_TEXT = '#7F6000';

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


/**
 * Clave de cobertura de un puesto: si pertenece a un grupo de cobertura (varios
 * puestos coordinados que comparten presencialidad mínima), la clave es el id
 * del grupo. Si no pertenece a ningún grupo, el puesto cubre solo por sí mismo.
 * Misma lógica que semaforo.ts (duplicada deliberadamente para que el
 * exportador no dependa de ese módulo).
 */
function getGrupoCoberturaKey(puesto: TeletrabajoPuesto, puestoKey: string): string {
  return puesto.grupoCoberturaId ? `grupo::${puesto.grupoCoberturaId}` : puestoKey;
}

function getPuestosInGrupo(
  puestosByKey: Map<string, TeletrabajoPuesto>,
  grupoKey: string,
): TeletrabajoPuesto[] {
  return Array.from(puestosByKey.entries())
    .filter(([puestoKey, puesto]) => getGrupoCoberturaKey(puesto, puestoKey) === grupoKey)
    .map(([, puesto]) => puesto);
}


function getDotacionRealGrupo(
  employees: Iterable<Employee>,
  puestosByKey: Map<string, TeletrabajoPuesto>,
  grupoKey: string,
): number {
  return new Set(
    Array.from(employees)
      .filter((employee) => {
        if (employee.deletedAt) {
          return false;
        }

        const empleadoKey = employee.empleado.trim();
        if (!empleadoKey) {
          return false;
        }

        const employeePuestoKey = normalizeTeletrabajoPuesto(employee.puestoOrganizativo);
        const employeePuesto = puestosByKey.get(employeePuestoKey);
        return employeePuesto
          ? getGrupoCoberturaKey(employeePuesto, employeePuestoKey) === grupoKey
          : false;
      })
      .map((employee) => employee.empleado.trim()),
  ).size;
}

function getDotacionComputableGrupo(
  puestosByKey: Map<string, TeletrabajoPuesto>,
  grupoKey: string,
): number {
  return getPuestosInGrupo(puestosByKey, grupoKey).reduce(
    (total, puesto) => total + Math.max(0, Math.floor(puesto.dotacionComputable ?? 0)),
    0,
  );
}

function getPresencialidadMinimaGrupo(
  puestosByKey: Map<string, TeletrabajoPuesto>,
  grupoKey: string,
  gruposById: Map<string, GrupoCobertura>,
): number {
  const [primerPuesto] = getPuestosInGrupo(puestosByKey, grupoKey);
  if (primerPuesto?.grupoCoberturaId) {
    const grupo = gruposById.get(primerPuesto.grupoCoberturaId);
    if (grupo) {
      return Math.max(0, Math.floor(grupo.presencialidadMinima ?? 0));
    }
  }

  return Math.max(
    0,
    ...getPuestosInGrupo(puestosByKey, grupoKey).map((puesto) => Math.max(0, Math.floor(puesto.maxSolicitudes ?? 0))),
  );
}

/** Mismo formato que semaforo.ts, para que el Excel de Dirección y la app muestren el mismo texto. */
function pluralPersonas(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
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


export type TeletrabajoExportAssessment = {
  status: 'ok' | 'review' | 'blocked' | 'rejected';
  cellValue: string;
  rowFillColor: string | null;
  textColor: string;
  apuntesRrll: string;
};

export function buildTeletrabajoAssessment({
  solicitud,
  employeesById,
  puestosByKey,
  solicitudesByPuestoDiaCount,
  gruposById = new Map(),
}: {
  solicitud: TeletrabajoSolicitud;
  employeesById: Map<string, Employee>;
  puestosByKey: Map<string, TeletrabajoPuesto>;
  solicitudesByPuestoDiaCount: Map<string, number>;
  gruposById?: Map<string, GrupoCobertura>;
}): TeletrabajoExportAssessment {
  if (solicitud.estado === 'denegada') {
    return {
      status: 'rejected',
      cellValue: NO,
      rowFillColor: SOFT_RED,
      textColor: SOFT_RED_TEXT,
      apuntesRrll: 'Rechazada por RRLL',
    };
  }

  const employee = findEmployee(employeesById, solicitud.empleado);
  const antiguedad = evaluateTeletrabajoAntiguedad(solicitud, employee);

  if (antiguedad.status === 'no-cumple') {
    return {
      status: 'blocked',
      cellValue: NO,
      rowFillColor: SOFT_RED,
      textColor: SOFT_RED_TEXT,
      apuntesRrll: 'Antigüedad insuficiente',
    };
  }

  if (antiguedad.status === 'sin-dato') {
    return {
      status: 'review',
      cellValue: 'REVISAR',
      rowFillColor: SOFT_YELLOW,
      textColor: SOFT_YELLOW_TEXT,
      apuntesRrll: antiguedad.title,
    };
  }

  const puestoKey = normalizeTeletrabajoPuesto(solicitud.puestoOrganizativo);
  if (!puestoKey) {
    return {
      status: 'blocked',
      cellValue: NO,
      rowFillColor: SOFT_RED,
      textColor: SOFT_RED_TEXT,
      apuntesRrll: 'Puesto organizativo',
    };
  }

  const puesto = puestosByKey.get(puestoKey);
  if (!puesto) {
    return {
      status: 'blocked',
      cellValue: NO,
      rowFillColor: SOFT_RED,
      textColor: SOFT_RED_TEXT,
      apuntesRrll: 'Puesto organizativo',
    };
  }

  const coberturaKey = getGrupoCoberturaKey(puesto, puestoKey);
  const presencialidadMinima = getPresencialidadMinimaGrupo(puestosByKey, coberturaKey, gruposById);
  const diasSolicitados =
    solicitud.diasTeletrabajo.length > 0 ? solicitud.diasTeletrabajo : TELETRABAJO_DIAS;

  // Nº de peticiones activas (mismo periodo, misma cobertura) en cualquiera de
  // los días solicitados por esta solicitud. Mismo cálculo que semaforo.ts,
  // para que el Excel de Dirección y la app muestren la misma cifra.
  const peticionesActivas = Math.max(
    0,
    ...diasSolicitados.map(
      (dia) =>
        solicitudesByPuestoDiaCount.get(
          buildSolicitudPeriodoPuestoDiaKey(solicitud.periodo, coberturaKey, dia),
        ) ?? 0,
    ),
  );

  if (presencialidadMinima > 0) {
    const dotacionParametrizada = getDotacionComputableGrupo(puestosByKey, coberturaKey);
    const totalPersonasPuesto = dotacionParametrizada > 0
      ? dotacionParametrizada
      : getDotacionRealGrupo(employeesById.values(), puestosByKey, coberturaKey);
    // Solo importan los días que esta solicitud concreta pide teletrabajar:
    // un conflicto de otro compañero del mismo puesto en un día distinto no
    // debe contagiar el semáforo de esta solicitud. Igual que en semaforo.ts.
    const conflictos = diasSolicitados
      .map((dia) => {
        const solicitudesDia =
          solicitudesByPuestoDiaCount.get(
            buildSolicitudPeriodoPuestoDiaKey(solicitud.periodo, coberturaKey, dia),
          ) ?? 0;
        const presencialesDia = totalPersonasPuesto - solicitudesDia;
        return { dia, solicitudesDia, presencialesDia };
      })
      .filter(
        ({ solicitudesDia, presencialesDia }) =>
          solicitudesDia > 0 && presencialesDia < presencialidadMinima,
      );

    if (conflictos.length > 0) {
      const peorConflicto = conflictos.reduce((peor, actual) =>
        actual.presencialesDia < peor.presencialesDia ? actual : peor,
      );
      const presencialesResultantes = Math.max(peorConflicto.presencialesDia, 0);
      const personasFaltantes = presencialidadMinima - presencialesResultantes;
      const diasAfectados = conflictos.map(({ dia }) => dia).join(', ');

      return {
        status: 'review',
        cellValue: 'REVISAR',
        rowFillColor: SOFT_YELLOW,
        textColor: SOFT_YELLOW_TEXT,
        apuntesRrll:
          `Revisar presencialidad mínima · ${pluralPersonas(peticionesActivas, 'petición', 'peticiones')} · mín. ${presencialidadMinima} presenciales · ` +
          `faltan ${pluralPersonas(personasFaltantes, 'persona', 'personas')} (${diasAfectados}).`,
      };
    }

    return {
      status: 'ok',
      cellValue: YES,
      rowFillColor: null,
      textColor: SOFT_GREEN_TEXT,
      apuntesRrll:
        `Sin incidencias · ${pluralPersonas(peticionesActivas, 'petición', 'peticiones')} · mín. ${presencialidadMinima} presenciales` +
        (puesto.observaciones ? ` · ${puesto.observaciones}` : ''),
    };
  }

  return {
    status: 'ok',
    cellValue: YES,
    rowFillColor: null,
    textColor: SOFT_GREEN_TEXT,
    apuntesRrll:
      `Sin incidencias · ${pluralPersonas(peticionesActivas, 'petición', 'peticiones')} · sin mínimo de presencialidad` +
      (puesto.observaciones ? ` · ${puesto.observaciones}` : ''),
  };
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
  setStatusCellStyle({
    cell,
    value: value ? YES : NO,
    fillColor: value ? SOFT_GREEN : SOFT_RED,
    textColor: value ? SOFT_GREEN_TEXT : SOFT_RED_TEXT,
  });
}

function setStatusCellStyle({
  cell,
  value,
  fillColor,
  textColor,
}: {
  cell: ExcelJS.Cell;
  value: string;
  fillColor: string;
  textColor: string;
}): void {
  cell.value = value;
  cell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: toExcelColor(fillColor),
  };
  cell.font = {
    name: ROTIS_FONT,
    size: 11,
    bold: true,
    color: toExcelColor(textColor),
  };
  cell.alignment = { horizontal: 'center', vertical: 'middle' };
  cell.border = buildDottedBorder();
}

function applyRowFill(row: ExcelJS.Row, fillColor: string): void {
  row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    if (colNumber < 1 || colNumber > 20) {
      return;
    }

    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: toExcelColor(fillColor),
    };
  });
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
  puestosTeletrabajo,
  gruposCobertura = [],
  solicitudesForAssessment = rows,
  periodo,
}: {
  rows: readonly TeletrabajoSolicitud[];
  employees: readonly Employee[];
  puestosTeletrabajo: readonly TeletrabajoPuesto[];
  gruposCobertura?: readonly GrupoCobertura[];
  solicitudesForAssessment?: readonly TeletrabajoSolicitud[];
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
  const puestosByKey = buildPuestosByKey(puestosTeletrabajo);
  const gruposById = buildGruposCoberturaByIdMap(gruposCobertura);
  const solicitudesByPuestoDiaCount = buildSolicitudesByPeriodoPuestoCount(solicitudesForAssessment, puestosByKey);

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
    { key: 'presencialidad', width: 13.82 },
    { key: 'informe', width: 11.09 },
    { key: 'anoAnterior', width: 14 },
    { key: 'validacionJefatura', width: 16.18 },
    { key: 'validacionDireccion', width: 38.54 },
    { key: 'validacionSeptiembre', width: 48 },
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
  worksheet.mergeCells('Q4:S4');

  worksheet.getCell('B4').value = 'Solicitante';
  worksheet.getCell('D4').value = 'Puesto de Trabajo';
  worksheet.getCell('F4').value = 'Petición original';
  worksheet.getCell('I4').value = 'Periodo 2025-2026';
  worksheet.getCell('J4').value = 'Cumplimiento Condiciones Presencialidad';
  worksheet.getCell('K4').value = 'Cumplimiento Presencialidad Mínima';
  worksheet.getCell('L4').value = 'Informe Favorable';
  worksheet.getCell('M4').value = 'Año Anterior Teletrabajado';
  worksheet.getCell('N4').value = 'Validación Jefatura de Unidad a Repetir ';
  worksheet.getCell('O4').value = 'Validación ordinaria de la Dirección ';
  worksheet.getCell('P4').value = 'Apuntes RRLL';
  worksheet.getCell('Q4').value = 'Petición II';
  worksheet.getCell('T4').value = 'Cambios fuera de plazo ordinario';
  worksheet.getCell('U4').value = 'Observaciones';

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
    const assessment = buildTeletrabajoAssessment({
      solicitud,
      employeesById,
      puestosByKey,
      solicitudesByPuestoDiaCount,
      gruposById,
    });
    const presencialidad = evaluateTeletrabajoPresencialidad(
      solicitud,
      puestosByKey,
      solicitudesByPuestoDiaCount,
      employeesById,
      gruposById,
    );
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
      '',
      solicitud.tipoSolicitud === 'renovacion' ? YES : NO,
      '',
      '',
      assessment.apuntesRrll,
      '',
      '',
      '',
      '',
      solicitud.observaciones,
    ];

    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      cell.font = { name: ROTIS_FONT, size: 11 };
      cell.alignment = {
        horizontal: [1, 2, 6, 7, 8, 9, 10, 11, 13].includes(colNumber) ? 'center' : 'left',
        vertical: 'middle',
        wrapText: true,
      };
    });

    setStatusCellStyle({
      cell: row.getCell(10),
      value: assessment.cellValue,
      fillColor: assessment.status === 'ok' ? SOFT_GREEN : assessment.rowFillColor ?? SOFT_YELLOW,
      textColor: assessment.textColor,
    });
    // Celda K, aislada de J: solo presencialidad mínima, sin tener en cuenta
    // el estado de la solicitud (rechazada) ni la antigüedad del empleado,
    // que ya tiñen J y el resto de la fila si corresponde.
    setStatusCellStyle({
      cell: row.getCell(11),
      value:
        presencialidad.status === 'cumple'
          ? YES
          : presencialidad.status === 'revisar'
            ? 'REVISAR'
            : NO,
      fillColor:
        presencialidad.status === 'cumple'
          ? SOFT_GREEN
          : presencialidad.status === 'revisar'
            ? SOFT_YELLOW
            : SOFT_RED,
      textColor:
        presencialidad.status === 'cumple'
          ? SOFT_GREEN_TEXT
          : presencialidad.status === 'revisar'
            ? SOFT_YELLOW_TEXT
            : SOFT_RED_TEXT,
    });
    setValidationCellStyle(row.getCell(12), solicitud.validacionJefatura);
    setAnoAnteriorCellStyle(row.getCell(13), solicitud.tipoSolicitud === 'renovacion' ? YES : NO);
    [14, 15, 16].forEach((columnNumber) => setManualValidationCellStyle(row.getCell(columnNumber)));

    if (assessment.rowFillColor) {
      applyRowFill(row, assessment.rowFillColor);
      setStatusCellStyle({
        cell: row.getCell(10),
        value: assessment.cellValue,
        fillColor: assessment.rowFillColor,
        textColor: assessment.textColor,
      });
    }
  });

  worksheet.autoFilter = {
    from: 'B5',
    to: 'U5',
  };

  const buffer = await workbook.xlsx.writeBuffer();
  await openWorkbookInExcel(buffer, buildStableExportFilename('teletrabajo-direccion', generatedAt));
}
