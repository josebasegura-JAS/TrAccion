import { AlertTriangle, FileUp, Pencil, Plus, Search, Trash2, Users, X } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { useEmployeeStore } from '../features/plantilla/store/useEmployeeStore';
import { normalizeJobPosition } from '../features/plantilla/domain/jobPositionTranslation';
import { buildGruposCoberturaByIdMap } from '../features/teletrabajo/domain/gruposCobertura';
import {
  EMPTY_TELETRABAJO_PUESTO_DRAFT,
  importTeletrabajoPuestosFromFile,
  normalizeTeletrabajoPuesto,
  type TeletrabajoPuesto,
  type TeletrabajoPuestoDraft,
  type TeletrabajoPuestoImportRow,
} from '../features/teletrabajo/domain/puestosTeletrabajo';
import { useTeletrabajoStore } from '../features/teletrabajo/store/useTeletrabajoStore';
import { readStorageItem, writeStorageItem } from '../services/persistence';
import { TeletrabajoGruposCoberturaModal } from './TeletrabajoGruposCoberturaModal';

interface TeletrabajoPuestosModalProps {
  onClose: () => void;
}

interface PendingImportResolution {
  rows: TeletrabajoPuestoImportRow[];
  unknownPuestos: string[];
  mapping: Record<string, string>;
}

const TELETRABAJO_PUESTOS_ALIASES_STORAGE_KEY = 'traccion.v1.teletrabajo.puestos.translationAliases';
const SIN_GRUPO_VALUE = '';

function readStoredAliases(): Record<string, string> {
  try {
    const stored = readStorageItem(TELETRABAJO_PUESTOS_ALIASES_STORAGE_KEY);
    if (!stored) {
      return {};
    }

    const parsed: unknown = JSON.parse(stored);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }

    return Object.entries(parsed).reduce<Record<string, string>>((aliases, [key, value]) => {
      if (typeof value === 'string' && value.trim()) {
        aliases[key] = value;
      }
      return aliases;
    }, {});
  } catch {
    return {};
  }
}

function persistStoredAliases(aliases: Record<string, string>): void {
  writeStorageItem(TELETRABAJO_PUESTOS_ALIASES_STORAGE_KEY, JSON.stringify(aliases));
}

