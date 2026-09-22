import {
  ChevronDown,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  ListTodo,
  Plus,
  RefreshCw,
  Save,
  Settings2,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { isDocxPath } from '../features/configuracion/domain/teletrabajoTemplate';
import { useConfiguracionStore } from '../features/configuracion/store/useConfiguracionStore';
import type { TaskOriginConfig } from '../features/configuracion/domain/taskOrigins';

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
  const addTaskPhase = useConfiguracionStore((state) => state.addTaskPhase);
  const updateTaskPhase = useConfiguracionStore((state) => state.updateTaskPhase);
  const toggleTaskPhase = useConfiguracionStore((state) => state.toggleTaskPhase);
  const addTaskOrigin = useConfiguracionStore((state) => state.addTaskOrigin);
  const updateTaskOrigin = useConfiguracionStore((state) => state.updateTaskOrigin);
  const toggleTaskOrigin = useConfiguracionStore((state) => state.toggleTaskOrigin);
  const deleteTaskOrigin = useConfiguracionStore((state) => state.deleteTaskOrigin);

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

  useEffect(() => {
    load();
  }, [load]);

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
      <div className="rounded-3xl border border-metro-border bg-metro-surface p-5 shadow-card">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-metro-red">Ajustes</p>
            <h2 className="mt-1 text-2xl font-bold text-metro-text">Configuración de TrAccion</h2>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-metro-muted">
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

        <div className="mt-5 border-t border-metro-border pt-4">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-metro-muted">
            Accesos directos
          </p>
          <div className="grid gap-2 sm:grid-cols-3">
            <button
              className="group flex items-center gap-3 rounded-xl border border-metro-border bg-metro-panel p-3 text-left transition hover:border-metro-red"
              onClick={() => openAndScroll('ajustes-plantillas')}
              type="button"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-metro-surface text-metro-red">
                <FileText size={17} />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-bold text-metro-text">Plantillas Word</span>
                <span className="block text-xs text-metro-muted">{TEMPLATE_FIELDS.length} rutas DOCX</span>
              </span>
            </button>

            <button
              className="group flex items-center gap-3 rounded-xl border border-metro-border bg-metro-panel p-3 text-left transition hover:border-metro-red"
              onClick={() => openAndScroll('ajustes-exportaciones')}
              type="button"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-metro-surface text-metro-red">
                <FileSpreadsheet size={17} />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-bold text-metro-text">Copias y documentación</span>
                <span className="block text-xs text-metro-muted">{EXPORT_FIELDS.length} carpetas compartidas</span>
              </span>
            </button>

            <button
              className="group flex items-center gap-3 rounded-xl border border-metro-border bg-metro-panel p-3 text-left transition hover:border-metro-red"
              onClick={() => openAndScroll('ajustes-tareas')}
              type="button"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-metro-surface text-metro-red">
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
        className="group scroll-mt-4 overflow-hidden rounded-2xl border border-metro-border bg-metro-panel"
        id="ajustes-plantillas"
        open
      >
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-metro-surface text-metro-red">
              <FileText size={17} />
            </span>
            <div>
              <h3 className="text-base font-bold text-metro-text">Plantillas Word</h3>
              <p className="mt-0.5 text-xs text-metro-muted">
                Documentos DOCX externos usados para generar escritos desde TrAccion.
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
        className="group scroll-mt-4 overflow-hidden rounded-2xl border border-metro-border bg-metro-panel"
        id="ajustes-exportaciones"
        open
      >
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-metro-surface text-metro-red">
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
        className="group scroll-mt-4 overflow-hidden rounded-2xl border border-metro-border bg-metro-panel"
        id="ajustes-tareas"
        open
      >
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-metro-surface text-metro-red">
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

        <div className="grid gap-4 border-t border-metro-border p-4 xl:grid-cols-2">
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
