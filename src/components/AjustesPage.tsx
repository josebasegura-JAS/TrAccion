import { Database, FileText, FolderOpen, ListChecks, Plus, Settings2, ShieldCheck } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { isDocxPath } from '../features/configuracion/domain/teletrabajoTemplate';
import { publishDatabaseStatus, useDatabaseStatus } from '../services/databaseStatus';
import { buildDatabaseStatusBadge } from '../services/databaseStatusView';
import { formatLockAge } from '../services/databaseLockView';
import { Notice } from './ui/Notice';
import { PageHeader } from './ui/PageHeader';
import { InlineSaveFeedback } from './InlineSaveFeedback';
import { useAppDialog } from '../hooks/useAppDialog';
import { useConfiguracionStore } from '../features/configuracion/store/useConfiguracionStore';
import { AJUSTES_HELP_SECTIONS, formatBytesAsMb, noticeTone } from './ajustes/ajustesCommon';
import { DatabaseSettingsSection } from './ajustes/DatabaseSettingsSection';
import { DataIntegrityAuditSection } from './ajustes/DataIntegrityAuditSection';
import { SchoolHelpSettingsSection } from './ajustes/SchoolHelpSettingsSection';

export function AjustesPage() {
  const rutaPlantillaTeletrabajo = useConfiguracionStore((state) => state.rutaPlantillaTeletrabajo);
  const rutaPlantillaLicenciaSinSueldo = useConfiguracionStore(
    (state) => state.rutaPlantillaLicenciaSinSueldo,
  );
  const rutaPlantillaExcedencia = useConfiguracionStore(
    (state) => state.rutaPlantillaExcedencia,
  );
  const rutaPlantillaProrrogaExcedencia = useConfiguracionStore(
    (state) => state.rutaPlantillaProrrogaExcedencia,
  );
  const rutaPlantillaVinculograma = useConfiguracionStore(
    (state) => state.rutaPlantillaVinculograma,
  );
  const rutaExportacionLoteria = useConfiguracionStore((state) => state.rutaExportacionLoteria);
  const rutaExportacionLicencias = useConfiguracionStore((state) => state.rutaExportacionLicencias);
  const rutaExportacionVinculograma = useConfiguracionStore((state) => state.rutaExportacionVinculograma);
  const taskPhases = useConfiguracionStore((state) => state.taskPhases);
  const addTaskPhase = useConfiguracionStore((state) => state.addTaskPhase);
  const updateTaskPhase = useConfiguracionStore((state) => state.updateTaskPhase);
  const toggleTaskPhase = useConfiguracionStore((state) => state.toggleTaskPhase);
  const load = useConfiguracionStore((state) => state.load);
  const setRutaPlantillaTeletrabajo = useConfiguracionStore(
    (state) => state.setRutaPlantillaTeletrabajo,
  );
  const setRutaPlantillaLicenciaSinSueldo = useConfiguracionStore(
    (state) => state.setRutaPlantillaLicenciaSinSueldo,
  );
  const setRutaPlantillaExcedencia = useConfiguracionStore(
    (state) => state.setRutaPlantillaExcedencia,
  );
  const setRutaPlantillaProrrogaExcedencia = useConfiguracionStore(
    (state) => state.setRutaPlantillaProrrogaExcedencia,
  );
  const setRutaPlantillaVinculograma = useConfiguracionStore(
    (state) => state.setRutaPlantillaVinculograma,
  );
  const setRutaExportacionLoteria = useConfiguracionStore((state) => state.setRutaExportacionLoteria);
  const setRutaExportacionLicencias = useConfiguracionStore((state) => state.setRutaExportacionLicencias);
  const setRutaExportacionVinculograma = useConfiguracionStore((state) => state.setRutaExportacionVinculograma);
  const [status, setStatus] = useState('');
  const [licenciaTemplateStatus, setLicenciaTemplateStatus] = useState('');
  const [excedenciaTemplateStatus, setExcedenciaTemplateStatus] = useState('');
  const [prorrogaExcedenciaTemplateStatus, setProrrogaExcedenciaTemplateStatus] = useState('');
  const [vinculogramaTemplateStatus, setVinculogramaTemplateStatus] = useState('');
  const [loteriaExportStatus, setLoteriaExportStatus] = useState('');
  const [licenciasExportStatus, setLicenciasExportStatus] = useState('');
  const [vinculogramaExportStatus, setVinculogramaExportStatus] = useState('');
  const databaseStatus = useDatabaseStatus();
  const databaseBadge = buildDatabaseStatusBadge(databaseStatus);
  const [databaseActionStatus, setDatabaseActionStatus] = useState('');
  const [localBackups, setLocalBackups] = useState<TraccionLocalBackupEntry[]>([]);
  const [isLoadingBackups, setIsLoadingBackups] = useState(false);
  const [isRestoringBackup, setIsRestoringBackup] = useState(false);
  const [isCreatingManualBackup, setIsCreatingManualBackup] = useState(false);
  const [secondaryBackupPath, setSecondaryBackupPath] = useState<string | null>(null);
  const [secondaryBackupStatus, setSecondaryBackupStatus] = useState('');
  const [updatesDirectoryPath, setUpdatesDirectoryPath] = useState<string | null>(null);
  const [updatesDirectoryStatus, setUpdatesDirectoryStatus] = useState('');
  const [updateCheckResult, setUpdateCheckResult] = useState<TraccionAppUpdateCheckResult | null>(
    null,
  );
  const [isCheckingForUpdate, setIsCheckingForUpdate] = useState(false);
  const [isApplyingUpdate, setIsApplyingUpdate] = useState(false);
  const [dailyBackupSettings, setDailyBackupSettings] =
    useState<TraccionDailyLocalBackupSettings | null>(null);
  const [dailyBackupStatus, setDailyBackupStatus] = useState('');
  const [vacuumStatus, setVacuumStatus] = useState<TraccionVacuumStatus | null>(null);
  const [isLoadingVacuumStatus, setIsLoadingVacuumStatus] = useState(false);
  const [vacuumStatusError, setVacuumStatusError] = useState('');
  const [isVacuuming, setIsVacuuming] = useState(false);
  const [vacuumActionStatus, setVacuumActionStatus] = useState('');
  const [integrityReport, setIntegrityReport] = useState<TraccionDataIntegrityReport | null>(null);
  const [isRunningIntegrityAudit, setIsRunningIntegrityAudit] = useState(false);
  const [integrityAuditStatus, setIntegrityAuditStatus] = useState('');
  const [currentDatabaseLock, setCurrentDatabaseLock] = useState<TraccionDatabaseLockInfo | null>(
    null,
  );
  const [isCheckingDatabaseLock, setIsCheckingDatabaseLock] = useState(false);
  const [databaseLockCheckError, setDatabaseLockCheckError] = useState('');
  const [isForcingLockRelease, setIsForcingLockRelease] = useState(false);
  const [newTaskPhase, setNewTaskPhase] = useState('');
  const [isDatabaseSectionOpen, setIsDatabaseSectionOpen] = useState(
    () => window.location.hash === '#base-de-datos',
  );
  const { confirm, dialogNode } = useAppDialog();

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (window.location.hash === '#base-de-datos') {
      document.getElementById('base-de-datos')?.scrollIntoView({ block: 'start' });
    }
  }, []);

  const refreshLocalBackups = useCallback(async () => {
    if (!window.traccion?.listLocalBackups) {
      setLocalBackups([]);
      return;
    }

    setIsLoadingBackups(true);
    try {
      setLocalBackups(await window.traccion.listLocalBackups());
    } catch (error) {
      console.warn('No se han podido listar las copias de respaldo.', error);
      setDatabaseActionStatus('No se han podido listar las copias de respaldo locales.');
    } finally {
      setIsLoadingBackups(false);
    }
  }, []);

  useEffect(() => {
    void refreshLocalBackups();
  }, [refreshLocalBackups]);

  useEffect(() => {
    window.traccion
      ?.getSecondaryBackupDirectory?.()
      .then((p) => setSecondaryBackupPath(p ?? null))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    window.traccion
      ?.getUpdatesDirectory?.()
      .then((p) => setUpdatesDirectoryPath(p ?? null))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    window.traccion
      ?.getDailyLocalBackupSettings?.()
      .then((settings) => setDailyBackupSettings(settings))
      .catch(() => undefined);
  }, []);

  const handleSetSecondaryBackupDirectory = async () => {
    setSecondaryBackupStatus('');
    if (!window.traccion?.setSecondaryBackupDirectory) {
      setSecondaryBackupStatus('Solo disponible en escritorio.');
      return;
    }
    const result = await window.traccion.setSecondaryBackupDirectory();
    if (result.ok && result.path) {
      setSecondaryBackupPath(result.path);
      setSecondaryBackupStatus('Carpeta de respaldo secundario guardada.');
    }
  };

  const handleClearSecondaryBackupDirectory = async () => {
    setSecondaryBackupStatus('');
    if (!window.traccion?.clearSecondaryBackupDirectory) return;
    await window.traccion.clearSecondaryBackupDirectory();
    setSecondaryBackupPath(null);
    setSecondaryBackupStatus('Carpeta de respaldo secundario eliminada.');
  };

  const handleSetUpdatesDirectory = async () => {
    setUpdatesDirectoryStatus('');
    setUpdateCheckResult(null);
    if (!window.traccion?.setUpdatesDirectory) {
      setUpdatesDirectoryStatus('Solo disponible en escritorio.');
      return;
    }
    const result = await window.traccion.setUpdatesDirectory();
    if (result.ok && result.path) {
      setUpdatesDirectoryPath(result.path);
      setUpdatesDirectoryStatus('Carpeta de actualizaciones guardada.');
    }
  };

  const handleClearUpdatesDirectory = async () => {
    setUpdatesDirectoryStatus('');
    setUpdateCheckResult(null);
    if (!window.traccion?.clearUpdatesDirectory) return;
    await window.traccion.clearUpdatesDirectory();
    setUpdatesDirectoryPath(null);
    setUpdatesDirectoryStatus('Carpeta de actualizaciones eliminada.');
  };

  const handleCheckForUpdateNow = async () => {
    setUpdatesDirectoryStatus('');
    if (!window.traccion?.checkForAppUpdate) {
      setUpdatesDirectoryStatus('Solo disponible en escritorio.');
      return;
    }
    setIsCheckingForUpdate(true);
    try {
      const result = await window.traccion.checkForAppUpdate();
      setUpdateCheckResult(result);
    } finally {
      setIsCheckingForUpdate(false);
    }
  };

  const handleApplyUpdateNow = async () => {
    if (!window.traccion?.applyAppUpdate || !updateCheckResult?.latestVersion) {
      return;
    }
    const confirmed = await confirm(
      `Se va a actualizar TrAccion a la versión V${updateCheckResult.latestVersion}. ` +
        'La aplicación se cerrará y se reabrirá automáticamente. ¿Continuar?',
      { confirmLabel: 'Actualizar ahora', title: 'Confirmar actualización' },
    );
    if (!confirmed) {
      return;
    }
    setIsApplyingUpdate(true);
    try {
      const result = await window.traccion.applyAppUpdate();
      if (!result.ok) {
        setUpdatesDirectoryStatus(`No se ha podido aplicar la actualización: ${result.message}`);
        setIsApplyingUpdate(false);
      }
      // Si result.ok, la app se cierra por su cuenta en breve; no hace
      // falta volver a false isApplyingUpdate ni mostrar más estado.
    } catch (error) {
      setUpdatesDirectoryStatus(
        `No se ha podido aplicar la actualización: ${error instanceof Error ? error.message : String(error)}`,
      );
      setIsApplyingUpdate(false);
    }
  };

  const handleToggleDailyBackupEnabled = async () => {
    setDailyBackupStatus('');
    if (!window.traccion?.setDailyLocalBackupEnabled) {
      setDailyBackupStatus('Solo disponible en escritorio.');
      return;
    }
    const nextEnabled = !(dailyBackupSettings?.enabled ?? true);
    const settings = await window.traccion.setDailyLocalBackupEnabled(nextEnabled);
    setDailyBackupSettings(settings);
    setDailyBackupStatus(settings.enabled ? 'Copia diaria activada.' : 'Copia diaria desactivada.');
  };

  const handleChangeDailyBackupRetentionDays = async (retentionDays: number) => {
    setDailyBackupStatus('');
    if (!window.traccion?.setDailyLocalBackupRetentionDays) {
      setDailyBackupStatus('Solo disponible en escritorio.');
      return;
    }
    const settings = await window.traccion.setDailyLocalBackupRetentionDays(retentionDays);
    setDailyBackupSettings(settings);
    setDailyBackupStatus(`Se conservarán ${settings.retentionDays} día(s) de copia diaria.`);
  };

  const handleSetDailyBackupDirectory = async () => {
    setDailyBackupStatus('');
    if (!window.traccion?.setDailyLocalBackupDirectory) {
      setDailyBackupStatus('Solo disponible en escritorio.');
      return;
    }
    const result = await window.traccion.setDailyLocalBackupDirectory();
    setDailyBackupSettings(result.settings);
    if (result.ok) {
      setDailyBackupStatus('Carpeta de copia diaria guardada.');
    }
  };

  const handleClearDailyBackupDirectory = async () => {
    setDailyBackupStatus('');
    if (!window.traccion?.clearDailyLocalBackupDirectory) return;
    const settings = await window.traccion.clearDailyLocalBackupDirectory();
    setDailyBackupSettings(settings);
    setDailyBackupStatus('Carpeta de copia diaria restaurada a la ubicación por defecto.');
  };

  const refreshVacuumStatus = useCallback(async () => {
    if (!window.traccion?.getVacuumStatus) {
      return;
    }
    setIsLoadingVacuumStatus(true);
    setVacuumStatusError('');
    try {
      setVacuumStatus(await window.traccion.getVacuumStatus());
    } catch (error) {
      console.warn('No se ha podido consultar el estado de compactado de la base de datos.', error);
      setVacuumStatusError(
        'No se ha podido consultar el tamaño de la base de datos (posible problema de red con la carpeta compartida). Puedes reintentarlo.',
      );
    } finally {
      setIsLoadingVacuumStatus(false);
    }
  }, []);

  useEffect(() => {
    void refreshVacuumStatus();
  }, [refreshVacuumStatus]);

  const refreshCurrentDatabaseLock = useCallback(async () => {
    if (!window.traccion?.getCurrentDatabaseLock) {
      return;
    }

    setIsCheckingDatabaseLock(true);
    setDatabaseLockCheckError('');
    try {
      setCurrentDatabaseLock(await window.traccion.getCurrentDatabaseLock());
    } catch (error) {
      console.warn('No se ha podido comprobar el bloqueo actual de SQLite.', error);
      setDatabaseLockCheckError(
        'No se ha podido comprobar el bloqueo de la base de datos (posible problema de red con la carpeta compartida). Puedes reintentarlo.',
      );
    } finally {
      setIsCheckingDatabaseLock(false);
    }
  }, []);

  useEffect(() => {
    // Solo merece la pena comprobar el lock en caliente cuando el arranque
    // se ha quedado realmente bloqueado por otro equipo; en el resto de
    // fases no hay nada que mostrar.
    if (databaseStatus?.phase === 'locked' || databaseStatus?.phase === 'fallback') {
      void refreshCurrentDatabaseLock();
    }
  }, [databaseStatus?.phase, refreshCurrentDatabaseLock]);

  const handleForceReleaseDatabaseLock = async () => {
    setDatabaseActionStatus('');

    if (!window.traccion?.forceReleaseDatabaseLock) {
      setDatabaseActionStatus(
        'La liberación manual del bloqueo solo está disponible en escritorio.',
      );
      return;
    }

    const lockDescription = currentDatabaseLock
      ? `${currentDatabaseLock.username}@${currentDatabaseLock.hostname} (PID ${currentDatabaseLock.pid}, ${formatLockAge(currentDatabaseLock.updatedAt)})`
      : 'el equipo que aparece en el aviso';

    const confirmed = await confirm(
      `Vas a forzar la liberación del bloqueo de ${lockDescription}. Solo hazlo si tienes la certeza de que esa persona no está trabajando realmente en TrAccion en este momento (por ejemplo, su equipo se apagó o se quedó colgado). Si en realidad sigue activo, ambos podríais escribir a la vez durante unos segundos. ¿Continuar?`,
      {
        confirmLabel: 'Forzar liberación',
        danger: true,
        title: 'Forzar liberación de bloqueo SQLite',
      },
    );
    if (!confirmed) {
      return;
    }

    setIsForcingLockRelease(true);
    try {
      const result = await window.traccion.forceReleaseDatabaseLock();
      publishDatabaseStatus(result.status);
      setDatabaseActionStatus(result.message);
      await refreshCurrentDatabaseLock();
      if (result.ok) {
        window.setTimeout(() => window.location.reload(), 900);
      }
    } catch (error) {
      console.warn('No se ha podido forzar la liberación del bloqueo SQLite.', error);
      setDatabaseActionStatus('No se ha podido forzar la liberación del bloqueo SQLite.');
    } finally {
      setIsForcingLockRelease(false);
    }
  };

  const handleVacuumNow = async () => {
    if (!window.traccion?.vacuumDatabaseNow) {
      setVacuumActionStatus('Solo disponible en escritorio.');
      return;
    }

    const confirmed = await confirm(
      'Compactar la base de datos puede tardar varios segundos y bloquea brevemente la escritura para el resto de equipos. ¿Continuar?',
      { confirmLabel: 'Compactar', title: 'Compactar base de datos' },
    );
    if (!confirmed) {
      return;
    }

    setIsVacuuming(true);
    setVacuumActionStatus('Compactando base de datos...');
    try {
      const result = await window.traccion.vacuumDatabaseNow();
      if (result.ok && result.sizeBeforeBytes !== null && result.sizeAfterBytes !== null) {
        setVacuumActionStatus(
          `Compactada: ${formatBytesAsMb(result.sizeBeforeBytes)} → ${formatBytesAsMb(result.sizeAfterBytes)} (${((result.durationMs ?? 0) / 1000).toFixed(1)} s).`,
        );
      } else {
        setVacuumActionStatus(result.message);
      }
      await refreshVacuumStatus();
    } catch (error) {
      console.warn('No se ha podido compactar la base de datos.', error);
      setVacuumActionStatus('No se ha podido compactar la base de datos.');
    } finally {
      setIsVacuuming(false);
    }
  };

  const handleRunIntegrityAudit = async () => {
    setIntegrityAuditStatus('');
    if (!window.traccion?.runDataIntegrityAudit) {
      setIntegrityAuditStatus('Solo disponible en escritorio.');
      return;
    }

    setIsRunningIntegrityAudit(true);
    try {
      const report = await window.traccion.runDataIntegrityAudit();
      setIntegrityReport(report);
      if (!report.databaseReady) {
        setIntegrityAuditStatus(
          report.sqliteIntegrityCheck.problems[0] ?? 'La base de datos no está activa.',
        );
      }
    } catch (error) {
      console.warn('No se ha podido ejecutar el diagnóstico de integridad.', error);
      setIntegrityAuditStatus('No se ha podido ejecutar el diagnóstico de integridad.');
    } finally {
      setIsRunningIntegrityAudit(false);
    }
  };

  const handleExportIntegrityReport = () => {
    if (!integrityReport) {
      return;
    }

    const blob = new Blob([JSON.stringify(integrityReport, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `traccion-diagnostico-integridad-${integrityReport.generatedAt.slice(0, 19).replace(/[:]/g, '-')}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const handleCreateManualBackup = async () => {
    if (!window.traccion?.createManualBackup) {
      setDatabaseActionStatus('La copia manual solo está disponible en escritorio.');
      return;
    }

    setIsCreatingManualBackup(true);
    setDatabaseActionStatus('Creando copia manual...');
    try {
      await window.traccion.createManualBackup();
      setDatabaseActionStatus('Copia manual creada correctamente.');
      await refreshLocalBackups();
    } catch (error) {
      console.warn('No se ha podido crear la copia manual.', error);
      setDatabaseActionStatus('No se ha podido crear la copia manual.');
    } finally {
      setIsCreatingManualBackup(false);
    }
  };

  const handleRestoreLocalBackup = async (backup: TraccionLocalBackupEntry) => {
    if (!window.traccion?.restoreLocalBackup) {
      setDatabaseActionStatus('La restauración de copias solo está disponible en escritorio.');
      return;
    }

    const confirmed = await confirm(
      `Vas a restaurar la copia local ${backup.fileName}. TrAccion creará una copia previa de la base activa antes de restaurar. ¿Continuar?`,
      { confirmLabel: 'Restaurar', danger: true, title: 'Restaurar copia local' },
    );
    if (!confirmed) {
      return;
    }

    setIsRestoringBackup(true);
    setDatabaseActionStatus('Restaurando copia local...');
    try {
      const result = await window.traccion.restoreLocalBackup(backup.id);
      publishDatabaseStatus(result.status);
      setDatabaseActionStatus(result.message);
      await refreshLocalBackups();
      if (result.ok) {
        window.setTimeout(() => window.location.reload(), 900);
      }
    } catch (error) {
      console.warn('No se ha podido restaurar la copia local.', error);
      setDatabaseActionStatus('No se ha podido restaurar la copia local seleccionada.');
    } finally {
      setIsRestoringBackup(false);
    }
  };

  const handleAddTaskPhase = () => {
    addTaskPhase(newTaskPhase);
    setNewTaskPhase('');
  };

  const handleSelectDatabaseDirectory = async () => {
    setDatabaseActionStatus('');

    if (!window.traccion?.selectDatabaseDirectory) {
      setDatabaseActionStatus('El selector de base de datos solo está disponible en escritorio.');
      return;
    }

    const nextStatus = await window.traccion.selectDatabaseDirectory();
    publishDatabaseStatus(nextStatus);
    void refreshLocalBackups();
    setDatabaseActionStatus(
      nextStatus.ready
        ? 'Ruta SQLite actualizada. Se usará traccion.sqlite dentro de la carpeta elegida.'
        : (nextStatus.message ?? 'No se ha podido activar la ruta seleccionada.'),
    );
  };

  const handleResetDatabaseDirectory = async () => {
    setDatabaseActionStatus('');

    if (!window.traccion?.resetDatabaseDirectory) {
      setDatabaseActionStatus(
        'La restauración de la base de datos solo está disponible en escritorio.',
      );
      return;
    }

    const nextStatus = await window.traccion.resetDatabaseDirectory();
    publishDatabaseStatus(nextStatus);
    void refreshLocalBackups();
    setDatabaseActionStatus(
      nextStatus.ready
        ? 'Ruta SQLite por defecto restaurada.'
        : (nextStatus.message ?? 'No se ha podido restaurar la ruta por defecto.'),
    );
  };

  const handleSelectLoteriaExportDirectory = async () => {
    setLoteriaExportStatus('');
    if (!window.traccion?.selectLoteriaExportDirectory) {
      setLoteriaExportStatus('El selector de carpeta solo está disponible en la aplicación de escritorio.');
      return;
    }
    const selectedPath = await window.traccion.selectLoteriaExportDirectory();
    if (!selectedPath) return;
    const normalized = selectedPath.replace(/[\\/]+$/, '');
    const result = await setRutaExportacionLoteria(`${normalized}\\Año {year}`);
    setLoteriaExportStatus(result.ok ? 'Carpeta de exportación de Lotería guardada.' : result.message);
  };

  const handleSelectOperationalBackupDirectory = async (
    setter: (ruta: string) => Promise<{ ok: boolean; message: string }>,
    setFeedback: (message: string) => void,
    successMessage: string,
  ) => {
    setFeedback('');
    if (!window.traccion?.selectOperationalExcelBackupDirectory) {
      setFeedback('El selector de carpeta solo está disponible en la aplicación de escritorio.');
      return;
    }
    const selectedPath = await window.traccion.selectOperationalExcelBackupDirectory();
    if (!selectedPath) return;
    const result = await setter(selectedPath.replace(/[\\/]+$/, ''));
    setFeedback(result.ok ? successMessage : result.message);
  };


  const databasePhaseLabel = databaseStatus?.ready
    ? 'activa'
    : databaseStatus?.phase === 'locked'
      ? 'ocupada'
      : databaseStatus?.phase === 'fallback'
        ? 'fallback'
        : databaseStatus?.phase === 'error'
          ? 'error'
          : 'no accesible';

  const handleSelectTemplate = async () => {
    setStatus('');

    if (!window.traccion?.selectTeletrabajoTemplate) {
      setStatus('El selector de plantillas solo está disponible en la aplicación de escritorio.');
      return;
    }

    const selectedPath = await window.traccion.selectTeletrabajoTemplate();
    if (!selectedPath) {
      return;
    }

    if (!isDocxPath(selectedPath)) {
      setStatus('La ruta seleccionada debe apuntar a un archivo DOCX.');
      return;
    }

    setStatus('Guardando ruta de plantilla...');
    const result = await setRutaPlantillaTeletrabajo(selectedPath);
    setStatus(result.ok ? 'Ruta de plantilla guardada.' : result.message);
  };

  const handleSelectVinculogramaTemplate = async () => {
    setVinculogramaTemplateStatus('');

    const api = window.traccion;
    if (!api || (!api.selectVinculogramaTemplate && !api.selectTeletrabajoTemplate)) {
      setVinculogramaTemplateStatus(
        'El selector de plantillas solo está disponible en la aplicación de escritorio.',
      );
      return;
    }

    const selectedPath = api.selectVinculogramaTemplate
      ? await api.selectVinculogramaTemplate()
      : await api.selectTeletrabajoTemplate();
    if (!selectedPath) {
      return;
    }

    if (!isDocxPath(selectedPath)) {
      setVinculogramaTemplateStatus('La ruta seleccionada debe apuntar a un archivo DOCX.');
      return;
    }

    setVinculogramaTemplateStatus('Guardando ruta de plantilla de vinculograma...');
    const result = await setRutaPlantillaVinculograma(selectedPath);
    setVinculogramaTemplateStatus(
      result.ok ? 'Ruta de plantilla de vinculograma guardada.' : result.message,
    );
  };

  const handleSelectLicenciaSinSueldoTemplate = async () => {
    setLicenciaTemplateStatus('');

    const api = window.traccion;
    if (!api || (!api.selectLicenciaSinSueldoTemplate && !api.selectTeletrabajoTemplate)) {
      setLicenciaTemplateStatus(
        'El selector de plantillas solo está disponible en la aplicación de escritorio.',
      );
      return;
    }

    const selectedPath = api.selectLicenciaSinSueldoTemplate
      ? await api.selectLicenciaSinSueldoTemplate()
      : await api.selectTeletrabajoTemplate();
    if (!selectedPath) {
      return;
    }

    if (!isDocxPath(selectedPath)) {
      setLicenciaTemplateStatus('La ruta seleccionada debe apuntar a un archivo DOCX.');
      return;
    }

    setLicenciaTemplateStatus('Guardando ruta de plantilla de licencia sin sueldo...');
    const result = await setRutaPlantillaLicenciaSinSueldo(selectedPath);
    setLicenciaTemplateStatus(
      result.ok ? 'Ruta de plantilla de licencia sin sueldo guardada.' : result.message,
    );
  };

  const handleSelectExcedenciaTemplate = async () => {
    setExcedenciaTemplateStatus('');

    const api = window.traccion;
    if (!api || (!api.selectExcedenciaTemplate && !api.selectLicenciaSinSueldoTemplate && !api.selectTeletrabajoTemplate)) {
      setExcedenciaTemplateStatus(
        'El selector de plantillas solo está disponible en la aplicación de escritorio.',
      );
      return;
    }

    const selectedPath = api.selectExcedenciaTemplate
      ? await api.selectExcedenciaTemplate()
      : api.selectLicenciaSinSueldoTemplate
        ? await api.selectLicenciaSinSueldoTemplate()
        : await api.selectTeletrabajoTemplate();
    if (!selectedPath) return;

    if (!isDocxPath(selectedPath)) {
      setExcedenciaTemplateStatus('La ruta seleccionada debe apuntar a un archivo DOCX.');
      return;
    }

    setExcedenciaTemplateStatus('Guardando ruta de plantilla de excedencia...');
    const result = await setRutaPlantillaExcedencia(selectedPath);
    setExcedenciaTemplateStatus(
      result.ok ? 'Ruta de plantilla de excedencia guardada.' : result.message,
    );
  };

  const handleSelectProrrogaExcedenciaTemplate = async () => {
    setProrrogaExcedenciaTemplateStatus('');
    const api = window.traccion;
    if (!api || (!api.selectExcedenciaTemplate && !api.selectLicenciaSinSueldoTemplate && !api.selectTeletrabajoTemplate)) {
      setProrrogaExcedenciaTemplateStatus('El selector de plantillas solo está disponible en la aplicación de escritorio.');
      return;
    }
    const selectedPath = api.selectExcedenciaTemplate
      ? await api.selectExcedenciaTemplate()
      : api.selectLicenciaSinSueldoTemplate
        ? await api.selectLicenciaSinSueldoTemplate()
        : await api.selectTeletrabajoTemplate();
    if (!selectedPath) return;
    if (!isDocxPath(selectedPath)) {
      setProrrogaExcedenciaTemplateStatus('La ruta seleccionada debe apuntar a un archivo DOCX.');
      return;
    }
    setProrrogaExcedenciaTemplateStatus('Guardando ruta de plantilla de prórroga...');
    const result = await setRutaPlantillaProrrogaExcedencia(selectedPath);
    setProrrogaExcedenciaTemplateStatus(result.ok ? 'Ruta de plantilla de prórroga guardada.' : result.message);
  };

  const scrollToSettingsSection = (id: string) => {
    const target = document.getElementById(id);
    if (target instanceof HTMLDetailsElement) {
      target.open = true;
    }
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const templateInputClass =
    'mt-1 w-full rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-sm font-medium text-metro-text outline-none transition focus:border-sky-400';

  return (
    <>
      <section className="space-y-4">
        <PageHeader
          helpSections={AJUSTES_HELP_SECTIONS}
          helpSubtitle="Guía rápida de rutas, estado de base de datos, plantillas y ajustes auxiliares."
          status={<InlineSaveFeedback />}
          title="Configuración"
        />

        <div className="rounded-[1.4rem] border border-metro-border/80 bg-[linear-gradient(180deg,rgba(21,39,62,0.98),rgba(15,31,50,0.96))] p-4 shadow-[0_18px_42px_rgba(2,8,23,0.22)]">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-3">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-sky-400/20 bg-sky-500/10 text-sky-200">
                <Settings2 size={22} />
              </div>
              <div>
                <h2 className="text-xl font-black text-metro-text">Ajustes de TrAccion</h2>
                <p className="mt-1 text-sm text-metro-muted">Configuración agrupada por función para localizar cada opción con rapidez.</p>
              </div>
            </div>
            <span className="inline-flex items-center rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-emerald-200">
              Los cambios se guardan automáticamente
            </span>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <button
            className="group rounded-[1.15rem] border border-sky-400/20 bg-[linear-gradient(180deg,rgba(22,57,94,0.68),rgba(15,38,63,0.75))] p-4 text-left transition hover:-translate-y-0.5 hover:border-sky-300/35"
            onClick={() => scrollToSettingsSection('plantillas-documentales')}
            type="button"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl border border-sky-300/20 bg-sky-400/10 text-sky-200"><FileText size={18} /></div>
              <span className="rounded-full border border-metro-border bg-metro-surface/70 px-2.5 py-1 text-[11px] font-bold text-metro-muted">5 plantillas</span>
            </div>
            <h3 className="mt-3 text-sm font-extrabold text-metro-text">Plantillas documentales</h3>
            <p className="mt-1 text-xs text-metro-muted">Teletrabajo, licencias, excedencias y vinculograma.</p>
          </button>

          <button
            className="group rounded-[1.15rem] border border-emerald-400/20 bg-[linear-gradient(180deg,rgba(17,74,65,0.55),rgba(13,48,46,0.7))] p-4 text-left transition hover:-translate-y-0.5 hover:border-emerald-300/35"
            onClick={() => scrollToSettingsSection('ajustes-base-datos')}
            type="button"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl border border-emerald-300/20 bg-emerald-400/10 text-emerald-200"><Database size={18} /></div>
              <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-bold text-emerald-100">{databaseBadge.label}</span>
            </div>
            <h3 className="mt-3 text-sm font-extrabold text-metro-text">Base de datos y copias</h3>
            <p className="mt-1 truncate text-xs text-metro-muted">{databaseStatus?.path ?? 'SQLite no inicializado'}</p>
          </button>

          <button
            className="group rounded-[1.15rem] border border-violet-400/20 bg-[linear-gradient(180deg,rgba(66,43,104,0.55),rgba(39,31,71,0.72))] p-4 text-left transition hover:-translate-y-0.5 hover:border-violet-300/35"
            onClick={() => scrollToSettingsSection('fases-tareas')}
            type="button"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl border border-violet-300/20 bg-violet-400/10 text-violet-200"><ListChecks size={18} /></div>
              <span className="rounded-full border border-violet-400/20 bg-violet-500/10 px-2.5 py-1 text-[11px] font-bold text-violet-100">{taskPhases.filter((phase) => phase.active).length} activas</span>
            </div>
            <h3 className="mt-3 text-sm font-extrabold text-metro-text">Fases de tareas</h3>
            <p className="mt-1 text-xs text-metro-muted">Gestiona las fases disponibles en el módulo Tareas.</p>
          </button>

          <button
            className="group rounded-[1.15rem] border border-amber-400/20 bg-[linear-gradient(180deg,rgba(91,66,24,0.46),rgba(54,43,24,0.66))] p-4 text-left transition hover:-translate-y-0.5 hover:border-amber-300/35"
            onClick={() => scrollToSettingsSection('ajustes-integridad')}
            type="button"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl border border-amber-300/20 bg-amber-400/10 text-amber-200"><ShieldCheck size={18} /></div>
              <span className="rounded-full border border-metro-border bg-metro-surface/70 px-2.5 py-1 text-[11px] font-bold text-metro-muted">Diagnóstico</span>
            </div>
            <h3 className="mt-3 text-sm font-extrabold text-metro-text">Integridad y mantenimiento</h3>
            <p className="mt-1 text-xs text-metro-muted">Comprueba datos, esquema y bloqueos sin modificar información.</p>
          </button>
        </div>

        <section
          className="scroll-mt-4 rounded-[1.3rem] border border-metro-border/80 bg-metro-panel/45 p-4"
          id="plantillas-documentales"
        >
          <div className="mb-4 flex items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-sky-400/20 bg-sky-500/10 text-sky-200"><FileText size={18} /></div>
            <div>
              <h3 className="text-base font-extrabold text-metro-text">Plantillas documentales</h3>
              <p className="mt-1 text-sm text-metro-muted">Rutas de los DOCX externos utilizados por los distintos módulos.</p>
            </div>
          </div>

          <div className="grid gap-3 xl:grid-cols-2">
            <div className="rounded-xl border border-metro-border/80 bg-metro-surface/55 p-3">
              <h4 className="text-sm font-bold text-metro-text">Teletrabajo</h4>
              <p className="mt-1 text-xs text-metro-muted">Acuerdo de teletrabajo generado desde el módulo correspondiente.</p>
              <label className="mt-3 block text-xs font-semibold text-metro-muted">Ruta plantilla DOCX
                <input className={templateInputClass} onChange={(event) => { void setRutaPlantillaTeletrabajo(event.target.value); }} placeholder="C:\\RRLL\\Plantillas\\Acuerdo Teletrabajo.docx" type="text" value={rutaPlantillaTeletrabajo} />
              </label>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button className="inline-flex items-center gap-2 rounded-lg border border-sky-400/25 bg-sky-500/10 px-3 py-2 text-xs font-bold text-sky-100 hover:bg-sky-500/15" onClick={handleSelectTemplate} type="button"><FolderOpen size={14} />Seleccionar</button>
                {status && <Notice tone={noticeTone(status)}>{status}</Notice>}
              </div>
            </div>

            <div className="rounded-xl border border-metro-border/80 bg-metro-surface/55 p-3">
              <h4 className="text-sm font-bold text-metro-text">Licencia sin sueldo</h4>
              <p className="mt-1 text-xs text-metro-muted">Documento de concesión utilizado en pendientes de firma.</p>
              <label className="mt-3 block text-xs font-semibold text-metro-muted">Ruta plantilla DOCX
                <input className={templateInputClass} onChange={(event) => { void setRutaPlantillaLicenciaSinSueldo(event.target.value); }} placeholder="C:\\RRLL\\Plantillas\\Concesión licencia sin sueldo.docx" type="text" value={rutaPlantillaLicenciaSinSueldo} />
              </label>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button className="inline-flex items-center gap-2 rounded-lg border border-sky-400/25 bg-sky-500/10 px-3 py-2 text-xs font-bold text-sky-100 hover:bg-sky-500/15" onClick={handleSelectLicenciaSinSueldoTemplate} type="button"><FolderOpen size={14} />Seleccionar</button>
                {licenciaTemplateStatus && <Notice tone={noticeTone(licenciaTemplateStatus)}>{licenciaTemplateStatus}</Notice>}
              </div>
            </div>

            <div className="rounded-xl border border-metro-border/80 bg-metro-surface/55 p-3">
              <h4 className="text-sm font-bold text-metro-text">Excedencia</h4>
              <p className="mt-1 text-xs text-metro-muted">Plantilla editable con marcadores de persona y fechas.</p>
              <label className="mt-3 block text-xs font-semibold text-metro-muted">Ruta plantilla DOCX
                <input className={templateInputClass} onChange={(event) => { void setRutaPlantillaExcedencia(event.target.value); }} placeholder="C:\\RRLL\\Plantillas\\Plantilla Excedencia.docx" type="text" value={rutaPlantillaExcedencia} />
              </label>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button className="inline-flex items-center gap-2 rounded-lg border border-sky-400/25 bg-sky-500/10 px-3 py-2 text-xs font-bold text-sky-100 hover:bg-sky-500/15" onClick={handleSelectExcedenciaTemplate} type="button"><FolderOpen size={14} />Seleccionar</button>
                {excedenciaTemplateStatus && <Notice tone={noticeTone(excedenciaTemplateStatus)}>{excedenciaTemplateStatus}</Notice>}
              </div>
            </div>

            <div className="rounded-xl border border-metro-border/80 bg-metro-surface/55 p-3">
              <h4 className="text-sm font-bold text-metro-text">Prórroga de excedencia</h4>
              <p className="mt-1 text-xs text-metro-muted">Documento utilizado para generar la prórroga de una excedencia.</p>
              <label className="mt-3 block text-xs font-semibold text-metro-muted">Ruta plantilla DOCX
                <input className={templateInputClass} onChange={(event) => { void setRutaPlantillaProrrogaExcedencia(event.target.value); }} placeholder="C:\\RRLL\\Plantillas\\Plantilla Prórroga Excedencia.docx" type="text" value={rutaPlantillaProrrogaExcedencia} />
              </label>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button className="inline-flex items-center gap-2 rounded-lg border border-sky-400/25 bg-sky-500/10 px-3 py-2 text-xs font-bold text-sky-100 hover:bg-sky-500/15" onClick={handleSelectProrrogaExcedenciaTemplate} type="button"><FolderOpen size={14} />Seleccionar</button>
                {prorrogaExcedenciaTemplateStatus && <Notice tone={noticeTone(prorrogaExcedenciaTemplateStatus)}>{prorrogaExcedenciaTemplateStatus}</Notice>}
              </div>
            </div>

            <div className="rounded-xl border border-metro-border/80 bg-metro-surface/55 p-3 xl:col-span-2">
              <h4 className="text-sm font-bold text-metro-text">Vinculograma</h4>
              <p className="mt-1 text-xs text-metro-muted">Solicitud de declaración responsable generada desde Vinculograma.</p>
              <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
                <input className={templateInputClass.replace('mt-1 ', '')} onChange={(event) => { void setRutaPlantillaVinculograma(event.target.value); }} placeholder="C:\\RRLL\\Plantillas\\Solicitud Vinculograma.docx" type="text" value={rutaPlantillaVinculograma} />
                <button className="inline-flex items-center justify-center gap-2 rounded-lg border border-sky-400/25 bg-sky-500/10 px-3 py-2 text-xs font-bold text-sky-100 hover:bg-sky-500/15" onClick={handleSelectVinculogramaTemplate} type="button"><FolderOpen size={14} />Seleccionar</button>
              </div>
              {vinculogramaTemplateStatus && <div className="mt-2"><Notice tone={noticeTone(vinculogramaTemplateStatus)}>{vinculogramaTemplateStatus}</Notice></div>}
            </div>

            <div className="rounded-xl border border-metro-border/80 bg-metro-surface/55 p-3 xl:col-span-2">
              <h4 className="text-sm font-bold text-metro-text">Licencias sin sueldo y Excedencias · Excel automático</h4>
              <p className="mt-1 text-xs text-metro-muted">Cada alta, modificación o eliminación confirmada actualiza un único Excel espejo. El nombre incluye la fecha de la última actualización; si cambia el día, TrAccion elimina el fichero anterior y lo sustituye por el nuevo.</p>
              <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
                <input className={templateInputClass.replace('mt-1 ', '')} onChange={(event) => { void setRutaExportacionLicencias(event.target.value); }} placeholder="G:\\...\\Licencias sin sueldo y Excedencias" type="text" value={rutaExportacionLicencias} />
                <button className="inline-flex items-center justify-center gap-2 rounded-lg border border-sky-400/25 bg-sky-500/10 px-3 py-2 text-xs font-bold text-sky-100 hover:bg-sky-500/15" onClick={() => void handleSelectOperationalBackupDirectory(setRutaExportacionLicencias, setLicenciasExportStatus, 'Carpeta del Excel automático de Licencias guardada.')} type="button"><FolderOpen size={14} />Seleccionar carpeta</button>
              </div>
              <p className="mt-2 text-[11px] text-metro-muted">Ejemplo: <strong>Licencias_y_Excedencias_21-09-2026.xlsx</strong>. Si la siguiente actualización es el 22/09/2026, pasa a llamarse <strong>Licencias_y_Excedencias_22-09-2026.xlsx</strong> y se elimina el anterior.</p>
              {licenciasExportStatus && <div className="mt-2"><Notice tone={noticeTone(licenciasExportStatus)}>{licenciasExportStatus}</Notice></div>}
            </div>

            <div className="rounded-xl border border-metro-border/80 bg-metro-surface/55 p-3 xl:col-span-2">
              <h4 className="text-sm font-bold text-metro-text">Vinculograma · Excel automático</h4>
              <p className="mt-1 text-xs text-metro-muted">Cada cambio confirmado actualiza un único Excel espejo con las relaciones vigentes, vencidas y revocadas. La fecha del nombre siempre corresponde a la última actualización.</p>
              <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
                <input className={templateInputClass.replace('mt-1 ', '')} onChange={(event) => { void setRutaExportacionVinculograma(event.target.value); }} placeholder="G:\\...\\Vinculograma" type="text" value={rutaExportacionVinculograma} />
                <button className="inline-flex items-center justify-center gap-2 rounded-lg border border-sky-400/25 bg-sky-500/10 px-3 py-2 text-xs font-bold text-sky-100 hover:bg-sky-500/15" onClick={() => void handleSelectOperationalBackupDirectory(setRutaExportacionVinculograma, setVinculogramaExportStatus, 'Carpeta del Excel automático de Vinculograma guardada.')} type="button"><FolderOpen size={14} />Seleccionar carpeta</button>
              </div>
              <p className="mt-2 text-[11px] text-metro-muted">Ejemplo: <strong>Vinculograma_21-09-2026.xlsx</strong>. Al actualizar otro día, se crea el nombre con la nueva fecha y se elimina el fichero anterior.</p>
              {vinculogramaExportStatus && <div className="mt-2"><Notice tone={noticeTone(vinculogramaExportStatus)}>{vinculogramaExportStatus}</Notice></div>}
            </div>

            <div className="rounded-xl border border-metro-border/80 bg-metro-surface/55 p-3 xl:col-span-2">
              <h4 className="text-sm font-bold text-metro-text">Lotería · Excel automático de campaña</h4>
              <p className="mt-1 text-xs text-metro-muted">Cada guardado de Lotería actualiza un único Excel espejo de la campaña. El nombre refleja la fecha de la última actualización; si cambia el día, TrAccion elimina el fichero anterior. Usa <strong>{'{year}'}</strong> para que la carpeta cambie automáticamente con el año.</p>
              <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
                <input className={templateInputClass.replace('mt-1 ', '')} onChange={(event) => { void setRutaExportacionLoteria(event.target.value); }} placeholder="G:\\...\\Lotería\\Año {year}" type="text" value={rutaExportacionLoteria} />
                <button className="inline-flex items-center justify-center gap-2 rounded-lg border border-sky-400/25 bg-sky-500/10 px-3 py-2 text-xs font-bold text-sky-100 hover:bg-sky-500/15" onClick={handleSelectLoteriaExportDirectory} type="button"><FolderOpen size={14} />Seleccionar carpeta base</button>
              </div>
              <p className="mt-2 text-[11px] text-metro-muted">Ejemplo para 2026: la plantilla termina en <strong>Año {'{year}'}</strong> y TrAccion guardará <strong>Loteria_2026_DD-MM-AAAA.xlsx</strong> en <strong>Año 2026</strong>.</p>
              {loteriaExportStatus && <div className="mt-2"><Notice tone={noticeTone(loteriaExportStatus)}>{loteriaExportStatus}</Notice></div>}
            </div>
          </div>
        </section>

        <SchoolHelpSettingsSection />

        <section className="scroll-mt-4 rounded-[1.3rem] border border-metro-border/80 bg-metro-panel/45 p-4" id="fases-tareas">
          <div className="mb-4 flex items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-violet-400/20 bg-violet-500/10 text-violet-200"><ListChecks size={18} /></div>
            <div>
              <h3 className="text-base font-extrabold text-metro-text">Fases de tareas</h3>
              <p className="mt-1 text-sm text-metro-muted">Desactivar una fase impide nuevas selecciones sin afectar al histórico.</p>
            </div>
          </div>

          <div className="mb-3 flex flex-col gap-2 sm:flex-row">
            <input className="min-w-0 flex-1 rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-sm font-medium text-metro-text outline-none focus:border-violet-400" onChange={(event) => setNewTaskPhase(event.target.value)} placeholder="Nueva fase" type="text" value={newTaskPhase} />
            <button className="inline-flex items-center justify-center gap-2 rounded-lg bg-metro-red px-3 py-2 text-sm font-semibold text-white hover:bg-metro-dark disabled:cursor-not-allowed disabled:opacity-50" disabled={!newTaskPhase.trim()} onClick={handleAddTaskPhase} type="button"><Plus size={16} />Añadir fase</button>
          </div>

          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {taskPhases.map((phase) => (
              <div className="grid gap-2 rounded-xl border border-metro-border bg-metro-surface/65 p-2.5" key={phase.id}>
                <input className="rounded-lg border border-metro-border bg-metro-panel px-3 py-2 text-sm font-medium text-metro-text outline-none focus:border-violet-400" onChange={(event) => updateTaskPhase(phase.id, event.target.value)} type="text" value={phase.nombre} />
                <button className={`rounded-lg border px-3 py-2 text-xs font-bold transition ${phase.active ? 'border-emerald-400/25 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/15' : 'border-metro-border bg-metro-panel text-metro-muted hover:border-metro-red'}`} onClick={() => toggleTaskPhase(phase.id)} type="button">
                  {phase.active ? 'Activa · Desactivar' : 'Inactiva · Activar'}
                </button>
              </div>
            ))}
          </div>
        </section>

        <details
          className="group scroll-mt-4 rounded-[1.3rem] border border-metro-border/80 bg-metro-panel/35"
          id="ajustes-base-datos"
          onToggle={(event) => setIsDatabaseSectionOpen(event.currentTarget.open)}
          open={isDatabaseSectionOpen}
        >
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl border border-emerald-400/20 bg-emerald-500/10 text-emerald-200"><Database size={18} /></div>
              <div><h3 className="text-base font-extrabold text-metro-text">Base de datos, copias y actualizaciones</h3><p className="mt-0.5 text-xs text-metro-muted">Opciones avanzadas de SQLite, copias, VACUUM y actualización de la aplicación.</p></div>
            </div>
            <span className="rounded-full border border-metro-border bg-metro-surface px-3 py-1 text-xs font-bold text-metro-muted">Abrir</span>
          </summary>
          <div className="px-3 pb-3">
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

        <details className="group scroll-mt-4 rounded-[1.3rem] border border-metro-border/80 bg-metro-panel/35" id="ajustes-integridad">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl border border-amber-400/20 bg-amber-500/10 text-amber-200"><ShieldCheck size={18} /></div>
              <div><h3 className="text-base font-extrabold text-metro-text">Diagnóstico de integridad</h3><p className="mt-0.5 text-xs text-metro-muted">Comprobaciones técnicas que no modifican los datos.</p></div>
            </div>
            <span className="rounded-full border border-metro-border bg-metro-surface px-3 py-1 text-xs font-bold text-metro-muted">Abrir</span>
          </summary>
          <div className="px-3 pb-3">
            <DataIntegrityAuditSection
              integrityReport={integrityReport}
              isRunningIntegrityAudit={isRunningIntegrityAudit}
              integrityAuditStatus={integrityAuditStatus}
              handleRunIntegrityAudit={handleRunIntegrityAudit}
              handleExportIntegrityReport={handleExportIntegrityReport}
            />
          </div>
        </details>
      </section>
      {dialogNode}
    </>
  );
}
