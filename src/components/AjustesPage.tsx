import { FolderOpen, Plus } from 'lucide-react';
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

export function AjustesPage() {
  const rutaPlantillaTeletrabajo = useConfiguracionStore((state) => state.rutaPlantillaTeletrabajo);
  const rutaPlantillaLicenciaSinSueldo = useConfiguracionStore(
    (state) => state.rutaPlantillaLicenciaSinSueldo,
  );
  const rutaPlantillaVinculograma = useConfiguracionStore(
    (state) => state.rutaPlantillaVinculograma,
  );
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
  const setRutaPlantillaVinculograma = useConfiguracionStore(
    (state) => state.setRutaPlantillaVinculograma,
  );
  const [status, setStatus] = useState('');
  const [licenciaTemplateStatus, setLicenciaTemplateStatus] = useState('');
  const [vinculogramaTemplateStatus, setVinculogramaTemplateStatus] = useState('');
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
  const [isVacuuming, setIsVacuuming] = useState(false);
  const [vacuumActionStatus, setVacuumActionStatus] = useState('');
  const [integrityReport, setIntegrityReport] = useState<TraccionDataIntegrityReport | null>(null);
  const [isRunningIntegrityAudit, setIsRunningIntegrityAudit] = useState(false);
  const [integrityAuditStatus, setIntegrityAuditStatus] = useState('');
  const [currentDatabaseLock, setCurrentDatabaseLock] = useState<TraccionDatabaseLockInfo | null>(
    null,
  );
  const [isCheckingDatabaseLock, setIsCheckingDatabaseLock] = useState(false);
  const [isForcingLockRelease, setIsForcingLockRelease] = useState(false);
  const [newTaskPhase, setNewTaskPhase] = useState('');
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
    try {
      setVacuumStatus(await window.traccion.getVacuumStatus());
    } catch (error) {
      console.warn('No se ha podido consultar el estado de compactado de la base de datos.', error);
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
    try {
      setCurrentDatabaseLock(await window.traccion.getCurrentDatabaseLock());
    } catch (error) {
      console.warn('No se ha podido comprobar el bloqueo actual de SQLite.', error);
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

  return (
    <>
      <section className="rounded-3xl border border-metro-border bg-metro-surface p-5 shadow-card">
        <PageHeader
          helpSections={AJUSTES_HELP_SECTIONS}
          helpSubtitle="Guía rápida de rutas, estado de base de datos, plantillas y ajustes auxiliares."
          status={<InlineSaveFeedback />}
          title="Configuración"
        />

        <DatabaseSettingsSection
          databaseStatus={databaseStatus}
          databaseBadge={databaseBadge}
          databasePhaseLabel={databasePhaseLabel}
          databaseActionStatus={databaseActionStatus}
          currentDatabaseLock={currentDatabaseLock}
          isCheckingDatabaseLock={isCheckingDatabaseLock}
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
          isVacuuming={isVacuuming}
          vacuumActionStatus={vacuumActionStatus}
          handleVacuumNow={handleVacuumNow}
        />

        <DataIntegrityAuditSection
          integrityReport={integrityReport}
          isRunningIntegrityAudit={isRunningIntegrityAudit}
          integrityAuditStatus={integrityAuditStatus}
          handleRunIntegrityAudit={handleRunIntegrityAudit}
          handleExportIntegrityReport={handleExportIntegrityReport}
        />

        <div className="mb-4 rounded-2xl border border-metro-border bg-metro-panel p-4">
          <div className="mb-4">
            <h3 className="text-base font-bold text-metro-text">Plantilla Teletrabajo</h3>
            <p className="mt-1 text-sm text-metro-muted">
              Guarda únicamente la ruta local, UNC o de unidad mapeada del DOCX externo.
            </p>
          </div>

          <label className="block text-xs font-semibold text-metro-muted">
            Ruta plantilla DOCX
            <input
              className="mt-1 w-full rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-sm font-medium text-metro-text outline-none focus:border-metro-red"
              onChange={(event) => {
                void setRutaPlantillaTeletrabajo(event.target.value);
              }}
              placeholder="C:\\RRLL\\Plantillas\\Acuerdo Teletrabajo.docx"
              type="text"
              value={rutaPlantillaTeletrabajo}
            />
          </label>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              className="inline-flex items-center gap-2 rounded-lg bg-metro-red px-3 py-2 text-sm font-semibold text-white hover:bg-metro-dark"
              onClick={handleSelectTemplate}
              type="button"
            >
              <FolderOpen size={16} />
              Seleccionar plantilla
            </button>
            {status && <Notice tone={noticeTone(status)}>{status}</Notice>}
          </div>
        </div>

        <div className="mb-4 rounded-2xl border border-metro-border bg-metro-panel p-4">
          <div className="mb-4">
            <h3 className="text-base font-bold text-metro-text">Plantilla Licencia sin sueldo</h3>
            <p className="mt-1 text-sm text-metro-muted">
              Guarda la ruta externa del DOCX usado para generar la concesión en pendientes de
              firma.
            </p>
          </div>

          <label className="block text-xs font-semibold text-metro-muted">
            Ruta plantilla DOCX
            <input
              className="mt-1 w-full rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-sm font-medium text-metro-text outline-none focus:border-metro-red"
              onChange={(event) => {
                void setRutaPlantillaLicenciaSinSueldo(event.target.value);
              }}
              placeholder="C:\\RRLL\\Plantillas\\Concesión licencia sin sueldo.docx"
              type="text"
              value={rutaPlantillaLicenciaSinSueldo}
            />
          </label>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              className="inline-flex items-center gap-2 rounded-lg bg-metro-red px-3 py-2 text-sm font-semibold text-white hover:bg-metro-dark"
              onClick={handleSelectLicenciaSinSueldoTemplate}
              type="button"
            >
              <FolderOpen size={16} />
              Seleccionar plantilla
            </button>
            {licenciaTemplateStatus && (
              <Notice tone={noticeTone(licenciaTemplateStatus)}>{licenciaTemplateStatus}</Notice>
            )}
          </div>
        </div>

        <div className="mb-4 rounded-2xl border border-metro-border bg-metro-panel p-4">
          <div className="mb-4">
            <h3 className="text-base font-bold text-metro-text">Plantilla Vinculograma</h3>
            <p className="mt-1 text-sm text-metro-muted">
              Guarda la ruta externa del DOCX usado para generar la solicitud de declaración
              responsable.
            </p>
          </div>

          <label className="block text-xs font-semibold text-metro-muted">
            Ruta plantilla DOCX
            <input
              className="mt-1 w-full rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-sm font-medium text-metro-text outline-none focus:border-metro-red"
              onChange={(event) => {
                void setRutaPlantillaVinculograma(event.target.value);
              }}
              placeholder="C:\\RRLL\\Plantillas\\Solicitud Vinculograma.docx"
              type="text"
              value={rutaPlantillaVinculograma}
            />
          </label>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              className="inline-flex items-center gap-2 rounded-lg bg-metro-red px-3 py-2 text-sm font-semibold text-white hover:bg-metro-dark"
              onClick={handleSelectVinculogramaTemplate}
              type="button"
            >
              <FolderOpen size={16} />
              Seleccionar plantilla
            </button>
            {vinculogramaTemplateStatus && (
              <Notice tone={noticeTone(vinculogramaTemplateStatus)}>
                {vinculogramaTemplateStatus}
              </Notice>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-metro-border bg-metro-panel p-4">
          <div className="mb-4">
            <h3 className="text-base font-bold text-metro-text">Fases de tareas</h3>
            <p className="mt-1 text-sm text-metro-muted">
              Configura las fases usadas en Tareas. Desactivar una fase evita nuevas selecciones,
              pero mantiene el histórico y las tareas existentes.
            </p>
          </div>

          <div className="mb-3 flex flex-col gap-2 sm:flex-row">
            <input
              className="min-w-0 flex-1 rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-sm font-medium text-metro-text outline-none focus:border-metro-red"
              onChange={(event) => setNewTaskPhase(event.target.value)}
              placeholder="Nueva fase"
              type="text"
              value={newTaskPhase}
            />
            <button
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-metro-red px-3 py-2 text-sm font-semibold text-white hover:bg-metro-dark disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!newTaskPhase.trim()}
              onClick={handleAddTaskPhase}
              type="button"
            >
              <Plus size={16} />
              Añadir fase
            </button>
          </div>

          <div className="space-y-2">
            {taskPhases.map((phase) => (
              <div
                className="grid gap-2 rounded-xl border border-metro-border bg-metro-surface p-2 sm:grid-cols-[minmax(0,1fr)_auto]"
                key={phase.id}
              >
                <input
                  className="rounded-lg border border-metro-border bg-metro-panel px-3 py-2 text-sm font-medium text-metro-text outline-none focus:border-metro-red"
                  onChange={(event) => updateTaskPhase(phase.id, event.target.value)}
                  type="text"
                  value={phase.nombre}
                />
                <button
                  className="rounded-lg border border-metro-border bg-metro-panel px-3 py-2 text-sm font-semibold text-metro-text hover:border-metro-red"
                  onClick={() => toggleTaskPhase(phase.id)}
                  type="button"
                >
                  {phase.active ? 'Desactivar' : 'Activar'}
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>
      {dialogNode}
    </>
  );
}