export function TeletrabajoPuestosModal({ onClose }: TeletrabajoPuestosModalProps) {
  const {
    createPuestoTeletrabajo,
    gruposCobertura,
    importPuestosTeletrabajoDrafts,
    puestosTeletrabajo,
    removePuestoTeletrabajo,
    updatePuestoTeletrabajo,
  } = useTeletrabajoStore();
  const jobPositionTranslations = useEmployeeStore((state) => state.jobPositionTranslations);
  const [search, setSearch] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [editingPuestoId, setEditingPuestoId] = useState<string | null>(null);
  const [draft, setDraft] = useState<TeletrabajoPuestoDraft>(EMPTY_TELETRABAJO_PUESTO_DRAFT);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [pendingImport, setPendingImport] = useState<PendingImportResolution | null>(null);
  const [isGruposModalOpen, setIsGruposModalOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const masterPuestos = useMemo(
    () =>
      Array.from(
        new Map(
          jobPositionTranslations
            .map((translation) => translation.puestoCastellano.trim())
            .filter(Boolean)
            .map((puesto): [string, string] => [normalizeJobPosition(puesto), puesto]),
        ).values(),
      ).sort((first, second) => first.localeCompare(second, 'es', { numeric: true, sensitivity: 'base' })),
    [jobPositionTranslations],
  );

  const masterPuestosByKey = useMemo(
    () => new Map(masterPuestos.map((puesto): [string, string] => [normalizeJobPosition(puesto), puesto])),
    [masterPuestos],
  );

  const visibleGruposCobertura = useMemo(
    () => gruposCobertura.filter((grupo) => !grupo.deletedAt),
    [gruposCobertura],
  );

  const gruposById = useMemo(() => buildGruposCoberturaByIdMap(gruposCobertura), [gruposCobertura]);

  const visiblePuestos = useMemo(
    () => puestosTeletrabajo.filter((puesto) => !puesto.deletedAt),
    [puestosTeletrabajo],
  );

  const filteredPuestos = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    if (!normalizedSearch) {
      return visiblePuestos;
    }

    return visiblePuestos.filter((puesto) => {
      const nombreGrupo = puesto.grupoCoberturaId
        ? gruposById.get(puesto.grupoCoberturaId)?.nombre ?? ''
        : '';
      return `${puesto.puesto} ${puesto.maxSolicitudes} ${puesto.dotacionComputable} ${nombreGrupo} ${puesto.observaciones}`
        .toLowerCase()
        .includes(normalizedSearch);
    });
  }, [search, visiblePuestos, gruposById]);

  const updateDraft = <K extends keyof TeletrabajoPuestoDraft>(
    key: K,
    value: TeletrabajoPuestoDraft[K],
  ) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const handleCreate = async () => {
    const puesto = draft.puesto.trim();
    if (!puesto) {
      setError('Indica el puesto antes de guardar.');
      setStatus('');
      return;
    }

    if (masterPuestos.length > 0 && !masterPuestosByKey.has(normalizeJobPosition(puesto))) {
      setError('El puesto indicado no existe en la tabla de Traducción de puestos. Selecciona un puesto válido de esa tabla.');
      setStatus('');
      return;
    }

    const result = await createPuestoTeletrabajo({ ...draft, puesto });
    if (!result.ok) {
      setError(result.message);
      setStatus('');
      return;
    }

    setDraft(EMPTY_TELETRABAJO_PUESTO_DRAFT);
    setIsCreating(false);
    setError('');
    setStatus('Puesto teletrabajable añadido.');
  };

  const handleStartEdit = (puesto: TeletrabajoPuesto) => {
    setIsCreating(false);
    setEditingPuestoId(puesto.id);
    setDraft({
      puesto: puesto.puesto,
      maxSolicitudes: puesto.maxSolicitudes,
      dotacionComputable: puesto.dotacionComputable,
      grupoCoberturaId: puesto.grupoCoberturaId,
      observaciones: puesto.observaciones,
    });
    setError('');
    setStatus('');
  };

  const handleCancelEdit = () => {
    setEditingPuestoId(null);
    setDraft(EMPTY_TELETRABAJO_PUESTO_DRAFT);
    setError('');
  };

  const handleUpdate = async () => {
    if (!editingPuestoId) {
      return;
    }

    const puesto = draft.puesto.trim();
    if (!puesto) {
      setError('Indica el puesto antes de guardar.');
      setStatus('');
      return;
    }

    if (masterPuestos.length > 0 && !masterPuestosByKey.has(normalizeJobPosition(puesto))) {
      setError('El puesto indicado no existe en la tabla de Traducción de puestos. Selecciona un puesto válido de esa tabla.');
      setStatus('');
      return;
    }

    const duplicate = puestosTeletrabajo.find(
      (existing) =>
        existing.id !== editingPuestoId &&
        !existing.deletedAt &&
        normalizeTeletrabajoPuesto(existing.puesto) === normalizeTeletrabajoPuesto(puesto),
    );
    if (duplicate) {
      setError('Ya existe otro puesto teletrabajable con ese mismo nombre.');
      setStatus('');
      return;
    }

    const result = await updatePuestoTeletrabajo(editingPuestoId, { ...draft, puesto });
    if (!result.ok) {
      setError(result.message);
      setStatus('');
      return;
    }

    setEditingPuestoId(null);
    setDraft(EMPTY_TELETRABAJO_PUESTO_DRAFT);
    setError('');
    setStatus('Puesto teletrabajable actualizado.');
  };

  const handleRemove = async (puesto: TeletrabajoPuesto) => {
    const result = await removePuestoTeletrabajo(puesto.id);
    if (!result.ok) {
      setError(result.message);
      setStatus('');
      return;
    }
    setError('');
    setStatus(`Puesto «${puesto.puesto}» eliminado.`);
  };

  const applyResolvedImport = (rows: readonly TeletrabajoPuestoImportRow[]) => {
    const count = importPuestosTeletrabajoDrafts(rows);
    setPendingImport(null);
    setError('');
    setStatus(`Importación completada: ${count} puestos procesados.`);
  };

  const handleImport = async (file: File) => {
    try {
      setError('');
      setStatus('');
      setPendingImport(null);

      if (masterPuestos.length === 0) {
        throw new Error('Antes de importar puestos teletrabajables debes importar la tabla de Traducción de puestos.');
      }

      const rows = await importTeletrabajoPuestosFromFile(file);
      const aliases = readStoredAliases();
      const mapping: Record<string, string> = {};
      const unknownByKey = new Map<string, string>();

      rows.forEach((row) => {
        const original = row.draft.puesto.trim();
        const key = normalizeTeletrabajoPuesto(original);
        if (!original || masterPuestosByKey.has(normalizeJobPosition(original))) {
          return;
        }

        const alias = aliases[key];
        if (alias && masterPuestosByKey.has(normalizeJobPosition(alias))) {
          mapping[key] = alias;
          return;
        }

        unknownByKey.set(key, original);
      });

      if (unknownByKey.size === 0) {
        applyResolvedImport(
          rows.map((row) => {
            const alias = mapping[normalizeTeletrabajoPuesto(row.draft.puesto)];
            return alias ? { ...row, draft: { ...row.draft, puesto: alias } } : row;
          }),
        );
        return;
      }

      setPendingImport({
        rows,
        unknownPuestos: Array.from(unknownByKey.values()).sort((first, second) =>
          first.localeCompare(second, 'es', { numeric: true, sensitivity: 'base' }),
        ),
        mapping,
      });
      setError('');
      setStatus('');
    } catch (importError) {
      setStatus('');
      setPendingImport(null);
      setError(
        importError instanceof Error
          ? importError.message
          : 'No se pudo importar el fichero de puestos.',
      );
    }
  };

  const handleResolvePendingImport = () => {
    if (!pendingImport) {
      return;
    }

    const missing = pendingImport.unknownPuestos.filter((puesto) => {
      const selected = pendingImport.mapping[normalizeTeletrabajoPuesto(puesto)] ?? '';
      return !selected.trim();
    });

    if (missing.length > 0) {
      setError('Asigna un puesto válido a todos los puestos no reconocidos antes de continuar.');
      setStatus('');
      return;
    }

    const aliases = readStoredAliases();
    const resolvedRows = pendingImport.rows.map((row) => {
      const key = normalizeTeletrabajoPuesto(row.draft.puesto);
      const resolved = pendingImport.mapping[key] ?? row.draft.puesto;
      if (resolved !== row.draft.puesto && masterPuestosByKey.has(normalizeJobPosition(resolved))) {
        aliases[key] = resolved;
      }
      return { ...row, draft: { ...row.draft, puesto: resolved } };
    });

    persistStoredAliases(aliases);
    applyResolvedImport(resolvedRows);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
      <section className="flex max-h-[88vh] w-full max-w-5xl flex-col rounded-2xl border border-metro-border bg-metro-surface shadow-card">
        <header className="flex items-start justify-between gap-3 border-b border-metro-border p-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-metro-red">
              Teletrabajo
            </p>
            <h3 className="text-xl font-bold text-metro-text">Puestos Teletrabajo</h3>
            <p className="mt-1 text-sm text-metro-muted">
              Importa o mantén los puestos organizativos teletrabajables usando Traducción de puestos como tabla maestra.
              Si varios puestos van coordinados (comparten presencialidad mínima), asígnales el mismo Grupo de cobertura.
            </p>
          </div>
          <button
            aria-label="Cerrar puestos teletrabajo"
            className="rounded-xl border border-metro-border bg-metro-panel p-2 text-metro-muted hover:border-metro-red hover:text-metro-text"
            onClick={onClose}
            type="button"
          >
            <X size={18} />
          </button>
        </header>

        <div className="grid gap-3 border-b border-metro-border p-4 lg:grid-cols-[minmax(220px,1fr)_auto] lg:items-center">
          <label className="flex items-center gap-2 rounded-xl border border-metro-border bg-metro-panel px-3 py-2 text-sm text-metro-muted">
            <Search size={16} />
            <input
              className="w-full bg-transparent text-metro-text outline-none placeholder:text-metro-muted"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar puesto..."
              type="search"
              value={search}
            />
          </label>
          <div className="flex flex-wrap justify-end gap-2">
            <input
              accept=".xlsx,.xls,.csv,.tsv,.txt"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  void handleImport(file);
                }
                event.target.value = '';
              }}
              ref={fileInputRef}
              type="file"
            />
            <button
              className="inline-flex items-center gap-2 rounded-xl border border-metro-border bg-metro-panel px-3 py-2 text-sm font-semibold text-metro-text hover:border-metro-red"
              onClick={() => setIsGruposModalOpen(true)}
              type="button"
            >
              <Users size={16} /> Grupos de cobertura
            </button>
            <button
              className="inline-flex items-center gap-2 rounded-xl border border-metro-border bg-metro-panel px-3 py-2 text-sm font-semibold text-metro-text hover:border-metro-red disabled:cursor-not-allowed disabled:opacity-60"
              disabled={masterPuestos.length === 0}
              onClick={() => fileInputRef.current?.click()}
              title={masterPuestos.length === 0 ? 'Importa primero la tabla de Traducción de puestos en Plantilla.' : 'Importar puestos'}
              type="button"
            >
              <FileUp size={16} /> Importar puestos
            </button>
            <button
              className="inline-flex items-center gap-2 rounded-xl bg-metro-red px-3 py-2 text-sm font-semibold text-white hover:bg-metro-dark"
              onClick={() => {
                setEditingPuestoId(null);
                setDraft(EMPTY_TELETRABAJO_PUESTO_DRAFT);
                setIsCreating((current) => !current);
              }}
              type="button"
            >
              <Plus size={16} /> Añadir puesto
            </button>
          </div>
        </div>

        {(isCreating || editingPuestoId || status || error || pendingImport) && (
          <div className="space-y-3 border-b border-metro-border p-4">
            {(isCreating || editingPuestoId) && (
              <div className="grid gap-2 rounded-xl border border-metro-border bg-metro-panel p-3 lg:grid-cols-[minmax(220px,1fr)_110px_110px_minmax(160px,0.9fr)_minmax(180px,1fr)_auto_auto] lg:items-end">
                <label className="text-xs font-semibold uppercase tracking-wide text-metro-muted">
                  Puesto
                  <select
                    className="mt-1 w-full rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-sm text-metro-text outline-none focus:border-metro-red"
                    onChange={(event) => updateDraft('puesto', event.target.value)}
                    value={draft.puesto}
                  >
                    <option value="">Selecciona puesto...</option>
                    {masterPuestos.map((puesto) => (
                      <option key={puesto} value={puesto}>{puesto}</option>
                    ))}
                  </select>
                </label>
                <label className="text-xs font-semibold uppercase tracking-wide text-metro-muted">
                  Presencialidad mínima
                  <input
                    className="mt-1 w-full rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-sm text-metro-text outline-none focus:border-metro-red disabled:opacity-50"
                    disabled={Boolean(draft.grupoCoberturaId)}
                    min={0}
                    onChange={(event) => updateDraft('maxSolicitudes', Number(event.target.value))}
                    title={
                      draft.grupoCoberturaId
                        ? 'Este puesto pertenece a un grupo de cobertura: la presencialidad mínima se gestiona en el grupo.'
                        : undefined
                    }
                    type="number"
                    value={draft.maxSolicitudes}
                  />
                </label>
                <label className="text-xs font-semibold uppercase tracking-wide text-metro-muted">
                  Dotación computable
                  <input
                    className="mt-1 w-full rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-sm text-metro-text outline-none focus:border-metro-red"
                    min={0}
                    onChange={(event) => updateDraft('dotacionComputable', Number(event.target.value))}
                    type="number"
                    value={draft.dotacionComputable}
                  />
                </label>
                <label className="text-xs font-semibold uppercase tracking-wide text-metro-muted">
                  Grupo cobertura
                  <select
                    className="mt-1 w-full rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-sm text-metro-text outline-none focus:border-metro-red"
                    onChange={(event) =>
                      updateDraft('grupoCoberturaId', event.target.value === SIN_GRUPO_VALUE ? null : event.target.value)
                    }
                    value={draft.grupoCoberturaId ?? SIN_GRUPO_VALUE}
                  >
                    <option value={SIN_GRUPO_VALUE}>Sin grupo (cobertura individual)</option>
                    {visibleGruposCobertura.map((grupo) => (
                      <option key={grupo.id} value={grupo.id}>
                        {grupo.nombre} (mín. {grupo.presencialidadMinima})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs font-semibold uppercase tracking-wide text-metro-muted">
                  Observaciones
                  <input
                    className="mt-1 w-full rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-sm text-metro-text outline-none focus:border-metro-red"
                    onChange={(event) => updateDraft('observaciones', event.target.value)}
                    placeholder="Opcional"
                    type="text"
                    value={draft.observaciones}
                  />
                </label>
                <button
                  className="rounded-xl bg-metro-red px-4 py-2 text-sm font-semibold text-white hover:bg-metro-dark"
                  onClick={() => void (editingPuestoId ? handleUpdate() : handleCreate())}
                  type="button"
                >
                  {editingPuestoId ? 'Guardar cambios' : 'Guardar'}
                </button>
                {editingPuestoId && (
                  <button
                    className="rounded-xl border border-metro-border bg-metro-surface px-4 py-2 text-sm font-semibold text-metro-text hover:border-metro-red"
                    onClick={handleCancelEdit}
                    type="button"
                  >
                    Cancelar
                  </button>
                )}
              </div>
            )}
            {pendingImport && (
              <div className="rounded-xl border border-amber-400/40 bg-amber-400/10 p-3 text-sm text-amber-100">
                <div className="mb-3 flex items-start gap-2 font-semibold">
                  <AlertTriangle size={18} className="mt-0.5 shrink-0" />
                  <div>
                    Se han encontrado {pendingImport.unknownPuestos.length} puestos que no existen en Traducción de puestos.
                    Asigna cada puesto importado al Puesto correcto de la tabla maestra.
                  </div>
                </div>
                <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                  {pendingImport.unknownPuestos.map((puesto) => {
                    const key = normalizeTeletrabajoPuesto(puesto);
                    return (
                      <div key={key} className="grid gap-2 rounded-lg border border-amber-400/20 bg-metro-surface/80 p-2 lg:grid-cols-[minmax(220px,1fr)_minmax(260px,1.2fr)] lg:items-center">
                        <div>
                          <p className="text-xs uppercase tracking-wide text-amber-200/80">Puesto importado</p>
                          <p className="font-semibold text-metro-text">{puesto}</p>
                        </div>
                        <label className="text-xs font-semibold uppercase tracking-wide text-amber-200/80">
                          Puesto válido
                          <select
                            className="mt-1 w-full rounded-lg border border-metro-border bg-metro-panel px-3 py-2 text-sm text-metro-text outline-none focus:border-metro-red"
                            onChange={(event) =>
                              setPendingImport((current) => current
                                ? { ...current, mapping: { ...current.mapping, [key]: event.target.value } }
                                : current)
                            }
                            value={pendingImport.mapping[key] ?? ''}
                          >
                            <option value="">Selecciona puesto...</option>
                            {masterPuestos.map((candidate) => (
                              <option key={candidate} value={candidate}>{candidate}</option>
                            ))}
                          </select>
                        </label>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-3 flex flex-wrap justify-end gap-2">
                  <button
                    className="rounded-xl border border-metro-border bg-metro-panel px-3 py-2 text-sm font-semibold text-metro-text hover:border-metro-red"
                    onClick={() => setPendingImport(null)}
                    type="button"
                  >
                    Cancelar importación
                  </button>
                  <button
                    className="rounded-xl bg-metro-red px-3 py-2 text-sm font-semibold text-white hover:bg-metro-dark"
                    onClick={handleResolvePendingImport}
                    type="button"
                  >
                    Confirmar e importar
                  </button>
                </div>
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
          <div className="overflow-hidden rounded-xl border border-metro-border">
            <div className="flex items-center justify-between border-b border-metro-border bg-metro-panel px-3 py-2 text-sm font-semibold text-metro-text">
              <span>Puestos organizativos con posibilidad de teletrabajo</span>
              <span className="rounded-full bg-metro-red/10 px-3 py-1 text-xs font-bold text-red-200">
                {filteredPuestos.length} registros
              </span>
            </div>
            <table className="w-full border-collapse text-sm">
              <thead className="bg-metro-surface text-left text-xs uppercase tracking-wide text-metro-muted">
                <tr>
                  <th className="px-3 py-2">Puesto</th>
                  <th className="w-44 px-3 py-2">Presencialidad mínima</th>
                  <th className="w-40 px-3 py-2">Dotación computable</th>
                  <th className="w-44 px-3 py-2">Grupo cobertura</th>
                  <th className="px-3 py-2">Observaciones</th>
                  <th className="w-24 px-3 py-2 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-metro-border">
                {filteredPuestos.map((puesto) => {
                  const grupo = puesto.grupoCoberturaId ? gruposById.get(puesto.grupoCoberturaId) : null;
                  return (
                    <tr
                      key={puesto.id}
                      className={
                        puesto.id === editingPuestoId
                          ? 'bg-metro-red/5 text-metro-text'
                          : 'text-metro-text'
                      }
                    >
                      <td className="px-3 py-2 font-semibold">{puesto.puesto}</td>
                      <td className="px-3 py-2 text-metro-muted">
                        {grupo ? `${grupo.presencialidadMinima} (grupo)` : puesto.maxSolicitudes || '—'}
                      </td>
                      <td className="px-3 py-2 text-metro-muted">{puesto.dotacionComputable || '—'}</td>
                      <td className="px-3 py-2 text-metro-muted">{grupo?.nombre ?? '—'}</td>
                      <td className="px-3 py-2 text-metro-muted">{puesto.observaciones || '—'}</td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            aria-label={`Editar ${puesto.puesto}`}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-metro-border bg-metro-surface text-metro-muted hover:border-metro-red hover:text-metro-text"
                            onClick={() => handleStartEdit(puesto)}
                            title="Editar puesto"
                            type="button"
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            aria-label={`Eliminar ${puesto.puesto}`}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-metro-border bg-metro-surface text-metro-muted hover:border-metro-red hover:text-metro-red"
                            onClick={() => void handleRemove(puesto)}
                            title="Eliminar puesto"
                            type="button"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filteredPuestos.length === 0 && (
                  <tr>
                    <td className="px-3 py-8 text-center text-sm text-metro-muted" colSpan={6}>
                      No hay puestos teletrabajables para los criterios indicados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {isGruposModalOpen && (
        <TeletrabajoGruposCoberturaModal onClose={() => setIsGruposModalOpen(false)} />
      )}
    </div>
  );
}
