import { FolderOpen, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { isDocxPath } from '../features/configuracion/domain/teletrabajoTemplate';
import { useConfiguracionStore } from '../features/configuracion/store/useConfiguracionStore';

export function AjustesPage() {
  const rutaPlantillaTeletrabajo = useConfiguracionStore((state) => state.rutaPlantillaTeletrabajo);
  const taskPhases = useConfiguracionStore((state) => state.taskPhases);
  const addTaskPhase = useConfiguracionStore((state) => state.addTaskPhase);
  const updateTaskPhase = useConfiguracionStore((state) => state.updateTaskPhase);
  const toggleTaskPhase = useConfiguracionStore((state) => state.toggleTaskPhase);
  const load = useConfiguracionStore((state) => state.load);
  const setRutaPlantillaTeletrabajo = useConfiguracionStore(
    (state) => state.setRutaPlantillaTeletrabajo,
  );
  const [status, setStatus] = useState('');
  const [newTaskPhase, setNewTaskPhase] = useState('');

  useEffect(() => {
    load();
  }, [load]);

  const handleAddTaskPhase = () => {
    addTaskPhase(newTaskPhase);
    setNewTaskPhase('');
  };

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

  return (
    <section className="rounded-3xl border border-metro-border bg-metro-surface p-5 shadow-card">
      <div className="mb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-metro-red">Ajustes</p>
        <h2 className="mt-1 text-2xl font-bold text-metro-text">Configuración</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-metro-muted">
          Configura rutas externas necesarias para generar documentos sin almacenar plantillas
          dentro de TrAccion.
        </p>
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
  );
}
