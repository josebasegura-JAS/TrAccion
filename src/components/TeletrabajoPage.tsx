import {
  AlertTriangle,
  BriefcaseBusiness,
  CheckCircle2,
  FileText,
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
  TELETRABAJO_ESTADOS,
  TELETRABAJO_TIPOS_SOLICITUD,
  type TeletrabajoSolicitud,
} from '../features/teletrabajo/domain/solicitud';

import { useConfiguracionStore } from '../features/configuracion/store/useConfiguracionStore';
import { saveDocxWithDialog } from '../features/teletrabajo/domain/download';
import { generateTeletrabajoWord } from '../features/teletrabajo/domain/word';
import {
  normalizeTeletrabajoPuesto,
  type TeletrabajoPuesto,
} from '../features/teletrabajo/domain/puestosTeletrabajo';
import { useTeletrabajoStore } from '../features/teletrabajo/store/useTeletrabajoStore';
import { buildFilterLabel } from '../shared/export/filterLabel';
import { ActiveFilterChips, type ActiveFilterChip } from '../shared/filters/ActiveFilterChips';
import { SelectFilter } from '../shared/filters/SelectFilter';
import type { ExportColumn } from '../shared/export/types';
import { ExportPrintButtons } from '../shared/print/ExportPrintButtons';
import { readStorageItem, writeStorageItem } from '../services/persistence';

type TeletrabajoTableColumnId =
  | 'empleado'
  | 'nombreApellidos'
  | 'puestoNomina'
  | 'teletrabajable'
  | 'residencia'
  | 'tipoSolicitud'
  | 'diasTeletrabajo'
  | 'estado'
  | 'periodo'
  | 'actions';

const TELETRABAJO_TABLE_STORAGE_KEY = 'traccion.tableView.teletrabajo.solicitudes';
const TELETRABAJO_PUESTOS_ALIASES_STORAGE_KEY =
  'traccion.v1.teletrabajo.puestos.translationAliases';
const teletrabajoTableColumnIds: readonly TeletrabajoTableColumnId[] = [
  'empleado',
  'nombreApellidos',
  'puestoNomina',
  'teletrabajable',
  'residencia',
  'tipoSolicitud',
  'diasTeletrabajo',
  'estado',
  'periodo',
  'actions',
];
const defaultTeletrabajoTablePreferences: TableViewPreferences<TeletrabajoTableColumnId> = {
  sort: null,
  columnWidths: {},
};

const teletrabajoExportColumns: ExportColumn<TeletrabajoSolicitud>[] = [
  { key: 'empleado', header: 'Empleado', value: (solicitud) => solicitud.empleado },
  {
    key: 'nombreApellidos',
    header: 'Nombre y apellidos',
    value: (solicitud) => solicitud.nombreApellidos,
  },
  { key: 'puestoNomina', header: 'Puesto nómina', value: (solicitud) => solicitud.puestoNomina },
  {
    key: 'teletrabajable',
    header: 'Teletrabajable',
    value: (solicitud) => solicitud.puestoOrganizativo,
  },
  { key: 'residencia', header: 'Residencia', value: (solicitud) => solicitud.residencia },
  { key: 'tipoSolicitud', header: 'Tipo', value: (solicitud) => solicitud.tipoSolicitud },
  {
    key: 'diasTeletrabajo',
    header: 'Días',
    value: (solicitud) => solicitud.diasTeletrabajo.join(', '),
  },
  { key: 'estado', header: 'Estado', value: (solicitud) => solicitud.estado },
  { key: 'periodo', header: 'Periodo', value: (solicitud) => solicitud.periodo },
];

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0))).sort(
    (first, second) => first.localeCompare(second, 'es', { numeric: true, sensitivity: 'base' }),
  );
}

type TeletrabajoSemaforoStatus = 'ok' | 'review' | 'blocked';

interface TeletrabajoSemaforo {
  status: TeletrabajoSemaforoStatus;
  title: string;
}

interface PendingEncuestaImport {
  file: File;
  unknownPuestos: string[];
  mapping: Record<string, string>;
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
  ignored: number;
  missingEmployees: number;
}): string {
  const parts = [
    `${summary.imported} registros importados`,
    `${summary.updated} registros actualizados`,
    `${summary.ignored} filas ignoradas`,
  ];

  if (summary.missingEmployees > 0) {
    parts.push(`${summary.missingEmployees} empleados no encontrados en Plantilla`);
  }

  return parts.join(' · ');
}

function buildPuestosByKey(puestos: readonly TeletrabajoPuesto[]): Map<string, TeletrabajoPuesto> {
  return new Map(
    puestos
      .filter((puesto) => !puesto.deletedAt)
      .map((puesto) => [normalizeTeletrabajoPuesto(puesto.puesto), puesto]),
  );
}

