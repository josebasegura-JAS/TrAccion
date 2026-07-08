import ExcelJS from 'exceljs';

import type { Employee } from '../../plantilla/domain/employee';
import { evaluateTeletrabajoAntiguedad } from './antiguedad';
import { buildGruposCoberturaByIdMap, type GrupoCobertura } from './gruposCobertura';
import type { TeletrabajoPuesto } from './puestosTeletrabajo';
import { normalizeTeletrabajoPuesto } from './puestosTeletrabajo';
import {
  buildPuestosByKey,
  buildSolicitudPeriodoPuestoKey,
  buildSolicitudPeriodoPuestoDiaKey,
  buildSolicitudesByPeriodoPuestoCount,
  evaluateTeletrabajoPresencialidad,
} from './semaforo';
import { TELETRABAJO_DIAS, type TeletrabajoSolicitud } from './solicitud';
import { getTeletrabajoPeriodoOffset, hasTeletrabajoEnPeriodo } from './tipoSolicitud';
import { buildStableExportFilename, openWorkbookInExcel } from '../../../shared/export/tableExport';

const YES = 'SI';
const NO = 'NO';

/**
 * Nº de periodos anteriores que se muestran en el Excel de Dirección, cada
 * uno en su propia columna ("Año Anterior Teletrabajado (YYYY-YYYY)",
 * "Año Teletrabajado (YYYY-YYYY)", ...). De momento solo hay histórico de 2
 * periodos anteriores; cuando haya más datos, basta con subir este número
 * (hasta 5, según lo comentado) para que aparezcan más columnas.
 */
const TELETRABAJO_EXPORT_ANOS_ANTERIORES = 2;

