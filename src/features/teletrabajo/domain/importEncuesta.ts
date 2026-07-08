import type { Employee } from '../../plantilla/domain/employee';
import {
  normalizeJobPosition,
  type JobPositionTranslation,
} from '../../plantilla/domain/jobPositionTranslation';
import {
  EMPTY_TELETRABAJO_DRAFT,
  type TeletrabajoDia,
  type TeletrabajoDraft,
  type TeletrabajoSolicitud,
  type TeletrabajoEstado,
  type TeletrabajoTipoSolicitud,
} from './solicitud';
import { parseXlsxRows } from '../../../shared/import/xlsxParser';
import { parseDelimitedText } from '../../../shared/import/delimitedText';

type TabularRow = string[];
type EncuestaField =
  | 'empleado'
  | 'nombreApellidos'
  | 'respuesta'
  | 'tipoSolicitud'
  | 'diasTeletrabajo'
  | 'periodo'
  | 'fechaOrdenador'
  | 'fechaCascos'
  | 'observaciones';

export interface ImportEncuestaSummary {
  imported: number;
  updated: number;
  reactivated: number;
  ignored: number;
}

export interface ImportEncuestaDiagnostics {
  missingEmployees: number;
  unresolvedPuestos: string[];
}

export interface ImportEncuestaResult {
  solicitudes: TeletrabajoSolicitud[];
  summary: ImportEncuestaSummary;
  diagnostics: ImportEncuestaDiagnostics;
}

export interface ImportHistoricoTeletrabajoSummary {
  imported: number;
  updated: number;
  unchanged: number;
  ignored: number;
  denegados: number;
}

export interface ImportHistoricoTeletrabajoResult {
  solicitudes: TeletrabajoSolicitud[];
  summary: ImportHistoricoTeletrabajoSummary;
  periodo: string;
}

export interface EncuestaParseOptions {
  defaultPeriodo?: string;
  now?: Date;
  jobPositionTranslations?: readonly JobPositionTranslation[];
  puestoAliases?: Readonly<Record<string, string>>;
}

const HEADER_ALIASES: ReadonlyArray<readonly [EncuestaField, readonly string[]]> = [
  [
    'empleado',
    [
      'empleado',
      'nº empleado',
      'nº emp',
      'n emp',
      'numero empleado',
      'número empleado',
      'num empleado',
      'cod empleado',
      'codigo empleado',
      'código empleado',
    ],
  ],
  [
    'nombreApellidos',
    [
      'nombreApellidos',
      'nombre apellidos',
      'nombre y apellidos',
      'apellidos y nombre',
      'nombre completo',
      'persona',
    ],
  ],
  ['respuesta', ['respuesta', 'selecciona si vas a teletrabajar', 'vas a teletrabajar']],
  [
    'tipoSolicitud',
    ['tipo solicitud', 'tipo', 'nueva renovacion', 'nueva renovación', 'renovación', 'renovacion'],
  ],
  [
    'diasTeletrabajo',
    [
      'dias teletrabajo',
      'días teletrabajo',
      'dias',
      'días',
      'dia elegido',
      'día elegido',
      'jornada teletrabajo',
    ],
  ],
  ['periodo', ['periodo', 'período', 'campaña', 'campana', 'curso']],
  [
    'fechaOrdenador',
    [
      'fecha ordenador',
      'fecha entrega ordenador',
      'entrega ordenador',
      'fecha equipo',
      'fecha entrega equipo',
    ],
  ],
  ['fechaCascos', ['fecha cascos', 'fecha entrega cascos', 'entrega cascos', 'fecha auriculares']],
  [
    'observaciones',
    [
      'aportaciones',
      'observaciones',
      'comentario',
      'comentarios',
      'notas',
      'si has respondido anteriormente que si por favor escribe brevemente que tipo de teletrabajo solicitas tiempo si te quieres acoger al teletrabajo por el periodo completo solo unos meses cuales semanas etc dias martes y jueves solo martes solo jueves o solo miercoles gracias por tu colaboracion',
    ],
  ],
];

const FIELD_BY_HEADER = buildFieldByHeader();

function buildFieldByHeader(): Map<string, EncuestaField> {
  return new Map(
    HEADER_ALIASES.flatMap(([field, aliases]) =>
      aliases.map((alias): [string, EncuestaField] => [normalizeHeader(alias), field]),
    ),
  );
}

