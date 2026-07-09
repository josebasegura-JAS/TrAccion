import { AlertTriangle, XCircle } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { sortDataTableRows } from '../shared/table/tableSorting';
import { useTableViewPreferences } from '../shared/table/useTableViewPreferences';
import { TeletrabajoEditor } from './TeletrabajoEditor';
import { TeletrabajoFiltersBar } from '../features/teletrabajo/components/TeletrabajoFiltersBar';
import { TeletrabajoPageHeader } from '../features/teletrabajo/components/TeletrabajoPageHeader';
import { TeletrabajoStatusMessages } from '../features/teletrabajo/components/TeletrabajoStatusMessages';
import { TeletrabajoHistoricoSection, TeletrabajoMainTableSection } from '../features/teletrabajo/components/TeletrabajoTableSections';
import { buildTeletrabajoTableColumns, type TeletrabajoIncidentTooltipState } from '../features/teletrabajo/components/teletrabajoTableColumns';
import {
  defaultTeletrabajoTablePreferences,
  TELETRABAJO_TABLE_STORAGE_KEY,
  teletrabajoTableColumnIds,
  type TeletrabajoTableColumnId,
} from '../features/teletrabajo/components/teletrabajoTableConfig';
import { TeletrabajoGruposCoberturaModal } from './TeletrabajoGruposCoberturaModal';
import { TeletrabajoPuestosModal } from './TeletrabajoPuestosModal';
import { normalizeJobPosition } from '../features/plantilla/domain/jobPositionTranslation';
import type { Employee } from '../features/plantilla/domain/employee';
import { useEmployeeStore } from '../features/plantilla/store/useEmployeeStore';
import { filterTeletrabajoSolicitudes } from '../features/teletrabajo/domain/filters';
import { buildGruposCoberturaByIdMap } from '../features/teletrabajo/domain/gruposCobertura';
import {
  buildPuestosByKey,
  buildSolicitudesByPeriodoPuestoCount,
} from '../features/teletrabajo/domain/semaforo';
import {
  getTeletrabajoIncidentMeta,
  matchesIncidentFilter,
  TELETRABAJO_INCIDENT_FILTER_LABELS,
  type TeletrabajoIncidentFilter,
} from '../features/teletrabajo/domain/incidentView';
import {
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
import { buildStableExportFilename, openWorkbookInExcel } from '../shared/export/tableExport';
import { ActiveFilterChips, type ActiveFilterChip } from '../shared/filters/ActiveFilterChips';
import { readStorageItem, writeStorageItem } from '../services/persistence';
import { useAppDialog } from '../hooks/useAppDialog';

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
    gruposCobertura,
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
  const [isGruposCoberturaModalOpen, setIsGruposCoberturaModalOpen] = useState(false);
  const [wordStatus, setWordStatus] = useState<string>('');
  const [generatingWordId, setGeneratingWordId] = useState<string | null>(null);
  const rutaPlantillaTeletrabajo = useConfiguracionStore((state) => state.rutaPlantillaTeletrabajo);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const historicoFileInputRef = useRef<HTMLInputElement>(null);
  const [isHistoricoOpen, setIsHistoricoOpen] = useState(false);
  const [openHistoricoPeriodos, setOpenHistoricoPeriodos] = useState<Record<string, boolean>>({});
  const processedNavigationNonceRef = useRef<number | null>(null);
  const [incidentFilter, setIncidentFilter] = useState<TeletrabajoIncidentFilter>('');
  const [incidentTooltip, setIncidentTooltip] = useState<TeletrabajoIncidentTooltipState | null>(null);

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
  const gruposByIdMap = useMemo(
    () => buildGruposCoberturaByIdMap(gruposCobertura),
    [gruposCobertura],
  );
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
          gruposByIdMap,
        ),
      ),
    [
      baseFilteredSolicitudes,
      employeesByEmpleado,
      gruposByIdMap,
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
        gruposByIdMap,
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
  }, [
    baseFilteredSolicitudes,
    employeesByEmpleado,
    gruposByIdMap,
    puestosByKey,
    solicitudesByPuestoCount,
  ]);
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
          gruposByIdMap,
        ),
    );
  }, [
    currentPeriodo,
    employeesByEmpleado,
    filters,
    gruposByIdMap,
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

  const teletrabajoTableColumns = useMemo(
    () =>
      buildTeletrabajoTableColumns({
        alert,
        employeesByEmpleado,
        generatingWordId,
        gruposByIdMap,
        handleGenerateWord,
        puestosByKey,
        removeWithConcurrencyCheck,
        setIncidentTooltip,
        solicitudesByPuestoCount,
      }),
    [
      alert,
      employeesByEmpleado,
      generatingWordId,
      gruposByIdMap,
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
        gruposCobertura,
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
    gruposCobertura,
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

  const handleGenerateSampleEncuestaExcel = async () => {
    try {
      const { default: ExcelJS } = await import('exceljs');
      const generatedAt = new Date();
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'TrAccion';
      workbook.created = generatedAt;
      workbook.modified = generatedAt;

      const worksheet = workbook.addWorksheet('Encuesta', {
        views: [{ state: 'frozen', ySplit: 1 }],
      });

      worksheet.columns = [
        { header: 'Nº Empleado', key: 'empleado', width: 14 },
        { header: 'Nombre Apellidos', key: 'nombreApellidos', width: 32 },
        { header: 'Respuesta', key: 'respuesta', width: 14 },
        { header: 'Tipo solicitud', key: 'tipoSolicitud', width: 16 },
        { header: 'Días teletrabajo', key: 'diasTeletrabajo', width: 22 },
        { header: 'Periodo', key: 'periodo', width: 14 },
        { header: 'Fecha entrega ordenador', key: 'fechaOrdenador', width: 22 },
        { header: 'Fecha entrega cascos', key: 'fechaCascos', width: 20 },
        { header: 'Observaciones', key: 'observaciones', width: 44 },
      ];

      worksheet.getRow(1).font = { bold: true };
      worksheet.getRow(1).alignment = { horizontal: 'center', vertical: 'middle' };

      worksheet.addRow({
        empleado: '12345',
        nombreApellidos: 'Apellido1 Apellido2, Nombre',
        respuesta: 'Sí',
        tipoSolicitud: 'Nueva',
        diasTeletrabajo: 'Martes y jueves',
        periodo: '2026-2027',
        fechaOrdenador: '2026-09-01',
        fechaCascos: '2026-09-01',
        observaciones: 'Fila de ejemplo: sustituir o borrar antes de importar.',
      });

      const notesSheet = workbook.addWorksheet('Instrucciones');
      notesSheet.columns = [{ header: 'Campo', width: 26 }, { header: 'Uso', width: 82 }];
      notesSheet.addRows([
        ['Nº Empleado', 'Obligatorio. Debe coincidir con un empleado existente en Plantilla.'],
        ['Nombre Apellidos', 'Opcional. Si no se informa, se usa el nombre de Plantilla.'],
        ['Respuesta', 'Obligatorio. Solo se importan las filas con "Sí"; el resto se ignoran.'],
        ['Tipo solicitud', 'Opcional. "Nueva" o "Renovación" (si no contiene "nueva" se asume renovación).'],
        ['Días teletrabajo', 'Opcional. Debe mencionar martes, miércoles y/o jueves.'],
        ['Periodo', 'Opcional. Si se deja vacío se usa el periodo por defecto de la campaña.'],
        ['Fecha entrega ordenador / Fecha entrega cascos', 'Opcionales.'],
        ['Observaciones', 'Opcional. Texto libre; también se usa para detectar los días de teletrabajo.'],
        ['Requisito previo', 'Antes de importar debes tener cargada la tabla de Traducción de puestos en Plantilla.'],
      ]);
      notesSheet.getRow(1).font = { bold: true };

      const buffer = await workbook.xlsx.writeBuffer();
      await openWorkbookInExcel(
        buffer,
        buildStableExportFilename('muestra-encuesta-teletrabajo', generatedAt),
      );
      setImportSummary('Excel de muestra generado.');
    } catch (sampleError) {
      setImportSummary(
        sampleError instanceof Error
          ? sampleError.message
          : 'No se ha podido generar el Excel de muestra.',
      );
    }
  };

  const handleGenerateSampleHistoricoExcel = async () => {
    try {
      const { default: ExcelJS } = await import('exceljs');
      const generatedAt = new Date();
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'TrAccion';
      workbook.created = generatedAt;
      workbook.modified = generatedAt;

      const worksheet = workbook.addWorksheet('Historico', {
        views: [{ state: 'frozen', ySplit: 3 }],
      });

      worksheet.mergeCells('A1:K1');
      worksheet.getCell('A1').value = 'Teletrabajo 2026-2027';
      worksheet.getCell('A1').font = { bold: true };

      const parentHeaderRow = worksheet.getRow(2);
      parentHeaderRow.getCell(5).value = 'Días teletrabajo';
      worksheet.mergeCells('E2:G2');

      const headerRow = worksheet.getRow(3);
      headerRow.values = [
        'Nº Empleado',
        'Nombre',
        'Detalle',
        'Dirección',
        'Martes',
        'Miércoles',
        'Jueves',
        'Periodo 20XX-20XX',
        'Informe favorable',
        'Año anterior teletrabajado',
        'Observaciones',
      ];
      headerRow.font = { bold: true };

      worksheet.addRow([
        '12345',
        'Apellido1 Apellido2, Nombre',
        'Puesto organizativo',
        'Centro de trabajo',
        'X',
        '',
        'X',
        '2026-2027',
        'Sí',
        'Sí',
        'Fila de ejemplo: sustituir o borrar antes de importar.',
      ]);

      worksheet.columns.forEach((column) => {
        column.width = 20;
      });

      const notesSheet = workbook.addWorksheet('Instrucciones');
      notesSheet.columns = [{ header: 'Campo', width: 26 }, { header: 'Uso', width: 82 }];
      notesSheet.addRows([
        ['Título', 'Obligatorio. En algún texto del fichero debe aparecer el periodo, por ejemplo "2026-2027".'],
        ['Nº Empleado', 'Obligatorio. Debe coincidir con un empleado existente en Plantilla.'],
        ['Nombre / Detalle / Dirección', 'Opcionales. "Detalle" se usa como puesto y "Dirección" como residencia si Plantilla no los tiene.'],
        ['Martes / Miércoles / Jueves', 'Marcar con "X" o "Sí" los días de teletrabajo concedidos.'],
        ['Periodo 20XX-20XX', 'Opcional. Periodo concreto solicitado; se añade a las observaciones.'],
        ['Informe favorable', '"No" o cualquier texto con "denegado" marca la solicitud como denegada; en otro caso se considera aprobada.'],
        ['Año anterior teletrabajado', '"Sí" marca la solicitud como renovación; en otro caso se considera nueva.'],
        ['Observaciones', 'Opcional. Texto libre.'],
        ['Estructura', 'Se esperan dos filas de cabecera: una fila superior de agrupación y, justo debajo, la fila con los nombres de columna ("Nº Empleado", "Nombre", "Martes", "Miércoles", "Jueves" son obligatorias para localizarla).'],
      ]);
      notesSheet.getRow(1).font = { bold: true };

      const buffer = await workbook.xlsx.writeBuffer();
      await openWorkbookInExcel(
        buffer,
        buildStableExportFilename('muestra-historico-teletrabajo', generatedAt),
      );
      setImportSummary('Excel de muestra generado.');
    } catch (sampleError) {
      setImportSummary(
        sampleError instanceof Error
          ? sampleError.message
          : 'No se ha podido generar el Excel de muestra.',
      );
    }
  };

  return (
    <section
      className="rounded-2xl border border-metro-border bg-metro-surface p-4 shadow-card"
      id="teletrabajo"
    >
      <TeletrabajoPageHeader
        encuestaFileInputRef={fileInputRef}
        historicoFileInputRef={historicoFileInputRef}
        onEncuestaFileSelected={(file) => void handleImportEncuesta(file)}
        onHistoricoFileSelected={(file) => void handleImportHistorico(file)}
        onGenerateSampleEncuestaExcel={() => void handleGenerateSampleEncuestaExcel()}
        onGenerateSampleHistoricoExcel={() => void handleGenerateSampleHistoricoExcel()}
        onOpenPuestosModal={() => setIsPuestosModalOpen(true)}
        onOpenGruposCoberturaModal={() => setIsGruposCoberturaModalOpen(true)}
        onOpenPeriodoModal={openPeriodoModal}
        onCreateSolicitud={openCreateEditor}
      />

      <TeletrabajoStatusMessages
        isEmployeesLoading={isEmployeesLoading}
        importSummary={importSummary}
        wordStatus={wordStatus}
      />

      <TeletrabajoFiltersBar filters={filters} periodos={periodos} onSetFilter={setFilter} />

      <div className="mb-3 flex flex-nowrap gap-1.5 overflow-x-auto">
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
              className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border bg-metro-surface px-2.5 py-1.5 text-xs font-semibold transition hover:border-metro-red ${item.className} ${
                isActive ? 'ring-2 ring-metro-red/60' : ''
              }`}
              key={item.label}
              onClick={() => setIncidentFilter(key)}
              type="button"
            >
              <span className="text-metro-muted">{item.label}</span>
              <span className="font-black">{item.value}</span>
            </button>
          );
        })}
      </div>

      {activeFilterChips.length > 0 && (
        <div className="mb-3">
          <ActiveFilterChips filters={activeFilterChips} onClearAll={clearActiveFilters} />
        </div>
      )}

      <TeletrabajoMainTableSection
        columns={teletrabajoTableColumns}
        employeesByEmpleado={employeesByEmpleado}
        filterLabel={teletrabajoFilterLabel}
        gruposByIdMap={gruposByIdMap}
        mainPeriodo={mainPeriodo}
        onColumnOrderChange={setColumnOrder}
        onColumnWidthChange={setColumnWidth}
        onExportDireccion={() => void handleExportDireccion()}
        onResetColumnWidths={resetColumnWidths}
        onResetPreferences={resetPreferences}
        onRowClick={openEditor}
        onSortChange={setSort}
        preferences={preferences}
        puestosByKey={puestosByKey}
        rows={sortedSolicitudes}
        solicitudesByPuestoCount={solicitudesByPuestoCount}
      />

      {!filters.periodo && (
        <TeletrabajoHistoricoSection
          columns={teletrabajoTableColumns}
          employeesByEmpleado={employeesByEmpleado}
          gruposByIdMap={gruposByIdMap}
          groups={historicoGroups}
          historicalCount={historicoSolicitudes.length}
          isOpen={isHistoricoOpen}
          onColumnOrderChange={setColumnOrder}
          onColumnWidthChange={setColumnWidth}
          onRowClick={openEditor}
          onSortChange={setSort}
          onToggle={() => setIsHistoricoOpen((current) => !current)}
          onTogglePeriodo={(periodo) =>
            setOpenHistoricoPeriodos((current) => ({
              ...current,
              [periodo]: !current[periodo],
            }))
          }
          openPeriodos={openHistoricoPeriodos}
          preferences={preferences}
          puestosByKey={puestosByKey}
          solicitudesByPuestoCount={solicitudesByPuestoCount}
        />
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
      {isGruposCoberturaModalOpen && (
        <TeletrabajoGruposCoberturaModal onClose={() => setIsGruposCoberturaModalOpen(false)} />
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
