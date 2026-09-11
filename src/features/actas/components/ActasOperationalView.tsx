import { ArrowLeft, Mail, Settings2 } from 'lucide-react';
import type { Dispatch, SetStateAction } from 'react';
import { ActionButton } from '../../../components/ui/ActionButton';
import { FilterSelect } from '../../../components/ui/FilterSelect';
import { PageHeader } from '../../../components/ui/PageHeader';
import { SearchField } from '../../../components/ui/SearchField';
import { Toolbar } from '../../../components/ui/Toolbar';
import { reorderExportColumns } from '../../../shared/export/reorderExportColumns';
import { ExportPrintButtons } from '../../../shared/print/ExportPrintButtons';
import { DataTable, type DataTableColumn } from '../../../shared/table/DataTable';
import type { TableViewPreferences, TableSortState } from '../../../shared/table/useTableViewPreferences';
import { ACTA_STATES, type Acta } from '../domain/acta';
import { actaExportColumns, type ActaColumnId } from './actasPage.helpers';

type ClosedActasByYear = Array<[string, { count: number; rows: Acta[] }]>;

type Props = {
  closedActasByYear: ClosedActasByYear;
  columns: Array<DataTableColumn<Acta, ActaColumnId>>;
  filterLabel: string | undefined;
  filteredActas: Acta[];
  hasLoadedHistoricalActas: boolean;
  onBack: () => void;
  onColumnOrderChange: (columnOrder: ActaColumnId[]) => void;
  onColumnWidthChange: (columnId: ActaColumnId, width: number) => void;
  onNewActa: () => void;
  onOpenActa: (acta: Acta) => void;
  onOpenOutlookTemplate: () => void;
  onOpenTypeManager: () => void;
  onResetColumnWidths: () => void;
  onSortChange: (sort: TableSortState<ActaColumnId> | null) => void;
  openActas: Acta[];
  openHistoryYears: Record<string, boolean>;
  preferences: TableViewPreferences<ActaColumnId>;
  search: string;
  setOpenHistoryYears: Dispatch<SetStateAction<Record<string, boolean>>>;
  setSearch: (value: string) => void;
  setStateFilter: (value: string) => void;
  setYearFilter: (value: string) => void;
  stateFilter: string;
  yearFilter: string;
  years: string[];
};

