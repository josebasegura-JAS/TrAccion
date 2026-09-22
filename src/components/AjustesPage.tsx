import { FolderOpen, Plus, Save, Settings2 } from 'lucide-react';
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
      </div>
    </div>
  );

  return (
    <section className="space-y-4">
      <div className="rounded-3xl border border-metro-border bg-metro-surface p-5 shadow-card">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-metro-red">Ajustes</p>
            <h2 className="mt-1 text-2xl font-bold text-metro-text">Configuración compartida</h2>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-metro-muted">
              Estas rutas se guardan en la SQLite compartida y son comunes para todos los usuarios de TrAccion.
              Al tener todos la unidad de red mapeada de la misma forma, basta con configurarlas una sola vez.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-metro-border bg-metro-panel px-3 py-2 text-xs font-semibold text-metro-muted">
            <Settings2 size={15} />
            {routesDirty ? 'Cambios sin guardar' : 'Configuración guardada'}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-metro-border bg-metro-panel p-4">
        <h3 className="text-base font-bold text-metro-text">Plantillas Word</h3>
        <p className="mt-1 text-sm text-metro-muted">Rutas de los DOCX externos usados por los distintos módulos.</p>
        <div className="mt-4 grid gap-3 xl:grid-cols-2">{TEMPLATE_FIELDS.map(renderRouteField)}</div>
      </div>

      <div className="rounded-2xl border border-metro-border bg-metro-panel p-4">
        <h3 className="text-base font-bold text-metro-text">Copias Excel y documentación</h3>
        <p className="mt-1 text-sm text-metro-muted">Carpetas compartidas donde TrAccion mantiene copias automáticas o archiva documentación.</p>
        <div className="mt-4 grid gap-3 xl:grid-cols-2">{EXPORT_FIELDS.map(renderRouteField)}</div>
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-metro-border pt-4">
          <button
            className="inline-flex items-center gap-2 rounded-lg bg-metro-red px-4 py-2 text-sm font-semibold text-white hover:bg-metro-dark disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!routesDirty || savingRoutes}
            onClick={() => void handleSaveRoutes()}
            type="button"
          >
            <Save size={16} />
            {savingRoutes ? 'Guardando…' : 'Guardar rutas compartidas'}
          </button>
          {status && <p className={`text-xs font-semibold ${/no se ha podido|debe ser|conflicto|error/i.test(status) ? 'text-amber-300' : 'text-metro-success'}`}>{status}</p>}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-2xl border border-metro-border bg-metro-panel p-4">
          <h3 className="text-base font-bold text-metro-text">Fases de tareas</h3>
          <p className="mt-1 text-sm text-metro-muted">Desactivar una fase impide nuevas selecciones, pero conserva el histórico.</p>
          <div className="my-3 flex flex-col gap-2 sm:flex-row">
            <input
              className="min-w-0 flex-1 rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-sm font-medium text-metro-text outline-none focus:border-metro-red"
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
              <div className="grid gap-2 rounded-xl border border-metro-border bg-metro-surface p-2 sm:grid-cols-[minmax(0,1fr)_auto]" key={phase.id}>
                <input
                  className="rounded-lg border border-metro-border bg-metro-panel px-3 py-2 text-sm font-medium text-metro-text outline-none focus:border-metro-red"
                  onChange={(event) => updateTaskPhase(phase.id, event.target.value)}
                  type="text"
                  value={phase.nombre}
                />
                <button className="rounded-lg border border-metro-border bg-metro-panel px-3 py-2 text-sm font-semibold text-metro-text hover:border-metro-red" onClick={() => toggleTaskPhase(phase.id)} type="button">
                  {phase.active ? 'Desactivar' : 'Activar'}
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-metro-border bg-metro-panel p-4">
          <h3 className="text-base font-bold text-metro-text">Orígenes de tareas</h3>
          <p className="mt-1 text-sm text-metro-muted">Sindicatos, áreas de empresa u otros orígenes disponibles en el detalle de una tarea.</p>
          <div className="my-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_130px_auto]">
            <input
              className="rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-sm font-medium text-metro-text outline-none focus:border-metro-red"
              onChange={(event) => setNewOriginName(event.target.value)}
              placeholder="Nuevo origen"
              type="text"
              value={newOriginName}
            />
            <select className="rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-sm font-medium text-metro-text" onChange={(event) => setNewOriginType(event.target.value as TaskOriginConfig['tipo'])} value={newOriginType}>
              <option value="empresa">Empresa</option>
              <option value="sindicato">Sindicato</option>
              <option value="otro">Otro</option>
            </select>
            <button className="inline-flex items-center justify-center gap-2 rounded-lg bg-metro-red px-3 py-2 text-sm font-semibold text-white hover:bg-metro-dark disabled:opacity-50" disabled={!newOriginName.trim()} onClick={handleAddOrigin} type="button">
              <Plus size={16} /> Añadir
            </button>
          </div>
          <div className="space-y-2">
            {taskOrigins.filter((origin) => !origin.deletedAt).map((origin) => (
              <div className="grid gap-2 rounded-xl border border-metro-border bg-metro-surface p-2 sm:grid-cols-[minmax(0,1fr)_120px_auto_auto]" key={origin.id}>
                <input className="rounded-lg border border-metro-border bg-metro-panel px-3 py-2 text-sm font-medium text-metro-text outline-none focus:border-metro-red" onChange={(event) => updateTaskOrigin(origin.id, event.target.value, origin.tipo)} type="text" value={origin.nombre} />
                <select className="rounded-lg border border-metro-border bg-metro-panel px-2 py-2 text-xs font-semibold text-metro-text" onChange={(event) => updateTaskOrigin(origin.id, origin.nombre, event.target.value as TaskOriginConfig['tipo'])} value={origin.tipo}>
                  <option value="empresa">Empresa</option>
                  <option value="sindicato">Sindicato</option>
                  <option value="otro">Otro</option>
                </select>
                <button className="rounded-lg border border-metro-border bg-metro-panel px-3 py-2 text-xs font-semibold text-metro-text hover:border-metro-red" onClick={() => toggleTaskOrigin(origin.id)} type="button">{origin.active ? 'Desactivar' : 'Activar'}</button>
                <button className="rounded-lg border border-metro-border bg-metro-panel px-3 py-2 text-xs font-semibold text-metro-muted hover:border-metro-red hover:text-metro-text" onClick={() => deleteTaskOrigin(origin.id)} type="button">Eliminar</button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
