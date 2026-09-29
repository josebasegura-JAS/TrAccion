import { ChevronDown, ListTodo, Plus, UserRound } from 'lucide-react';
import { useState } from 'react';
import type { TaskOriginConfig } from '../../features/configuracion/domain/taskOrigins';
import { useConfiguracionStore } from '../../features/configuracion/store/useConfiguracionStore';

export function TaskCatalogSettings() {
  const taskPhases = useConfiguracionStore((state) => state.taskPhases);
  const taskStates = useConfiguracionStore((state) => state.taskStates);
  const taskOrigins = useConfiguracionStore((state) => state.taskOrigins);
  const taskResponsibles = useConfiguracionStore((state) => state.taskResponsibles);
  const addTaskState = useConfiguracionStore((state) => state.addTaskState);
  const updateTaskState = useConfiguracionStore((state) => state.updateTaskState);
  const toggleTaskState = useConfiguracionStore((state) => state.toggleTaskState);
  const moveTaskState = useConfiguracionStore((state) => state.moveTaskState);
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

  const [newTaskState, setNewTaskState] = useState('');
  const [newTaskPhase, setNewTaskPhase] = useState('');
  const [newOriginName, setNewOriginName] = useState('');
  const [newOriginType, setNewOriginType] = useState<TaskOriginConfig['tipo']>('empresa');
  const [newResponsibleName, setNewResponsibleName] = useState('');
  const [newResponsibleWindowsUser, setNewResponsibleWindowsUser] = useState('');

  const handleAddTaskState = () => { addTaskState(newTaskState); setNewTaskState(''); };
  const handleAddTaskPhase = () => { addTaskPhase(newTaskPhase); setNewTaskPhase(''); };
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

  return (
    <details className="ui-accordion group scroll-mt-4" id="ajustes-tareas">
      <summary className="ui-accordion__summary">
        <div className="flex min-w-0 items-center gap-3"><span className="ui-shortcut-card__icon"><ListTodo size={17} /></span><div><h3 className="text-base font-bold text-metro-text">Configuración de tareas</h3><p className="mt-0.5 text-xs text-metro-muted">Catálogos utilizados en el alta y seguimiento de tareas.</p></div></div>
        <ChevronDown className="shrink-0 text-metro-muted transition-transform group-open:rotate-180" size={18} />
      </summary>
      <div className="grid gap-4 border-t border-metro-border p-4 xl:grid-cols-2">
        <div className="rounded-xl border border-metro-border bg-metro-surface p-3">
          <div className="mb-3"><h4 className="text-sm font-bold text-metro-text">Estados</h4><p className="mt-1 text-xs leading-5 text-metro-muted">El nombre y el orden son configurables. Pendiente y Cerrada conservan su función interna para proteger el flujo de trabajo.</p></div>
          <div className="mb-3 flex gap-2"><input className="min-w-0 flex-1 rounded-lg border border-metro-border bg-metro-panel px-3 py-2 text-sm font-medium text-metro-text outline-none focus:border-metro-red" onChange={(event) => setNewTaskState(event.target.value)} placeholder="Nuevo estado" type="text" value={newTaskState} /><button className="inline-flex items-center justify-center gap-2 rounded-lg bg-metro-red px-3 py-2 text-sm font-semibold text-white hover:bg-metro-dark disabled:opacity-50" disabled={!newTaskState.trim()} onClick={handleAddTaskState} type="button"><Plus size={16} /> Añadir</button></div>
          <div className="space-y-2">{taskStates.map((taskState, index) => <div className="grid gap-2 rounded-lg border border-metro-border bg-metro-panel p-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]" key={taskState.id}><div><input className="w-full rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-sm font-medium text-metro-text outline-none focus:border-metro-red" onChange={(event) => updateTaskState(taskState.id, event.target.value)} type="text" value={taskState.nombre} />{taskState.protectedRole && <span className="mt-1 block text-[10px] font-semibold uppercase tracking-wide text-metro-muted">{taskState.protectedRole === 'initial' ? 'Estado inicial protegido' : 'Estado de cierre protegido'}</span>}</div><div className="flex gap-1"><button aria-label="Subir estado" className="rounded-lg border border-metro-border bg-metro-surface px-2 py-2 text-xs font-bold text-metro-text disabled:opacity-30" disabled={index === 0} onClick={() => moveTaskState(taskState.id, 'up')} type="button">↑</button><button aria-label="Bajar estado" className="rounded-lg border border-metro-border bg-metro-surface px-2 py-2 text-xs font-bold text-metro-text disabled:opacity-30" disabled={index === taskStates.length - 1} onClick={() => moveTaskState(taskState.id, 'down')} type="button">↓</button></div><button className="rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-xs font-semibold text-metro-text hover:border-metro-red disabled:cursor-not-allowed disabled:opacity-50" disabled={Boolean(taskState.protectedRole)} onClick={() => toggleTaskState(taskState.id)} type="button">{taskState.active ? 'Desactivar' : 'Activar'}</button></div>)}</div>
        </div>
        <div className="rounded-xl border border-metro-border bg-metro-surface p-3">
          <div className="mb-3"><h4 className="flex items-center gap-2 text-sm font-bold text-metro-text"><UserRound size={15} /> Responsables</h4><p className="mt-1 text-xs leading-5 text-metro-muted">El usuario Windows vincula las tareas con «Mis tareas». La asignación nunca limita quién puede editar una tarea.</p></div>
          <div className="mb-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2"><input className="rounded-lg border border-metro-border bg-metro-panel px-3 py-2 text-sm font-medium text-metro-text outline-none focus:border-metro-red" onChange={(e) => setNewResponsibleName(e.target.value)} placeholder="Nombre / identificador" value={newResponsibleName} /><input className="rounded-lg border border-metro-border bg-metro-panel px-3 py-2 text-sm font-medium text-metro-text outline-none focus:border-metro-red" onChange={(e) => setNewResponsibleWindowsUser(e.target.value)} placeholder="Usuario Windows (opcional)" value={newResponsibleWindowsUser} /><button className="inline-flex items-center justify-center gap-2 rounded-lg bg-metro-red px-3 py-2 text-sm font-semibold text-white hover:bg-metro-dark disabled:opacity-50 sm:col-span-2 xl:col-span-1 2xl:col-span-2" disabled={!newResponsibleName.trim()} onClick={handleAddResponsible} type="button"><Plus size={16} /> Añadir responsable</button></div>
          <div className="space-y-2">{taskResponsibles.map((responsible) => <div className="grid gap-2 rounded-lg border border-metro-border bg-metro-panel p-2" key={responsible.id}><div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2"><input className="rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-sm font-medium text-metro-text outline-none focus:border-metro-red" onChange={(e) => updateTaskResponsible(responsible.id, e.target.value, responsible.windowsUser)} value={responsible.nombre} /><input className="rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-xs font-medium text-metro-text outline-none focus:border-metro-red" onChange={(e) => updateTaskResponsible(responsible.id, responsible.nombre, e.target.value)} placeholder="Usuario Windows" value={responsible.windowsUser} /></div><button className="rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-xs font-semibold text-metro-text hover:border-metro-red" onClick={() => toggleTaskResponsible(responsible.id)} type="button">{responsible.active ? 'Desactivar' : 'Activar'}</button></div>)}</div>
        </div>
        <div className="rounded-xl border border-metro-border bg-metro-surface p-3">
          <div className="mb-3"><h4 className="text-sm font-bold text-metro-text">Fases</h4><p className="mt-1 text-xs leading-5 text-metro-muted">Desactivar una fase evita nuevas selecciones, pero conserva el histórico.</p></div>
          <div className="mb-3 flex flex-col gap-2 sm:flex-row"><input className="min-w-0 flex-1 rounded-lg border border-metro-border bg-metro-panel px-3 py-2 text-sm font-medium text-metro-text outline-none focus:border-metro-red" onChange={(e) => setNewTaskPhase(e.target.value)} placeholder="Nueva fase" value={newTaskPhase} /><button className="inline-flex items-center justify-center gap-2 rounded-lg bg-metro-red px-3 py-2 text-sm font-semibold text-white hover:bg-metro-dark disabled:opacity-50" disabled={!newTaskPhase.trim()} onClick={handleAddTaskPhase} type="button"><Plus size={16} /> Añadir</button></div>
          <div className="space-y-2">{taskPhases.map((phase) => <div className="grid gap-2 rounded-lg border border-metro-border bg-metro-panel p-2 sm:grid-cols-[minmax(0,1fr)_auto]" key={phase.id}><input className="rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-sm font-medium text-metro-text outline-none focus:border-metro-red" onChange={(e) => updateTaskPhase(phase.id, e.target.value)} value={phase.nombre} /><button className="rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-sm font-semibold text-metro-text hover:border-metro-red" onClick={() => toggleTaskPhase(phase.id)} type="button">{phase.active ? 'Desactivar' : 'Activar'}</button></div>)}</div>
        </div>
        <div className="rounded-xl border border-metro-border bg-metro-surface p-3">
          <div className="mb-3"><h4 className="text-sm font-bold text-metro-text">Orígenes</h4><p className="mt-1 text-xs leading-5 text-metro-muted">Sindicatos, áreas de empresa u otros orígenes disponibles en una tarea.</p></div>
          <div className="mb-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_125px_auto]"><input className="rounded-lg border border-metro-border bg-metro-panel px-3 py-2 text-sm font-medium text-metro-text outline-none focus:border-metro-red" onChange={(e) => setNewOriginName(e.target.value)} placeholder="Nuevo origen" value={newOriginName} /><select className="rounded-lg border border-metro-border bg-metro-panel px-3 py-2 text-sm font-medium text-metro-text" onChange={(e) => setNewOriginType(e.target.value as TaskOriginConfig['tipo'])} value={newOriginType}><option value="empresa">Empresa</option><option value="sindicato">Sindicato</option><option value="otro">Otro</option></select><button className="inline-flex items-center justify-center gap-2 rounded-lg bg-metro-red px-3 py-2 text-sm font-semibold text-white hover:bg-metro-dark disabled:opacity-50" disabled={!newOriginName.trim()} onClick={handleAddOrigin} type="button"><Plus size={16} /> Añadir</button></div>
          <div className="space-y-2">{taskOrigins.filter((origin) => !origin.deletedAt).map((origin) => <div className="grid gap-2 rounded-lg border border-metro-border bg-metro-panel p-2 sm:grid-cols-[minmax(0,1fr)_115px_auto_auto]" key={origin.id}><input className="rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-sm font-medium text-metro-text outline-none focus:border-metro-red" onChange={(e) => updateTaskOrigin(origin.id, e.target.value, origin.tipo)} value={origin.nombre} /><select className="rounded-lg border border-metro-border bg-metro-surface px-2 py-2 text-xs font-semibold text-metro-text" onChange={(e) => updateTaskOrigin(origin.id, origin.nombre, e.target.value as TaskOriginConfig['tipo'])} value={origin.tipo}><option value="empresa">Empresa</option><option value="sindicato">Sindicato</option><option value="otro">Otro</option></select><button className="rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-xs font-semibold text-metro-text hover:border-metro-red" onClick={() => toggleTaskOrigin(origin.id)} type="button">{origin.active ? 'Desactivar' : 'Activar'}</button><button className="rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-xs font-semibold text-metro-muted hover:border-metro-red hover:text-metro-text" onClick={() => deleteTaskOrigin(origin.id)} type="button">Eliminar</button></div>)}</div>
        </div>
      </div>
    </details>
  );
}
