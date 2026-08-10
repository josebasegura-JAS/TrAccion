import type { ReactNode } from 'react';
import { useMemo } from 'react';
import { reorderExportColumns } from '../../../shared/export/reorderExportColumns';
import { ExportPrintButtons } from '../../../shared/print/ExportPrintButtons';
import { DataTable, type DataTableColumn } from '../../../shared/table/DataTable';
import { useTableViewPreferences } from '../../../shared/table/useTableViewPreferences';
import { ActionButton } from '../../../components/ui/ActionButton';
import { CountBadge } from '../../../components/ui/CountBadge';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import type { LicenciaSinSueldoRecord } from '../domain/licenciaSinSueldo';
import {
  defaultTablePreferences,
  exportColumns,
  formatDate,
  formatEstado,
  getLatestUpdateText,
  tableColumnIds,
  type BlockId,
  type LicenciasTableColumnId,
} from './licenciasSinSueldoPage.helpers';

export function LicenciasTable({
  blockId,
  emptyText,
  records,
  title,
  onAdvance,
  onDelete,
  onEdit,
  onGenerateWord,
  generatingWordId,
}: {
  blockId: BlockId;
  emptyText: string;
  records: LicenciaSinSueldoRecord[];
  title: string;
  onAdvance: (record: LicenciaSinSueldoRecord) => void;
  onDelete: (record: LicenciaSinSueldoRecord) => void;
  onEdit: (record: LicenciaSinSueldoRecord) => void;
  onGenerateWord: (record: LicenciaSinSueldoRecord) => void;
  generatingWordId: string | null;
}) {
  const {
    preferences,
    setSort,
    setColumnWidth,
    setColumnOrder,
    resetColumnWidths,
    resetPreferences,
  } = useTableViewPreferences<LicenciasTableColumnId>({
    storageKey: `traccion.tableView.licenciasSinSueldo.${blockId}`,
    defaultPreferences: defaultTablePreferences,
    validColumnIds: tableColumnIds,
  });

  const columns = useMemo<Array<DataTableColumn<LicenciaSinSueldoRecord, LicenciasTableColumnId>>>(
    () => [
      {
        id: 'numeroEmpleado',
        header: 'Nº',
        tone: 'identity',
        accessor: (record) => Number(record.numeroEmpleado) || record.numeroEmpleado,
        render: (record) => record.numeroEmpleado,
        width: 90,
        sortable: true,
      },
      {
        id: 'nombreCompleto',
        header: 'Nombre',
        accessor: (record) => record.nombreCompleto,
        render: (record) => record.nombreCompleto,
        width: 210,
        minWidth: 150,
        sortable: true,
      },
      {
        id: 'tipo',
        header: 'Tipo',
        accessor: (record) => record.tipo,
        render: (record) => record.tipo,
        width: 180,
        sortable: true,
      },
      {
        id: 'fechaSolicitud',
        header: 'Solicitud',
        tone: 'request',
        accessor: (record) => record.fechaSolicitud,
        render: (record) => formatDate(record.fechaSolicitud),
        width: 110,
        sortable: true,
      },
      {
        id: 'fechaInicio',
        header: 'Inicio',
        tone: 'start',
        accessor: (record) => record.fechaInicio,
        render: (record) => formatDate(record.fechaInicio),
        width: 105,
        sortable: true,
      },
      {
        id: 'fechaFin',
        header: 'Fin',
        tone: 'end',
        accessor: (record) => record.fechaFin,
        render: (record) => formatDate(record.fechaFin),
        width: 105,
        sortable: true,
      },
      {
        id: 'estado',
        header: 'Estado',
        accessor: (record) => record.estado,
        render: (record) => {
          const tone =
            record.estado === 'vigente'
              ? 'success'
              : record.estado === 'denegada'
                ? 'error'
                : record.estado === 'historico'
                  ? 'muted'
                  : 'warning';
          return <StatusBadge tone={tone}>{formatEstado(record.estado)}</StatusBadge>;
        },
        width: 125,
        sortable: true,
      },
      {
        id: 'ultimaActualizacion',
        header: 'Última actualización',
        accessor: (record) => getLatestUpdateText(record),
        render: (record) => getLatestUpdateText(record),
        width: 260,
        minWidth: 180,
        sortable: true,
      },
      {
        id: 'actions',
        header: 'Acciones',
        width: 220,
        minWidth: 190,
        resizable: false,
        isActionColumn: true,
        render: (record) => (
          <div className="flex flex-wrap justify-end gap-2">
            {record.estado === 'pendiente_aprobacion' && (
              <button
                className="text-xs font-semibold text-metro-red hover:text-metro-text"
                onClick={(event) => {
                  event.stopPropagation();
                  onAdvance(record);
                }}
                type="button"
              >
                Aprobar
              </button>
            )}
            {record.estado === 'pendiente_firma' && record.tipo === 'Licencia sin sueldo' && (
              <ActionButton
                aria-label="Generar Word concesión"
                disabled={generatingWordId !== null}
                onClick={(event) => {
                  event.stopPropagation();
                  onGenerateWord(record);
                }}
                size="sm"
                title="Generar Word concesión"
                variant="word"
              >
                {generatingWordId === record.id ? 'Generando…' : 'Word'}
              </ActionButton>
            )}
            {record.estado === 'pendiente_firma' && (
              <button
                className="text-xs font-semibold text-metro-red hover:text-metro-text"
                onClick={(event) => {
                  event.stopPropagation();
                  onAdvance(record);
                }}
                type="button"
              >
                Firma recibida
              </button>
            )}
            <ActionButton
              aria-label="Eliminar"
              onClick={(event) => {
                event.stopPropagation();
                onDelete(record);
              }}
              size="sm"
              title="Eliminar"
              variant="delete"
            />
          </div>
        ),
      },
    ],
    [generatingWordId, onAdvance, onDelete, onGenerateWord],
  );

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-metro-muted">{records.length} registros visibles</p>
        <div className="flex flex-wrap items-center gap-2">
          <ActionButton size="sm" variant="secondary" iconOnly={false} onClick={resetPreferences}>
            Vista
          </ActionButton>
          <ExportPrintButtons
            payload={{
              title,
              filename: title,
              columns: reorderExportColumns(exportColumns, preferences.columnOrder),
              rows: records,
              filterLabel: `${records.length} registros filtrados`,
            }}
          />
        </div>
      </div>
      <DataTable
        ariaLabel={title}
        columnOrder={preferences.columnOrder}
        columnWidths={preferences.columnWidths}
        onResetColumnWidths={resetColumnWidths}
        columns={columns}
        emptyMessage={emptyText}
        getRowId={(record) => record.id}
        maxHeightClassName="max-h-[320px]"
        onColumnOrderChange={setColumnOrder}
        onColumnWidthChange={setColumnWidth}
        onRowDoubleClick={onEdit}
        onSortChange={setSort}
        rows={records}
        sort={preferences.sort}
      />
    </div>
  );
}

export function LicenciasBlock({
  children,
  count,
  icon,
  title,
}: {
  children: ReactNode;
  count: number;
  icon: ReactNode;
  title: string;
}) {
  return (
    <section className="rounded-xl bg-metro-panel/45 p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-metro-red/10 p-2 text-metro-red">{icon}</div>
          <h2 className="text-base font-semibold text-metro-text">{title}</h2>
        </div>
        <CountBadge tone="muted">{count}</CountBadge>
      </div>
      {children}
    </section>
  );
}