export async function importEncuestaFromFile(
  file: File,
  employees: readonly Employee[],
  currentSolicitudes: readonly TeletrabajoSolicitud[],
  options: EncuestaParseOptions = {},
): Promise<ImportEncuestaResult> {
  const buffer = await file.arrayBuffer();
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  const rows =
    extension === 'csv' || extension === 'tsv' || extension === 'txt'
      ? parseDelimitedText(new TextDecoder().decode(buffer), extension)
      : await parseXlsxRows(buffer);

  return importEncuestaRows(rows, employees, currentSolicitudes, options);
}

export function importEncuestaRows(
  rows: readonly TabularRow[],
  employees: readonly Employee[],
  currentSolicitudes: readonly TeletrabajoSolicitud[],
  options: EncuestaParseOptions = {},
): ImportEncuestaResult {
  const now = options.now ?? new Date();
  const defaultPeriodo = options.defaultPeriodo ?? detectPeriodo(rows) ?? '2026-2027';
  const drafts = rowsToTeletrabajoDrafts(rows, employees, defaultPeriodo, options);
  return upsertEncuestaSolicitudes(currentSolicitudes, drafts, now);
}

export async function importHistoricoTeletrabajoFromFile(
  file: File,
  employees: readonly Employee[],
  currentSolicitudes: readonly TeletrabajoSolicitud[],
  options: Pick<EncuestaParseOptions, 'now'> = {},
): Promise<ImportHistoricoTeletrabajoResult> {
  const buffer = await file.arrayBuffer();
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  const rows =
    extension === 'csv' || extension === 'tsv' || extension === 'txt'
      ? parseDelimitedText(new TextDecoder().decode(buffer), extension)
      : await parseXlsxRows(buffer);

  return importHistoricoTeletrabajoRows(rows, employees, currentSolicitudes, options);
}