export function ActasOperationalView({
  closedActasByYear,
  columns,
  filterLabel,
  filteredActas,
  hasLoadedHistoricalActas,
  onBack,
  onColumnOrderChange,
  onColumnWidthChange,
  onNewActa,
  onOpenActa,
  onOpenOutlookTemplate,
  onOpenTypeManager,
  onResetColumnWidths,
  onSortChange,
  openActas,
  openHistoryYears,
  preferences,
  search,
  setOpenHistoryYears,
  setSearch,
  setStateFilter,
  setYearFilter,
  stateFilter,
  yearFilter,
  years,
}: Props) {
  return (
    <>
      <div className="sticky top-0 z-20 -mx-1 flex items-center border-b border-metro-border/70 bg-metro-app/95 px-1 pb-2 pt-0.5 backdrop-blur">
        <ActionButton
          variant="secondary"
          icon={ArrowLeft}
          iconOnly={false}
          onClick={onBack}
          size="sm"
          title="Volver a la pantalla de seguimiento de Actas"
        >
          Inicio Actas
        </ActionButton>
        <span className="ml-2 text-xs font-semibold text-metro-muted">
          Vista operativa{stateFilter ? ` · ${stateFilter}` : ''}
        </span>
      </div>

      <PageHeader
        title="Actas"
        actions={
          <Toolbar
            className="gap-1.5"
            filters={
              <>
                <SearchField
                  onChange={(event) => setSearch(event.target.value)}
                  onClear={() => setSearch('')}
                  placeholder="Buscar por título, estado, actualización, alegación o ruta..."
                  value={search}
                  wrapperClassName="min-w-[240px] flex-1"
                />
                <FilterSelect
                  allLabel="Todos los estados"
                  aria-label="Filtrar actas por estado"
                  onChange={(event) => setStateFilter(event.target.value)}
                  options={ACTA_STATES}
                  value={stateFilter}
                  wrapperClassName="w-[185px]"
                />
                <FilterSelect
                  allLabel="Todos los años"
                  aria-label="Filtrar actas por año"
                  onChange={(event) => setYearFilter(event.target.value)}
                  options={years.map((year) => ({ label: year, value: year }))}
                  value={yearFilter}
                  wrapperClassName="w-[120px]"
                />
              </>
            }
            actions={
              <>
                <ActionButton
                  variant="secondary"
                  icon={Settings2}
                  iconOnly={false}
                  onClick={onOpenTypeManager}
                  size="sm"
                  title="Gestionar tipos de acta"
                >
                  Nuevo tipo
                </ActionButton>
                <ActionButton
                  variant="secondary"
                  icon={Mail}
                  iconOnly={false}
                  onClick={onOpenOutlookTemplate}
                  size="sm"
                  title="Configurar plantilla Outlook de Actas"
                >
                  Outlook
                </ActionButton>
                <ExportPrintButtons
                  payload={{
                    title: 'Actas',
                    filename: 'actas',
                    columns: reorderExportColumns(actaExportColumns, preferences.columnOrder),
                    rows: filteredActas,
                    filterLabel,
                  }}
                  size="sm"
                />
                <ActionButton
                  iconOnly={false}
                  onClick={onNewActa}
                  size="sm"
                  title="Nueva acta"
                  variant="add"
                >
                  Nueva acta
                </ActionButton>
              </>
            }
          />
        }
      />

      <div className="rounded-xl border border-metro-border bg-metro-panel/40 p-3">
        <h3 className="mb-3 text-sm font-bold text-metro-muted">Actas abiertas</h3>
        <DataTable
          ariaLabel="Actas abiertas"
          columnOrder={preferences.columnOrder}
          columnWidths={preferences.columnWidths}
          onResetColumnWidths={onResetColumnWidths}
          columns={columns}
          emptyMessage="No hay actas abiertas con los filtros actuales."
          getRowId={(acta) => acta.id}
          onColumnOrderChange={onColumnOrderChange}
          onColumnWidthChange={onColumnWidthChange}
          onRowClick={onOpenActa}
          onSortChange={onSortChange}
          rows={openActas}
          sort={preferences.sort}
          maxHeightClassName="max-h-none"
        />
      </div>

      <div className="space-y-3 rounded-xl border border-metro-border bg-metro-panel/40 p-3">
        <h3 className="text-sm font-bold text-metro-muted">Histórico de actas</h3>
        {!hasLoadedHistoricalActas && !search.trim() && !yearFilter && (
          <p className="rounded-lg border border-dashed border-metro-border px-3 py-4 text-sm text-metro-muted">
            El histórico se cargará al buscar, filtrar por año o abrir un ejercicio.
          </p>
        )}
        {closedActasByYear.length === 0 && hasLoadedHistoricalActas && (
          <p className="rounded-lg border border-dashed border-metro-border px-3 py-4 text-sm text-metro-muted">
            No hay actas cerradas con los filtros actuales.
          </p>
        )}
        {closedActasByYear.map(([year, group]) => {
          const isYearOpen = Boolean(search || yearFilter || openHistoryYears[year]);
          const rows = isYearOpen ? group.rows : [];

          return (
            <details
              className="rounded-xl border border-metro-border bg-metro-surface p-3"
              key={year}
              onToggle={(event) => {
                if (search || yearFilter) return;
                setOpenHistoryYears((current) => ({
                  ...current,
                  [year]: event.currentTarget.open,
                }));
              }}
              open={isYearOpen}
            >
              <summary className="cursor-pointer text-sm font-bold text-metro-text">
                {year} · {group.count} acta{group.count === 1 ? '' : 's'}
              </summary>
              {isYearOpen && (
                <div className="mt-3">
                  <DataTable
                    ariaLabel={`Actas históricas ${year}`}
                    columnOrder={preferences.columnOrder}
                    columnWidths={preferences.columnWidths}
                    onResetColumnWidths={onResetColumnWidths}
                    columns={columns}
                    emptyMessage="No hay actas cerradas."
                    getRowId={(acta) => acta.id}
                    onColumnOrderChange={onColumnOrderChange}
                    onColumnWidthChange={onColumnWidthChange}
                    onRowClick={onOpenActa}
                    onSortChange={onSortChange}
                    rows={rows}
                    sort={preferences.sort}
                  />
                </div>
              )}
            </details>
          );
        })}
      </div>
    </>
  );
}
