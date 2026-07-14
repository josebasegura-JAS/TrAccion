import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  EMPTY_GRUPO_COBERTURA_DRAFT,
  type GrupoCobertura,
  type GrupoCoberturaDraft,
} from '../features/teletrabajo/domain/gruposCobertura';
import { useTeletrabajoStore } from '../features/teletrabajo/store/useTeletrabajoStore';
import { ModalShell } from './ui/ModalShell';
import { ModalCloseButton } from './ui/ModalCloseButton';

interface TeletrabajoGruposCoberturaModalProps {
  onClose: () => void;
}

function compareTextEs(first: string, second: string): number {
  return first.localeCompare(second, 'es', { numeric: true, sensitivity: 'base' });
}

function compareByPuesto(first: { puesto: string }, second: { puesto: string }): number {
  return compareTextEs(first.puesto, second.puesto);
}

function compareByNombre(first: { nombre: string }, second: { nombre: string }): number {
  return compareTextEs(first.nombre, second.nombre);
}

export function TeletrabajoGruposCoberturaModal({ onClose }: TeletrabajoGruposCoberturaModalProps) {
  const {
    createGrupoCobertura,
    gruposCobertura,
    puestosTeletrabajo,
    removeGrupoCobertura,
    setPuestoGrupoCobertura,
    updateGrupoCobertura,
  } = useTeletrabajoStore();

  const [isCreating, setIsCreating] = useState(false);
  const [editingGrupoId, setEditingGrupoId] = useState<string | null>(null);
  const [draft, setDraft] = useState<GrupoCoberturaDraft>(EMPTY_GRUPO_COBERTURA_DRAFT);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [expandedGrupoId, setExpandedGrupoId] = useState<string | null>(null);

  const visibleGrupos = useMemo(
    () =>
      gruposCobertura
        .filter((grupo) => !grupo.deletedAt)
        .sort(compareByNombre),
    [gruposCobertura],
  );

  const visiblePuestos = useMemo(
    () => puestosTeletrabajo.filter((puesto) => !puesto.deletedAt).sort(compareByPuesto),
    [puestosTeletrabajo],
  );

  const puestosCountByGrupoId = useMemo(() => {
    const counts = new Map<string, number>();
    visiblePuestos.forEach((puesto) => {
      if (puesto.grupoCoberturaId) {
        counts.set(puesto.grupoCoberturaId, (counts.get(puesto.grupoCoberturaId) ?? 0) + 1);
      }
    });
    return counts;
  }, [visiblePuestos]);

  const updateDraft = <K extends keyof GrupoCoberturaDraft>(
    key: K,
    value: GrupoCoberturaDraft[K],
  ) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const startCreate = () => {
    setEditingGrupoId(null);
    setDraft(EMPTY_GRUPO_COBERTURA_DRAFT);
    setIsCreating((current) => !current);
    setError('');
    setStatus('');
  };

  const startEdit = (grupo: GrupoCobertura) => {
    setIsCreating(false);
    setEditingGrupoId(grupo.id);
    setDraft({ nombre: grupo.nombre, presencialidadMinima: grupo.presencialidadMinima });
    setError('');
    setStatus('');
  };

  const cancelEdit = () => {
    setEditingGrupoId(null);
    setIsCreating(false);
    setDraft(EMPTY_GRUPO_COBERTURA_DRAFT);
    setError('');
  };

  const handleSave = async () => {
    const nombre = draft.nombre.trim();
    if (!nombre) {
      setError('Indica un nombre para el grupo (por ejemplo, el área o turno coordinado).');
      setStatus('');
      return;
    }

    const duplicate = visibleGrupos.find(
      (existing) =>
        existing.id !== editingGrupoId &&
        existing.nombre.trim().toLowerCase() === nombre.toLowerCase(),
    );
    if (duplicate) {
      setError('Ya existe otro grupo de cobertura con ese mismo nombre.');
      setStatus('');
      return;
    }

    if (editingGrupoId) {
      const result = await updateGrupoCobertura(editingGrupoId, { ...draft, nombre });
      if (!result.ok) {
        setError(result.message);
        setStatus('');
        return;
      }
      setStatus('Grupo de cobertura actualizado.');
    } else {
      const result = await createGrupoCobertura({ ...draft, nombre });
      if (!result.ok) {
        setError(result.message);
        setStatus('');
        return;
      }
      if (result.recordId) {
        setExpandedGrupoId(result.recordId);
      }
      setStatus('Grupo de cobertura creado. Selecciona ahora qué puestos lo forman.');
    }

    setEditingGrupoId(null);
    setIsCreating(false);
    setDraft(EMPTY_GRUPO_COBERTURA_DRAFT);
    setError('');
  };

  const handleRemove = async (grupo: GrupoCobertura) => {
    const result = await removeGrupoCobertura(grupo.id);
    if (!result.ok) {
      setError(result.message);
      setStatus('');
      return;
    }
    if (expandedGrupoId === grupo.id) {
      setExpandedGrupoId(null);
    }
    setStatus(`Grupo «${grupo.nombre}» eliminado. Sus puestos pasan a cobertura individual.`);
    setError('');
  };

  const togglePuestoEnGrupo = async (puestoId: string, grupoId: string, isChecked: boolean) => {
    const result = await setPuestoGrupoCobertura(puestoId, isChecked ? grupoId : null);
    if (!result.ok) {
      setError(result.message);
      setStatus('');
    }
  };

  return (
    <ModalShell
      labelledBy="grupos-cobertura-modal-title"
      maxWidthClassName="max-w-3xl"
      onClose={onClose}
      stacked
    >
      <header className="flex items-start justify-between gap-3 border-b border-metro-border p-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-metro-red">
            Teletrabajo
          </p>
          <h3 className="text-xl font-bold text-metro-text" id="grupos-cobertura-modal-title">
            Grupos de cobertura
          </h3>
            <p className="mt-1 text-sm text-metro-muted">
              Agrupa puestos que van coordinados (comparten presencialidad mínima): las
              solicitudes de cualquiera de esos puestos competirán juntas por el mismo mínimo.
            </p>
          </div>
          <ModalCloseButton label="Cerrar grupos de cobertura" onClick={onClose} />
        </header>

        <div className="flex justify-end border-b border-metro-border p-4">
          <button
            className="inline-flex items-center gap-2 rounded-xl bg-metro-red px-3 py-2 text-sm font-semibold text-white hover:bg-metro-dark"
            onClick={startCreate}
            type="button"
          >
            <Plus size={16} /> Nuevo grupo
          </button>
        </div>

        {(isCreating || editingGrupoId || status || error) && (
          <div className="space-y-3 border-b border-metro-border p-4">
            {(isCreating || editingGrupoId) && (
              <div className="grid gap-2 rounded-xl border border-metro-border bg-metro-panel p-3 sm:grid-cols-[minmax(200px,1fr)_160px_auto_auto] sm:items-end">
                <label className="text-xs font-semibold uppercase tracking-wide text-metro-muted">
                  Nombre del grupo
                  <input
                    autoFocus
                    className="mt-1 w-full rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-sm text-metro-text outline-none focus:border-metro-red"
                    onChange={(event) => updateDraft('nombre', event.target.value)}
                    placeholder="Ej. Recepción turno mañana"
                    type="text"
                    value={draft.nombre}
                  />
                </label>
                <label className="text-xs font-semibold uppercase tracking-wide text-metro-muted">
                  Presencialidad mínima
                  <input
                    className="mt-1 w-full rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-sm text-metro-text outline-none focus:border-metro-red"
                    min={0}
                    onChange={(event) => updateDraft('presencialidadMinima', Number(event.target.value))}
                    type="number"
                    value={draft.presencialidadMinima}
                  />
                </label>
                <button
                  className="rounded-xl bg-metro-red px-4 py-2 text-sm font-semibold text-white hover:bg-metro-dark"
                  onClick={() => void handleSave()}
                  type="button"
                >
                  {editingGrupoId ? 'Guardar cambios' : 'Crear grupo'}
                </button>
                <button
                  className="rounded-xl border border-metro-border bg-metro-surface px-4 py-2 text-sm font-semibold text-metro-text hover:border-metro-red"
                  onClick={cancelEdit}
                  type="button"
                >
                  Cancelar
                </button>
              </div>
            )}
            {status && (
              <div className="rounded-xl border border-metro-success/30 bg-metro-success/10 px-3 py-2 text-sm font-semibold text-emerald-200">
                {status}
              </div>
            )}
            {error && (
              <div className="rounded-xl border border-metro-red/40 bg-metro-red/10 px-3 py-2 text-sm font-semibold text-red-200">
                {error}
              </div>
            )}
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {visibleGrupos.length === 0 ? (
            <p className="rounded-xl border border-dashed border-metro-border p-6 text-center text-sm text-metro-muted">
              No hay grupos de cobertura todavía. Crea uno para agrupar puestos que vayan coordinados.
            </p>
          ) : (
            <div className="space-y-3">
              {visibleGrupos.map((grupo) => {
                const isExpanded = expandedGrupoId === grupo.id;
                const puestosDelGrupo = puestosCountByGrupoId.get(grupo.id) ?? 0;

                return (
                  <div key={grupo.id} className="overflow-hidden rounded-xl border border-metro-border">
                    <button
                      className="flex w-full items-center justify-between gap-3 bg-metro-panel px-3 py-2.5 text-left hover:bg-metro-panel/80"
                      onClick={() => setExpandedGrupoId(isExpanded ? null : grupo.id)}
                      type="button"
                    >
                      <div>
                        <p className="text-sm font-semibold text-metro-text">{grupo.nombre}</p>
                        <p className="text-xs text-metro-muted">
                          Presencialidad mínima: {grupo.presencialidadMinima} · {puestosDelGrupo}{' '}
                          {puestosDelGrupo === 1 ? 'puesto asignado' : 'puestos asignados'}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-metro-border bg-metro-surface text-metro-muted hover:border-metro-red hover:text-metro-text"
                          onClick={(event) => {
                            event.stopPropagation();
                            startEdit(grupo);
                          }}
                          role="button"
                          tabIndex={0}
                          title="Editar grupo"
                        >
                          <Pencil size={15} />
                        </span>
                        <span
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-metro-border bg-metro-surface text-metro-muted hover:border-metro-red hover:text-metro-red"
                          onClick={(event) => {
                            event.stopPropagation();
                            void handleRemove(grupo);
                          }}
                          role="button"
                          tabIndex={0}
                          title="Eliminar grupo"
                        >
                          <Trash2 size={15} />
                        </span>
                      </div>
                    </button>
                    {isExpanded && (
                      <div className="border-t border-metro-border p-3">
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-metro-muted">
                          Puestos en este grupo
                        </p>
                        {visiblePuestos.length === 0 ? (
                          <p className="text-sm text-metro-muted">
                            Todavía no hay puestos teletrabajables dados de alta.
                          </p>
                        ) : (
                          <div className="grid gap-1.5 sm:grid-cols-2">
                            {visiblePuestos.map((puesto) => {
                              const isInThisGroup = puesto.grupoCoberturaId === grupo.id;
                              const isInOtherGroup =
                                Boolean(puesto.grupoCoberturaId) && !isInThisGroup;
                              return (
                                <label
                                  key={puesto.id}
                                  className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm ${
                                    isInThisGroup
                                      ? 'border-metro-red/40 bg-metro-red/5 text-metro-text'
                                      : 'border-metro-border text-metro-muted'
                                  }`}
                                >
                                  <input
                                    checked={isInThisGroup}
                                    onChange={(event) =>
                                      void togglePuestoEnGrupo(puesto.id, grupo.id, event.target.checked)
                                    }
                                    type="checkbox"
                                  />
                                  <span className="truncate">{puesto.puesto}</span>
                                  {isInOtherGroup && (
                                    <span className="ml-auto shrink-0 text-xs text-amber-300">
                                      (en otro grupo)
                                    </span>
                                  )}
                                </label>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
    </ModalShell>
  );
}