function buildSolicitudesByPuestoCount(
  solicitudes: readonly TeletrabajoSolicitud[],
): Map<string, number> {
  const counts = new Map<string, number>();

  solicitudes.forEach((solicitud) => {
    if (solicitud.deletedAt || solicitud.estado === 'denegada') {
      return;
    }

    const key = normalizeTeletrabajoPuesto(solicitud.puestoOrganizativo);
    if (!key) {
      return;
    }

    counts.set(key, (counts.get(key) ?? 0) + 1);
  });

  return counts;
}

function getTeletrabajoSemaforo(
  solicitud: TeletrabajoSolicitud,
  puestosByKey: Map<string, TeletrabajoPuesto>,
  solicitudesByPuestoCount: Map<string, number>,
): TeletrabajoSemaforo {
  const puestoKey = normalizeTeletrabajoPuesto(solicitud.puestoOrganizativo);
  if (!puestoKey) {
    return {
      status: 'blocked',
      title: 'La solicitud no tiene puesto organizativo informado.',
    };
  }

  const puesto = puestosByKey.get(puestoKey);
  if (!puesto) {
    return {
      status: 'blocked',
      title: `El puesto organizativo «${solicitud.puestoOrganizativo}» no está marcado como teletrabajable.`,
    };
  }

  const solicitudesDelPuesto = solicitudesByPuestoCount.get(puestoKey) ?? 0;
  if (puesto.maxSolicitudes > 0 && solicitudesDelPuesto > puesto.maxSolicitudes) {
    return {
      status: 'review',
      title: `Revisar: ${solicitudesDelPuesto} solicitudes activas para presencialidad mínima ${puesto.maxSolicitudes}.`,
    };
  }

  return {
    status: 'ok',
    title: puesto.observaciones
      ? `Puesto teletrabajable. ${puesto.observaciones}`
      : 'Puesto teletrabajable.',
  };
}