// Columnas fijas antes/después del bloque de "años anteriores", que tiene
// TELETRABAJO_EXPORT_ANOS_ANTERIORES columnas (una por periodo anterior).
const COL_PERIODO = 9;
const COL_PRESENCIALIDAD = 10;
const COL_INFORME = 11;
const COL_ANOS_ANTERIORES_START = 12;
const COL_ANOS_ANTERIORES_END = COL_ANOS_ANTERIORES_START + TELETRABAJO_EXPORT_ANOS_ANTERIORES - 1;
const COL_VALIDACION_JEFATURA_REPETIR = COL_ANOS_ANTERIORES_END + 1;
const COL_VALIDACION_DIRECCION = COL_VALIDACION_JEFATURA_REPETIR + 1;
const COL_APUNTES_RRLL = COL_VALIDACION_DIRECCION + 1;
const COL_PETICION_MARTES = COL_APUNTES_RRLL + 1;
const COL_PETICION_MIERCOLES = COL_PETICION_MARTES + 1;
const COL_PETICION_JUEVES = COL_PETICION_MARTES + 2;
const COL_CAMBIOS_FUERA_PLAZO = COL_PETICION_JUEVES + 1;
const COL_OBSERVACIONES = COL_CAMBIOS_FUERA_PLAZO + 1;
const COL_OBSERVACIONES_RRLL = COL_OBSERVACIONES + 1;
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

  // Nº de peticiones activas: personas del mismo puesto/cobertura y periodo
  // que han solicitado teletrabajo. No equivale al número de días pedidos ni
  // a las coincidencias en un día concreto; esas cifras solo sirven para la
  // comprobación diaria de presencialidad.
  const peticionesActivas =
    solicitudesByPuestoDiaCount.get(buildSolicitudPeriodoPuestoKey(solicitud.periodo, coberturaKey)) ??
    Math.max(
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

function toNumericEmployeeValue(empleado: string): number | string {
  const trimmed = empleado.trim();

  if (/^\d+$/.test(trimmed)) {
    return Number(trimmed);
  }

  return empleado;
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

/**
 * Periodo de referencia usado únicamente para etiquetar las columnas de años
 * anteriores con su rango de años (p. ej. "(2025-2026)"). Usa el periodo
 * filtrado si lo hay; si no, solo lo infiere cuando todas las filas
 * comparten un único periodo. En cualquier otro caso, las columnas se
 * etiquetan sin años (no hay un periodo único del que partir).
 */
function resolveReferencePeriodo(
  rows: readonly TeletrabajoSolicitud[],
  selectedPeriodo?: string,
): string | null {
  const trimmed = selectedPeriodo?.trim();
  if (trimmed) {
    return trimmed;
  }

  const periodos = Array.from(new Set(rows.map((row) => row.periodo.trim()).filter(Boolean)));
  return periodos.length === 1 ? periodos[0] : null;
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
    if (colNumber < 1 || colNumber > COL_OBSERVACIONES_RRLL) {
      return;
    }

    // La fila puede marcar un bloqueo general (por ejemplo, solicitud
    // rechazada o antigüedad insuficiente), pero no debe borrar colores de
    // celdas calculadas por otra condición: cumplimiento de presencialidad,
    // informe favorable, año anterior o validaciones manuales.
    if (cell.fill) {
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

  const anosAnterioresColumns = Array.from(
    { length: TELETRABAJO_EXPORT_ANOS_ANTERIORES },
    (_, offsetIndex) => ({ key: `anoAnterior${offsetIndex + 1}`, width: 14 }),
  );

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
    { key: 'presencialidad', width: 13.82 },
    { key: 'informe', width: 11.09 },
    ...anosAnterioresColumns,
    { key: 'validacionJefaturaRepetir', width: 16.18 },
    { key: 'validacionDireccion', width: 38.54 },
    { key: 'apuntesRrll', width: 48 },
    { key: 'peticionMartes', width: 8.27 },
    { key: 'peticionMiercoles', width: 8.09 },
    { key: 'peticionJueves', width: 5.63 },
    { key: 'cambiosFueraPlazo', width: 52.09 },
    { key: 'observaciones', width: 40.73 },
    { key: 'observacionesRrll', width: 40.73 },
  ];

  worksheet.mergeCells(2, 2, 2, 4);
  const titleCell = worksheet.getCell(2, 2);
  titleCell.value = buildTitle(rows, periodo);
  titleCell.font = { name: 'Calibri', size: 11, bold: false };
  titleCell.alignment = { horizontal: 'left', vertical: 'middle' };
  worksheet.getRow(2).height = 20.5;

  worksheet.mergeCells(4, 2, 4, 3);
  worksheet.mergeCells(4, 4, 4, 5);
  worksheet.mergeCells(4, 6, 4, 8);
  worksheet.mergeCells(4, COL_PETICION_MARTES, 4, COL_PETICION_JUEVES);

  worksheet.getCell(4, 2).value = 'Solicitante';
  worksheet.getCell(4, 4).value = 'Puesto de Trabajo';
  worksheet.getCell(4, 6).value = 'Petición original';
  worksheet.getCell(4, COL_PERIODO).value = 'Periodo 2025-2026';
  worksheet.getCell(4, COL_PRESENCIALIDAD).value = 'Cumplimiento Presencialidad Mínima';
  worksheet.getCell(4, COL_INFORME).value = 'Informe Favorable';

  // Un periodo de referencia (el filtrado, o el único periodo presente en las
  // filas) para poder etiquetar cada columna de año anterior con su rango de
  // años concreto, igual que en el Excel de Dirección de referencia.
  const referencePeriodo = resolveReferencePeriodo(rows, periodo);
  for (let offset = 1; offset <= TELETRABAJO_EXPORT_ANOS_ANTERIORES; offset += 1) {
    const targetPeriodo = referencePeriodo
      ? getTeletrabajoPeriodoOffset(referencePeriodo, offset)
      : null;
    const label = offset === 1 ? 'Año Anterior Teletrabajado' : 'Año Teletrabajado';
    worksheet.getCell(4, COL_ANOS_ANTERIORES_START + offset - 1).value = targetPeriodo
      ? `${label} (${targetPeriodo})`
      : label;
  }

  worksheet.getCell(4, COL_VALIDACION_JEFATURA_REPETIR).value =
    'Validación Jefatura de Unidad a Repetir ';
  worksheet.getCell(4, COL_VALIDACION_DIRECCION).value = 'Validación ordinaria de la Dirección ';
  worksheet.getCell(4, COL_APUNTES_RRLL).value = 'Apuntes RRLL';
  worksheet.getCell(4, COL_PETICION_MARTES).value = 'Petición II';
  worksheet.getCell(4, COL_CAMBIOS_FUERA_PLAZO).value = 'Cambios fuera de plazo ordinario';
  worksheet.getCell(4, COL_OBSERVACIONES).value = 'Observaciones';
  worksheet.getCell(4, COL_OBSERVACIONES_RRLL).value = 'Observaciones RRLL';

  const row5Values: string[] = new Array(COL_OBSERVACIONES_RRLL).fill('');
  row5Values[1] = 'Nº Empl';
  row5Values[2] = 'Nombre';
  row5Values[3] = 'Detalle';
  row5Values[4] = 'Dirección';
  row5Values[5] = 'Martes';
  row5Values[6] = 'Miércoles';
  row5Values[7] = 'Jueves';
  row5Values[COL_PETICION_MARTES - 1] = 'Martes';
  row5Values[COL_PETICION_MIERCOLES - 1] = 'Miércoles';
  row5Values[COL_PETICION_JUEVES - 1] = 'Jueves';
  worksheet.getRow(5).values = row5Values;

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

    // Para cada año anterior (1 = inmediatamente anterior, 2 = dos periodos
    // atrás, ...) se mira si el empleado tuvo teletrabajo concedido en ese
    // periodo concreto, sobre el conjunto completo de solicitudes (todos los
    // periodos), no solo las filas exportadas.
    const anosAnterioresTeletrabajados = Array.from(
      { length: TELETRABAJO_EXPORT_ANOS_ANTERIORES },
      (_, offsetIndex) => {
        const yearsBack = offsetIndex + 1;
        const targetPeriodo = getTeletrabajoPeriodoOffset(solicitud.periodo, yearsBack);
        return hasTeletrabajoEnPeriodo(solicitud.empleado, targetPeriodo, solicitudesForAssessment, {
          excludeSolicitudId: solicitud.id,
        });
      },
    );

    const rowValues: Array<string | number> = new Array(COL_OBSERVACIONES_RRLL).fill('');
    rowValues[1] = toNumericEmployeeValue(solicitud.empleado);
    rowValues[2] = solicitud.nombreApellidos;
    rowValues[3] = solicitud.puestoNomina;
    rowValues[4] = employee?.direccionOrganizativa ?? '';
    rowValues[5] = hasDia(solicitud, 'martes');
    rowValues[6] = hasDia(solicitud, 'miercoles');
    rowValues[7] = hasDia(solicitud, 'jueves');
    rowValues[8] = solicitud.periodo;
    rowValues[COL_APUNTES_RRLL - 1] = assessment.apuntesRrll;
    rowValues[COL_OBSERVACIONES - 1] = solicitud.observaciones;
    rowValues[COL_OBSERVACIONES_RRLL - 1] = solicitud.observacionesRrll ?? '';
    row.values = rowValues;

    const empleadoCell = row.getCell(2);
    empleadoCell.numFmt = '0';

    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      cell.font = { name: ROTIS_FONT, size: 11 };
      cell.alignment = {
        horizontal: [1, 2, 6, 7, 8, 9].includes(colNumber) ? 'center' : 'left',
        vertical: 'middle',
        wrapText: true,
      };
    });

    // Única celda de cumplimiento: solo presencialidad mínima, sin tener en
    // cuenta el estado de la solicitud (rechazada) ni la antigüedad del
    // empleado. Esos motivos siguen tiñendo el resto de la fila si
    // corresponde (más abajo) y se explican en Apuntes RRLL; no hace falta
    // una segunda celda de cumplimiento combinado, sería redundante.
    setStatusCellStyle({
      cell: row.getCell(COL_PRESENCIALIDAD),
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
    setValidationCellStyle(row.getCell(COL_INFORME), solicitud.validacionJefatura);
    anosAnterioresTeletrabajados.forEach((wasTeletrabajando, offsetIndex) => {
      setAnoAnteriorCellStyle(
        row.getCell(COL_ANOS_ANTERIORES_START + offsetIndex),
        wasTeletrabajando ? YES : NO,
      );
    });
    setValidationCellStyle(
      row.getCell(COL_VALIDACION_JEFATURA_REPETIR),
      Boolean(solicitud.validacionJefaturaRepetir),
    );
    setValidationCellStyle(row.getCell(COL_VALIDACION_DIRECCION), solicitud.validacionDireccion);
    setManualValidationCellStyle(row.getCell(COL_APUNTES_RRLL));

    if (assessment.rowFillColor) {
      applyRowFill(row, assessment.rowFillColor);
    }
  });

  worksheet.autoFilter = {
    from: { row: 5, column: 2 },
    to: { row: 5, column: COL_OBSERVACIONES_RRLL },
  };

  const buffer = await workbook.xlsx.writeBuffer();
  await openWorkbookInExcel(buffer, buildStableExportFilename('teletrabajo-direccion', generatedAt));
}
