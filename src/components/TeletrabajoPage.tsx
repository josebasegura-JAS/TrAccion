import {
  AlertTriangle,
  BriefcaseBusiness,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FileText,
  Loader2,
  Plus,
  RotateCcw,
  Search,
  SlidersHorizontal,
  XCircle,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DataTable, type DataTableColumn } from '../shared/table/DataTable';
import { sortDataTableRows } from '../shared/table/tableSorting';
import {
  useTableViewPreferences,
  type TableViewPreferences,
} from '../shared/table/useTableViewPreferences';
import { TeletrabajoEditor } from './TeletrabajoEditor';
import { TeletrabajoPuestosModal } from './TeletrabajoPuestosModal';
import { ActionButton } from './ui/ActionButton';
import { normalizeJobPosition } from '../features/plantilla/domain/jobPositionTranslation';
import { useEmployeeStore } from '../features/plantilla/store/useEmployeeStore';
import { filterTeletrabajoSolicitudes } from '../features/teletrabajo/domain/filters';
import {
  buildPuestosByKey,
  buildSolicitudesByPeriodoPuestoCount,
  getTeletrabajoSemaforo,
} from '../features/teletrabajo/domain/semaforo';
import {
  TELETRABAJO_ESTADOS,
  TELETRABAJO_TIPOS_SOLICITUD,
  type TeletrabajoSolicitud,
} from '../features/teletrabajo/domain/solicitud';
import { resolveTeletrabajoTipoSolicitud } from '../features/teletrabajo/domain/tipoSolicitud';

import { useConfiguracionStore } from '../features/configuracion/store/useConfiguracionStore';
import { saveDocxWithDialog } from '../features/teletrabajo/domain/download';
import { exportTeletrabajoDireccionToExcel } from '../features/teletrabajo/domain/exportDireccion';
import { generateTeletrabajoWord } from '../features/teletrabajo/domain/word';
import {
  applyPlantillaDataToTeletrabajoSolicitudes,
  findActiveEmployeeByEmpleado,
} from '../features/teletrabajo/domain/plantillaData';
import { useTeletrabajoStore } from '../features/teletrabajo/store/useTeletrabajoStore';
import { buildFilterLabel } from '../shared/export/filterLabel';
import { ActiveFilterChips, type ActiveFilterChip } from '../shared/filters/ActiveFilterChips';
import { ModuleHelpButton, type ModuleHelpSection } from './ModuleHelp';
import { SelectFilter } from '../shared/filters/SelectFilter';
import type { ExportColumn } from '../shared/export/types';
import { reorderExportColumns } from '../shared/export/reorderExportColumns';
import { ExportPrintButtons } from '../shared/print/ExportPrintButtons';
import { readStorageItem, writeStorageItem } from '../services/persistence';
import type { Employee } from '../features/plantilla/domain/employee';
import { useAppDialog } from '../hooks/useAppDialog';

const TELETRABAJO_HELP_SECTIONS: ModuleHelpSection[] = [
  {
    title: '¿Qué hace este módulo?',
    body: 'Gestiona solicitudes y renovaciones de teletrabajo, con seguimiento de validaciones, aprobación, denegación e histórico.',
  },
  {
    title: 'Flujo recomendado',
    ordered: true,
    items: [
      'Crear solicitud o importar interesados desde encuesta.',
      'Revisar los datos de la persona y el puesto asignado.',
      'Completar las validaciones necesarias.',
      'Aprobar o denegar la solicitud.',
      'Mantener el histórico cuando finalice el periodo correspondiente.',
    ],
  },
  {
    title: 'Reglas principales',
    items: [
      'El puesto debe existir en Plantilla y debe poder traducirse a un puesto de teletrabajo.',
      'Las renovaciones mantienen trazabilidad respecto al ejercicio anterior.',
      'Las solicitudes conservan observaciones y validaciones para revisión posterior.',
      'Los registros eliminados no desaparecen físicamente: quedan fuera de la vista activa mediante borrado lógico.',
    ],
  },
  {
    title: 'Importación de interesados',
    items: [
      'Permite alta o actualización masiva desde Excel de encuesta.',
      'Busca la persona en Plantilla para tomar el puesto correcto.',
      'Si un puesto no tiene correspondencia, debe resolverse desde el popup de asignación de puestos.',
      'La importación debe informar si termina correctamente o si no ha podido procesarse.',
    ],
  },
];

type TeletrabajoTableColumnId =
  | 'revisado'
  | 'estado'
  | 'empleado'
  | 'nombreApellidos'
  | 'puestoOrganizativo'
  | 'teletrabajable'
  | 'residencia'
  | 'tipoSolicitud'
  | 'diasTeletrabajo'
  | 'periodo'
  | 'actions';

const TELETRABAJO_TABLE_STORAGE_KEY = 'traccion.tableView.teletrabajo.solicitudes';
const TELETRABAJO_PUESTOS_ALIASES_STORAGE_KEY =
  'traccion.v1.teletrabajo.puestos.translationAliases';
const teletrabajoTableColumnIds: readonly TeletrabajoTableColumnId[] = [
  'revisado',
  'estado',
  'empleado',
  'nombreApellidos',
  'puestoOrganizativo',
  'teletrabajable',
  'residencia',
  'tipoSolicitud',
  'diasTeletrabajo',
  'periodo',
  'actions',
];
const defaultTeletrabajoTablePreferences: TableViewPreferences<TeletrabajoTableColumnId> = {
  sort: null,
  columnWidths: {},
  columnOrder: null,
};

const teletrabajoExportColumns: ExportColumn<TeletrabajoSolicitud>[] = [
  { key: 'revisado', header: 'Revisado', value: (solicitud) => (solicitud.revisado ? 'Sí' : 'No') },
  {
    key: 'estado',
    header: 'Estado',
    value: (solicitud) => {
      const labels: Record<string, string> = {
        pendiente: 'Pendiente',
        analizada: 'Analizada',
        aprobada: 'Aprobada',
        denegada: 'Rechazada',
      };
      return labels[solicitud.estado] ?? solicitud.estado;
    },
  },
  { key: 'empleado', header: 'Empleado', value: (solicitud) => solicitud.empleado },
  {
    key: 'nombreApellidos',
    header: 'Nombre y apellidos',
    value: (solicitud) => solicitud.nombreApellidos,
  },
  {
    key: 'puestoOrganizativo',
    header: 'Puesto organizativo',
    value: (solicitud) => solicitud.puestoOrganizativo,
  },
  {
    key: 'teletrabajable',
    header: 'Incidencias',
    value: (solicitud) => solicitud.puestoOrganizativo,
  },
  { key: 'residencia', header: 'Residencia', value: (solicitud) => solicitud.residencia },
  { key: 'tipoSolicitud', header: 'Tipo', value: (solicitud) => solicitud.tipoSolicitud },
  {
    key: 'diasTeletrabajo',
    header: 'Días',
    value: (solicitud) => solicitud.diasTeletrabajo.join(', '),
  },
  { key: 'periodo', header: 'Periodo', value: (solicitud) => solicitud.periodo },
];

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0))).sort(
    (first, second) => first.localeCompare(second, 'es', { numeric: true, sensitivity: 'base' }),
  );
}

function suggestNextPeriodo(periodos: readonly string[]): string {
  const current = periodos[0]?.trim() ?? '';
  const match = /^(\d{4})\D+(\d{4})$/.exec(current);
  if (!match) {
    return '';
  }

  return `${Number(match[1]) + 1}-${Number(match[2]) + 1}`;
}

interface PendingEncuestaImport {
  file: File;
  unknownPuestos: string[];
  mapping: Record<string, string>;
}

type TeletrabajoIncidentFilter =
  | ''
  | 'conflictos'
  | 'bloqueantes'
  | 'revisadasPendientes'
  | 'sinRevisar'
  | 'listasAprobar';

interface TeletrabajoIncidentMeta {
  status: 'ok' | 'review' | 'blocked';
  label: string;
  title: string;
  isReviewedPending: boolean;
  isReadyToApprove: boolean;
}

