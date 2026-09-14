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

type LicenciasBlockTone = 'danger' | 'warning' | 'success' | 'history';

const blockToneStyles: Record<LicenciasBlockTone, { icon: string; badge: string }> = {
  danger: {
    icon: 'bg-red-500/12 text-red-300 ring-1 ring-red-400/20',
    badge: 'border-red-400/25 bg-red-500/10 text-red-100',
  },
  warning: {
    icon: 'bg-amber-400/12 text-amber-200 ring-1 ring-amber-300/20',
    badge: 'border-amber-300/25 bg-amber-400/10 text-amber-100',
  },
  success: {
    icon: 'bg-emerald-500/12 text-emerald-200 ring-1 ring-emerald-400/20',
    badge: 'border-emerald-300/25 bg-emerald-500/10 text-emerald-100',
  },
  history: {
    icon: 'bg-violet-500/12 text-violet-200 ring-1 ring-violet-400/20',
    badge: 'border-violet-300/25 bg-violet-500/10 text-violet-100',
  },
};

export function LicenciasTable({
  blockId,
  emptyText,
  records,
  title,
  onAdvance,
  onDelete,
  onEdit,
  onGenerateWord,
  onExtendExcedencia,
  onGenerateProrrogaWord,
  generatingWordId,
  compact = false,
  showToolbar = true,
}: {
  blockId: BlockId;
  emptyText: string;
  records: LicenciaSinSueldoRecord[];
  title: string;
  onAdvance: (record: LicenciaSinSueldoRecord) => void;
  onDelete: (record: LicenciaSinSueldoRecord) => void;
  onEdit: (record: LicenciaSinSueldoRecord) => void;
  onGenerateWord: (record: LicenciaSinSueldoRecord) => void;
  onExtendExcedencia?: (record: LicenciaSinSueldoRecord) => void;
  onGenerateProrrogaWord?: (record: LicenciaSinSueldoRecord) => void;
  generatingWordId: string | null;
  compact?: boolean;
  showToolbar?: boolean;
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
        width: compact ? 240 : 310,
        minWidth: compact ? 220 : 280,
        resizable: false,
        isActionColumn: true,
        render: (record) => (
          <div className="flex flex-nowrap items-center justify-end gap-2">
            {record.estado === 'pendiente_aprobacion' && (
              <ActionButton
                iconOnly={false}
                onClick={(event) => {
                  event.stopPropagation();
                  onAdvance(record);
                }}
                size="sm"
                variant="approve"
              >
                Aprobar
              </ActionButton>
            )}
            {record.estado === 'pendiente_firma' &&
              (record.tipo === 'Licencia sin sueldo' || record.tipo === 'Excedencia') && (
              <ActionButton
                aria-label={record.tipo === 'Excedencia' ? 'Generar Word excedencia' : 'Generar Word concesión'}
                disabled={generatingWordId !== null}
                onClick={(event) => {
                  event.stopPropagation();
                  onGenerateWord(record);
                }}
                size="sm"
                title={record.tipo === 'Excedencia' ? 'Generar Word de concesión de excedencia' : 'Generar Word concesión'}
                variant="word"
              >
                {generatingWordId === record.id ? 'Generando…' : 'Word'}
              </ActionButton>
            )}
            {record.estado === 'vigente' && record.tipo === 'Excedencia' && !record.prorroga && onExtendExcedencia && (
              <ActionButton
                iconOnly={false}
                onClick={(event) => {
                  event.stopPropagation();
                  onExtendExcedencia(record);
                }}
                size="sm"
                title="Ampliar excedencia"
                variant="secondary"
              >
                Ampliar excedencia
              </ActionButton>
            )}
            {record.estado === 'vigente' && record.tipo === 'Excedencia' && record.prorroga && onGenerateProrrogaWord && (
              <ActionButton
                iconOnly={false}
                disabled={generatingWordId !== null}
                onClick={(event) => {
                  event.stopPropagation();
                  onGenerateProrrogaWord(record);
                }}
                size="sm"
                title="Generar Word de prórroga de excedencia"
                variant="word"
              >
                {generatingWordId === record.id ? 'Generando…' : 'Word prórroga'}
              </ActionButton>
            )}
            {record.estado === 'pendiente_firma' && (
              <ActionButton
                iconOnly={false}
                onClick={(event) => {
                  event.stopPropagation();
                  onAdvance(record);
                }}
                size="sm"
                variant="secondary"
              >
                Firma recibida
              </ActionButton>
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
    [compact, generatingWordId, onAdvance, onDelete, onExtendExcedencia, onGenerateProrrogaWord, onGenerateWord],
  );

  const visibleColumns = useMemo(
    () =>
      compact
        ? columns.filter((column) =>
            ['numeroEmpleado', 'nombreCompleto', 'tipo', 'actions'].includes(column.id),
          )
        : columns,
    [columns, compact],
  );

  const toolbar = (
    <>
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
        size="sm"
      />
    </>
  );

  return (
    <div className="space-y-2">
      {showToolbar && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-metro-muted">{records.length} registros visibles</p>
          <div className="flex flex-wrap items-center gap-2">{toolbar}</div>
        </div>
      )}
      <DataTable
        ariaLabel={title}
        columnOrder={preferences.columnOrder}
        columnWidths={preferences.columnWidths}
        onResetColumnWidths={resetColumnWidths}
        columns={visibleColumns}
        emptyMessage={emptyText}
        getRowId={(record) => record.id}
        heightClassName={compact ? 'h-[164px]' : undefined}
        maxHeightClassName={compact ? 'max-h-[164px]' : 'max-h-[340px]'}
        onColumnOrderChange={setColumnOrder}
        onColumnWidthChange={setColumnWidth}
        onRowClick={onEdit}
        onSortChange={setSort}
        preserveScrollOnRowsChange={!compact}
        rows={records}
        sort={preferences.sort}
        strongZebra
      />
      {!showToolbar && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-metro-border/60 bg-metro-panel/35 px-3 py-2 text-xs text-metro-muted">
          <span>{records.length} registros visibles</span>
          <div className="flex flex-wrap items-center gap-2">{toolbar}</div>
        </div>
      )}
    </div>
  );
}

export function LicenciasBlock({
  children,
  count,
  icon,
  subtitle,
  title,
  tone = 'danger',
}: {
  children: ReactNode;
  count: number;
  icon: ReactNode;
  subtitle?: string;
  title: string;
  tone?: LicenciasBlockTone;
}) {
  const styles = blockToneStyles[tone];

  return (
    <section className="rounded-[1.35rem] border border-metro-border/80 bg-[linear-gradient(180deg,rgba(18,35,56,0.98),rgba(14,30,49,0.95))] p-3.5 shadow-[0_16px_36px_rgba(2,8,23,0.2)]">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className={`mt-0.5 rounded-2xl p-2.5 ${styles.icon}`}>{icon}</div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[1.05rem] font-bold text-metro-text">{title}</h2>
              <CountBadge className={styles.badge} tone="muted">{count}</CountBadge>
            </div>
            {subtitle ? <p className="mt-1 text-sm text-metro-muted">{subtitle}</p> : null}
          </div>
        </div>
      </div>
      {children}
    </section>
  );
}
