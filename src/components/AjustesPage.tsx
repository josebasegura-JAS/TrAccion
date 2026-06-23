import { Database, FolderOpen, Plus, RotateCcw, Save } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { isDocxPath } from '../features/configuracion/domain/teletrabajoTemplate';
import { publishDatabaseStatus, useDatabaseStatus } from '../services/databaseStatus';
import { buildDatabaseStatusBadge, type DatabaseStatusTone } from '../services/databaseStatusView';
import { formatLockAge } from '../services/databaseLockView';
import { Notice } from './ui/Notice';
import { ModuleHelpButton, type ModuleHelpSection } from './ModuleHelp';
import { StatusBadge } from './ui/StatusBadge';
import { ActionButton } from './ui/ActionButton';
import { FieldLabel, Select } from './ui/Field';
import { useAppDialog } from '../hooks/useAppDialog';
import { useConfiguracionStore } from '../features/configuracion/store/useConfiguracionStore';

const AJUSTES_HELP_SECTIONS: ModuleHelpSection[] = [
  {
    title: 'Para qué sirve',
    items: [
      'Centraliza configuración técnica de TrAccion: base de datos, rutas externas, plantillas y opciones auxiliares.',
      'Permite comprobar el estado de SQLite, el modo de conexión y avisos de funcionamiento.',
      'Guarda rutas necesarias para generar documentos o comunicaciones sin incrustar plantillas en la app.',
    ],
  },
  {
    title: 'Uso recomendado',
    items: [
      'Modifica rutas solo cuando cambie la ubicación real de base de datos o plantillas.',
      'Comprueba los avisos de estado antes de asumir que la app está trabajando contra la ruta compartida.',
      'Evita cambiar configuración durante importaciones o escrituras críticas en otros módulos.',
    ],
  },
];

function databaseTone(tone: DatabaseStatusTone): 'success' | 'warning' | 'error' | 'muted' {
  if (tone === 'ok') {
    return 'success';
  }

  if (tone === 'error') {
    return 'error';
  }

  if (tone === 'locked') {
    return 'muted';
  }

  return 'warning';
}