export function TeletrabajoPage({
  initialSolicitudId = null,
  navigationNonce,
}: {
  initialSolicitudId?: string | null;
  navigationNonce?: number;
} = {}) {
  const {
    filters,
    importEncuesta,
    load,
    puestosTeletrabajo,
    remove,
    selectSolicitud,
    setFilter,
    solicitudes,
  } = useTeletrabajoStore();
  const employees = useEmployeeStore((state) => state.employees);
  const loadEmployees = useEmployeeStore((state) => state.load);
  const jobPositionTranslations = useEmployeeStore((state) => state.jobPositionTranslations);
  const [editorMode, setEditorMode] = useState<'create' | 'edit' | null>(null);
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
  const processedNavigationNonceRef = useRef<number | null>(null);

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

      const employee =
        employees.find(
          (candidate) =>
            !candidate.deletedAt && candidate.empleado.trim() === solicitud.empleado.trim(),
        ) ?? null;

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

  const visibleSolicitudes = useMemo(
    () => solicitudes.filter((solicitud) => !solicitud.deletedAt),
    [solicitudes],
  );
  const puestosByKey = useMemo(() => buildPuestosByKey(puestosTeletrabajo), [puestosTeletrabajo]);
  const solicitudesByPuestoCount = useMemo(
    () => buildSolicitudesByPuestoCount(solicitudes),
    [solicitudes],
  );
  const filteredSolicitudes = useMemo(
    () => filterTeletrabajoSolicitudes(solicitudes, filters),
    [filters, solicitudes],
  );
  const { preferences, setSort, setColumnWidth, resetPreferences } =
    useTableViewPreferences<TeletrabajoTableColumnId>({
      storageKey: TELETRABAJO_TABLE_STORAGE_KEY,
      defaultPreferences: defaultTeletrabajoTablePreferences,
      validColumnIds: teletrabajoTableColumnIds,
    });

  const teletrabajoTableColumns = useMemo<
    Array<DataTableColumn<TeletrabajoSolicitud, TeletrabajoTableColumnId>>
  >(
    () => [
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
        id: 'puestoNomina',
        header: 'Puesto nómina',
        accessor: (s) => s.puestoNomina,
        render: (s) => s.puestoNomina,
        width: 190,
        minWidth: 140,
        maxWidth: 360,
        sortable: true,
        className: 'text-metro-muted',
      },
      {
        id: 'teletrabajable',
        header: 'TT',
        accessor: (s) => getTeletrabajoSemaforo(s, puestosByKey, solicitudesByPuestoCount).status,
        render: (s) => {
          const semaforo = getTeletrabajoSemaforo(s, puestosByKey, solicitudesByPuestoCount);
          const className =
            semaforo.status === 'ok'
              ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-200'
              : semaforo.status === 'review'
                ? 'border-amber-400/40 bg-amber-500/15 text-amber-200'
                : 'border-red-400/40 bg-red-500/15 text-red-200';
          const icon =
            semaforo.status === 'ok' ? (
              <CheckCircle2 size={15} />
            ) : semaforo.status === 'review' ? (
              <AlertTriangle size={15} />
            ) : (
              <XCircle size={15} />
            );

          return (
            <span
              className={`inline-flex h-7 min-w-7 items-center justify-center rounded-full border px-2 text-xs font-bold ${className}`}
              title={semaforo.title}
            >
              {icon}
              {semaforo.status === 'review' && <span className="ml-1">!</span>}
            </span>
          );
        },
        width: 70,
        minWidth: 58,
        maxWidth: 90,
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
        id: 'estado',
        header: 'Estado',
        accessor: (s) => s.estado,
        render: (s) => s.estado,
        width: 110,
        minWidth: 90,
        maxWidth: 180,
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
                remove(solicitud.id);
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
    [generatingWordId, handleGenerateWord, puestosByKey, remove, solicitudesByPuestoCount],
  );

  const sortedSolicitudes = useMemo(
    () => sortDataTableRows(filteredSolicitudes, teletrabajoTableColumns, preferences.sort),
    [filteredSolicitudes, preferences.sort, teletrabajoTableColumns],
  );

  const editorSolicitud =
    editorMode === 'edit'
      ? (visibleSolicitudes.find((solicitud) => solicitud.id === editingSolicitudId) ?? null)
      : null;

  const periodos = useMemo(
    () => uniqueSorted(visibleSolicitudes.map((solicitud) => solicitud.periodo)).reverse(),
    [visibleSolicitudes],
  );
  const teletrabajoFilterLabel = buildFilterLabel([
    ['Búsqueda', filters.search],
    ['Estado', filters.estado],
    ['Tipo', filters.tipoSolicitud],
    ['Periodo', filters.periodo],
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
  ].filter((filter): filter is ActiveFilterChip => filter !== null);

  const clearActiveFilters = () => {
    setFilter('search', '');
    setFilter('estado', '');
    setFilter('tipoSolicitud', '');
    setFilter('periodo', '');
  };

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

      if (result.summary.imported === 0 && result.summary.updated === 0) {
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

      if (result.summary.imported === 0 && result.summary.updated === 0) {
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
          <h2 className="text-xl font-bold text-metro-text">Teletrabajo</h2>
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
          <ActionButton onClick={() => fileInputRef.current?.click()} variant="import">
            Importar encuesta
          </ActionButton>
          <button
            className="inline-flex items-center gap-2 rounded-xl border border-metro-border bg-metro-surface px-3 py-2 text-sm font-semibold text-metro-text hover:border-metro-red"
            onClick={() => setIsPuestosModalOpen(true)}
            type="button"
          >
            <BriefcaseBusiness size={16} /> Puestos Teletrabajo
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

      <div className="mb-3 grid gap-2 rounded-xl border border-metro-border bg-metro-panel p-2 lg:grid-cols-[minmax(220px,1.2fr)_minmax(150px,0.8fr)_minmax(150px,0.8fr)_minmax(150px,0.8fr)]">
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

      {activeFilterChips.length > 0 && (
        <div className="mb-3">
          <ActiveFilterChips filters={activeFilterChips} onClearAll={clearActiveFilters} />
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-metro-border">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-metro-border bg-metro-surface px-3 py-2">
          <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-metro-text">
            <SlidersHorizontal size={16} className="text-metro-red" /> Solicitudes de teletrabajo
            <ExportPrintButtons
              payload={{
                title: 'Solicitudes de teletrabajo',
                filename: 'teletrabajo-solicitudes',
                columns: teletrabajoExportColumns,
                rows: sortedSolicitudes,
                filterLabel: teletrabajoFilterLabel,
              }}
            />
          </div>
          <span className="rounded-full bg-metro-red/10 px-3 py-1 text-xs font-bold text-red-200">
            {filteredSolicitudes.length} registros
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
          columnWidths={preferences.columnWidths}
          columns={teletrabajoTableColumns}
          emptyMessage="No hay solicitudes de teletrabajo para los criterios seleccionados."
          getRowId={(solicitud) => solicitud.id}
          onColumnWidthChange={setColumnWidth}
          onRowClick={openEditor}
          onSortChange={setSort}
          rows={filteredSolicitudes}
          sort={preferences.sort}
        />
      </div>

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

      {editorMode && (
        <TeletrabajoEditor mode={editorMode} onDone={closeEditor} solicitud={editorSolicitud} />
      )}
    </section>
  );
}
