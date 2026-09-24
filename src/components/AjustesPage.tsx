import {
  ChevronDown,
  Database,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  ListTodo,
  Plus,
  RefreshCw,
  Save,
  Settings2,
  UserRound,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { isDocxPath } from '../features/configuracion/domain/teletrabajoTemplate';
import { useConfiguracionStore } from '../features/configuracion/store/useConfiguracionStore';
import type { TaskOriginConfig } from '../features/configuracion/domain/taskOrigins';
import { DatabaseSettingsSection } from './ajustes/DatabaseSettingsSection';
import { buildDatabaseStatusBadge } from '../services/databaseStatusView';
import { publishDatabaseStatus, refreshDatabaseStatus, useDatabaseStatus } from '../services/databaseStatus';

type RouteDraft = {
  rutaPlantillaTeletrabajo: string;
  rutaPlantillaLicenciaSinSueldo: string;
  rutaPlantillaExcedencia: string;
  rutaPlantillaProrrogaExcedencia: string;
  rutaPlantillaVinculograma: string;
  rutaExportacionTareas: string;
  rutaExportacionLoteria: string;
  rutaExportacionLicencias: string;
  rutaExportacionVinculograma: string;
  rutaExportacionCoordinacion: string;
  rutaAyudaEscolar: string;
};

type RouteKey = keyof RouteDraft;

type RouteField = {
  key: RouteKey;
  label: string;
  description: string;
  placeholder: string;
  kind: 'docx' | 'folder';
  selector?:
    | 'teletrabajo'
    | 'licencia'
    | 'excedencia'
    | 'vinculograma'
    | 'loteria'
    | 'operational'
    | 'school';
};

const TEMPLATE_FIELDS: RouteField[] = [
  {
    key: 'rutaPlantillaTeletrabajo',
    label: 'Teletrabajo',
    description: 'Plantilla DOCX utilizada para generar acuerdos de teletrabajo.',
    placeholder: 'G:\\...\\Plantillas\\Acuerdo Teletrabajo.docx',
    kind: 'docx',
    selector: 'teletrabajo',
  },
  {
    key: 'rutaPlantillaLicenciaSinSueldo',
    label: 'Licencia sin sueldo',
    description: 'Plantilla DOCX utilizada para licencias sin sueldo.',
    placeholder: 'G:\\...\\Plantillas\\Licencia sin sueldo.docx',
    kind: 'docx',
    selector: 'licencia',
  },
  {
    key: 'rutaPlantillaExcedencia',
    label: 'Excedencia',
    description: 'Plantilla DOCX utilizada para nuevas excedencias.',
    placeholder: 'G:\\...\\Plantillas\\Excedencia.docx',
    kind: 'docx',
    selector: 'excedencia',
  },
  {
    key: 'rutaPlantillaProrrogaExcedencia',
    label: 'Prórroga de excedencia',
    description: 'Plantilla DOCX utilizada para las prórrogas de excedencia.',
    placeholder: 'G:\\...\\Plantillas\\Prórroga excedencia.docx',
    kind: 'docx',
    selector: 'excedencia',
  },
  {
    key: 'rutaPlantillaVinculograma',
    label: 'Vinculograma',
    description: 'Plantilla DOCX utilizada por el módulo Vinculograma.',
    placeholder: 'G:\\...\\Plantillas\\Vinculograma.docx',
    kind: 'docx',
    selector: 'vinculograma',
  },
];

const EXPORT_FIELDS: RouteField[] = [
  {
    key: 'rutaExportacionTareas',
    label: 'Tareas abiertas',
    description: 'Carpeta del Excel automático Tareas_abiertas_DD-MM-AAAA.xlsx. Compartida para todos los usuarios.',
    placeholder: 'G:\\Capital Humano\\...\\Tareas',
    kind: 'folder',
    selector: 'operational',
  },
  {
    key: 'rutaExportacionLoteria',
    label: 'Lotería',
    description: 'Carpeta del Excel espejo de cada campaña. Admite {year}.',
    placeholder: 'G:\\Capital Humano\\...\\Lotería\\Año {year}',
    kind: 'folder',
    selector: 'loteria',
  },
  {
    key: 'rutaExportacionLicencias',
    label: 'Licencias y excedencias',
    description: 'Carpeta del Excel automático de licencias sin sueldo y excedencias.',
    placeholder: 'G:\\Capital Humano\\...\\Licencias sin sueldo y Excedencias',
    kind: 'folder',
    selector: 'operational',
  },
  {
    key: 'rutaExportacionVinculograma',
    label: 'Vinculograma',
    description: 'Carpeta del Excel automático del Vinculograma.',
    placeholder: 'G:\\Capital Humano\\...\\Vinculograma',
    kind: 'folder',
    selector: 'operational',
  },
  {
    key: 'rutaExportacionCoordinacion',
    label: 'Coordinación',
    description: 'Carpeta de los Excel de reuniones con Dirección, áreas y sindicatos. Admite {year}.',
    placeholder: 'G:\\Capital Humano\\...\\Coordinación\\{year}',
    kind: 'folder',
    selector: 'operational',
  },
  {
    key: 'rutaAyudaEscolar',
    label: 'Ayuda escolar',
    description: 'Carpeta donde se archivan los adjuntos arrastrados desde Outlook.',
    placeholder: 'G:\\Capital Humano\\...\\Ayuda Escolar\\2026\\Documentación',
    kind: 'folder',
    selector: 'school',
  },
];

function currentRoutes(): RouteDraft {
  const state = useConfiguracionStore.getState();
  return {
    rutaPlantillaTeletrabajo: state.rutaPlantillaTeletrabajo,
    rutaPlantillaLicenciaSinSueldo: state.rutaPlantillaLicenciaSinSueldo,
    rutaPlantillaExcedencia: state.rutaPlantillaExcedencia,
    rutaPlantillaProrrogaExcedencia: state.rutaPlantillaProrrogaExcedencia,
    rutaPlantillaVinculograma: state.rutaPlantillaVinculograma,
    rutaExportacionTareas: state.rutaExportacionTareas,
    rutaExportacionLoteria: state.rutaExportacionLoteria,
    rutaExportacionLicencias: state.rutaExportacionLicencias,
    rutaExportacionVinculograma: state.rutaExportacionVinculograma,
    rutaExportacionCoordinacion: state.rutaExportacionCoordinacion,
    rutaAyudaEscolar: state.rutaAyudaEscolar,
  };
}

export function AjustesPage() {
  const load = useConfiguracionStore((state) => state.load);
  const saveRutasCompartidas = useConfiguracionStore((state) => state.saveRutasCompartidas);
  const taskPhases = useConfiguracionStore((state) => state.taskPhases);
  const taskOrigins = useConfiguracionStore((state) => state.taskOrigins);
  const taskResponsibles = useConfiguracionStore((state) => state.taskResponsibles);
  const addTaskPhase = useConfiguracionStore((state) => state.addTaskPhase);
  const updateTaskPhase = useConfiguracionStore((state) => state.updateTaskPhase);
  const toggleTaskPhase = useConfiguracionStore((state) => state.toggleTaskPhase);
  const addTaskOrigin = useConfiguracionStore((state) => state.addTaskOrigin);
  const updateTaskOrigin = useConfiguracionStore((state) => state.updateTaskOrigin);
  const toggleTaskOrigin = useConfiguracionStore((state) => state.toggleTaskOrigin);
  const deleteTaskOrigin = useConfiguracionStore((state) => state.deleteTaskOrigin);
  const addTaskResponsible = useConfiguracionStore((state) => state.addTaskResponsible);
  const updateTaskResponsible = useConfiguracionStore((state) => state.updateTaskResponsible);
  const toggleTaskResponsible = useConfiguracionStore((state) => state.toggleTaskResponsible);

  const rutaPlantillaTeletrabajo = useConfiguracionStore((state) => state.rutaPlantillaTeletrabajo);
  const rutaPlantillaLicenciaSinSueldo = useConfiguracionStore((state) => state.rutaPlantillaLicenciaSinSueldo);
  const rutaPlantillaExcedencia = useConfiguracionStore((state) => state.rutaPlantillaExcedencia);
  const rutaPlantillaProrrogaExcedencia = useConfiguracionStore((state) => state.rutaPlantillaProrrogaExcedencia);
  const rutaPlantillaVinculograma = useConfiguracionStore((state) => state.rutaPlantillaVinculograma);
  const rutaExportacionTareas = useConfiguracionStore((state) => state.rutaExportacionTareas);
  const rutaExportacionLoteria = useConfiguracionStore((state) => state.rutaExportacionLoteria);
  const rutaExportacionLicencias = useConfiguracionStore((state) => state.rutaExportacionLicencias);
  const rutaExportacionVinculograma = useConfiguracionStore((state) => state.rutaExportacionVinculograma);
  const rutaExportacionCoordinacion = useConfiguracionStore((state) => state.rutaExportacionCoordinacion);
  const rutaAyudaEscolar = useConfiguracionStore((state) => state.rutaAyudaEscolar);

  const watchedRoutes = useMemo<RouteDraft>(() => ({
    rutaPlantillaTeletrabajo,
    rutaPlantillaLicenciaSinSueldo,
    rutaPlantillaExcedencia,
    rutaPlantillaProrrogaExcedencia,
    rutaPlantillaVinculograma,
    rutaExportacionTareas,
    rutaExportacionLoteria,
    rutaExportacionLicencias,
    rutaExportacionVinculograma,
    rutaExportacionCoordinacion,
    rutaAyudaEscolar,
  }), [
    rutaPlantillaTeletrabajo,
    rutaPlantillaLicenciaSinSueldo,
    rutaPlantillaExcedencia,
    rutaPlantillaProrrogaExcedencia,
    rutaPlantillaVinculograma,
    rutaExportacionTareas,
    rutaExportacionLoteria,
    rutaExportacionLicencias,
    rutaExportacionVinculograma,
    rutaExportacionCoordinacion,
    rutaAyudaEscolar,
  ]);

  const [routes, setRoutes] = useState<RouteDraft>(() => currentRoutes());
  const [status, setStatus] = useState('');
  const [savingRoutes, setSavingRoutes] = useState(false);
  const [generatingTasksExcel, setGeneratingTasksExcel] = useState(false);
  const [newTaskPhase, setNewTaskPhase] = useState('');
  const [newOriginName, setNewOriginName] = useState('');
  const [newOriginType, setNewOriginType] = useState<TaskOriginConfig['tipo']>('empresa');
  const [newResponsibleName, setNewResponsibleName] = useState('');
  const [newResponsibleWindowsUser, setNewResponsibleWindowsUser] = useState('');

  const databaseStatus = useDatabaseStatus();
  const [databaseActionStatus, setDatabaseActionStatus] = useState('');
  const [currentDatabaseLock, setCurrentDatabaseLock] = useState<TraccionDatabaseLockInfo | null>(null);
  const [isCheckingDatabaseLock, setIsCheckingDatabaseLock] = useState(false);
  const [databaseLockCheckError, setDatabaseLockCheckError] = useState('');
  const [isForcingLockRelease, setIsForcingLockRelease] = useState(false);
  const [localBackups, setLocalBackups] = useState<TraccionLocalBackupEntry[]>([]);
  const [isLoadingBackups, setIsLoadingBackups] = useState(false);
  const [isRestoringBackup, setIsRestoringBackup] = useState(false);
  const [isCreatingManualBackup, setIsCreatingManualBackup] = useState(false);
  const [secondaryBackupPath, setSecondaryBackupPath] = useState<string | null>(null);
  const [secondaryBackupStatus, setSecondaryBackupStatus] = useState('');
  const [updatesDirectoryPath, setUpdatesDirectoryPath] = useState<string | null>(null);
  const [updatesDirectoryStatus, setUpdatesDirectoryStatus] = useState('');
  const [updateCheckResult, setUpdateCheckResult] = useState<TraccionAppUpdateCheckResult | null>(null);
  const [isCheckingForUpdate, setIsCheckingForUpdate] = useState(false);
  const [isApplyingUpdate, setIsApplyingUpdate] = useState(false);
  const [dailyBackupSettings, setDailyBackupSettings] = useState<TraccionDailyLocalBackupSettings | null>(null);
  const [dailyBackupStatus, setDailyBackupStatus] = useState('');
  const [vacuumStatus, setVacuumStatus] = useState<TraccionVacuumStatus | null>(null);
  const [isLoadingVacuumStatus, setIsLoadingVacuumStatus] = useState(false);
  const [vacuumStatusError, setVacuumStatusError] = useState('');
  const [isVacuuming, setIsVacuuming] = useState(false);
  const [vacuumActionStatus, setVacuumActionStatus] = useState('');

  const refreshCurrentDatabaseLock = useCallback(async () => {
    if (!window.traccion?.getCurrentDatabaseLock) return;
    setIsCheckingDatabaseLock(true);
    setDatabaseLockCheckError('');
    try {
      setCurrentDatabaseLock(await window.traccion.getCurrentDatabaseLock());
    } catch (error) {
      setDatabaseLockCheckError(error instanceof Error ? error.message : 'No se ha podido comprobar el bloqueo SQLite.');
    } finally {
      setIsCheckingDatabaseLock(false);
    }
  }, []);

  const refreshLocalBackups = useCallback(async () => {
    if (!window.traccion?.listLocalBackups) return;
    setIsLoadingBackups(true);
    try {
      setLocalBackups(await window.traccion.listLocalBackups());
    } catch (error) {
      setDatabaseActionStatus(error instanceof Error ? error.message : 'No se han podido cargar las copias de respaldo.');
    } finally {
      setIsLoadingBackups(false);
    }
  }, []);

  const refreshVacuumStatus = useCallback(async () => {
    if (!window.traccion?.getVacuumStatus) return;
    setIsLoadingVacuumStatus(true);
    setVacuumStatusError('');
    try {
      setVacuumStatus(await window.traccion.getVacuumStatus());
    } catch (error) {
      setVacuumStatusError(error instanceof Error ? error.message : 'No se ha podido leer el estado de mantenimiento.');
    } finally {
      setIsLoadingVacuumStatus(false);
    }
  }, []);

  useEffect(() => {
    void refreshDatabaseStatus();
    void refreshCurrentDatabaseLock();
    void refreshLocalBackups();
    void refreshVacuumStatus();
    void window.traccion?.getSecondaryBackupDirectory?.().then(setSecondaryBackupPath).catch(() => undefined);
    void window.traccion?.getUpdatesDirectory?.().then(setUpdatesDirectoryPath).catch(() => undefined);
    void window.traccion?.getDailyLocalBackupSettings?.().then(setDailyBackupSettings).catch(() => undefined);
  }, [refreshCurrentDatabaseLock, refreshLocalBackups, refreshVacuumStatus]);

  const applyDatabaseStatus = async (nextStatus: TraccionDatabaseStatus) => {
    publishDatabaseStatus(nextStatus);
    setDatabaseActionStatus(nextStatus.message ?? (nextStatus.ready ? 'Base de datos actualizada.' : 'No se ha podido activar SQLite.'));
    await refreshCurrentDatabaseLock();
    load();
  };

  const handleSelectDatabaseDirectory = async () => {
    if (!window.traccion?.selectDatabaseDirectory) {
      setDatabaseActionStatus('El cambio de ubicación SQLite solo está disponible en la aplicación de escritorio.');
      return;
    }
    try {
      await applyDatabaseStatus(await window.traccion.selectDatabaseDirectory());
    } catch (error) {
      setDatabaseActionStatus(error instanceof Error ? error.message : 'No se ha podido cambiar la ubicación SQLite.');
    }
  };

  const handleResetDatabaseDirectory = async () => {
    if (!window.traccion?.resetDatabaseDirectory) return;
    try {
      await applyDatabaseStatus(await window.traccion.resetDatabaseDirectory());
    } catch (error) {
      setDatabaseActionStatus(error instanceof Error ? error.message : 'No se ha podido quitar la ruta SQLite configurada.');
    }
  };

  const handleForceReleaseDatabaseLock = async () => {
    if (!window.traccion?.forceReleaseDatabaseLock) return;
    setIsForcingLockRelease(true);
    try {
      const result = await window.traccion.forceReleaseDatabaseLock();
      publishDatabaseStatus(result.status);
      setDatabaseActionStatus(result.message);
      await refreshCurrentDatabaseLock();
    } catch (error) {
      setDatabaseActionStatus(error instanceof Error ? error.message : 'No se ha podido liberar el bloqueo SQLite.');
    } finally {
      setIsForcingLockRelease(false);
    }
  };

  const handleCreateManualBackup = async () => {
    if (!window.traccion?.createManualBackup) return;
    setIsCreatingManualBackup(true);
    try {
      const result = await window.traccion.createManualBackup();
      setDatabaseActionStatus(result.ok ? 'Copia de respaldo creada.' : 'No se ha podido crear la copia de respaldo.');
      await refreshLocalBackups();
    } catch (error) {
      setDatabaseActionStatus(error instanceof Error ? error.message : 'No se ha podido crear la copia de respaldo.');
    } finally {
      setIsCreatingManualBackup(false);
    }
  };

  const handleRestoreLocalBackup = async (backup: TraccionLocalBackupEntry) => {
    if (!window.traccion?.restoreLocalBackup) return;
    setIsRestoringBackup(true);
    try {
      const result = await window.traccion.restoreLocalBackup(backup.id);
      publishDatabaseStatus(result.status);
      setDatabaseActionStatus(result.message);
    } catch (error) {
      setDatabaseActionStatus(error instanceof Error ? error.message : 'No se ha podido restaurar la copia.');
    } finally {
      setIsRestoringBackup(false);
    }
  };

  const handleSetSecondaryBackupDirectory = async () => {
    if (!window.traccion?.setSecondaryBackupDirectory) return;
    try {
      const result = await window.traccion.setSecondaryBackupDirectory();
      setSecondaryBackupPath(result.path);
      setSecondaryBackupStatus(result.ok ? 'Carpeta secundaria guardada.' : 'No se ha cambiado la carpeta secundaria.');
    } catch (error) { setSecondaryBackupStatus(error instanceof Error ? error.message : 'No se ha podido guardar la carpeta secundaria.'); }
  };
  const handleClearSecondaryBackupDirectory = async () => {
    if (!window.traccion?.clearSecondaryBackupDirectory) return;
    await window.traccion.clearSecondaryBackupDirectory();
    setSecondaryBackupPath(null);
    setSecondaryBackupStatus('Carpeta secundaria eliminada.');
  };
  const handleSetUpdatesDirectory = async () => {
    if (!window.traccion?.setUpdatesDirectory) return;
    try {
      const result = await window.traccion.setUpdatesDirectory();
      setUpdatesDirectoryPath(result.path);
      setUpdatesDirectoryStatus(result.ok ? 'Carpeta de actualizaciones guardada.' : 'No se ha cambiado la carpeta.');
    } catch (error) { setUpdatesDirectoryStatus(error instanceof Error ? error.message : 'No se ha podido guardar la carpeta de actualizaciones.'); }
  };
  const handleClearUpdatesDirectory = async () => {
    if (!window.traccion?.clearUpdatesDirectory) return;
    await window.traccion.clearUpdatesDirectory();
    setUpdatesDirectoryPath(null);
    setUpdatesDirectoryStatus('Carpeta de actualizaciones eliminada.');
  };
  const handleCheckForUpdateNow = async () => {
    if (!window.traccion?.checkForAppUpdate) return;
    setIsCheckingForUpdate(true);
    try { setUpdateCheckResult(await window.traccion.checkForAppUpdate()); }
    finally { setIsCheckingForUpdate(false); }
  };
  const handleApplyUpdateNow = async () => {
    if (!window.traccion?.applyAppUpdate) return;
    setIsApplyingUpdate(true);
    try {
      const result = await window.traccion.applyAppUpdate();
      setUpdatesDirectoryStatus(result.message);
    } finally { setIsApplyingUpdate(false); }
  };
  const handleToggleDailyBackupEnabled = async () => {
    if (!window.traccion?.setDailyLocalBackupEnabled) return;
    try {
      const next = await window.traccion.setDailyLocalBackupEnabled(!(dailyBackupSettings?.enabled ?? true));
      setDailyBackupSettings(next);
      setDailyBackupStatus(next.enabled ? 'Copia diaria automática activada.' : 'Copia diaria automática desactivada.');
    } catch (error) { setDailyBackupStatus(error instanceof Error ? error.message : 'No se ha podido cambiar la copia diaria.'); }
  };
  const handleChangeDailyBackupRetentionDays = async (retentionDays: number) => {
    if (!window.traccion?.setDailyLocalBackupRetentionDays) return;
    try {
      setDailyBackupSettings(await window.traccion.setDailyLocalBackupRetentionDays(retentionDays));
      setDailyBackupStatus('Retención de copias actualizada.');
    } catch (error) { setDailyBackupStatus(error instanceof Error ? error.message : 'No se ha podido cambiar la retención.'); }
  };
  const handleSetDailyBackupDirectory = async () => {
    if (!window.traccion?.setDailyLocalBackupDirectory) return;
    try {
      const result = await window.traccion.setDailyLocalBackupDirectory();
      setDailyBackupSettings(result.settings);
      setDailyBackupStatus(result.ok ? 'Carpeta de copia diaria guardada.' : 'No se ha cambiado la carpeta.');
    } catch (error) { setDailyBackupStatus(error instanceof Error ? error.message : 'No se ha podido guardar la carpeta de copia diaria.'); }
  };
  const handleClearDailyBackupDirectory = async () => {
    if (!window.traccion?.clearDailyLocalBackupDirectory) return;
    setDailyBackupSettings(await window.traccion.clearDailyLocalBackupDirectory());
    setDailyBackupStatus('Carpeta personalizada de copia diaria eliminada.');
  };
  const handleVacuumNow = async () => {
    if (!window.traccion?.vacuumDatabaseNow) return;
    setIsVacuuming(true);
    setVacuumActionStatus('');
    try {
      const result = await window.traccion.vacuumDatabaseNow();
      setVacuumActionStatus(result.message);
      await refreshVacuumStatus();
    } catch (error) { setVacuumActionStatus(error instanceof Error ? error.message : 'No se ha podido compactar la base de datos.'); }
    finally { setIsVacuuming(false); }
  };

  useEffect(() => {
    load();
  }, [load]);

  const databaseBadge = useMemo(() => buildDatabaseStatusBadge(databaseStatus), [databaseStatus]);
  const databasePhaseLabel = databaseStatus?.ready
    ? 'Activa y disponible'
    : databaseStatus?.phase === 'locked'
      ? 'Bloqueada temporalmente'
      : databaseStatus?.phase === 'fallback'
        ? 'Modo consulta / sin conexión SQLite'
        : databaseStatus?.phase === 'error'
          ? 'Error de conexión'
          : 'No inicializada';

  const routesDirty = useMemo(
    () => (Object.keys(routes) as RouteKey[]).some((key) => routes[key] !== watchedRoutes[key]),
    [routes, watchedRoutes],
  );

  useEffect(() => {
    if (!routesDirty) setRoutes(watchedRoutes);
  }, [routesDirty, watchedRoutes]);

  const setRoute = (key: RouteKey, value: string) => {
    setRoutes((current) => ({ ...current, [key]: value }));
    setStatus('');
  };

  const selectRoute = async (field: RouteField) => {
    setStatus('');
    let selectedPath: string | null = null;
    try {
      switch (field.selector) {
        case 'teletrabajo':
          selectedPath = (await window.traccion?.selectTeletrabajoTemplate?.()) ?? null;
          break;
        case 'licencia':
          selectedPath = (await window.traccion?.selectLicenciaSinSueldoTemplate?.()) ?? null;
          break;
        case 'excedencia':
          selectedPath = (await window.traccion?.selectExcedenciaTemplate?.()) ?? null;
          break;
        case 'vinculograma':
          selectedPath = (await window.traccion?.selectVinculogramaTemplate?.()) ?? null;
          break;
        case 'loteria':
          selectedPath = (await window.traccion?.selectLoteriaExportDirectory?.()) ?? null;
          break;
        case 'operational':
          selectedPath = (await window.traccion?.selectOperationalExcelBackupDirectory?.()) ?? null;
          break;
        case 'school':
          selectedPath = (await window.traccion?.selectSchoolHelpFolder?.()) ?? null;
          break;
        default:
          break;
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'No se ha podido abrir el selector.');
      return;
    }
    if (!selectedPath) return;
    if (field.kind === 'docx' && !isDocxPath(selectedPath)) {
      setStatus('La ruta seleccionada debe apuntar a un archivo DOCX.');
      return;
    }
    setRoute(field.key, selectedPath);
  };

  const handleSaveRoutes = async () => {
    setSavingRoutes(true);
    setStatus('');
    try {
      const liveStatus = await refreshDatabaseStatus();
      if (!liveStatus?.ready || liveStatus.phase !== 'active') {
        setStatus('No se han guardado las rutas: la SQLite compartida no está activa. Corrige primero la ruta de Base de datos para garantizar que el cambio llegue a todos los usuarios.');
        return;
      }
      for (const field of TEMPLATE_FIELDS) {
        const value = routes[field.key].trim();
        if (value && !isDocxPath(value)) {
          setStatus(`${field.label}: la plantilla debe ser un archivo DOCX.`);
          return;
        }
      }
      const result = await saveRutasCompartidas(routes);
      setStatus(result.ok ? 'Rutas compartidas guardadas para todos los usuarios.' : result.message);
    } finally {
      setSavingRoutes(false);
    }
  };

  const handleGenerateTasksExcel = async () => {
    if (routes.rutaExportacionTareas.trim() !== watchedRoutes.rutaExportacionTareas.trim()) {
      setStatus('Guarda primero las rutas compartidas antes de generar el Excel de tareas.');
      return;
    }

    const bridge = (window as unknown as {
      traccionTaskWord?: {
        refresh?: () => Promise<{ ok: boolean; message: string }>;
      };
    }).traccionTaskWord;

    if (!bridge?.refresh) {
      setStatus('La generación manual del Excel de tareas solo está disponible en la aplicación de escritorio.');
      return;
    }

    setGeneratingTasksExcel(true);
    setStatus('Actualizando Excel de tareas abiertas…');
    try {
      const result = await bridge.refresh();
      setStatus(result.message);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'No se ha podido actualizar el Excel de tareas.');
    } finally {
      setGeneratingTasksExcel(false);
    }
  };

  const handleAddTaskPhase = () => {
    addTaskPhase(newTaskPhase);
    setNewTaskPhase('');
  };

  const handleAddOrigin = () => {
    const name = newOriginName.trim();
    if (!name) return;
    addTaskOrigin(name, newOriginType);
    setNewOriginName('');
  };

  const handleAddResponsible = () => {
    const name = newResponsibleName.trim();
    if (!name) return;
    addTaskResponsible(name, newResponsibleWindowsUser);
    setNewResponsibleName('');
    setNewResponsibleWindowsUser('');
  };

  const renderRouteField = (field: RouteField) => (
    <div className="rounded-xl border border-metro-border bg-metro-surface p-3" key={field.key}>
      <div className="mb-2">
        <p className="text-sm font-bold text-metro-text">{field.label}</p>
        <p className="mt-0.5 text-xs leading-5 text-metro-muted">{field.description}</p>
      </div>
      <div className="flex flex-col gap-2 lg:flex-row">
        <input
          className="min-w-0 flex-1 rounded-lg border border-metro-border bg-metro-panel px-3 py-2 text-sm font-medium text-metro-text outline-none focus:border-metro-red"
          onChange={(event) => setRoute(field.key, event.target.value)}
          placeholder={field.placeholder}
          type="text"
          value={routes[field.key]}
        />
        {field.selector && (
          <button
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-metro-border bg-metro-panel px-3 py-2 text-xs font-semibold text-metro-text hover:border-metro-red"
            onClick={() => void selectRoute(field)}
            type="button"
          >
            <FolderOpen size={14} />
            Seleccionar
          </button>
        )}
        {field.key === 'rutaExportacionTareas' && (
          <button
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-metro-border bg-metro-panel px-3 py-2 text-xs font-semibold text-metro-text hover:border-metro-red disabled:cursor-not-allowed disabled:opacity-50"
            disabled={generatingTasksExcel || !routes.rutaExportacionTareas.trim()}
            onClick={() => void handleGenerateTasksExcel()}
            type="button"
          >
            <RefreshCw className={generatingTasksExcel ? 'animate-spin' : ''} size={14} />
            {generatingTasksExcel ? 'Generando…' : 'Generar ahora'}
          </button>
        )}
      </div>
    </div>
  );

  const openAndScroll = (id: string) => {
    const section = document.getElementById(id);
    if (section instanceof HTMLDetailsElement) {
      section.open = true;
    }
    section?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <section className="space-y-4">
      <div className="ui-section ui-section--hero">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <p className="ui-eyebrow">Ajustes</p>
            <h2 className="mt-1 text-xl font-bold text-metro-text">Configuración de TrAcción</h2>
            <p className="mt-1 max-w-4xl text-sm leading-5 text-metro-muted">
              Configuración común para RRLL. Las rutas se guardan en la SQLite compartida y se aplican
              a todos los usuarios que trabajan con la misma base de datos.
            </p>
          </div>

          <div
            className={`inline-flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold ${
              routesDirty
                ? 'border-amber-400/30 bg-amber-500/10 text-amber-100'
                : 'border-metro-border bg-metro-panel text-metro-muted'
            }`}
          >
            <Settings2 size={15} />
            {routesDirty ? 'Cambios de rutas sin guardar' : 'Configuración de rutas guardada'}
          </div>
        </div>

        <div className="mt-4 border-t border-metro-border/80 pt-3">
          <p className="ui-eyebrow mb-2 text-metro-muted">
            Accesos directos
          </p>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <button
              className="ui-shortcut-card"
              onClick={() => openAndScroll('ajustes-base-datos')}
              type="button"
            >
              <span className="ui-shortcut-card__icon">
                <Database size={17} />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-bold text-metro-text">Base de datos</span>
                <span className="block text-xs text-metro-muted">Ruta, bloqueos y copias</span>
              </span>
            </button>
            <button
              className="ui-shortcut-card"
              onClick={() => openAndScroll('ajustes-plantillas')}
              type="button"
            >
              <span className="ui-shortcut-card__icon">
                <FileText size={17} />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-bold text-metro-text">Plantillas Word</span>
                <span className="block text-xs text-metro-muted">{TEMPLATE_FIELDS.length} rutas DOCX</span>
              </span>
            </button>

            <button
              className="ui-shortcut-card"
              onClick={() => openAndScroll('ajustes-exportaciones')}
              type="button"
            >
              <span className="ui-shortcut-card__icon">
                <FileSpreadsheet size={17} />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-bold text-metro-text">Copias y documentación</span>
                <span className="block text-xs text-metro-muted">{EXPORT_FIELDS.length} carpetas compartidas</span>
              </span>
            </button>

            <button
              className="ui-shortcut-card"
              onClick={() => openAndScroll('ajustes-tareas')}
              type="button"
            >
              <span className="ui-shortcut-card__icon">
                <ListTodo size={17} />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-bold text-metro-text">Tareas</span>
                <span className="block text-xs text-metro-muted">Fases y orígenes</span>
              </span>
            </button>
          </div>
        </div>
      </div>

      <details
        className="ui-accordion group scroll-mt-4"
        id="ajustes-base-datos"
        open
      >
        <summary className="ui-accordion__summary">
          <div className="flex min-w-0 items-center gap-3">
            <span className="ui-shortcut-card__icon"><Database size={17} /></span>
            <div>
              <h3 className="text-base font-bold text-metro-text">Base de datos y protecciones</h3>
              <p className="mt-0.5 text-xs text-metro-muted">Ruta SQLite, desbloqueo, copias, actualizaciones y mantenimiento.</p>
            </div>
          </div>
          <ChevronDown className="shrink-0 text-metro-muted transition-transform group-open:rotate-180" size={18} />
        </summary>
        <div className="border-t border-metro-border p-4">
          <DatabaseSettingsSection
            databaseStatus={databaseStatus}
            databaseBadge={databaseBadge}
            databasePhaseLabel={databasePhaseLabel}
            databaseActionStatus={databaseActionStatus}
            currentDatabaseLock={currentDatabaseLock}
            isCheckingDatabaseLock={isCheckingDatabaseLock}
            databaseLockCheckError={databaseLockCheckError}
            isForcingLockRelease={isForcingLockRelease}
            refreshCurrentDatabaseLock={refreshCurrentDatabaseLock}
            handleForceReleaseDatabaseLock={handleForceReleaseDatabaseLock}
            handleSelectDatabaseDirectory={handleSelectDatabaseDirectory}
            handleResetDatabaseDirectory={handleResetDatabaseDirectory}
            localBackups={localBackups}
            isLoadingBackups={isLoadingBackups}
            isRestoringBackup={isRestoringBackup}
            isCreatingManualBackup={isCreatingManualBackup}
            refreshLocalBackups={refreshLocalBackups}
            handleCreateManualBackup={handleCreateManualBackup}
            handleRestoreLocalBackup={handleRestoreLocalBackup}
            secondaryBackupPath={secondaryBackupPath}
            secondaryBackupStatus={secondaryBackupStatus}
            handleSetSecondaryBackupDirectory={handleSetSecondaryBackupDirectory}
            handleClearSecondaryBackupDirectory={handleClearSecondaryBackupDirectory}
            updatesDirectoryPath={updatesDirectoryPath}
            updatesDirectoryStatus={updatesDirectoryStatus}
            updateCheckResult={updateCheckResult}
            isCheckingForUpdate={isCheckingForUpdate}
            isApplyingUpdate={isApplyingUpdate}
            handleSetUpdatesDirectory={handleSetUpdatesDirectory}
            handleClearUpdatesDirectory={handleClearUpdatesDirectory}
            handleCheckForUpdateNow={handleCheckForUpdateNow}
            handleApplyUpdateNow={handleApplyUpdateNow}
            dailyBackupSettings={dailyBackupSettings}
            dailyBackupStatus={dailyBackupStatus}
            handleToggleDailyBackupEnabled={handleToggleDailyBackupEnabled}
            handleChangeDailyBackupRetentionDays={handleChangeDailyBackupRetentionDays}
            handleSetDailyBackupDirectory={handleSetDailyBackupDirectory}
            handleClearDailyBackupDirectory={handleClearDailyBackupDirectory}
            vacuumStatus={vacuumStatus}
            isLoadingVacuumStatus={isLoadingVacuumStatus}
            vacuumStatusError={vacuumStatusError}
            onRetryVacuumStatus={refreshVacuumStatus}
            isVacuuming={isVacuuming}
            vacuumActionStatus={vacuumActionStatus}
            handleVacuumNow={handleVacuumNow}
          />
        </div>
      </details>

      <details
        className="ui-accordion group scroll-mt-4"
        id="ajustes-plantillas"
        open
      >
        <summary className="ui-accordion__summary">
          <div className="flex min-w-0 items-center gap-3">
            <span className="ui-shortcut-card__icon">
              <FileText size={17} />
            </span>
            <div>
              <h3 className="text-base font-bold text-metro-text">Plantillas Word</h3>
              <p className="mt-0.5 text-xs text-metro-muted">
                Documentos DOCX externos usados para generar escritos desde TrAcción.
              </p>
            </div>
          </div>
          <ChevronDown className="shrink-0 text-metro-muted transition-transform group-open:rotate-180" size={18} />
        </summary>

        <div className="border-t border-metro-border p-4">
          <div className="grid gap-3 xl:grid-cols-2">{TEMPLATE_FIELDS.map(renderRouteField)}</div>
        </div>
      </details>

      <details
        className="ui-accordion group scroll-mt-4"
        id="ajustes-exportaciones"
        open
      >
        <summary className="ui-accordion__summary">
          <div className="flex min-w-0 items-center gap-3">
            <span className="ui-shortcut-card__icon">
              <FileSpreadsheet size={17} />
            </span>
            <div>
              <h3 className="text-base font-bold text-metro-text">Copias Excel y documentación</h3>
              <p className="mt-0.5 text-xs text-metro-muted">
                Destinos compartidos de copias automáticas, exportaciones y documentación archivada.
              </p>
            </div>
          </div>
          <ChevronDown className="shrink-0 text-metro-muted transition-transform group-open:rotate-180" size={18} />
        </summary>

        <div className="border-t border-metro-border p-4">
          <div className="grid gap-3 xl:grid-cols-2">{EXPORT_FIELDS.map(renderRouteField)}</div>

          <div className="mt-4 flex flex-col gap-3 rounded-xl border border-metro-border bg-metro-surface p-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-bold text-metro-text">
                {routesDirty ? 'Hay cambios pendientes en las rutas' : 'Rutas compartidas actualizadas'}
              </p>
              <p className="mt-0.5 text-xs text-metro-muted">
                El guardado se realiza una sola vez para evitar escrituras continuas en la base compartida.
              </p>
            </div>
            <button
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-metro-red px-4 py-2 text-sm font-semibold text-white hover:bg-metro-dark disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!routesDirty || savingRoutes}
              onClick={() => void handleSaveRoutes()}
              type="button"
            >
              <Save size={16} />
              {savingRoutes ? 'Guardando…' : 'Guardar rutas compartidas'}
            </button>
          </div>

          {status && (
            <p
              className={`mt-3 text-xs font-semibold ${
                /no se ha podido|debe ser|conflicto|error/i.test(status)
                  ? 'text-amber-300'
                  : 'text-metro-success'
              }`}
            >
              {status}
            </p>
          )}
        </div>
      </details>

      <details
        className="ui-accordion group scroll-mt-4"
        id="ajustes-tareas"
        open
      >
        <summary className="ui-accordion__summary">
          <div className="flex min-w-0 items-center gap-3">
            <span className="ui-shortcut-card__icon">
              <ListTodo size={17} />
            </span>
            <div>
              <h3 className="text-base font-bold text-metro-text">Configuración de tareas</h3>
              <p className="mt-0.5 text-xs text-metro-muted">
                Catálogos utilizados en el alta y seguimiento de tareas.
              </p>
            </div>
          </div>
          <ChevronDown className="shrink-0 text-metro-muted transition-transform group-open:rotate-180" size={18} />
        </summary>

        <div className="grid gap-4 border-t border-metro-border p-4 xl:grid-cols-3">
          <div className="rounded-xl border border-metro-border bg-metro-surface p-3">
            <div className="mb-3">
              <h4 className="flex items-center gap-2 text-sm font-bold text-metro-text"><UserRound size={15} /> Responsables</h4>
              <p className="mt-1 text-xs leading-5 text-metro-muted">
                El usuario Windows vincula las tareas con «Mis tareas». La asignación nunca limita quién puede editar una tarea.
              </p>
            </div>

            <div className="mb-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              <input
                className="rounded-lg border border-metro-border bg-metro-panel px-3 py-2 text-sm font-medium text-metro-text outline-none focus:border-metro-red"
                onChange={(event) => setNewResponsibleName(event.target.value)}
                placeholder="Nombre / identificador"
                type="text"
                value={newResponsibleName}
              />
              <input
                className="rounded-lg border border-metro-border bg-metro-panel px-3 py-2 text-sm font-medium text-metro-text outline-none focus:border-metro-red"
                onChange={(event) => setNewResponsibleWindowsUser(event.target.value)}
                placeholder="Usuario Windows (opcional)"
                type="text"
                value={newResponsibleWindowsUser}
              />
              <button
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-metro-red px-3 py-2 text-sm font-semibold text-white hover:bg-metro-dark disabled:opacity-50 sm:col-span-2 xl:col-span-1 2xl:col-span-2"
                disabled={!newResponsibleName.trim()}
                onClick={handleAddResponsible}
                type="button"
              >
                <Plus size={16} /> Añadir responsable
              </button>
            </div>

            <div className="space-y-2">
              {taskResponsibles.map((responsible) => (
                <div className="grid gap-2 rounded-lg border border-metro-border bg-metro-panel p-2" key={responsible.id}>
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                    <input
                      className="rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-sm font-medium text-metro-text outline-none focus:border-metro-red"
                      onChange={(event) => updateTaskResponsible(responsible.id, event.target.value, responsible.windowsUser)}
                      type="text"
                      value={responsible.nombre}
                    />
                    <input
                      className="rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-xs font-medium text-metro-text outline-none focus:border-metro-red"
                      onChange={(event) => updateTaskResponsible(responsible.id, responsible.nombre, event.target.value)}
                      placeholder="Usuario Windows"
                      type="text"
                      value={responsible.windowsUser}
                    />
                  </div>
                  <button
                    className="rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-xs font-semibold text-metro-text hover:border-metro-red"
                    onClick={() => toggleTaskResponsible(responsible.id)}
                    type="button"
                  >
                    {responsible.active ? 'Desactivar' : 'Activar'}
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-metro-border bg-metro-surface p-3">
            <div className="mb-3">
              <h4 className="text-sm font-bold text-metro-text">Fases</h4>
              <p className="mt-1 text-xs leading-5 text-metro-muted">
                Desactivar una fase evita nuevas selecciones, pero conserva el histórico.
              </p>
            </div>

            <div className="mb-3 flex flex-col gap-2 sm:flex-row">
              <input
                className="min-w-0 flex-1 rounded-lg border border-metro-border bg-metro-panel px-3 py-2 text-sm font-medium text-metro-text outline-none focus:border-metro-red"
                onChange={(event) => setNewTaskPhase(event.target.value)}
                placeholder="Nueva fase"
                type="text"
                value={newTaskPhase}
              />
              <button
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-metro-red px-3 py-2 text-sm font-semibold text-white hover:bg-metro-dark disabled:opacity-50"
                disabled={!newTaskPhase.trim()}
                onClick={handleAddTaskPhase}
                type="button"
              >
                <Plus size={16} /> Añadir
              </button>
            </div>

            <div className="space-y-2">
              {taskPhases.map((phase) => (
                <div
                  className="grid gap-2 rounded-lg border border-metro-border bg-metro-panel p-2 sm:grid-cols-[minmax(0,1fr)_auto]"
                  key={phase.id}
                >
                  <input
                    className="rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-sm font-medium text-metro-text outline-none focus:border-metro-red"
                    onChange={(event) => updateTaskPhase(phase.id, event.target.value)}
                    type="text"
                    value={phase.nombre}
                  />
                  <button
                    className="rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-sm font-semibold text-metro-text hover:border-metro-red"
                    onClick={() => toggleTaskPhase(phase.id)}
                    type="button"
                  >
                    {phase.active ? 'Desactivar' : 'Activar'}
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-metro-border bg-metro-surface p-3">
            <div className="mb-3">
              <h4 className="text-sm font-bold text-metro-text">Orígenes</h4>
              <p className="mt-1 text-xs leading-5 text-metro-muted">
                Sindicatos, áreas de empresa u otros orígenes disponibles en una tarea.
              </p>
            </div>

            <div className="mb-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_125px_auto]">
              <input
                className="rounded-lg border border-metro-border bg-metro-panel px-3 py-2 text-sm font-medium text-metro-text outline-none focus:border-metro-red"
                onChange={(event) => setNewOriginName(event.target.value)}
                placeholder="Nuevo origen"
                type="text"
                value={newOriginName}
              />
              <select
                className="rounded-lg border border-metro-border bg-metro-panel px-3 py-2 text-sm font-medium text-metro-text"
                onChange={(event) => setNewOriginType(event.target.value as TaskOriginConfig['tipo'])}
                value={newOriginType}
              >
                <option value="empresa">Empresa</option>
                <option value="sindicato">Sindicato</option>
                <option value="otro">Otro</option>
              </select>
              <button
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-metro-red px-3 py-2 text-sm font-semibold text-white hover:bg-metro-dark disabled:opacity-50"
                disabled={!newOriginName.trim()}
                onClick={handleAddOrigin}
                type="button"
              >
                <Plus size={16} /> Añadir
              </button>
            </div>

            <div className="space-y-2">
              {taskOrigins.filter((origin) => !origin.deletedAt).map((origin) => (
                <div
                  className="grid gap-2 rounded-lg border border-metro-border bg-metro-panel p-2 sm:grid-cols-[minmax(0,1fr)_115px_auto_auto]"
                  key={origin.id}
                >
                  <input
                    className="rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-sm font-medium text-metro-text outline-none focus:border-metro-red"
                    onChange={(event) => updateTaskOrigin(origin.id, event.target.value, origin.tipo)}
                    type="text"
                    value={origin.nombre}
                  />
                  <select
                    className="rounded-lg border border-metro-border bg-metro-surface px-2 py-2 text-xs font-semibold text-metro-text"
                    onChange={(event) =>
                      updateTaskOrigin(
                        origin.id,
                        origin.nombre,
                        event.target.value as TaskOriginConfig['tipo'],
                      )
                    }
                    value={origin.tipo}
                  >
                    <option value="empresa">Empresa</option>
                    <option value="sindicato">Sindicato</option>
                    <option value="otro">Otro</option>
                  </select>
                  <button
                    className="rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-xs font-semibold text-metro-text hover:border-metro-red"
                    onClick={() => toggleTaskOrigin(origin.id)}
                    type="button"
                  >
                    {origin.active ? 'Desactivar' : 'Activar'}
                  </button>
                  <button
                    className="rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-xs font-semibold text-metro-muted hover:border-metro-red hover:text-metro-text"
                    onClick={() => deleteTaskOrigin(origin.id)}
                    type="button"
                  >
                    Eliminar
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </details>
    </section>
  );
}