export function importHistoricoTeletrabajoRows(
  rows: readonly TabularRow[],
  employees: readonly Employee[],
  currentSolicitudes: readonly TeletrabajoSolicitud[],
  options: Pick<EncuestaParseOptions, 'now'> = {},
): ImportHistoricoTeletrabajoResult {
  const periodo = detectPeriodo(rows);
  if (!periodo) {
    throw new Error('No se ha podido detectar el periodo en el título del fichero.');
  }

  const headerIndex = findHistoricoHeaderIndex(rows);
  if (headerIndex < 1) {
    throw new Error('No se han localizado las cabeceras del histórico de teletrabajo.');
  }

  const nowDate = options.now ?? new Date();
  const now = nowDate.toISOString();
  const parentHeaders = rows[headerIndex - 1] ?? [];
  const headers = rows[headerIndex] ?? [];
  const columns = buildHistoricoColumns(parentHeaders, headers);
  const employeesByEmpleado = new Map(
    employees.map((employee): [string, Employee] => [employee.empleado.trim(), employee]),
  );
  const solicitudes = [...currentSolicitudes];
  const indexByKey = new Map(
    solicitudes.map((solicitud, index): [string, number] => [
      getSolicitudKey(solicitud.empleado, solicitud.periodo),
      index,
    ]),
  );
  const seenImportKeys = new Set<string>();

  let imported = 0;
  let updated = 0;
  let unchanged = 0;
  let ignored = 0;
  let denegados = 0;

  rows.slice(headerIndex + 1).forEach((row) => {
    const empleado = getCell(row, columns.empleado).trim();
    if (!empleado || isAuxiliaryRow(row)) {
      ignored += 1;
      return;
    }

    const nombre = getCell(row, columns.nombre).trim();
    const detalle = getCell(row, columns.detalle).trim();
    const direccion = getCell(row, columns.direccion).trim();
    const informeFavorable = getCell(row, columns.informeFavorable).trim();
    const estado = normalizeHistoricoEstado(informeFavorable);
    const employee = employeesByEmpleado.get(empleado);
    const periodoSolicitud = getCell(row, columns.periodoSolicitud).trim();
    const observaciones = buildHistoricoObservaciones(
      getCell(row, columns.observaciones).trim(),
      periodoSolicitud,
    );
    const draft: TeletrabajoDraft = {
      ...EMPTY_TELETRABAJO_DRAFT,
      empleado,
      nombreApellidos: nombre || employee?.nombreApellidos || '',
      puestoNomina: employee?.puestoNomina || detalle,
      puestoOrganizativo: detalle || employee?.puestoOrganizativo || employee?.puestoNomina || '',
      residencia: direccion || employee?.residencia || '',
      dni: employee?.dni || '',
      direccionTeletrabajo: employee?.direccionTeletrabajo || '',
      estado,
      tipoSolicitud: normalizeHistoricoTipoSolicitud(getCell(row, columns.anteriorTeletrabajado)),
      diasTeletrabajo: normalizeHistoricoDias(row, columns),
      fechaSolicitud: '',
      fechaOrdenador: '',
      fechaCascos: '',
      periodo,
      observaciones,
      validacionSeguridadInformatica: false,
      validacionPrevencion: false,
      validacionJefatura: EMPTY_TELETRABAJO_DRAFT.validacionJefatura,
      validacionJefaturaRepetir: EMPTY_TELETRABAJO_DRAFT.validacionJefaturaRepetir,
      validacionDireccion: EMPTY_TELETRABAJO_DRAFT.validacionDireccion,
      revisado: true,
    };

    if (estado === 'denegada') {
      denegados += 1;
    }

    const key = getSolicitudKey(empleado, periodo);
    if (seenImportKeys.has(key)) {
      ignored += 1;
      return;
    }
    seenImportKeys.add(key);

    const existingIndex = indexByKey.get(key);
    if (existingIndex === undefined) {
      const solicitud: TeletrabajoSolicitud = {
        id: createSolicitudId(),
        ...draft,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      };
      solicitudes.push(solicitud);
      indexByKey.set(key, solicitudes.length - 1);
      imported += 1;
      return;
    }

    const previous = solicitudes[existingIndex];
    const next: TeletrabajoSolicitud = {
      ...previous,
      ...draft,
      // El histórico importado no aporta información sobre validaciones
      // internas (seguridad, prevención, jefatura): si la solicitud ya
      // existía, se conservan las validaciones ya realizadas en la app en
      // lugar de resetearlas. Solo las solicitudes nuevas arrancan en false.
      validacionSeguridadInformatica: previous.validacionSeguridadInformatica,
      validacionPrevencion: previous.validacionPrevencion,
      validacionJefatura: previous.validacionJefatura,
      validacionJefaturaRepetir:
        previous.validacionJefaturaRepetir ?? EMPTY_TELETRABAJO_DRAFT.validacionJefaturaRepetir,
      validacionDireccion: previous.validacionDireccion,
      createdAt: previous.createdAt,
      updatedAt: now,
      deletedAt: null,
    };

    if (areHistoricoSolicitudesEquivalent(previous, next)) {
      unchanged += 1;
      return;
    }

    solicitudes[existingIndex] = next;
    updated += 1;
  });

  return {
    solicitudes,
    periodo,
    summary: { imported, updated, unchanged, ignored, denegados },
  };
}

interface HistoricoColumns {
  empleado: number;
  nombre: number;
  detalle: number;
  direccion: number;
  martes: number;
  miercoles: number;
  jueves: number;
  periodoSolicitud: number;
  informeFavorable: number;
  anteriorTeletrabajado: number;
  observaciones: number;
}

function findHistoricoHeaderIndex(rows: readonly TabularRow[]): number {
  return rows.findIndex((row) => {
    const headers = row.map(normalizeHeader);
    return (
      headers.some((header) =>
        ['n empl', 'n empleado', 'num empl', 'num empleado'].includes(header),
      ) &&
      headers.includes('nombre') &&
      headers.includes('martes') &&
      headers.includes('miercoles') &&
      headers.includes('jueves')
    );
  });
}

function buildHistoricoColumns(
  parentHeaders: readonly string[],
  headers: readonly string[],
): HistoricoColumns {
  const combinedHeaders = headers.map((header, index) =>
    normalizeHeader(header || parentHeaders[index] || ''),
  );

  const findColumn = (aliases: readonly string[]): number =>
    combinedHeaders.findIndex((header) =>
      aliases.some((alias) => header === alias || header.includes(alias)),
    );

  return {
    empleado: findColumn(['n empl', 'n empleado', 'num empl', 'num empleado']),
    nombre: findColumn(['nombre']),
    detalle: findColumn(['detalle']),
    direccion: findColumn(['direccion']),
    martes: findColumn(['martes']),
    miercoles: findColumn(['miercoles']),
    jueves: findColumn(['jueves']),
    periodoSolicitud: findColumn(['periodo 20', 'periodo']),
    informeFavorable: findColumn(['informe favorable']),
    anteriorTeletrabajado: findColumn(['ano anterior teletrabajado']),
    observaciones: findColumn(['observaciones']),
  };
}

