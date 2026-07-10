import { ChevronDown, ChevronRight, RotateCcw, SlidersHorizontal } from 'lucide-react';
import { DataTable, type DataTableColumn } from '../../../shared/table/DataTable';
import type { TableSortState, TableViewPreferences } from '../../../shared/table/useTableViewPreferences';
import { reorderExportColumns } from '../../../shared/export/reorderExportColumns';
import { ExportPrintButtons } from '../../../shared/print/ExportPrintButtons';
import { getTeletrabajoIncidentMeta, getTeletrabajoRowClassName } from '../domain/incidentView';
import type { TeletrabajoSolicitud } from '../domain/solicitud';
import type { Employee } from '../../plantilla/domain/employee';
import type { buildGruposCoberturaByIdMap } from '../domain/gruposCobertura';
import type { buildPuestosByKey, buildSolicitudesByPeriodoPuestoCount } from '../domain/semaforo';
import type { TeletrabajoTableColumnId } from './teletrabajoTableConfig';
import { teletrabajoExportColumns } from './teletrabajoTableConfig';
import { CountBadge } from '../../../components/ui/CountBadge';

interface SharedTableProps {
  columns: Array<DataTableColumn<TeletrabajoSolicitud, TeletrabajoTableColumnId>>;
  employeesByEmpleado: Map<string, Employee>;
  gruposByIdMap: ReturnType<typeof buildGruposCoberturaByIdMap>;
  onColumnOrderChange: (columnOrder: TeletrabajoTableColumnId[]) => void;
  onColumnWidthChange: (columnId: TeletrabajoTableColumnId, width: number) => void;
  onRowClick: (solicitud: TeletrabajoSolicitud) => void;
  onSortChange: (sort: TableSortState<TeletrabajoTableColumnId> | null) => void;
  preferences: TableViewPreferences<TeletrabajoTableColumnId>;
  puestosByKey: ReturnType<typeof buildPuestosByKey>;
  solicitudesByPuestoCount: ReturnType<typeof buildSolicitudesByPeriodoPuestoCount>;
}

interface TeletrabajoMainTableSectionProps extends SharedTableProps {
  filterLabel: string;
  mainPeriodo: string;
  onExportDireccion: () => void;
  onResetColumnWidths: () => void;
  onResetPreferences: () => void;
  rows: TeletrabajoSolicitud[];
}

export function TeletrabajoMainTableSection({
  columns,
  employeesByEmpleado,
  filterLabel,
  gruposByIdMap,
  mainPeriodo,
  onColumnOrderChange,
  onColumnWidthChange,
  onExportDireccion,
  onResetColumnWidths,
  onResetPreferences,
  onRowClick,
  onSortChange,
  preferences,
  puestosByKey,
  rows,
  solicitudesByPuestoCount,
}: TeletrabajoMainTableSectionProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-metro-border">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-metro-border bg-metro-surface px-3 py-2">
        <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-metro-text">
          <SlidersHorizontal size={16} className="text-metro-red" /> Solicitudes de teletrabajo ·{' '}
          {mainPeriodo || 'Sin periodo'}
          <ExportPrintButtons
            payload={{
              title: 'Solicitudes de teletrabajo',
              filename: 'teletrabajo-solicitudes',
              columns: reorderExportColumns(teletrabajoExportColumns, preferences.columnOrder),
              rows,
              filterLabel,
            }}
          />
          <button
            className="inline-flex items-center justify-center rounded-xl border border-transparent bg-[#1a5c38] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#217346] disabled:cursor-not-allowed disabled:opacity-50"
            disabled={rows.length === 0}
            onClick={onExportDireccion}
            title="Exportar a Dirección"
            type="button"
          >
            Dirección
          </button>
        </div>
        <CountBadge>{rows.length} registros</CountBadge>
      </div>
      <div className="flex flex-wrap justify-end pb-2">
        <button
          className="inline-flex items-center gap-1 rounded-lg border border-metro-border bg-metro-panel px-2.5 py-1 text-xs font-semibold text-metro-muted hover:border-metro-red hover:text-metro-text"
          onClick={onResetPreferences}
          type="button"
        >
          <RotateCcw size={14} /> Restablecer vista
        </button>
      </div>
      <DataTable
        ariaLabel="Solicitudes de teletrabajo"
        columnOrder={preferences.columnOrder}
        columnWidths={preferences.columnWidths}
        onResetColumnWidths={onResetColumnWidths}
        columns={columns}
        emptyMessage="No hay solicitudes de teletrabajo para los criterios seleccionados."
        getRowId={(solicitud) => solicitud.id}
        onColumnOrderChange={onColumnOrderChange}
        onColumnWidthChange={onColumnWidthChange}
        onRowClick={onRowClick}
        onSortChange={onSortChange}
        rows={rows}
        rowClassName={(solicitud) =>
          getTeletrabajoRowClassName(
            getTeletrabajoIncidentMeta(
              solicitud,
              puestosByKey,
              solicitudesByPuestoCount,
              employeesByEmpleado,
              gruposByIdMap,
            ),
            solicitud.estado,
          )
        }
        sort={preferences.sort}
        preserveScrollOnRowsChange
      />
    </div>
  );
}