const TELETRABAJO_INCIDENT_FILTER_LABELS: Record<Exclude<TeletrabajoIncidentFilter, ''>, string> = {
  conflictos: 'Con incidencias',
  bloqueantes: 'Bloqueantes',
  revisadasPendientes: 'Revisadas pendientes',
  sinRevisar: 'Sin revisar',
  listasAprobar: 'Listas para aprobar',
};

function getTeletrabajoIncidentLabel(
  semaforo: ReturnType<typeof getTeletrabajoSemaforo>,
): string {
  if (semaforo.status === 'ok') {
    return 'Sin incidencias';
  }

  const title = semaforo.title.toLocaleLowerCase('es-ES');

  if (title.includes('presencialidad')) {
    return 'Revisar presencialidad';
  }

  if (title.includes('empleado no localizado')) {
    return 'Empleado no localizado';
  }

  if (title.includes('antigüedad insuficiente')) {
    return 'Antigüedad insuficiente';
  }

  if (title.includes('antigüedad')) {
    return 'Revisar antigüedad';
  }

  if (title.includes('falta puesto organizativo')) {
    return 'Falta puesto organizativo';
  }

  if (title.includes('puesto no teletrabajable')) {
    return 'Puesto no teletrabajable';
  }

  return semaforo.status === 'blocked' ? 'Incidencia bloqueante' : 'Revisar incidencia';
}

function getTeletrabajoIncidentMeta(
  solicitud: TeletrabajoSolicitud,
  puestosByKey: ReturnType<typeof buildPuestosByKey>,
  solicitudesByPuestoCount: ReturnType<typeof buildSolicitudesByPeriodoPuestoCount>,
  employeesByEmpleado: Map<string, Employee>,
): TeletrabajoIncidentMeta {
  const semaforo = getTeletrabajoSemaforo(
    solicitud,
    puestosByKey,
    solicitudesByPuestoCount,
    employeesByEmpleado,
  );
  const isReviewedPending = solicitud.revisado && solicitud.estado === 'pendiente';
  const isReadyToApprove =
    solicitud.revisado && solicitud.estado === 'analizada' && semaforo.status === 'ok';

  if (semaforo.status === 'blocked') {
    return {
      status: 'blocked',
      label: getTeletrabajoIncidentLabel(semaforo),
      title: semaforo.title,
      isReviewedPending,
      isReadyToApprove,
    };
  }

  if (semaforo.status === 'review') {
    return {
      status: 'review',
      label: getTeletrabajoIncidentLabel(semaforo),
      title: semaforo.title,
      isReviewedPending,
      isReadyToApprove,
    };
  }

  return {
    status: 'ok',
    label: getTeletrabajoIncidentLabel(semaforo),
    title: isReviewedPending
      ? `${semaforo.title} Solicitud revisada que sigue en estado pendiente: queda una decisión manual por resolver, pero no hay incidencia objetiva de condiciones.`
      : semaforo.title,
    isReviewedPending,
    isReadyToApprove,
  };
}

function matchesIncidentFilter(
  solicitud: TeletrabajoSolicitud,
  filter: TeletrabajoIncidentFilter,
  puestosByKey: ReturnType<typeof buildPuestosByKey>,
  solicitudesByPuestoCount: ReturnType<typeof buildSolicitudesByPeriodoPuestoCount>,
  employeesByEmpleado: Map<string, Employee>,
): boolean {
  if (!filter) {
    return true;
  }

  const meta = getTeletrabajoIncidentMeta(
    solicitud,
    puestosByKey,
    solicitudesByPuestoCount,
    employeesByEmpleado,
  );

  if (filter === 'conflictos') {
    return meta.status !== 'ok';
  }

  if (filter === 'bloqueantes') {
    return meta.status === 'blocked';
  }

  if (filter === 'revisadasPendientes') {
    return meta.isReviewedPending;
  }

  if (filter === 'sinRevisar') {
    return !solicitud.revisado;
  }

  if (filter === 'listasAprobar') {
    return meta.isReadyToApprove;
  }

  return true;
}

function getTeletrabajoRowClassName(
  meta: TeletrabajoIncidentMeta,
  estado: TeletrabajoSolicitud['estado'],
): string {
  if (estado === 'denegada') {
    return 'border-l-4 border-slate-500/50 bg-slate-900/20 text-slate-200 hover:bg-slate-900/30';
  }

  if (meta.status === 'blocked') {
    return 'border-l-4 border-red-400 bg-red-950/30 text-red-100 hover:bg-red-950/40';
  }

  if (meta.status === 'review' || meta.isReviewedPending) {
    return 'border-l-4 border-amber-400 bg-amber-950/20 text-amber-50 hover:bg-amber-950/30';
  }

  return '';
}

function readStoredPuestoAliases(): Record<string, string> {
  try {
    const stored = readStorageItem(TELETRABAJO_PUESTOS_ALIASES_STORAGE_KEY);
    if (!stored) {
      return {};
    }

    const parsed: unknown = JSON.parse(stored);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }

    return Object.entries(parsed).reduce<Record<string, string>>((aliases, [key, value]) => {
      if (typeof value === 'string' && value.trim()) {
        aliases[key] = value;
      }
      return aliases;
    }, {});
  } catch {
    return {};
  }
}

function persistStoredPuestoAliases(aliases: Record<string, string>): void {
  writeStorageItem(TELETRABAJO_PUESTOS_ALIASES_STORAGE_KEY, JSON.stringify(aliases));
}

function buildImportSummaryMessage(summary: {
  imported: number;
  updated: number;
  reactivated: number;
  ignored: number;
  missingEmployees: number;
}): string {
  const parts = [
    `${summary.imported} registros importados`,
    `${summary.reactivated} registros reactivados`,
    `${summary.updated} registros actualizados`,
    `${summary.ignored} filas ignoradas`,
  ];

  if (summary.missingEmployees > 0) {
    parts.push(`${summary.missingEmployees} empleados no encontrados en Plantilla`);
  }

  return parts.join(' · ');
}

