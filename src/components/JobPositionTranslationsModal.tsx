import {
  FileUp,
  Languages,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { DataTable, type DataTableColumn } from '../shared/table/DataTable';
import { sortDataTableRows } from '../shared/table/tableSorting';
import {
  useTableViewPreferences,
  type TableViewPreferences,
} from '../shared/table/useTableViewPreferences';
import { useEmployeeStore } from '../features/plantilla/store/useEmployeeStore';
import { isJobPositionTranslationPending } from '../features/plantilla/domain/jobPositionTranslation';

interface JobPositionTranslationsModalProps {
  onClose: () => void;
}

type JobPositionTranslation = ReturnType<
  typeof useEmployeeStore.getState
>['jobPositionTranslations'][number];
type JobPositionTranslationColumnId = 'puestoCastellano' | 'puestoEuskera' | 'acciones';
type TranslationEditorMode = 'create' | 'edit';
const JOB_POSITION_TRANSLATIONS_TABLE_STORAGE_KEY =
  'traccion.tableView.plantilla.jobPositionTranslations';
const jobPositionTranslationColumnIds: readonly JobPositionTranslationColumnId[] = [
  'puestoCastellano',
  'puestoEuskera',
  'acciones',
];
const defaultJobPositionTranslationTablePreferences: TableViewPreferences<JobPositionTranslationColumnId> =
  {
    sort: null,
    columnWidths: {},
    columnOrder: null,
  };
const EMPTY_TRANSLATION_DRAFT: JobPositionTranslation = {
  puestoCastellano: '',
  puestoEuskera: '',
};

export function JobPositionTranslationsModal({ onClose }: JobPositionTranslationsModalProps) {
  const {
    jobPositionTranslations,
    importJobPositionTranslations,
    createJobPositionTranslation,
    updateJobPositionTranslation,
    updateEmptyEmployeeJobPositionTranslations,
    syncMissingJobPositionTranslationsFromEmployees,
  } = useEmployeeStore();
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [editorMode, setEditorMode] = useState<TranslationEditorMode>('create');
  const [editingPuestoCastellano, setEditingPuestoCastellano] = useState<string | null>(null);
  const [draft, setDraft] = useState<JobPositionTranslation>(EMPTY_TRANSLATION_DRAFT);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Al abrir el modal, da de alta como pendientes (sin traducción) los
  // puestoOrganizativo de Plantilla que todavía no existan aquí. Solo una
  // vez por apertura del modal, no en cada render.
  useEffect(() => {
    void (async () => {
      try {
        const { created, createdPuestos } = await syncMissingJobPositionTranslationsFromEmployees();
        if (created > 0) {
          setError('');
          setMessage(
            `Se ${created === 1 ? 'ha' : 'han'} añadido ${created} puesto${created === 1 ? '' : 's'} pendiente${created === 1 ? '' : 's'} de traducción: ${createdPuestos.join(', ')}.`,
          );
        }
      } catch (syncError) {
        setMessage('');
        setError(
          syncError instanceof Error
            ? syncError.message
            : 'No se pudieron sincronizar los puestos pendientes desde Plantilla.',
        );
      }
    })();
  }, [syncMissingJobPositionTranslationsFromEmployees]);

  const resetEditor = () => {
    setEditorMode('create');
    setEditingPuestoCastellano(null);
    setDraft(EMPTY_TRANSLATION_DRAFT);
  };

  const startEdit = (translation: JobPositionTranslation) => {
    setEditorMode('edit');
    setEditingPuestoCastellano(translation.puestoCastellano);
    setDraft({
      puestoCastellano: translation.puestoCastellano,
      puestoEuskera: translation.puestoEuskera,
    });
    setMessage('');
    setError('');
  };

  const saveDraft = async () => {
    const result =
      editorMode === 'edit' && editingPuestoCastellano
        ? await updateJobPositionTranslation(editingPuestoCastellano, draft)
        : await createJobPositionTranslation(draft);

    if (!result.ok) {
      setMessage('');
      setError(result.message);
      return;
    }

    setError('');
    setMessage(result.message);
    resetEditor();
  };

  const filteredTranslations = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    if (!normalizedSearch) {
      return jobPositionTranslations;
    }

    return jobPositionTranslations.filter((translation) => {
      const haystack = `${translation.puestoCastellano} ${translation.puestoEuskera}`.toLowerCase();
      return haystack.includes(normalizedSearch);
    });
  }, [jobPositionTranslations, search]);

  const {
    preferences,
    setSort,
    setColumnWidth,
    setColumnOrder,
    resetColumnWidths,
    resetPreferences,
  } = useTableViewPreferences<JobPositionTranslationColumnId>({
    storageKey: JOB_POSITION_TRANSLATIONS_TABLE_STORAGE_KEY,
    defaultPreferences: defaultJobPositionTranslationTablePreferences,
    validColumnIds: jobPositionTranslationColumnIds,
  });

  const translationColumns = useMemo<
    Array<DataTableColumn<JobPositionTranslation, JobPositionTranslationColumnId>>
  >(
    () => [
      {
        id: 'puestoCastellano',
        header: 'Puesto',
        accessor: (translation) => translation.puestoCastellano,
        render: (translation) => translation.puestoCastellano,
        width: 360,
        minWidth: 180,
        maxWidth: 640,
        sortable: true,
        className: 'font-semibold text-metro-text',
      },
      {
        id: 'puestoEuskera',
        header: 'Lanpostua',
        accessor: (translation) => translation.puestoEuskera,
        render: (translation) =>
          isJobPositionTranslationPending(translation) ? (
            <span className="font-semibold text-red-300">Sin traducción</span>
          ) : (
            translation.puestoEuskera
          ),
        width: 360,
        minWidth: 180,
        maxWidth: 640,
        sortable: true,
        className: 'text-metro-muted',
      },
      {
        id: 'acciones',
        header: 'Acciones',
        render: (translation) => (
          <button
            className="inline-flex items-center gap-1 rounded-lg border border-metro-border bg-metro-panel px-2.5 py-1 text-xs font-semibold text-metro-text hover:border-metro-red"
            onClick={(event) => {
              event.stopPropagation();
              startEdit(translation);
            }}
            type="button"
          >
            <Pencil size={13} /> Editar
          </button>
        ),
        width: 120,
        minWidth: 100,
        maxWidth: 160,
        isActionColumn: true,
        reorderable: false,
      },
    ],
    [],
  );

  const sortedTranslations = useMemo(
    () => sortDataTableRows(filteredTranslations, translationColumns, preferences.sort),
    [filteredTranslations, preferences.sort, translationColumns],
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
      <section className="flex max-h-[88vh] w-full max-w-5xl flex-col rounded-2xl border border-metro-border bg-metro-surface shadow-card">
        <header className="flex items-start justify-between gap-3 border-b border-metro-border p-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-metro-red">
              Plantilla
            </p>
            <h3 className="flex items-center gap-2 text-xl font-bold text-metro-text">
              <Languages size={20} className="text-metro-red" /> Traducción de puestos
            </h3>
            <p className="mt-1 text-sm text-metro-muted">
              Crea, edita, importa y consulta la equivalencia entre el puesto en castellano y su
              traducción en euskera.
            </p>
          </div>
          <button
            aria-label="Cerrar traducción de puestos"
            className="rounded-xl border border-metro-border bg-metro-panel p-2 text-metro-muted hover:border-metro-red hover:text-metro-text"
            onClick={onClose}
            type="button"
          >
            <X size={18} />
          </button>
        </header>

        <div className="grid gap-3 border-b border-metro-border p-4 xl:grid-cols-[minmax(220px,1fr)_auto] xl:items-center">
          <label className="flex items-center gap-2 rounded-xl border border-metro-border bg-metro-panel px-3 py-2 text-sm text-metro-muted">
            <Search size={16} />
            <input
              className="w-full bg-transparent text-metro-text outline-none placeholder:text-metro-muted"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por puesto o traducción..."
              type="search"
              value={search}
            />
          </label>
          <div className="flex flex-wrap justify-end gap-2">
            <input
              accept=".xlsx"
              className="hidden"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) {
                  return;
                }

                try {
                  setError('');
                  const importedCount = await importJobPositionTranslations(file);
                  resetEditor();
                  setMessage(`Importación completada: ${importedCount} puestos importados.`);
                } catch (importError) {
                  setMessage('');
                  setError(
                    importError instanceof Error
                      ? importError.message
                      : 'No se pudo importar la Excel.',
                  );
                } finally {
                  event.target.value = '';
                }
              }}
              ref={fileInputRef}
              type="file"
            />
            <button
              className="inline-flex items-center gap-2 rounded-xl border border-metro-border bg-metro-panel px-3 py-2 text-sm font-semibold text-metro-text hover:border-metro-red"
              onClick={() => {
                void (async () => {
                  try {
                    const { updated, missing } = await updateEmptyEmployeeJobPositionTranslations();
                    setError('');
                    setMessage(
                      `Puestos EUS actualizados: ${updated}. Sin traducción encontrada: ${missing}.`,
                    );
                  } catch (error) {
                    setMessage('');
                    setError(
                      error instanceof Error
                        ? error.message
                        : 'No se pudieron actualizar los puestos EUS.',
                    );
                  }
                })();
              }}
              type="button"
            >
              <RefreshCw size={16} /> Actualizar plantilla
            </button>
            <button
              className="inline-flex items-center gap-2 rounded-xl bg-metro-red px-3 py-2 text-sm font-semibold text-white hover:bg-metro-dark"
              onClick={() => fileInputRef.current?.click()}
              type="button"
            >
              <FileUp size={16} /> Importar Excel
            </button>
          </div>
        </div>

        <div className="grid gap-3 border-b border-metro-border bg-metro-panel/45 p-4 lg:grid-cols-[minmax(220px,1fr)_minmax(220px,1fr)_auto] lg:items-end">
          <label className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-metro-muted">
            Puesto
            <input
              className="rounded-xl border border-metro-border bg-metro-surface px-3 py-2 text-sm font-semibold normal-case tracking-normal text-metro-text outline-none focus:border-metro-red"
              onChange={(event) =>
                setDraft((current) => ({ ...current, puestoCastellano: event.target.value }))
              }
              placeholder="Nombre del puesto"
              type="text"
              value={draft.puestoCastellano}
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-metro-muted">
            Traducción
            <input
              className="rounded-xl border border-metro-border bg-metro-surface px-3 py-2 text-sm font-semibold normal-case tracking-normal text-metro-text outline-none focus:border-metro-red"
              onChange={(event) =>
                setDraft((current) => ({ ...current, puestoEuskera: event.target.value }))
              }
              placeholder="Traducción en euskera"
              type="text"
              value={draft.puestoEuskera}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              className="inline-flex items-center gap-2 rounded-xl bg-metro-red px-3 py-2 text-sm font-semibold text-white hover:bg-metro-dark"
              onClick={() => void saveDraft()}
              type="button"
            >
              {editorMode === 'edit' ? <Save size={16} /> : <Plus size={16} />}
              {editorMode === 'edit' ? 'Guardar cambios' : 'Crear puesto'}
            </button>
            {editorMode === 'edit' && (
              <button
                className="inline-flex items-center gap-2 rounded-xl border border-metro-border bg-metro-surface px-3 py-2 text-sm font-semibold text-metro-text hover:border-metro-red"
                onClick={resetEditor}
                type="button"
              >
                Cancelar
              </button>
            )}
          </div>
        </div>

        {(message || error) && (
          <div className="px-4 pt-3">
            {message && (
              <div className="rounded-xl border border-metro-success/30 bg-metro-success/10 px-3 py-2 text-sm font-semibold text-emerald-200">
                {message}
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
              <span>Equivalencias de puestos</span>
              <span className="rounded-full bg-metro-red/10 px-3 py-1 text-xs font-bold text-red-200">
                {sortedTranslations.length} registros
              </span>
            </div>
            <div className="flex justify-end px-3 py-2">
              <button
                className="inline-flex items-center gap-1 rounded-lg border border-metro-border bg-metro-surface px-2.5 py-1 text-xs font-semibold text-metro-muted hover:border-metro-red hover:text-metro-text"
                onClick={resetPreferences}
                type="button"
              >
                <RotateCcw size={14} /> Restablecer vista
              </button>
            </div>
            <DataTable
              ariaLabel="Traducciones de puestos"
              columnOrder={preferences.columnOrder}
              columnWidths={preferences.columnWidths}
              columns={translationColumns}
              emptyMessage="No hay puestos traducidos importados."
              getRowId={(translation) => translation.puestoCastellano}
              maxHeightClassName="max-h-[46vh]"
              onColumnOrderChange={setColumnOrder}
              onColumnWidthChange={setColumnWidth}
              onResetColumnWidths={resetColumnWidths}
              onRowDoubleClick={startEdit}
              onSortChange={setSort}
              rowClassName={(translation) =>
                isJobPositionTranslationPending(translation) ? 'bg-red-500/10' : ''
              }
              rows={sortedTranslations}
              sort={preferences.sort}
            />
          </div>
        </div>
      </section>
    </div>
  );
}