interface TeletrabajoHistoricoGroup {
  periodo: string;
  rows: TeletrabajoSolicitud[];
}

interface TeletrabajoHistoricoSectionProps extends SharedTableProps {
  groups: TeletrabajoHistoricoGroup[];
  historicalCount: number;
  isOpen: boolean;
  onToggle: () => void;
  onTogglePeriodo: (periodo: string) => void;
  openPeriodos: Record<string, boolean>;
}

export function TeletrabajoHistoricoSection({
  columns,
  employeesByEmpleado,
  gruposByIdMap,
  groups,
  historicalCount,
  isOpen,
  onColumnOrderChange,
  onColumnWidthChange,
  onRowClick,
  onSortChange,
  onToggle,
  onTogglePeriodo,
  openPeriodos,
  preferences,
  puestosByKey,
  solicitudesByPuestoCount,
}: TeletrabajoHistoricoSectionProps) {
  return (
    <div className="mt-4 overflow-hidden rounded-xl border border-metro-border bg-metro-surface">
      <button
        className="flex w-full flex-wrap items-center justify-between gap-2 border-b border-metro-border px-3 py-2 text-left text-sm font-semibold text-metro-text hover:bg-metro-panel"
        onClick={onToggle}
        type="button"
      >
        <span className="inline-flex items-center gap-2">
          {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          Histórico de teletrabajo
        </span>
        <CountBadge>{historicalCount} registros</CountBadge>
      </button>

      {isOpen && (
        <div className="space-y-3 p-3">
          {groups.length === 0 ? (
            <p className="rounded-xl border border-metro-border bg-metro-panel px-3 py-2 text-sm text-metro-muted">
              No hay solicitudes históricas para los criterios seleccionados.
            </p>
          ) : (
            groups.map((group) => {
              const isPeriodoOpen = Boolean(openPeriodos[group.periodo]);
              return (
                <div
                  className="overflow-hidden rounded-xl border border-metro-border bg-metro-panel"
                  key={group.periodo}
                >
                  <button
                    className="flex w-full flex-wrap items-center justify-between gap-2 px-3 py-2 text-left text-sm font-semibold text-metro-text hover:bg-metro-surface"
                    onClick={() => onTogglePeriodo(group.periodo)}
                    type="button"
                  >
                    <span className="inline-flex items-center gap-2">
                      {isPeriodoOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      Periodo {group.periodo}
                    </span>
                    <CountBadge tone="muted">{group.rows.length} registros</CountBadge>
                  </button>
                  {isPeriodoOpen && (
                    <div className="border-t border-metro-border p-2">
                      <DataTable
                        ariaLabel={`Solicitudes históricas de teletrabajo ${group.periodo}`}
                        columnOrder={preferences.columnOrder}
                        columnWidths={preferences.columnWidths}
                        columns={columns}
                        emptyMessage="No hay solicitudes históricas para este periodo."
                        getRowId={(solicitud) => solicitud.id}
                        onColumnOrderChange={onColumnOrderChange}
                        onColumnWidthChange={onColumnWidthChange}
                        onRowClick={onRowClick}
                        onSortChange={onSortChange}
                        rows={group.rows}
                        rowClassName={(solicitud) =>
                          getTeletrabajoRowClassName(
                            getTeletrabajoIncidentMeta(
                              solicitud,
                              puestosByKey,
                              solicitudesByPuestoCount,
                              employeesByEmpleado,
                              gruposByIdMap,
                            ),
                            solicitud.estado,
                          )
                        }
                        sort={preferences.sort}
                        maxHeightClassName="max-h-[360px]"
                        preserveScrollOnRowsChange
                      />
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