function getCell(row: readonly string[], index: number): string {
  return index >= 0 ? (row[index] ?? '') : '';
}

function isMarked(value: string): boolean {
  return normalizeHeader(value) === 'x' || normalizeHeader(value) === 'si';
}

function normalizeHistoricoEstado(informeFavorable: string): TeletrabajoEstado {
  const normalized = normalizeHeader(informeFavorable);
  return normalized === 'no' || normalized.includes('deneg') ? 'denegada' : 'aprobada';
}

function normalizeHistoricoTipoSolicitud(value: string): TeletrabajoTipoSolicitud {
  return normalizeHeader(value) === 'si' ? 'renovacion' : 'nueva';
}

function normalizeHistoricoDias(
  row: readonly string[],
  columns: HistoricoColumns,
): TeletrabajoDia[] {
  const days: TeletrabajoDia[] = [];
  if (isMarked(getCell(row, columns.martes))) days.push('martes');
  if (isMarked(getCell(row, columns.miercoles))) days.push('miercoles');
  if (isMarked(getCell(row, columns.jueves))) days.push('jueves');
  return days;
}

function buildHistoricoObservaciones(observaciones: string, periodoSolicitud: string): string {
  const parts = [];
  if (periodoSolicitud.trim()) {
    parts.push(`Periodo solicitado: ${periodoSolicitud.trim()}`);
  }
  if (observaciones.trim()) {
    parts.push(observaciones.trim());
  }
  return parts.join('\n');
}

function areHistoricoSolicitudesEquivalent(
  previous: TeletrabajoSolicitud,
  next: TeletrabajoSolicitud,
): boolean {
  const ignoredFields = new Set<keyof TeletrabajoSolicitud>(['updatedAt']);
  return (Object.keys(next) as Array<keyof TeletrabajoSolicitud>).every((field) => {
    if (ignoredFields.has(field)) return true;
    return JSON.stringify(previous[field]) === JSON.stringify(next[field]);
  });
}

export function rowsToTeletrabajoDrafts(
  rows: readonly TabularRow[],
  employees: readonly Employee[],
  defaultPeriodo = '2026-2027',
  options: Pick<EncuestaParseOptions, 'jobPositionTranslations' | 'puestoAliases'> = {},
): {
  drafts: TeletrabajoDraft[];
  ignored: number;
  missingEmployees: number;
  unresolvedPuestos: string[];
} {
  const headerIndex = findEncuestaHeaderIndex(rows);
  if (headerIndex < 0) {
    return { drafts: [], ignored: 0, missingEmployees: 0, unresolvedPuestos: [] };
  }

  const headers = rows[headerIndex] ?? [];
  const dataRows = rows.slice(headerIndex + 1);
  const fieldByColumn = headers.map((header) => resolveEncuestaField(header));
  const employeesByEmpleado = new Map(
    employees.map((employee): [string, Employee] => [employee.empleado.trim(), employee]),
  );
  const drafts: TeletrabajoDraft[] = [];
  const unresolvedPuestosByKey = new Map<string, string>();
  let ignored = 0;
  let missingEmployees = 0;

  dataRows.forEach((row) => {
    const raw = readEncuestaRow(row, fieldByColumn);
    const empleado = raw.empleado.trim();

    if (!empleado || isAuxiliaryRow(row) || !isAffirmativeResponse(raw.respuesta)) {
      ignored += 1;
      return;
    }

    const aportaciones = raw.observaciones.trim();
    const employee = employeesByEmpleado.get(empleado);
    if (!employee) {
      missingEmployees += 1;
    }

    const resolvedPuesto = resolveTeletrabajoPuestoFromEmployee(employee, options);
    if (resolvedPuesto.requiresResolution) {
      unresolvedPuestosByKey.set(
        normalizeTeletrabajoPuestoKey(resolvedPuesto.rawPuesto),
        resolvedPuesto.rawPuesto,
      );
    }

    drafts.push({
      ...EMPTY_TELETRABAJO_DRAFT,
      empleado,
      nombreApellidos: employee?.nombreApellidos ?? raw.nombreApellidos.trim(),
      puestoNomina: employee?.puestoNomina ?? '',
      puestoOrganizativo: resolvedPuesto.puesto,
      residencia: employee?.residencia ?? '',
      dni: employee?.dni ?? '',
      direccionTeletrabajo: employee?.direccionTeletrabajo ?? '',
      estado: 'pendiente',
      tipoSolicitud: normalizeTipoSolicitud(raw.tipoSolicitud),
      diasTeletrabajo: normalizeEncuestaDias(`${raw.diasTeletrabajo} ${aportaciones}`),
      fechaOrdenador: raw.fechaOrdenador.trim(),
      fechaCascos: raw.fechaCascos.trim(),
      periodo: raw.periodo.trim() || defaultPeriodo,
      observaciones: aportaciones,
      validacionSeguridadInformatica: false,
      validacionPrevencion: false,
      validacionJefatura: EMPTY_TELETRABAJO_DRAFT.validacionJefatura,
      validacionJefaturaRepetir: EMPTY_TELETRABAJO_DRAFT.validacionJefaturaRepetir,
      validacionDireccion: EMPTY_TELETRABAJO_DRAFT.validacionDireccion,
      revisado: EMPTY_TELETRABAJO_DRAFT.revisado,
    });
  });

  return {
    drafts,
    ignored,
    missingEmployees,
    unresolvedPuestos: Array.from(unresolvedPuestosByKey.values()).sort((first, second) =>
      first.localeCompare(second, 'es', { numeric: true, sensitivity: 'base' }),
    ),
  };
}