function noticeTone(message: string): 'success' | 'warning' | 'error' | 'muted' {
  const normalizedMessage = message.toLowerCase();

  if (
    normalizedMessage.includes('no se ha podido') ||
    normalizedMessage.includes('solo está disponible')
  ) {
    return 'error';
  }

  if (normalizedMessage.includes('restaurando') || normalizedMessage.includes('fallback')) {
    return 'warning';
  }

  if (
    normalizedMessage.includes('guardada') ||
    normalizedMessage.includes('actualizada') ||
    normalizedMessage.includes('restaurada')
  ) {
    return 'success';
  }

  return 'muted';
}

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
  const [dailyBackupSettings, setDailyBackupSettings] = useState<TraccionDailyLocalBackupSettings | null>(
    null,
  );
  const [dailyBackupStatus, setDailyBackupStatus] = useState('');
  const [vacuumStatus, setVacuumStatus] = useState<TraccionVacuumStatus | null>(null);
  const [isVacuuming, setIsVacuuming] = useState(false);
  const [vacuumActionStatus, setVacuumActionStatus] = useState('');
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
    window.traccion?.getSecondaryBackupDirectory?.()
      .then((p) => setSecondaryBackupPath(p ?? null))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    window.traccion?.getDailyLocalBackupSettings?.()
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
      setDatabaseActionStatus('La liberación manual del bloqueo solo está disponible en escritorio.');
      return;
    }

    const lockDescription = currentDatabaseLock
      ? `${currentDatabaseLock.username}@${currentDatabaseLock.hostname} (PID ${currentDatabaseLock.pid}, ${formatLockAge(currentDatabaseLock.updatedAt)})`
      : 'el equipo que aparece en el aviso';

    const confirmed = await confirm(
      `Vas a forzar la liberación del bloqueo de ${lockDescription}. Solo hazlo si tienes la certeza de que esa persona no está trabajando realmente en TrAccion en este momento (por ejemplo, su equipo se apagó o se quedó colgado). Si en realidad sigue activo, ambos podríais escribir a la vez durante unos segundos. ¿Continuar?`,
      { confirmLabel: 'Forzar liberación', danger: true, title: 'Forzar liberación de bloqueo SQLite' },
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

  const formatBytesAsMb = (sizeBytes: number) => `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;

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

  const formatBackupSize = (sizeBytes: number) => {
    if (sizeBytes < 1024) {
      return `${sizeBytes} B`;
    }

    if (sizeBytes < 1024 * 1024) {
      return `${(sizeBytes / 1024).toFixed(1)} KB`;
    }

    return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatBackupDate = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }

    return date.toLocaleString('es-ES');
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
      <div className="mb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-metro-red">Ajustes</p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h2 className="text-2xl font-bold text-metro-text">Configuración</h2>
          <ModuleHelpButton
            title="Configuración"
            subtitle="Guía rápida de rutas, estado de base de datos, plantillas y ajustes auxiliares."
            sections={AJUSTES_HELP_SECTIONS}
          />
        </div>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-metro-muted">
          Configura rutas externas necesarias para generar documentos sin almacenar plantillas
          dentro de TrAccion.
        </p>
      </div>

      <div
        id="base-de-datos"
        className="mb-4 scroll-mt-6 rounded-2xl border border-metro-border bg-metro-panel p-4"
      >
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-bold text-metro-text">Base de datos</h3>
            <p className="mt-1 text-sm text-metro-muted">
              SQLite es la base principal. La app mantiene una caché local y una copia de respaldo en este equipo.
              Selecciona una carpeta local o compartida; TrAccion usará dentro el fichero traccion.sqlite sin sobrescribir bases
              existentes.
            </p>
          </div>
          <StatusBadge
            icon={<Database size={14} aria-hidden="true" />}
            title={databaseBadge.title}
            tone={databaseTone(databaseBadge.tone)}
          >
            {databaseBadge.label}
          </StatusBadge>
        </div>

        <div className="grid gap-3 text-sm text-metro-text md:grid-cols-2">
          <div className="rounded-xl border border-metro-border bg-metro-surface p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-metro-muted">
              Ruta activa
            </p>
            <p className="mt-1 break-all font-medium">
              {databaseStatus?.path ?? 'SQLite no inicializado'}
            </p>
          </div>
          <div className="rounded-xl border border-metro-border bg-metro-surface p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-metro-muted">
              Estado
            </p>
            <p className="mt-1 font-medium">{databasePhaseLabel}</p>
            <p className="mt-1 text-xs text-metro-muted">{databaseBadge.detail}</p>
          </div>
        </div>

        {currentDatabaseLock && (
          <>
            <Notice className="mt-3" tone="warning">
              Bloqueo activo de {currentDatabaseLock.username}@{currentDatabaseLock.hostname} · PID{' '}
              {currentDatabaseLock.pid} · {formatLockAge(currentDatabaseLock.updatedAt)}
            </Notice>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                className="inline-flex items-center gap-2 rounded-lg border border-metro-border bg-metro-surface px-3 py-1.5 text-xs font-semibold text-metro-text hover:border-metro-red disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isCheckingDatabaseLock}
                onClick={() => void refreshCurrentDatabaseLock()}
                type="button"
              >
                {isCheckingDatabaseLock ? 'Comprobando...' : 'Comprobar de nuevo'}
              </button>
              <button
                className="inline-flex items-center gap-2 rounded-lg bg-metro-red px-3 py-1.5 text-xs font-semibold text-white hover:bg-metro-dark disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isForcingLockRelease}
                onClick={handleForceReleaseDatabaseLock}
                type="button"
              >
                {isForcingLockRelease ? 'Liberando...' : 'Forzar liberación'}
              </button>
            </div>
          </>
        )}

        {(databaseStatus?.message || databaseActionStatus) && (
          <Notice
            className="mt-3"
            tone={noticeTone(databaseActionStatus || databaseStatus?.message || '')}
          >
            {databaseActionStatus || databaseStatus?.message}
          </Notice>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            className="inline-flex items-center gap-2 rounded-lg bg-metro-red px-3 py-2 text-sm font-semibold text-white hover:bg-metro-dark"
            onClick={handleSelectDatabaseDirectory}
            type="button"
          >
            <Database size={16} />
            Seleccionar ubicación
          </button>
          <button
            className="inline-flex items-center gap-2 rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-sm font-semibold text-metro-text hover:border-metro-red"
            onClick={handleResetDatabaseDirectory}
            type="button"
          >
            <RotateCcw size={16} />
            Restaurar ruta por defecto
          </button>
          <button
            className="inline-flex items-center gap-2 rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-sm font-semibold text-metro-text hover:border-metro-red disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isLoadingBackups}
            onClick={() => void refreshLocalBackups()}
            type="button"
          >
            <Database size={16} />
            Actualizar copias
          </button>
          <ActionButton
            variant="save"
            iconOnly={false}
            disabled={isCreatingManualBackup}
            onClick={() => void handleCreateManualBackup()}
            title="Crear una copia de respaldo ahora, sin esperar al guardado automático"
          >
            <Save size={16} />
            {isCreatingManualBackup ? 'Creando copia...' : 'Crear copia ahora'}
          </ActionButton>
        </div>

        <div className="mt-4 rounded-xl border border-metro-border bg-metro-surface p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-metro-muted">
                Copias locales de respaldo
              </p>
              <p className="mt-1 text-xs text-metro-muted">
                Restaurar una copia crea antes un backup de la base activa y recarga TrAccion para aplicar los datos.
              </p>
              <p className="mt-1 text-xs text-metro-muted">
                Cada copia guarda tanto la base SQLite como un JSON de emergencia. El JSON solo debe usarse si la base SQLite no es recuperable; no sustituye al backup SQLite.
              </p>
            </div>
            <span className="text-xs font-semibold text-metro-muted">
              {isLoadingBackups ? 'Cargando…' : `${localBackups.length} copias`}
            </span>
          </div>

          {localBackups.length === 0 ? (
            <p className="text-xs text-metro-muted">No hay copias locales disponibles todavía.</p>
          ) : (
            <div className="max-h-64 space-y-2 overflow-auto pr-1">
              {localBackups.map((backup) => (
                <div
                  className="grid gap-2 rounded-lg border border-metro-border bg-metro-panel p-2 text-xs text-metro-text md:grid-cols-[minmax(0,1fr)_auto]"
                  key={backup.id}
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{backup.fileName}</p>
                    <p className="mt-1 text-metro-muted">
                      {backup.kind.toUpperCase()} · {formatBackupSize(backup.sizeBytes)} ·{' '}
                      {formatBackupDate(backup.createdAt)}
                      {backup.isLiveCopy ? ' · copia viva' : ''}
                    </p>
                  </div>
                  <button
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-xs font-semibold text-metro-text hover:border-metro-red disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={isRestoringBackup}
                    onClick={() => void handleRestoreLocalBackup(backup)}
                    type="button"
                  >
                    <RotateCcw size={14} />
                    Restaurar
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-4 rounded-xl border border-metro-border bg-metro-surface p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-metro-muted">
            Carpeta de respaldo secundario
          </p>
          <p className="mt-1 text-xs text-metro-muted">
            TrAccion copiará los respaldos automáticos también a esta carpeta (red, USB u otro equipo).
            Protege frente a pérdida del equipo principal.
          </p>
          {secondaryBackupPath ? (
            <p className="mt-2 break-all text-xs font-medium text-metro-text">
              {secondaryBackupPath}
            </p>
          ) : (
            <p className="mt-2 text-xs text-metro-muted">Sin carpeta secundaria configurada.</p>
          )}
          {secondaryBackupStatus && (
            <p className="mt-1 text-xs text-metro-success">{secondaryBackupStatus}</p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              className="inline-flex items-center gap-2 rounded-lg bg-metro-red px-3 py-2 text-xs font-semibold text-white hover:bg-metro-dark"
              onClick={() => void handleSetSecondaryBackupDirectory()}
              type="button"
            >
              <Database size={14} />
              {secondaryBackupPath ? 'Cambiar carpeta' : 'Seleccionar carpeta'}
            </button>
            {secondaryBackupPath && (
              <button
                className="inline-flex items-center gap-2 rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-xs font-semibold text-metro-text hover:border-metro-red"
                onClick={() => void handleClearSecondaryBackupDirectory()}
                type="button"
              >
                <RotateCcw size={14} />
                Eliminar
              </button>
            )}
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-metro-border bg-metro-surface p-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-metro-muted">
                Copia diaria local
              </p>
              <p className="mt-1 max-w-xl text-xs text-metro-muted">
                Mantiene en este equipo un archivo fijo por día de la semana (se sobrescribe cada
                vez), independiente de las copias en la carpeta de red. Útil si la carpeta
                compartida deja de estar disponible o se corrompe.
              </p>
            </div>
            <ActionButton
              variant={dailyBackupSettings?.enabled === false ? 'secondary' : 'save'}
              iconOnly={false}
              onClick={() => void handleToggleDailyBackupEnabled()}
            >
              {dailyBackupSettings?.enabled === false ? 'Desactivada' : 'Activada'}
            </ActionButton>
          </div>

          <div className="mt-3 flex flex-wrap items-end gap-3">
            <FieldLabel className="w-32">
              Días a conservar
              <Select
                disabled={dailyBackupSettings?.enabled === false}
                onChange={(event) => void handleChangeDailyBackupRetentionDays(Number(event.target.value))}
                value={dailyBackupSettings?.retentionDays ?? 7}
              >
                {[1, 2, 3, 4, 5, 6, 7].map((days) => (
                  <option key={days} value={days}>
                    {days} día{days === 1 ? '' : 's'}
                  </option>
                ))}
              </Select>
            </FieldLabel>
          </div>

          {dailyBackupSettings?.directoryPath ? (
            <p className="mt-3 break-all text-xs font-medium text-metro-text">
              {dailyBackupSettings.directoryPath}
            </p>
          ) : (
            <p className="mt-3 text-xs text-metro-muted">
              Usando la ubicación por defecto de la aplicación.
            </p>
          )}
          {dailyBackupStatus && (
            <p className="mt-1 text-xs text-metro-success">{dailyBackupStatus}</p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              className="inline-flex items-center gap-2 rounded-lg bg-metro-red px-3 py-2 text-xs font-semibold text-white hover:bg-metro-dark"
              onClick={() => void handleSetDailyBackupDirectory()}
              type="button"
            >
              <Database size={14} />
              {dailyBackupSettings?.directoryPath ? 'Cambiar carpeta' : 'Elegir otra carpeta'}
            </button>
            {dailyBackupSettings?.directoryPath && (
              <button
                className="inline-flex items-center gap-2 rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-xs font-semibold text-metro-text hover:border-metro-red"
                onClick={() => void handleClearDailyBackupDirectory()}
                type="button"
              >
                <RotateCcw size={14} />
                Restaurar por defecto
              </button>
            )}
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-metro-border bg-metro-surface p-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-metro-muted">
                Compactar base de datos
              </p>
              <p className="mt-1 max-w-xl text-xs text-metro-muted">
                Libera en disco el espacio de filas ya borradas (p. ej. tras podar copias internas
                antiguas). Se ejecuta automáticamente como máximo una vez por semana al cerrar
                TrAccion. Puede tardar varios segundos y bloquea brevemente la escritura para el
                resto de equipos.
              </p>
            </div>
            <ActionButton
              variant="save"
              iconOnly={false}
              disabled={isVacuuming}
              onClick={() => void handleVacuumNow()}
            >
              {isVacuuming ? 'Compactando...' : 'Compactar ahora'}
            </ActionButton>
          </div>

          <div className="mt-3 grid gap-2 text-xs text-metro-muted sm:grid-cols-2">
            <p>
              Tamaño actual:{' '}
              <span className="font-semibold text-metro-text">
                {vacuumStatus?.currentSizeBytes != null
                  ? formatBytesAsMb(vacuumStatus.currentSizeBytes)
                  : '—'}
              </span>
            </p>
            <p>
              Última compactación:{' '}
              <span className="font-semibold text-metro-text">
                {vacuumStatus?.lastVacuumAt
                  ? new Date(vacuumStatus.lastVacuumAt).toLocaleString('es-ES')
                  : 'Nunca'}
              </span>
            </p>
          </div>

          {vacuumStatus?.heaviestTables && vacuumStatus.heaviestTables.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-metro-muted">
                Tablas más pesadas
              </p>
              <div className="mt-2 overflow-hidden rounded-lg border border-metro-border">
                <table className="w-full text-xs">
                  <thead className="bg-metro-panel text-metro-muted">
                    <tr>
                      <th className="px-2 py-1 text-left font-semibold">Tabla</th>
                      <th className="px-2 py-1 text-right font-semibold">Filas</th>
                      <th className="px-2 py-1 text-right font-semibold">Tamaño</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vacuumStatus.heaviestTables.map((entry) => (
                      <tr className="border-t border-metro-border" key={entry.table}>
                        <td className="px-2 py-1 font-mono text-metro-text">{entry.table}</td>
                        <td className="px-2 py-1 text-right text-metro-text">
                          {entry.rowCount.toLocaleString('es-ES')}
                        </td>
                        <td className="px-2 py-1 text-right text-metro-text">
                          {entry.isExactSize ? formatBytesAsMb(entry.sizeBytes) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!vacuumStatus.heaviestTables[0]?.isExactSize && (
                <p className="mt-1 text-[11px] text-metro-muted">
                  Tamaño no disponible en este equipo; ordenado por número de filas.
                </p>
              )}
            </div>
          )}

          {vacuumActionStatus && (
            <p className="mt-2 text-xs text-metro-success">{vacuumActionStatus}</p>
          )}
        </div>
      </div>

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
            onChange={(event) => { void setRutaPlantillaTeletrabajo(event.target.value); }}
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
            Guarda la ruta externa del DOCX usado para generar la concesión en pendientes de firma.
          </p>
        </div>

        <label className="block text-xs font-semibold text-metro-muted">
          Ruta plantilla DOCX
          <input
            className="mt-1 w-full rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-sm font-medium text-metro-text outline-none focus:border-metro-red"
            onChange={(event) => { void setRutaPlantillaLicenciaSinSueldo(event.target.value); }}
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
            Guarda la ruta externa del DOCX usado para generar la solicitud de declaración responsable.
          </p>
        </div>

        <label className="block text-xs font-semibold text-metro-muted">
          Ruta plantilla DOCX
          <input
            className="mt-1 w-full rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-sm font-medium text-metro-text outline-none focus:border-metro-red"
            onChange={(event) => { void setRutaPlantillaVinculograma(event.target.value); }}
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
            <Notice tone={noticeTone(vinculogramaTemplateStatus)}>{vinculogramaTemplateStatus}</Notice>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-metro-border bg-metro-panel p-4">
        <div className="mb-4">
          <h3 className="text-base font-bold text-metro-text">Fases de tareas</h3>
          <p className="mt-1 text-sm text-metro-muted">
            Configura las fases usadas en Tareas. Desactivar una fase evita nuevas selecciones, pero
            mantiene el histórico y las tareas existentes.
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
