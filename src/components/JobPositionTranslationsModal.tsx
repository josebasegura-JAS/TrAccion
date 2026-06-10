import { FileUp, Languages, RefreshCw, RotateCcw, Search, X } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { DataTable, type DataTableColumn } from '../shared/table/DataTable';
import { sortDataTableRows } from '../shared/table/tableSorting';
import { useTableViewPreferences, type TableViewPreferences } from '../shared/table/useTableViewPreferences';
import { useEmployeeStore } from '../features/plantilla/store/useEmployeeStore';

interface JobPositionTranslationsModalProps {
  onClose: () => void;
}

type JobPositionTranslation = ReturnType<typeof useEmployeeStore.getState>['jobPositionTranslations'][number];
type JobPositionTranslationColumnId = 'puestoCastellano' | 'puestoEuskera';
const JOB_POSITION_TRANSLATIONS_TABLE_STORAGE_KEY = 'traccion.tableView.plantilla.jobPositionTranslations';
const jobPositionTranslationColumnIds: readonly JobPositionTranslationColumnId[] = [
  'puestoCastellano',
  'puestoEuskera',
];
const defaultJobPositionTranslationTablePreferences: TableViewPreferences<JobPositionTranslationColumnId> = {
  sort: null,
  columnWidths: {},
};

export function JobPositionTranslationsModal({ onClose }: JobPositionTranslationsModalProps) {
  const {
    jobPositionTranslations,
    importJobPositionTranslations,
    updateEmptyEmployeeJobPositionTranslations,
  } = useEmployeeStore();
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const { preferences, setSort, setColumnWidth, resetColumnWidths, resetPreferences } =
    useTableViewPreferences<JobPositionTranslationColumnId>({
      storageKey: JOB_POSITION_TRANSLATIONS_TABLE_STORAGE_KEY,
      defaultPreferences: defaultJobPositionTranslationTablePreferences,
      validColumnIds: jobPositionTranslationColumnIds,
    });

  const translationColumns = useMemo<Array<DataTableColumn<JobPositionTranslation, JobPositionTranslationColumnId>>>(
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
        render: (translation) => translation.puestoEuskera,
        width: 360,
        minWidth: 180,
        maxWidth: 640,
        sortable: true,
        className: 'text-metro-muted',
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
              Importa y consulta la equivalencia entre el puesto en castellano y su traducción en
              euskera.
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

        <div className="grid gap-3 border-b border-metro-border p-4 lg:grid-cols-[minmax(220px,1fr)_auto] lg:items-center">
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
                  setMessage(`Importación completada: ${importedCount} puestos importados.`);
                } catch (importError) {
                  setMessage('');
                  setError(importError instanceof Error ? importError.message : 'No se pudo importar la Excel.');
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
                const { updated, missing } = updateEmptyEmployeeJobPositionTranslations();
                setError('');
                setMessage(`Puestos EUS actualizados: ${updated}. Sin traducción encontrada: ${missing}.`);
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

        <div className="min-h-0 flex-1 p-4">
          <div className="overflow-hidden rounded-xl border border-metro-border">
            <div className="flex items-center justify-between border-b border-metro-border bg-metro-panel px-3 py-2 text-sm font-semibold text-metro-text">
              <span>Equivalencias importadas</span>
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
              columnWidths={preferences.columnWidths}
          onResetColumnWidths={resetColumnWidths}
              columns={translationColumns}
              emptyMessage="No hay puestos traducidos importados."
              getRowId={(translation) => translation.puestoCastellano}
              maxHeightClassName="max-h-[52vh]"
              onColumnWidthChange={setColumnWidth}
              onSortChange={setSort}
              rows={sortedTranslations}
              sort={preferences.sort}
            />
          </div>
        </div>
      </section>
    </div>
  );
}