function resolveTeletrabajoPuestoFromEmployee(
  employee: Employee | undefined,
  options: Pick<EncuestaParseOptions, 'jobPositionTranslations' | 'puestoAliases'>,
): { puesto: string; rawPuesto: string; requiresResolution: boolean } {
  if (!employee) {
    return { puesto: '', rawPuesto: '', requiresResolution: false };
  }

  const rawPuesto =
    employee.puestoOrganizativo.trim() || employee.puestoNomina.trim() || employee.puestoEus.trim();
  if (!rawPuesto) {
    return { puesto: '', rawPuesto: '', requiresResolution: false };
  }

  const translations = options.jobPositionTranslations ?? [];
  const aliases = options.puestoAliases ?? {};
  const alias = aliases[normalizeTeletrabajoPuestoKey(rawPuesto)]?.trim();
  if (alias) {
    return { puesto: alias, rawPuesto, requiresResolution: false };
  }

  if (translations.length === 0) {
    return { puesto: rawPuesto, rawPuesto, requiresResolution: false };
  }

  const translationsByKey = new Map<string, string>();
  translations.forEach((translation) => {
    const puestoCastellano = translation.puestoCastellano.trim();
    const puestoEuskera = translation.puestoEuskera.trim();
    if (puestoCastellano) {
      translationsByKey.set(normalizeJobPosition(puestoCastellano), puestoCastellano);
    }
    if (puestoEuskera && puestoCastellano) {
      translationsByKey.set(normalizeJobPosition(puestoEuskera), puestoCastellano);
    }
  });

  const candidates = [employee.puestoOrganizativo, employee.puestoNomina, employee.puestoEus]
    .map((puesto) => puesto.trim())
    .filter(Boolean);

  for (const candidate of candidates) {
    const translated = translationsByKey.get(normalizeJobPosition(candidate));
    if (translated) {
      return { puesto: translated, rawPuesto, requiresResolution: false };
    }
  }

  return { puesto: rawPuesto, rawPuesto, requiresResolution: true };
}

function normalizeTeletrabajoPuestoKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function resolveEncuestaField(header: string): EncuestaField | null {
  const normalized = normalizeHeader(header);
  const directField = FIELD_BY_HEADER.get(normalized);

  if (directField) {
    return directField;
  }

  if (normalized.includes('selecciona si vas a teletrabajar')) {
    return 'respuesta';
  }

  if (
    normalized.includes('si has respondido anteriormente que si') ||
    (normalized.includes('tipo de teletrabajo') && normalized.includes('martes'))
  ) {
    return 'observaciones';
  }

  return null;
}