export function TeletrabajoPage({
  initialSolicitudId = null,
  navigationNonce,
}: {
  initialSolicitudId?: string | null;
  navigationNonce?: number;
} = {}) {
  const {
    cancelImportHistorico,
    confirmImportHistorico,
    createPeriodo,
    filters,
    importEncuesta,
    load,
    pendingHistoricoImport,
    previewImportHistorico,
    puestosTeletrabajo,
    removeWithConcurrencyCheck,
    selectSolicitud,
    setFilter,
    solicitudes,
  } = useTeletrabajoStore();
  const { alert, dialogNode } = useAppDialog();
  const employees = useEmployeeStore((state) => state.employees);
  const isEmployeesLoading = useEmployeeStore((state) => state.isLoading);
  const loadEmployees = useEmployeeStore((state) => state.load);
  const jobPositionTranslations = useEmployeeStore((state) => state.jobPositionTranslations);
  const [editorMode, setEditorMode] = useState<'create' | 'edit' | null>(null);
  const [isPeriodoModalOpen, setIsPeriodoModalOpen] = useState(false);
  const [newPeriodoName, setNewPeriodoName] = useState('');
  const [sourcePeriodo, setSourcePeriodo] = useState('');
  const [copyFromPreviousPeriodo, setCopyFromPreviousPeriodo] = useState(true);
  const [periodoStatus, setPeriodoStatus] = useState('');
  const [editingSolicitudId, setEditingSolicitudId] = useState<string | null>(null);
  const [importSummary, setImportSummary] = useState<string>('');
  const [pendingEncuestaImport, setPendingEncuestaImport] = useState<PendingEncuestaImport | null>(
    null,
  );
  const [isPuestosModalOpen, setIsPuestosModalOpen] = useState(false);
  const [wordStatus, setWordStatus] = useState<string>('');
  const [generatingWordId, setGeneratingWordId] = useState<string | null>(null);
  const rutaPlantillaTeletrabajo = useConfiguracionStore((state) => state.rutaPlantillaTeletrabajo);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const historicoFileInputRef = useRef<HTMLInputElement | null>(null);
  const [isHistoricoOpen, setIsHistoricoOpen] = useState(false);
  const [openHistoricoPeriodos, setOpenHistoricoPeriodos] = useState<Record<string, boolean>>({});
  const processedNavigationNonceRef = useRef<number | null>(null);
  const [incidentFilter, setIncidentFilter] = useState<TeletrabajoIncidentFilter>('');
  const [incidentTooltip, setIncidentTooltip] = useState<{
    title: string;
    x: number;
    y: number;
  } | null>(null);

  useEffect(() => {
    load();
    loadEmployees();
  }, [load, loadEmployees]);

  const masterPuestos = useMemo(
    () =>
      Array.from(
        new Map(
          jobPositionTranslations
            .map((translation) => translation.puestoCastellano.trim())
            .filter(Boolean)
            .map((puesto): [string, string] => [normalizeJobPosition(puesto), puesto]),
        ).values(),
      ).sort((first, second) =>
        first.localeCompare(second, 'es', { numeric: true, sensitivity: 'base' }),
      ),
    [jobPositionTranslations],
  );

  const masterPuestosByKey = useMemo(
    () =>
      new Map(
        masterPuestos.map((puesto): [string, string] => [normalizeJobPosition(puesto), puesto]),
      ),
    [masterPuestos],
  );

  const handleGenerateWord = useCallback(
    async (solicitud: TeletrabajoSolicitud) => {
      if (solicitud.estado !== 'aprobada' || generatingWordId) {
        return;
      }

      const employee = findActiveEmployeeByEmpleado(employees, solicitud.empleado);

      setGeneratingWordId(solicitud.id);
      setWordStatus('');

      try {
        const result = await generateTeletrabajoWord(
          solicitud,
          employee,
          rutaPlantillaTeletrabajo,
          jobPositionTranslations,
        );
        await saveDocxWithDialog(result.blob, result.fileName);
        setWordStatus(`Word generado: ${result.detectedMarkers.length} marcadores sustituidos.`);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'No se ha podido generar el Word.';
        setWordStatus(message);
      } finally {
        setGeneratingWordId(null);
      }
    },
    [employees, generatingWordId, jobPositionTranslations, rutaPlantillaTeletrabajo],
  );

  const solicitudesWithPlantillaData = useMemo(() => {
    const withPlantillaData = applyPlantillaDataToTeletrabajoSolicitudes(solicitudes, employees);
    return withPlantillaData.map((solicitud) => ({
      ...solicitud,
      tipoSolicitud: resolveTeletrabajoTipoSolicitud(solicitud, withPlantillaData, {
        excludeSolicitudId: solicitud.id,
      }),
    }));
  }, [employees, solicitudes]);
  const visibleSolicitudes = useMemo(
    () => solicitudesWithPlantillaData.filter((solicitud) => !solicitud.deletedAt),
    [solicitudesWithPlantillaData],
  );
  const puestosByKey = useMemo(() => buildPuestosByKey(puestosTeletrabajo), [puestosTeletrabajo]);
  const employeesByEmpleado = useMemo(
    () =>
      new Map(
        employees
          .filter((employee) => !employee.deletedAt)
          .map((employee): [string, Employee] => [employee.empleado.trim(), employee]),
      ),
    [employees],
  );
  const solicitudesByPuestoCount = useMemo(
    () => buildSolicitudesByPeriodoPuestoCount(solicitudesWithPlantillaData, puestosByKey),
    [solicitudesWithPlantillaData, puestosByKey],
  );
  const periodos = useMemo(
    () => uniqueSorted(visibleSolicitudes.map((solicitud) => solicitud.periodo)).reverse(),
    [visibleSolicitudes],
  );

  const currentPeriodo = periodos[0] ?? '';
  const mainPeriodo = filters.periodo || currentPeriodo;
  const mainFilters = useMemo(() => ({ ...filters, periodo: mainPeriodo }), [filters, mainPeriodo]);
  const baseFilteredSolicitudes = useMemo(
    () => filterTeletrabajoSolicitudes(solicitudesWithPlantillaData, mainFilters),
    [mainFilters, solicitudesWithPlantillaData],
  );
  const filteredSolicitudes = useMemo(
    () =>
      baseFilteredSolicitudes.filter((solicitud) =>
        matchesIncidentFilter(
          solicitud,
          incidentFilter,
          puestosByKey,
          solicitudesByPuestoCount,
          employeesByEmpleado,
        ),
      ),
    [
      baseFilteredSolicitudes,
      employeesByEmpleado,
      incidentFilter,
      puestosByKey,
      solicitudesByPuestoCount,
    ],
  );
  const incidentStats = useMemo(() => {
    const initial = {
      total: baseFilteredSolicitudes.length,
      conflicts: 0,
      blocked: 0,
      reviewedPending: 0,
      notReviewed: 0,
      readyToApprove: 0,
    };

    return baseFilteredSolicitudes.reduce((stats, solicitud) => {
      const meta = getTeletrabajoIncidentMeta(
        solicitud,
        puestosByKey,
        solicitudesByPuestoCount,
        employeesByEmpleado,
      );

      if (meta.status !== 'ok') {
        stats.conflicts += 1;
      }
      if (meta.status === 'blocked') {
        stats.blocked += 1;
      }
      if (meta.isReviewedPending) {
        stats.reviewedPending += 1;
      }
      if (!solicitud.revisado) {
        stats.notReviewed += 1;
      }
      if (meta.isReadyToApprove) {
        stats.readyToApprove += 1;
      }

      return stats;
    }, initial);
  }, [baseFilteredSolicitudes, employeesByEmpleado, puestosByKey, solicitudesByPuestoCount]);
  const historicoSolicitudes = useMemo(() => {
    const historicalRows = solicitudesWithPlantillaData.filter(
      (solicitud) => !solicitud.deletedAt && solicitud.periodo !== currentPeriodo,
    );

    if (filters.periodo) {
      return [];
    }

    return filterTeletrabajoSolicitudes(historicalRows, { ...filters, periodo: '' }).filter(
      (solicitud) =>
        matchesIncidentFilter(
          solicitud,
          incidentFilter,
          puestosByKey,
          solicitudesByPuestoCount,
          employeesByEmpleado,
        ),
    );
  }, [
    currentPeriodo,
    employeesByEmpleado,
    filters,
    incidentFilter,
    puestosByKey,
    solicitudesByPuestoCount,
    solicitudesWithPlantillaData,
  ]);
  const {
    preferences,
    setSort,
    setColumnWidth,
    setColumnOrder,
    resetColumnWidths,
    resetPreferences,
  } = useTableViewPreferences<TeletrabajoTableColumnId>({
    storageKey: TELETRABAJO_TABLE_STORAGE_KEY,
    defaultPreferences: defaultTeletrabajoTablePreferences,
    validColumnIds: teletrabajoTableColumnIds,
  });

  const teletrabajoTableColumns = useMemo<
    Array<DataTableColumn<TeletrabajoSolicitud, TeletrabajoTableColumnId>>
  >(
    () => [
      {
        id: 'revisado',
        header: 'Revisado',
        accessor: (s) => (s.revisado ? 1 : 0),
        render: (s) => (
          <span
            className={`inline-flex items-center justify-center rounded-full border px-2 py-1 text-xs font-bold ${
              s.revisado
                ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-200'
                : 'border-amber-400/40 bg-amber-500/15 text-amber-200'
            }`}
            title={s.revisado ? 'Solicitud revisada' : 'Solicitud pendiente de revisar'}
          >
            {s.revisado ? 'Sí' : 'No'}
          </span>
        ),
        width: 96,
        minWidth: 84,
        maxWidth: 130,
        sortable: true,
        className: 'text-center',
      },
      {
        id: 'estado',
        header: 'Estado',
        accessor: (s) => s.estado,
        render: (s) => {
          const estadoStyles: Record<string, string> = {
            pendiente: 'border-amber-400/40 bg-amber-500/15 text-amber-200',
            analizada: 'border-blue-400/40 bg-blue-500/15 text-blue-200',
            aprobada: 'border-emerald-400/40 bg-emerald-500/15 text-emerald-200',
            denegada: 'border-red-400/40 bg-red-500/15 text-red-200',
          };
          const estadoLabels: Record<string, string> = {
            pendiente: 'Pendiente',
            analizada: 'Analizada',
            aprobada: 'Aprobada',
            denegada: 'Rechazada',
          };
          const className =
            estadoStyles[s.estado] ?? 'border-metro-border bg-metro-surface text-metro-muted';
          const label = estadoLabels[s.estado] ?? s.estado;
          return (
            <span
              className={`inline-flex items-center justify-center rounded-full border px-2 py-1 text-xs font-bold ${className}`}
              title={label}
            >
              {label}
            </span>
          );
        },
        width: 110,
        minWidth: 90,
        maxWidth: 180,
        sortable: true,
        className: 'text-center',
      },
      {
        id: 'empleado',
        header: 'Empleado',
        accessor: (s) => Number(s.empleado) || s.empleado,
        render: (s) => s.empleado,
        width: 105,
        minWidth: 85,
        maxWidth: 170,
        sortable: true,
        className: 'font-semibold text-metro-text',
      },
      {
        id: 'nombreApellidos',
        header: 'Nombre y apellidos',
        accessor: (s) => s.nombreApellidos,
        render: (s) => s.nombreApellidos,
        width: 220,
        minWidth: 160,
        maxWidth: 420,
        sortable: true,
        className: 'text-metro-text',
      },
      {
        id: 'puestoOrganizativo',
        header: 'Puesto organizativo',
        accessor: (s) => s.puestoOrganizativo,
        render: (s) => s.puestoOrganizativo,
        width: 190,
        minWidth: 140,
        maxWidth: 360,
        sortable: true,
        className: 'text-metro-muted',
      },
      {
        id: 'teletrabajable',
        header: 'Incidencias',
        accessor: (s) =>
          getTeletrabajoIncidentMeta(s, puestosByKey, solicitudesByPuestoCount, employeesByEmpleado)
            .status,
        render: (s) => {
          const meta = getTeletrabajoIncidentMeta(
            s,
            puestosByKey,
            solicitudesByPuestoCount,
            employeesByEmpleado,
          );
          const className =
            meta.status === 'ok'
              ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-200'
              : meta.status === 'review'
                ? 'border-amber-400/40 bg-amber-500/15 text-amber-200'
                : 'border-red-400/40 bg-red-500/15 text-red-200';
          const icon =
            meta.status === 'ok' ? (
              <CheckCircle2 size={15} />
            ) : meta.status === 'review' ? (
              <AlertTriangle size={15} />
            ) : (
              <XCircle size={15} />
            );

          return (
            <span
              aria-label={meta.title}
              className={`inline-flex h-7 min-w-[9.5rem] items-center justify-center gap-1 rounded-full border px-2 text-xs font-bold ${className}`}
              onMouseEnter={(event) =>
                setIncidentTooltip({
                  title: meta.title,
                  x: event.clientX,
                  y: event.clientY,
                })
              }
              onMouseLeave={() => setIncidentTooltip(null)}
              onMouseMove={(event) =>
                setIncidentTooltip((current) =>
                  current ? { ...current, x: event.clientX, y: event.clientY } : current,
                )
              }
            >
              {icon}
              <span className="truncate">{meta.label}</span>
            </span>
          );
        },
        width: 185,
        minWidth: 160,
        maxWidth: 260,
        sortable: true,
        className: 'text-center',
      },
      {
        id: 'residencia',
        header: 'Residencia',
        accessor: (s) => s.residencia,
        render: (s) => s.residencia,
        width: 130,
        minWidth: 100,
        maxWidth: 240,
        sortable: true,
        className: 'text-metro-muted',
      },
      {
        id: 'tipoSolicitud',
        header: 'Tipo',
        accessor: (s) => s.tipoSolicitud,
        render: (s) => s.tipoSolicitud,
        width: 110,
        minWidth: 90,
        maxWidth: 180,
        sortable: true,
        className: 'text-metro-muted',
      },
      {
        id: 'diasTeletrabajo',
        header: 'Días',
        accessor: (s) => s.diasTeletrabajo.join(', '),
        render: (s) => s.diasTeletrabajo.join(', '),
        width: 150,
        minWidth: 110,
        maxWidth: 240,
        sortable: true,
        className: 'text-metro-muted',
      },
      {
        id: 'periodo',
        header: 'Periodo',
        accessor: (s) => s.periodo,
        render: (s) => s.periodo,
        width: 110,
        minWidth: 90,
        maxWidth: 180,
        sortable: true,
        className: 'text-metro-muted',
      },
      {
        id: 'actions',
        header: 'Acciones',
        render: (solicitud) => (
          <div className="inline-flex items-center justify-end gap-1">
            {solicitud.estado === 'aprobada' && (
              <button
                aria-label="Generar acuerdo Word"
                className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-metro-border bg-metro-surface text-xs font-black text-metro-text hover:border-metro-red disabled:cursor-not-allowed disabled:opacity-50"
                disabled={generatingWordId !== null}
                onClick={(event) => {
                  event.stopPropagation();
                  void handleGenerateWord(solicitud);
                }}
                title="Generar acuerdo Word"
                type="button"
              >
                {generatingWordId === solicitud.id ? <FileText size={13} /> : 'W'}
              </button>
            )}
            <button
              className="rounded-lg bg-metro-red px-2.5 py-1 text-xs font-semibold text-white hover:bg-metro-dark"
              onClick={(event) => {
                event.stopPropagation();
                void (async () => {
                  const result = await removeWithConcurrencyCheck(
                    solicitud.id,
                    solicitud.updatedAt,
                  );
                  if (!result.ok) {
                    await alert(result.message, { type: 'error' });
                  }
                })();
              }}
              type="button"
            >
              Eliminar
            </button>
          </div>
        ),
        width: 100,
        minWidth: 95,
        maxWidth: 130,
        resizable: false,
        isActionColumn: true,
        className: 'whitespace-nowrap',
      },
    ],
    [
      alert,
      employeesByEmpleado,
      generatingWordId,
      handleGenerateWord,
      puestosByKey,
      removeWithConcurrencyCheck,
      solicitudesByPuestoCount,
    ],
  );

  const sortedSolicitudes = useMemo(
    () => sortDataTableRows(filteredSolicitudes, teletrabajoTableColumns, preferences.sort),
    [filteredSolicitudes, preferences.sort, teletrabajoTableColumns],
  );
  const historicoGroups = useMemo(() => {
    const grouped = new Map<string, TeletrabajoSolicitud[]>();
    historicoSolicitudes.forEach((solicitud) => {
      const periodo = solicitud.periodo || 'Sin periodo';
      grouped.set(periodo, [...(grouped.get(periodo) ?? []), solicitud]);
    });

    return Array.from(grouped.entries())
      .sort(([first], [second]) =>
        second.localeCompare(first, 'es', { numeric: true, sensitivity: 'base' }),
      )
      .map(([periodo, rows]) => ({
        periodo,
        rows: sortDataTableRows(rows, teletrabajoTableColumns, preferences.sort),
      }));
  }, [historicoSolicitudes, preferences.sort, teletrabajoTableColumns]);

  const editorSolicitud =
    editorMode === 'edit'
      ? (visibleSolicitudes.find((solicitud) => solicitud.id === editingSolicitudId) ?? null)
      : null;

  const teletrabajoFilterLabel = buildFilterLabel([
    ['Búsqueda', filters.search],
    ['Estado', filters.estado],
    ['Tipo', filters.tipoSolicitud],
    ['Periodo', filters.periodo],
    ['Incidencias', incidentFilter ? TELETRABAJO_INCIDENT_FILTER_LABELS[incidentFilter] : ''],
  ]);
  const activeFilterChips: ActiveFilterChip[] = [
    filters.search.trim()
      ? {
          key: 'search',
          label: 'Búsqueda',
          value: filters.search.trim(),
          onClear: () => setFilter('search', ''),
        }
      : null,
    filters.estado
      ? {
          key: 'estado',
          label: 'Estado',
          value: filters.estado,
          onClear: () => setFilter('estado', ''),
        }
      : null,
    filters.tipoSolicitud
      ? {
          key: 'tipoSolicitud',
          label: 'Tipo',
          value: filters.tipoSolicitud,
          onClear: () => setFilter('tipoSolicitud', ''),
        }
      : null,
    filters.periodo
      ? {
          key: 'periodo',
          label: 'Periodo',
          value: filters.periodo,
          onClear: () => setFilter('periodo', ''),
        }
      : null,
    incidentFilter
      ? {
          key: 'incidentFilter',
          label: 'Incidencias',
          value: TELETRABAJO_INCIDENT_FILTER_LABELS[incidentFilter],
          onClear: () => setIncidentFilter(''),
        }
      : null,
  ].filter((filter): filter is ActiveFilterChip => filter !== null);

  const clearActiveFilters = () => {
    setIncidentFilter('');
    setFilter('search', '');
    setFilter('estado', '');
    setFilter('tipoSolicitud', '');
    setFilter('periodo', '');
  };

  const openPeriodoModal = () => {
    const defaultSourcePeriodo = filters.periodo || periodos[0] || '';
    setNewPeriodoName(suggestNextPeriodo(periodos));
    setSourcePeriodo(defaultSourcePeriodo);
    setCopyFromPreviousPeriodo(Boolean(defaultSourcePeriodo));
    setPeriodoStatus('');
    setIsPeriodoModalOpen(true);
  };

  const handleCreatePeriodo = async () => {
    const result = await createPeriodo({
      periodo: newPeriodoName,
      sourcePeriodo,
      copyFromPrevious: copyFromPreviousPeriodo,
    });
    setPeriodoStatus(result.message);
    if (result.ok) {
      setIsPeriodoModalOpen(false);
      setImportSummary(result.message);
    }
  };

  const handleExportDireccion = useCallback(async () => {
    try {
      await exportTeletrabajoDireccionToExcel({
        rows: sortedSolicitudes,
        employees,
        puestosTeletrabajo,
        solicitudesForAssessment: solicitudesWithPlantillaData,
        periodo: filters.periodo,
      });
      setWordStatus('Excel Dirección generado y abierto correctamente.');
    } catch (error) {
      setWordStatus(
        error instanceof Error
          ? `No se pudo generar el Excel Dirección: ${error.message}`
          : 'No se pudo generar el Excel Dirección.',
      );
    }
  }, [
    employees,
    filters.periodo,
    puestosTeletrabajo,
    solicitudesWithPlantillaData,
    sortedSolicitudes,
  ]);

  const openEditor = (solicitud: TeletrabajoSolicitud) => {
    selectSolicitud(solicitud.id);
    setEditingSolicitudId(solicitud.id);
    setEditorMode('edit');
  };

  const openCreateEditor = () => {
    setEditingSolicitudId(null);
    setEditorMode('create');
  };

  const closeEditor = () => {
    setEditorMode(null);
    setEditingSolicitudId(null);
  };

  useEffect(() => {
    if (!initialSolicitudId || navigationNonce === undefined) {
      return;
    }

    if (processedNavigationNonceRef.current === navigationNonce) {
      return;
    }

    const targetSolicitud = visibleSolicitudes.find(
      (solicitud) => solicitud.id === initialSolicitudId,
    );
    if (!targetSolicitud) {
      return;
    }

    selectSolicitud(targetSolicitud.id);
    setEditingSolicitudId(targetSolicitud.id);
    setEditorMode('edit');
    processedNavigationNonceRef.current = navigationNonce;
  }, [initialSolicitudId, navigationNonce, selectSolicitud, visibleSolicitudes]);

  const handleImportEncuesta = async (file: File) => {
    try {
      setPendingEncuestaImport(null);

      if (jobPositionTranslations.length === 0) {
        setImportSummary(
          'No se pudo importar la encuesta: antes debes tener cargada la tabla de Traducción de puestos en Plantilla.',
        );
        return;
      }

      setImportSummary('Importando encuesta...');

      const result = await importEncuesta(file, employees, {
        jobPositionTranslations,
        puestoAliases: readStoredPuestoAliases(),
      });

      if (result.diagnostics.unresolvedPuestos.length > 0) {
        setPendingEncuestaImport({
          file,
          unknownPuestos: result.diagnostics.unresolvedPuestos,
          mapping: {},
        });
        setImportSummary(
          `Importación pendiente: ${result.diagnostics.unresolvedPuestos.length} puesto${result.diagnostics.unresolvedPuestos.length === 1 ? '' : 's'} sin correspondencia. Asigna el puesto correcto para continuar.`,
        );
        return;
      }

      if (
        result.summary.imported === 0 &&
        result.summary.updated === 0 &&
        result.summary.reactivated === 0
      ) {
        setImportSummary(
          `La importación terminó sin crear ni actualizar solicitudes: ${buildImportSummaryMessage({ ...result.summary, missingEmployees: result.diagnostics.missingEmployees })}. Revisa cabeceras, respuestas “Sí” y empleados de Plantilla.`,
        );
        return;
      }

      setImportSummary(
        `Importación completada correctamente: ${buildImportSummaryMessage({ ...result.summary, missingEmployees: result.diagnostics.missingEmployees })}.`,
      );
    } catch (error) {
      setPendingEncuestaImport(null);
      setImportSummary(
        error instanceof Error
          ? `No se pudo importar la encuesta: ${error.message}`
          : 'No se pudo importar la encuesta.',
      );
    }
  };

  const handleImportHistorico = async (file: File) => {
    try {
      setImportSummary('Analizando histórico de teletrabajo...');
      await previewImportHistorico(file, employees);
      setImportSummary('');
    } catch (error) {
      setImportSummary(
        error instanceof Error
          ? `No se pudo leer el histórico: ${error.message}`
          : 'No se pudo leer el histórico.',
      );
    }
  };

  const handleConfirmImportHistorico = async () => {
    try {
      setImportSummary('Importando histórico de teletrabajo...');
      const result = await confirmImportHistorico();
      setImportSummary(
        `Histórico ${result.periodo} importado correctamente: ${result.summary.imported} registros creados · ${result.summary.updated} actualizados · ${result.summary.unchanged} sin cambios · ${result.summary.denegados} denegados · ${result.summary.ignored} filas ignoradas.`,
      );
    } catch (error) {
      setImportSummary(
        error instanceof Error
          ? `No se pudo importar el histórico: ${error.message}`
          : 'No se pudo importar el histórico.',
      );
    }
  };

  const handleCancelImportHistorico = () => {
    cancelImportHistorico();
    setImportSummary('');
  };

  const handleResolvePendingEncuestaImport = async () => {
    if (!pendingEncuestaImport) {
      return;
    }

    const missing = pendingEncuestaImport.unknownPuestos.filter((puesto) => {
      const selected = pendingEncuestaImport.mapping[normalizeJobPosition(puesto)] ?? '';
      return !selected.trim() || !masterPuestosByKey.has(normalizeJobPosition(selected));
    });

    if (missing.length > 0) {
      setImportSummary(
        'Asigna un puesto válido a todos los puestos no reconocidos antes de continuar.',
      );
      return;
    }

    try {
      const aliases = readStoredPuestoAliases();
      pendingEncuestaImport.unknownPuestos.forEach((puesto) => {
        const selected = pendingEncuestaImport.mapping[normalizeJobPosition(puesto)] ?? '';
        if (selected.trim()) {
          aliases[normalizeJobPosition(puesto)] = selected.trim();
        }
      });
      persistStoredPuestoAliases(aliases);

      const result = await importEncuesta(pendingEncuestaImport.file, employees, {
        jobPositionTranslations,
        puestoAliases: aliases,
      });

      if (result.diagnostics.unresolvedPuestos.length > 0) {
        setPendingEncuestaImport({
          file: pendingEncuestaImport.file,
          unknownPuestos: result.diagnostics.unresolvedPuestos,
          mapping: {},
        });
        setImportSummary(
          'Quedan puestos sin correspondencia. Revisa las asignaciones e inténtalo de nuevo.',
        );
        return;
      }

      if (
        result.summary.imported === 0 &&
        result.summary.updated === 0 &&
        result.summary.reactivated === 0
      ) {
        setPendingEncuestaImport(null);
        setImportSummary(
          `La importación terminó sin crear ni actualizar solicitudes: ${buildImportSummaryMessage({ ...result.summary, missingEmployees: result.diagnostics.missingEmployees })}. Revisa cabeceras, respuestas “Sí” y empleados de Plantilla.`,
        );
        return;
      }

      setPendingEncuestaImport(null);
      setImportSummary(
        `Importación completada correctamente: ${buildImportSummaryMessage({ ...result.summary, missingEmployees: result.diagnostics.missingEmployees })}.`,
      );
    } catch (error) {
      setImportSummary(
        error instanceof Error
          ? `No se pudo completar la importación: ${error.message}`
          : 'No se pudo completar la importación.',
      );
    }
  };

  return (
    <section
      className="rounded-2xl border border-metro-border bg-metro-surface p-4 shadow-card"
      id="teletrabajo"
    >
      <div className="mb-3 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-metro-red">Módulo</p>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-bold text-metro-text">Teletrabajo</h2>
            <ModuleHelpButton
              title="Teletrabajo"
              subtitle="Guía rápida de solicitudes, validaciones, importación e histórico."
              sections={TELETRABAJO_HELP_SECTIONS}
            />
          </div>
          <p className="mt-0.5 text-sm text-metro-muted">
            Listado de solicitudes con alta manual, edición, borrado lógico, búsqueda y filtros.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            accept=".xlsx,.csv,.tsv"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                void handleImportEncuesta(file);
              }
              event.target.value = '';
            }}
            ref={fileInputRef}
            type="file"
          />
          <input
            accept=".xlsx,.csv,.tsv"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                void handleImportHistorico(file);
              }
              event.target.value = '';
            }}
            ref={historicoFileInputRef}
            type="file"
          />
          <ActionButton
            iconOnly={false}
            onClick={() => fileInputRef.current?.click()}
            variant="import"
          >
            Importar encuesta
          </ActionButton>
          <ActionButton
            iconOnly={false}
            onClick={() => historicoFileInputRef.current?.click()}
            variant="import"
          >
            Importar histórico
          </ActionButton>
          <button
            className="inline-flex items-center gap-2 rounded-xl border border-metro-border bg-metro-surface px-3 py-2 text-sm font-semibold text-metro-text hover:border-metro-red"
            onClick={() => setIsPuestosModalOpen(true)}
            type="button"
          >
            <BriefcaseBusiness size={16} /> Puestos Teletrabajo
          </button>
          <button
            className="inline-flex items-center gap-2 rounded-xl border border-metro-border bg-metro-surface px-3 py-2 text-sm font-semibold text-metro-text hover:border-metro-red"
            onClick={openPeriodoModal}
            type="button"
          >
            <Plus size={16} /> Nuevo periodo
          </button>
          <button
            className="inline-flex items-center gap-2 rounded-xl bg-metro-red px-3 py-2 text-sm font-semibold text-white hover:bg-metro-dark"
            onClick={openCreateEditor}
            type="button"
          >
            <Plus size={16} /> Nueva solicitud
          </button>
        </div>
      </div>

      {isEmployeesLoading && (
        <div
          className="mb-3 flex items-center gap-2 rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-sm font-semibold text-amber-100"
          role="status"
          aria-live="polite"
        >
          <Loader2 size={16} className="animate-spin" />
          Cargando datos de Plantilla…
        </div>
      )}

      {importSummary && (
        <div className="mb-3 rounded-xl border border-metro-border bg-metro-surface px-3 py-2 text-sm font-semibold text-metro-text">
          {importSummary}
        </div>
      )}

      {wordStatus && (
        <div className="mb-3 rounded-xl border border-metro-border bg-metro-surface px-3 py-2 text-sm font-semibold text-metro-text">
          {wordStatus}
        </div>
      )}

      <div className="mb-3 grid gap-2 rounded-xl border border-metro-border bg-metro-panel p-2 xl:grid-cols-[minmax(220px,1.2fr)_minmax(150px,0.8fr)_minmax(150px,0.8fr)_minmax(150px,0.8fr)]">
        <label className="flex items-center gap-2 rounded-lg border border-metro-border bg-metro-surface px-3 py-1.5 text-sm text-metro-muted">
          <Search size={16} />
          <input
            className="w-full bg-transparent text-metro-text outline-none placeholder:text-metro-muted"
            onChange={(event) => setFilter('search', event.target.value)}
            placeholder="Buscar por empleado o nombre..."
            type="search"
            value={filters.search}
          />
        </label>
        <SelectFilter
          showLabel
          label="Estado"
          onChange={(value) => setFilter('estado', value as typeof filters.estado)}
          options={TELETRABAJO_ESTADOS}
          value={filters.estado}
        />
        <SelectFilter
          showLabel
          label="Tipo"
          onChange={(value) => setFilter('tipoSolicitud', value as typeof filters.tipoSolicitud)}
          options={TELETRABAJO_TIPOS_SOLICITUD}
          value={filters.tipoSolicitud}
        />
        <SelectFilter
          showLabel
          label="Periodo"
          onChange={(value) => setFilter('periodo', value)}
          options={periodos}
          value={filters.periodo}
        />
      </div>

      <div className="mb-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
        {[
          {
            key: '',
            label: 'Todas',
            value: incidentStats.total,
            className: 'border-metro-border text-metro-text',
          },
          {
            key: 'sinRevisar',
            label: 'Sin revisar',
            value: incidentStats.notReviewed,
            className: 'border-amber-400/40 text-amber-100',
          },
          {
            key: 'revisadasPendientes',
            label: 'Revisadas pendientes',
            value: incidentStats.reviewedPending,
            className: 'border-amber-400/40 text-amber-100',
          },
          {
            key: 'conflictos',
            label: 'Con incidencias',
            value: incidentStats.conflicts,
            className: 'border-amber-400/40 text-amber-100',
          },
          {
            key: 'bloqueantes',
            label: 'Bloqueantes',
            value: incidentStats.blocked,
            className: 'border-red-400/40 text-red-100',
          },
          {
            key: 'listasAprobar',
            label: 'Listas para aprobar',
            value: incidentStats.readyToApprove,
            className: 'border-emerald-400/40 text-emerald-100',
          },
        ].map((item) => {
          const key = item.key as TeletrabajoIncidentFilter;
          const isActive = incidentFilter === key;
          return (
            <button
              className={`rounded-xl border bg-metro-surface px-3 py-2 text-left transition hover:border-metro-red ${item.className} ${
                isActive ? 'ring-2 ring-metro-red/60' : ''
              }`}
              key={item.label}
              onClick={() => setIncidentFilter(key)}
              type="button"
            >
              <span className="block text-xs font-semibold uppercase tracking-wide text-metro-muted">
                {item.label}
              </span>
              <span className="mt-1 block text-lg font-black">{item.value}</span>
            </button>
          );
        })}
      </div>

      {activeFilterChips.length > 0 && (
        <div className="mb-3">
          <ActiveFilterChips filters={activeFilterChips} onClearAll={clearActiveFilters} />
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-metro-border">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-metro-border bg-metro-surface px-3 py-2">
          <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-metro-text">
            <SlidersHorizontal size={16} className="text-metro-red" /> Solicitudes de teletrabajo ·{' '}
            {mainPeriodo || 'Sin periodo'}
            <ExportPrintButtons
              payload={{
                title: 'Solicitudes de teletrabajo',
                filename: 'teletrabajo-solicitudes',
                columns: reorderExportColumns(teletrabajoExportColumns, preferences.columnOrder),
                rows: sortedSolicitudes,
                filterLabel: teletrabajoFilterLabel,
              }}
            />
            <button
              className="inline-flex items-center justify-center rounded-xl border border-transparent bg-[#1a5c38] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#217346] disabled:cursor-not-allowed disabled:opacity-50"
              disabled={sortedSolicitudes.length === 0}
              onClick={() => void handleExportDireccion()}
              title="Exportar a Dirección"
              type="button"
            >
              Dirección
            </button>
          </div>
          <span className="rounded-full bg-metro-red/10 px-3 py-1 text-xs font-bold text-red-200">
            {sortedSolicitudes.length} registros
          </span>
        </div>
        <div className="flex flex-wrap justify-end pb-2">
          <button
            className="inline-flex items-center gap-1 rounded-lg border border-metro-border bg-metro-panel px-2.5 py-1 text-xs font-semibold text-metro-muted hover:border-metro-red hover:text-metro-text"
            onClick={resetPreferences}
            type="button"
          >
            <RotateCcw size={14} /> Restablecer vista
          </button>
        </div>
        <DataTable
          ariaLabel="Solicitudes de teletrabajo"
          columnOrder={preferences.columnOrder}
          columnWidths={preferences.columnWidths}
          onResetColumnWidths={resetColumnWidths}
          columns={teletrabajoTableColumns}
          emptyMessage="No hay solicitudes de teletrabajo para los criterios seleccionados."
          getRowId={(solicitud) => solicitud.id}
          onColumnOrderChange={setColumnOrder}
          onColumnWidthChange={setColumnWidth}
          onRowClick={openEditor}
          onSortChange={setSort}
          rows={sortedSolicitudes}
          rowClassName={(solicitud) =>
            getTeletrabajoRowClassName(
              getTeletrabajoIncidentMeta(
                solicitud,
                puestosByKey,
                solicitudesByPuestoCount,
                employeesByEmpleado,
              ),
              solicitud.estado,
            )
          }
          sort={preferences.sort}
          preserveScrollOnRowsChange
        />
      </div>

      {!filters.periodo && (
        <div className="mt-4 overflow-hidden rounded-xl border border-metro-border bg-metro-surface">
          <button
            className="flex w-full flex-wrap items-center justify-between gap-2 border-b border-metro-border px-3 py-2 text-left text-sm font-semibold text-metro-text hover:bg-metro-panel"
            onClick={() => setIsHistoricoOpen((current) => !current)}
            type="button"
          >
            <span className="inline-flex items-center gap-2">
              {isHistoricoOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              Histórico de teletrabajo
            </span>
            <span className="rounded-full bg-metro-red/10 px-3 py-1 text-xs font-bold text-red-200">
              {historicoSolicitudes.length} registros
            </span>
          </button>

          {isHistoricoOpen && (
            <div className="space-y-3 p-3">
              {historicoGroups.length === 0 ? (
                <p className="rounded-xl border border-metro-border bg-metro-panel px-3 py-2 text-sm text-metro-muted">
                  No hay solicitudes históricas para los criterios seleccionados.
                </p>
              ) : (
                historicoGroups.map((group) => {
                  const isPeriodoOpen = Boolean(openHistoricoPeriodos[group.periodo]);
                  return (
                    <div
                      className="overflow-hidden rounded-xl border border-metro-border bg-metro-panel"
                      key={group.periodo}
                    >
                      <button
                        className="flex w-full flex-wrap items-center justify-between gap-2 px-3 py-2 text-left text-sm font-semibold text-metro-text hover:bg-metro-surface"
                        onClick={() =>
                          setOpenHistoricoPeriodos((current) => ({
                            ...current,
                            [group.periodo]: !current[group.periodo],
                          }))
                        }
                        type="button"
                      >
                        <span className="inline-flex items-center gap-2">
                          {isPeriodoOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                          Periodo {group.periodo}
                        </span>
                        <span className="rounded-full bg-metro-surface px-3 py-1 text-xs font-bold text-metro-muted">
                          {group.rows.length} registros
                        </span>
                      </button>
                      {isPeriodoOpen && (
                        <div className="border-t border-metro-border p-2">
                          <DataTable
                            ariaLabel={`Solicitudes históricas de teletrabajo ${group.periodo}`}
                            columnOrder={preferences.columnOrder}
                            columnWidths={preferences.columnWidths}
                            columns={teletrabajoTableColumns}
                            emptyMessage="No hay solicitudes históricas para este periodo."
                            getRowId={(solicitud) => solicitud.id}
                            onColumnOrderChange={setColumnOrder}
                            onColumnWidthChange={setColumnWidth}
                            onRowClick={openEditor}
                            onSortChange={setSort}
                            rows={group.rows}
                            rowClassName={(solicitud) =>
                              getTeletrabajoRowClassName(
                                getTeletrabajoIncidentMeta(
                                  solicitud,
                                  puestosByKey,
                                  solicitudesByPuestoCount,
                                  employeesByEmpleado,
                                ),
                                solicitud.estado,
                              )
                            }
                            sort={preferences.sort}
                            maxHeightClassName="max-h-[360px]"
                            preserveScrollOnRowsChange
                          />
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      )}

      {incidentTooltip && (
        <div
          className="pointer-events-none fixed z-[80] max-w-md rounded-xl border border-metro-border bg-slate-950 px-3 py-2 text-left text-xs font-semibold leading-relaxed text-metro-text shadow-card"
          style={{
            left: Math.max(12, Math.min(incidentTooltip.x + 12, window.innerWidth - 420)),
            top: incidentTooltip.y + 12,
          }}
        >
          {incidentTooltip.title}
        </div>
      )}

      {isPeriodoModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
          <section className="w-full max-w-xl rounded-2xl border border-metro-border bg-metro-surface shadow-card">
            <header className="flex items-start justify-between gap-3 border-b border-metro-border p-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-metro-red">
                  Teletrabajo
                </p>
                <h3 className="text-xl font-bold text-metro-text">Nuevo periodo</h3>
                <p className="mt-1 text-sm text-metro-muted">
                  Crea una nueva campaña sin modificar las solicitudes del periodo anterior.
                </p>
              </div>
              <button
                aria-label="Cerrar creación de periodo"
                className="rounded-xl border border-metro-border bg-metro-panel p-2 text-metro-muted hover:border-metro-red hover:text-metro-text"
                onClick={() => setIsPeriodoModalOpen(false)}
                type="button"
              >
                <XCircle size={18} />
              </button>
            </header>
            <div className="space-y-4 p-4">
              <label className="block text-xs font-semibold uppercase tracking-wide text-metro-muted">
                Nombre del nuevo periodo
                <input
                  className="mt-1 w-full rounded-lg border border-metro-border bg-metro-panel px-3 py-2 text-sm normal-case tracking-normal text-metro-text outline-none focus:border-metro-red"
                  onChange={(event) => setNewPeriodoName(event.target.value)}
                  placeholder="2027-2028"
                  type="text"
                  value={newPeriodoName}
                />
              </label>
              <label className="flex items-start gap-2 rounded-xl border border-metro-border bg-metro-panel p-3 text-sm font-semibold text-metro-text">
                <input
                  checked={copyFromPreviousPeriodo}
                  className="mt-1"
                  disabled={periodos.length === 0}
                  onChange={(event) => setCopyFromPreviousPeriodo(event.target.checked)}
                  type="checkbox"
                />
                <span>
                  Generar renovaciones desde un periodo anterior
                  <span className="mt-1 block text-xs font-normal text-metro-muted">
                    Copia solicitudes aprobadas o analizadas, las marca como renovación, las deja
                    pendientes y limpia revisión y validaciones.
                  </span>
                </span>
              </label>
              {copyFromPreviousPeriodo && (
                <label className="block text-xs font-semibold uppercase tracking-wide text-metro-muted">
                  Periodo origen
                  <select
                    className="mt-1 w-full rounded-lg border border-metro-border bg-metro-panel px-3 py-2 text-sm normal-case tracking-normal text-metro-text outline-none focus:border-metro-red"
                    onChange={(event) => setSourcePeriodo(event.target.value)}
                    value={sourcePeriodo}
                  >
                    <option value="">Selecciona periodo...</option>
                    {periodos.map((periodo) => (
                      <option key={periodo} value={periodo}>
                        {periodo}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {periodoStatus && (
                <div className="rounded-xl border border-metro-border bg-metro-panel px-3 py-2 text-sm font-semibold text-metro-text">
                  {periodoStatus}
                </div>
              )}
            </div>
            <footer className="flex flex-wrap justify-end gap-2 border-t border-metro-border p-4">
              <button
                className="rounded-xl border border-metro-border bg-metro-panel px-3 py-2 text-sm font-semibold text-metro-text hover:border-metro-red"
                onClick={() => setIsPeriodoModalOpen(false)}
                type="button"
              >
                Cancelar
              </button>
              <button
                className="rounded-xl bg-metro-red px-3 py-2 text-sm font-semibold text-white hover:bg-metro-dark disabled:cursor-not-allowed disabled:opacity-50"
                disabled={
                  !newPeriodoName.trim() || (copyFromPreviousPeriodo && !sourcePeriodo.trim())
                }
                onClick={() => void handleCreatePeriodo()}
                type="button"
              >
                Crear periodo
              </button>
            </footer>
          </section>
        </div>
      )}

      {pendingEncuestaImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
          <section className="flex max-h-[88vh] w-full max-w-4xl flex-col rounded-2xl border border-metro-border bg-metro-surface shadow-card">
            <header className="flex items-start justify-between gap-3 border-b border-metro-border p-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-metro-red">
                  Importar encuesta
                </p>
                <h3 className="text-xl font-bold text-metro-text">
                  Resolver puestos no reconocidos
                </h3>
                <p className="mt-1 text-sm text-metro-muted">
                  Asigna cada puesto de Plantilla al puesto correcto de la tabla de Traducción de
                  puestos.
                </p>
              </div>
              <button
                aria-label="Cancelar resolución de puestos"
                className="rounded-xl border border-metro-border bg-metro-panel p-2 text-metro-muted hover:border-metro-red hover:text-metro-text"
                onClick={() => setPendingEncuestaImport(null)}
                type="button"
              >
                <XCircle size={18} />
              </button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <div className="mb-3 flex items-start gap-2 rounded-xl border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-sm font-semibold text-amber-100">
                <AlertTriangle size={18} className="mt-0.5 shrink-0" />
                <span>
                  Hay {pendingEncuestaImport.unknownPuestos.length} puesto
                  {pendingEncuestaImport.unknownPuestos.length === 1 ? '' : 's'} que no cuadran con
                  la tabla maestra.
                </span>
              </div>
              <div className="space-y-2">
                {pendingEncuestaImport.unknownPuestos.map((puesto) => {
                  const key = normalizeJobPosition(puesto);
                  return (
                    <div
                      className="grid gap-2 rounded-xl border border-metro-border bg-metro-panel p-3 lg:grid-cols-[minmax(220px,1fr)_minmax(280px,1.2fr)] lg:items-center"
                      key={key}
                    >
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-metro-muted">
                          Puesto en Plantilla
                        </p>
                        <p className="font-semibold text-metro-text">{puesto}</p>
                      </div>
                      <label className="text-xs font-semibold uppercase tracking-wide text-metro-muted">
                        Puesto correcto
                        <select
                          className="mt-1 w-full rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-sm text-metro-text outline-none focus:border-metro-red"
                          onChange={(event) =>
                            setPendingEncuestaImport((current) =>
                              current
                                ? {
                                    ...current,
                                    mapping: { ...current.mapping, [key]: event.target.value },
                                  }
                                : current,
                            )
                          }
                          value={pendingEncuestaImport.mapping[key] ?? ''}
                        >
                          <option value="">Selecciona puesto...</option>
                          {masterPuestos.map((candidate) => (
                            <option key={candidate} value={candidate}>
                              {candidate}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  );
                })}
              </div>
            </div>
            <footer className="flex flex-wrap justify-end gap-2 border-t border-metro-border p-4">
              <button
                className="rounded-xl border border-metro-border bg-metro-panel px-3 py-2 text-sm font-semibold text-metro-text hover:border-metro-red"
                onClick={() => setPendingEncuestaImport(null)}
                type="button"
              >
                Cancelar importación
              </button>
              <button
                className="rounded-xl bg-metro-red px-3 py-2 text-sm font-semibold text-white hover:bg-metro-dark"
                onClick={() => void handleResolvePendingEncuestaImport()}
                type="button"
              >
                Confirmar e importar
              </button>
            </footer>
          </section>
        </div>
      )}

      {isPuestosModalOpen && (
        <TeletrabajoPuestosModal onClose={() => setIsPuestosModalOpen(false)} />
      )}

      {pendingHistoricoImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
          <section className="flex max-h-[88vh] w-full max-w-2xl flex-col rounded-2xl border border-metro-border bg-metro-surface shadow-card">
            <header className="flex items-start justify-between gap-3 border-b border-metro-border p-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-metro-red">
                  Importar histórico
                </p>
                <h3 className="text-xl font-bold text-metro-text">
                  Confirmar importación del periodo {pendingHistoricoImport.periodo}
                </h3>
                <p className="mt-1 text-sm text-metro-muted">
                  Revisa el resumen antes de aplicar los cambios a la base compartida.
                </p>
              </div>
              <button
                aria-label="Cancelar importación de histórico"
                className="rounded-xl border border-metro-border bg-metro-panel p-2 text-metro-muted hover:border-metro-red hover:text-metro-text"
                onClick={handleCancelImportHistorico}
                type="button"
              >
                <XCircle size={18} />
              </button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <ul className="grid gap-2 text-sm text-metro-text sm:grid-cols-2">
                <li className="rounded-lg border border-metro-border bg-metro-panel px-3 py-2">
                  <span className="font-semibold text-emerald-300">
                    {pendingHistoricoImport.summary.imported}
                  </span>{' '}
                  registros nuevos
                </li>
                <li className="rounded-lg border border-metro-border bg-metro-panel px-3 py-2">
                  <span className="font-semibold text-amber-300">
                    {pendingHistoricoImport.summary.updated}
                  </span>{' '}
                  registros existentes actualizados
                </li>
                <li className="rounded-lg border border-metro-border bg-metro-panel px-3 py-2">
                  <span className="font-semibold text-metro-muted">
                    {pendingHistoricoImport.summary.unchanged}
                  </span>{' '}
                  sin cambios
                </li>
                <li className="rounded-lg border border-metro-border bg-metro-panel px-3 py-2">
                  <span className="font-semibold text-red-300">
                    {pendingHistoricoImport.summary.denegados}
                  </span>{' '}
                  denegados
                </li>
                <li className="rounded-lg border border-metro-border bg-metro-panel px-3 py-2 sm:col-span-2">
                  <span className="font-semibold text-metro-muted">
                    {pendingHistoricoImport.summary.ignored}
                  </span>{' '}
                  filas ignoradas (sin empleado o auxiliares)
                </li>
              </ul>
              {pendingHistoricoImport.summary.updated > 0 && (
                <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-sm font-semibold text-amber-100">
                  <AlertTriangle size={18} className="mt-0.5 shrink-0" />
                  <span>
                    {pendingHistoricoImport.summary.updated} solicitud
                    {pendingHistoricoImport.summary.updated === 1 ? '' : 'es'} ya existente
                    {pendingHistoricoImport.summary.updated === 1 ? '' : 's'} se actualizará
                    {pendingHistoricoImport.summary.updated === 1 ? '' : 'n'} con los datos del
                    fichero (estado, días, observaciones...). Las validaciones de seguridad,
                    prevención y jefatura ya realizadas en la app se conservan.
                  </span>
                </div>
              )}
            </div>
            <footer className="flex flex-wrap justify-end gap-2 border-t border-metro-border p-4">
              <button
                className="rounded-xl border border-metro-border bg-metro-panel px-3 py-2 text-sm font-semibold text-metro-text hover:border-metro-red"
                onClick={handleCancelImportHistorico}
                type="button"
              >
                Cancelar
              </button>
              <button
                className="rounded-xl bg-metro-red px-3 py-2 text-sm font-semibold text-white hover:bg-metro-dark"
                onClick={() => void handleConfirmImportHistorico()}
                type="button"
              >
                Confirmar e importar
              </button>
            </footer>
          </section>
        </div>
      )}

      {editorMode && (
        <TeletrabajoEditor mode={editorMode} onDone={closeEditor} solicitud={editorSolicitud} />
      )}

      {dialogNode}
    </section>
  );
}
