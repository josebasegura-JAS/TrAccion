import { Database, FolderOpen, Plus, RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { isDocxPath } from '../features/configuracion/domain/teletrabajoTemplate';
import { publishDatabaseStatus, useDatabaseStatus } from '../services/databaseStatus';
import { buildDatabaseStatusBadge, databaseStatusBadgeClassName } from '../services/databaseStatusView';
import { useAppDialog } from '../hooks/useAppDialog';
import { useConfiguracionStore } from '../features/configuracion/store/useConfiguracionStore';

export function AjustesPage() {
  const rutaPlantillaTeletrabajo = useConfiguracionStore((state) => state.rutaPlantillaTeletrabajo);
  const rutaPlantillaLicenciaSinSueldo = useConfiguracionStore(
    (state) => state.rutaPlantillaLicenciaSinSueldo,
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
  const [status, setStatus] = useState('');
  const [licenciaTemplateStatus, setLicenciaTemplateStatus] = useState('');
  const databaseStatus = useDatabaseStatus();
  const databaseBadge = buildDatabaseStatusBadge(databaseStatus);
  const [databaseActionStatus, setDatabaseActionStatus] = useState('');
  const [localBackups, setLocalBackups] = useState<TraccionLocalBackupEntry[]>([]);
  const [isLoadingBackups, setIsLoadingBackups] = useState(false);
  const [isRestoringBackup, setIsRestoringBackup] = useState(false);
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

    setRutaPlantillaTeletrabajo(selectedPath);
    setStatus('Ruta de plantilla guardada.');
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

    setRutaPlantillaLicenciaSinSueldo(selectedPath);
    setLicenciaTemplateStatus('Ruta de plantilla de licencia sin sueldo guardada.');
  };

  return (
    <>
      <section className="rounded-3xl border border-metro-border bg-metro-surface p-5 shadow-card">
      <div className="mb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-metro-red">Ajustes</p>
        <h2 className="mt-1 text-2xl font-bold text-metro-text">Configuración</h2>
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
          <span
            className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-1 text-xs font-bold ${databaseStatusBadgeClassName(databaseBadge.tone)}`}
            title={databaseBadge.title}
          >
            <Database size={14} />
            {databaseBadge.label}
          </span>
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

        {databaseStatus?.lock && (
          <p className="mt-3 rounded-xl border border-metro-border bg-metro-surface p-3 text-xs text-metro-muted">
            Lock: {databaseStatus.lock.username}@{databaseStatus.lock.hostname} · PID{' '}
            {databaseStatus.lock.pid} · {databaseStatus.lock.updatedAt}
          </p>
        )}

        {(databaseStatus?.message || databaseActionStatus) && (
          <p className="mt-3 text-xs font-semibold text-metro-muted">
            {databaseActionStatus || databaseStatus?.message}
          </p>
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
            </div>
            <span className="text-xs font-semibold text-metro-muted">
              {isLoadingBackups ? 'Cargando...' : `${localBackups.length} copias`}
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
            onChange={(event) => setRutaPlantillaTeletrabajo(event.target.value)}
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
          {status && <p className="text-xs font-semibold text-metro-muted">{status}</p>}
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
            onChange={(event) => setRutaPlantillaLicenciaSinSueldo(event.target.value)}
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
            <p className="text-xs font-semibold text-metro-muted">{licenciaTemplateStatus}</p>
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