function readEncuestaRow(
  row: readonly string[],
  fieldByColumn: readonly (EncuestaField | null)[],
): Record<EncuestaField, string> {
  const values: Record<EncuestaField, string> = {
    empleado: '',
    nombreApellidos: '',
    respuesta: '',
    tipoSolicitud: '',
    diasTeletrabajo: '',
    periodo: '',
    fechaOrdenador: '',
    fechaCascos: '',
    observaciones: '',
  };

  fieldByColumn.forEach((field, index) => {
    if (field) {
      values[field] = row[index]?.trim() ?? '';
    }
  });

  return values;
}

function upsertEncuestaSolicitudes(
  currentSolicitudes: readonly TeletrabajoSolicitud[],
  draftsResult: {
    drafts: TeletrabajoDraft[];
    ignored: number;
    missingEmployees: number;
    unresolvedPuestos: string[];
  },
  nowDate: Date,
): ImportEncuestaResult {
  const now = nowDate.toISOString();
  const solicitudes = [...currentSolicitudes];
  const indexByKey = new Map(
    solicitudes.map((solicitud, index): [string, number] => [
      getSolicitudKey(solicitud.empleado, solicitud.periodo),
      index,
    ]),
  );
  let imported = 0;
  let updated = 0;
  let reactivated = 0;

  draftsResult.drafts.forEach((draft) => {
    const key = getSolicitudKey(draft.empleado, draft.periodo);
    const existingIndex = indexByKey.get(key);

    if (existingIndex === undefined) {
      const solicitud: TeletrabajoSolicitud = {
        id: createSolicitudId(),
        ...draft,
        fechaSolicitud: draft.fechaSolicitud || nowDate.toISOString().slice(0, 10),
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      };
      solicitudes.push(solicitud);
      indexByKey.set(key, solicitudes.length - 1);
      imported += 1;
      return;
    }

    const previous = solicitudes[existingIndex];
    solicitudes[existingIndex] = {
      ...previous,
      ...draft,
      fechaSolicitud: draft.fechaSolicitud || previous.fechaSolicitud,
      createdAt: previous.createdAt,
      updatedAt: now,
      deletedAt: null,
    };

    if (previous.deletedAt) {
      reactivated += 1;
    } else {
      updated += 1;
    }
  });

  return {
    solicitudes,
    summary: {
      imported,
      updated,
      reactivated,
      ignored: draftsResult.ignored,
    },
    diagnostics: {
      missingEmployees: draftsResult.missingEmployees,
      unresolvedPuestos: draftsResult.unresolvedPuestos,
    },
  };
}

function getSolicitudKey(empleado: string, periodo: string): string {
  return `${empleado.trim()}::${periodo.trim()}`;
}

function createSolicitudId(): string {
  return `teletrabajo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function findEncuestaHeaderIndex(rows: readonly TabularRow[]): number {
  return rows.findIndex((row) => {
    const fields = new Set(
      row
        .map((header) => FIELD_BY_HEADER.get(normalizeHeader(header)) ?? null)
        .filter((field): field is EncuestaField => field !== null),
    );

    return fields.has('empleado') && fields.has('nombreApellidos');
  });
}

function detectPeriodo(rows: readonly TabularRow[]): string | null {
  for (const row of rows) {
    for (const cell of row) {
      const match = cell.match(/(20\d{2})\s*[-/]\s*(20\d{2})/);
      if (match) {
        return `${match[1]}-${match[2]}`;
      }
    }
  }

  return null;
}

function isAffirmativeResponse(value: string): boolean {
  return normalizeHeader(value) === 'si';
}

function isAuxiliaryRow(row: readonly string[]): boolean {
  return row.some((cell) => normalizeHeader(cell) === 'punt');
}

function normalizeHeader(header: string): string {
  return header
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\./g, '')
    .replace(/[_-]/g, ' ')
    .replace(/º/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeTipoSolicitud(value: string): TeletrabajoTipoSolicitud {
  const normalized = normalizeHeader(value);

  if (normalized.includes('nueva')) {
    return 'nueva';
  }

  return 'renovacion';
}

function normalizeEncuestaDias(value: string): TeletrabajoDia[] {
  const normalized = normalizeHeader(value);
  const days: TeletrabajoDia[] = [];

  if (/\b(martes|asteartea?)\b/.test(normalized)) {
    days.push('martes');
  }

  if (/\b(miercoles|asteazkena?)\b/.test(normalized)) {
    days.push('miercoles');
  }

  if (/\b(jueves|osteguna?|ostegunetan)\b/.test(normalized)) {
    days.push('jueves');
  }

  return days;
}


