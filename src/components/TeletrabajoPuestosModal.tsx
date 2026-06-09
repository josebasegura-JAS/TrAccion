import { FileUp, Plus, Search, Trash2, X } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import {
  EMPTY_TELETRABAJO_PUESTO_DRAFT,
  type TeletrabajoPuestoDraft,
} from '../features/teletrabajo/domain/puestosTeletrabajo';
import { useTeletrabajoStore } from '../features/teletrabajo/store/useTeletrabajoStore';

interface TeletrabajoPuestosModalProps {
  onClose: () => void;
}

export function TeletrabajoPuestosModal({ onClose }: TeletrabajoPuestosModalProps) {
  const {
    createPuestoTeletrabajo,
    importPuestosTeletrabajo,
    puestosTeletrabajo,
    removePuestoTeletrabajo,
  } = useTeletrabajoStore();
  const [search, setSearch] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [draft, setDraft] = useState<TeletrabajoPuestoDraft>(EMPTY_TELETRABAJO_PUESTO_DRAFT);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const visiblePuestos = useMemo(
    () => puestosTeletrabajo.filter((puesto) => !puesto.deletedAt),
    [puestosTeletrabajo],
  );

  const filteredPuestos = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    if (!normalizedSearch) {
      return visiblePuestos;
    }

    return visiblePuestos.filter((puesto) =>
      `${puesto.puesto} ${puesto.maxSolicitudes} ${puesto.observaciones}`
        .toLowerCase()
        .includes(normalizedSearch),
    );
  }, [search, visiblePuestos]);

  const updateDraft = <K extends keyof TeletrabajoPuestoDraft>(
    key: K,
    value: TeletrabajoPuestoDraft[K],
  ) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const handleCreate = () => {
    const puesto = draft.puesto.trim();
    if (!puesto) {
      setError('Indica el puesto antes de guardar.');
      setStatus('');
      return;
    }

    createPuestoTeletrabajo({ ...draft, puesto });
    setDraft(EMPTY_TELETRABAJO_PUESTO_DRAFT);
    setIsCreating(false);
    setError('');
    setStatus('Puesto teletrabajable añadido.');
  };

  const handleImport = async (file: File) => {
    try {
      setError('');
      const count = await importPuestosTeletrabajo(file);
      setStatus(`Importación completada: ${count} puestos procesados.`);
    } catch (importError) {
      setStatus('');
      setError(
        importError instanceof Error
          ? importError.message
          : 'No se pudo importar el fichero de puestos.',
      );
    }
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
              Importa o mantén los puestos organizativos teletrabajables y su presencialidad mínima.
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
              onClick={() => fileInputRef.current?.click()}
              type="button"
            >
              <FileUp size={16} /> Importar puestos
            </button>
            <button
              className="inline-flex items-center gap-2 rounded-xl bg-metro-red px-3 py-2 text-sm font-semibold text-white hover:bg-metro-dark"
              onClick={() => setIsCreating((current) => !current)}
              type="button"
            >
              <Plus size={16} /> Añadir puesto
            </button>
          </div>
        </div>

        {(isCreating || status || error) && (
          <div className="space-y-3 border-b border-metro-border p-4">
            {isCreating && (
              <div className="grid gap-2 rounded-xl border border-metro-border bg-metro-panel p-3 lg:grid-cols-[minmax(240px,1fr)_120px_minmax(220px,1fr)_auto] lg:items-end">
                <label className="text-xs font-semibold uppercase tracking-wide text-metro-muted">
                  Puesto
                  <input
                    className="mt-1 w-full rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-sm text-metro-text outline-none focus:border-metro-red"
                    onChange={(event) => updateDraft('puesto', event.target.value)}
                    placeholder="Ej. Técnico/a"
                    type="text"
                    value={draft.puesto}
                  />
                </label>
                <label className="text-xs font-semibold uppercase tracking-wide text-metro-muted">
                  Presencialidad mínima
                  <input
                    className="mt-1 w-full rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-sm text-metro-text outline-none focus:border-metro-red"
                    min={0}
                    onChange={(event) => updateDraft('maxSolicitudes', Number(event.target.value))}
                    type="number"
                    value={draft.maxSolicitudes}
                  />
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
                  onClick={handleCreate}
                  type="button"
                >
                  Guardar
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
                  <th className="px-3 py-2">Observaciones</th>
                  <th className="w-24 px-3 py-2 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-metro-border">
                {filteredPuestos.map((puesto) => (
                  <tr key={puesto.id} className="text-metro-text">
                    <td className="px-3 py-2 font-semibold">{puesto.puesto}</td>
                    <td className="px-3 py-2 text-metro-muted">{puesto.maxSolicitudes || '—'}</td>
                    <td className="px-3 py-2 text-metro-muted">{puesto.observaciones || '—'}</td>
                    <td className="px-3 py-2 text-right">
                      <button
                        aria-label={`Eliminar ${puesto.puesto}`}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-metro-border bg-metro-surface text-metro-muted hover:border-metro-red hover:text-metro-red"
                        onClick={() => removePuestoTeletrabajo(puesto.id)}
                        title="Eliminar puesto"
                        type="button"
                      >
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
                {filteredPuestos.length === 0 && (
                  <tr>
                    <td className="px-3 py-8 text-center text-sm text-metro-muted" colSpan={4}>
                      No hay puestos teletrabajables para los criterios indicados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
