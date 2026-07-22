import { FileDown, Trash2 } from 'lucide-react';
import { useMemo } from 'react';
import { ActionButton } from '../../../components/ui/ActionButton';
import { Input } from '../../../components/ui/Field';
import { ModalBody, ModalFooter, ModalHeader, ModalShell, ModalTitle } from '../../../components/ui/ModalShell';
import { type TicketRestaurantAbsence } from '../domain/ticketRestaurante';
import type { TicketRestaurantAbsencePreviewRow } from '../domain/importAbsences';
import type { ExportTablePayload } from '../../../shared/export/types';
import { ExportPrintButtons } from '../../../shared/print/ExportPrintButtons';
import { DataTable, type DataTableColumn } from '../../../shared/table/DataTable';
import { CompactTable, CompactTableBody, CompactTableHead } from '../../../shared/table/CompactTable';
import {
  type TableViewPreferences,
  useTableViewPreferences,
} from '../../../shared/table/useTableViewPreferences';
import { MonthNavigator } from './TicketRestauranteCalendarPanels';

type TicketAbsencesTableColumnId =
  | 'empleado'
  | 'nombreApellidos'
  | 'desde'
  | 'hasta'
  | 'motivo'
  | 'calendario'
  | 'totalDias'
  | 'diasTicketMes'
  | 'afectaTicket'
  | 'actions';

const TICKET_ABSENCES_TABLE_STORAGE_KEY = 'traccion.tableView.ticketRestaurante.absences';

const defaultTicketAbsencesTablePreferences: TableViewPreferences<TicketAbsencesTableColumnId> = {
  sort: { columnId: 'desde', direction: 'asc' },
  columnWidths: {
    empleado: 110,
    nombreApellidos: 230,
    desde: 115,
    hasta: 115,
    motivo: 170,
    calendario: 145,
    totalDias: 95,
    diasTicketMes: 110,
    afectaTicket: 105,
    actions: 82,
  },
  columnOrder: null,
};

const ticketAbsencesTableColumnIds: TicketAbsencesTableColumnId[] = [
  'empleado',
  'nombreApellidos',
  'desde',
  'hasta',
  'motivo',
  'calendario',
  'totalDias',
  'diasTicketMes',
  'afectaTicket',
  'actions',
];

export type TicketAbsenceDisplayRow = TicketRestaurantAbsence & {
  calendario: string;
  diasTicketMes: number;
  descuentaTicket: boolean;
};

export function AbsencesTable({
  absences,
  exportPayload,
  importMessage,
  month,
  onEdit,
  onExportModel,
  onImport,
  onMonthChange,
  onNextMonth,
  onPreviousMonth,
  onRemove,
  onYearChange,
  year,
}: {
  absences: TicketAbsenceDisplayRow[];
  exportPayload: ExportTablePayload<TicketAbsenceDisplayRow>;
  importMessage: string;
  month: number;
  onEdit: (absence: TicketRestaurantAbsence) => void;
  onExportModel: () => void;
  onImport: () => void;
  onMonthChange: (value: string) => void;
  onNextMonth: () => void;
  onPreviousMonth: () => void;
  onRemove: (id: string) => void;
  onYearChange: (value: string) => void;
  year: number;
}) {
  const { preferences, setSort, setColumnWidth, setColumnOrder, resetColumnWidths } =
    useTableViewPreferences<TicketAbsencesTableColumnId>({
      storageKey: TICKET_ABSENCES_TABLE_STORAGE_KEY,
      defaultPreferences: defaultTicketAbsencesTablePreferences,
      validColumnIds: ticketAbsencesTableColumnIds,
    });
  const absenceColumns = useMemo<
    Array<DataTableColumn<TicketAbsenceDisplayRow, TicketAbsencesTableColumnId>>
  >(
    () => [
      {
        id: 'empleado',
        header: 'Nº empleado',
        accessor: (absence) => {
          const employeeNumber = Number(absence.empleado.trim());
          return Number.isFinite(employeeNumber) ? employeeNumber : absence.empleado;
        },
        render: (absence) => absence.empleado,
        width: 110,
        minWidth: 95,
        maxWidth: 170,
        sortable: true,
        className: 'font-semibold text-metro-text',
      },
      {
        id: 'nombreApellidos',
        header: 'Nombre y apellidos',
        accessor: (absence) => absence.nombreApellidos,
        render: (absence) => absence.nombreApellidos,
        width: 230,
        minWidth: 170,
        maxWidth: 420,
        sortable: true,
        className: 'text-metro-text',
      },
      {
        id: 'desde',
        header: 'Desde',
        accessor: (absence) => absence.desde,
        render: (absence) => absence.desde,
        width: 115,
        minWidth: 95,
        maxWidth: 170,
        sortable: true,
        className: 'text-metro-muted',
      },
      {
        id: 'hasta',
        header: 'Hasta',
        accessor: (absence) => absence.hasta,
        render: (absence) => absence.hasta,
        width: 115,
        minWidth: 95,
        maxWidth: 170,
        sortable: true,
        className: 'text-metro-muted',
      },
      {
        id: 'motivo',
        header: 'Motivo',
        accessor: (absence) => absence.motivo,
        render: (absence) => absence.motivo,
        width: 170,
        minWidth: 130,
        maxWidth: 320,
        sortable: true,
        className: 'text-metro-muted',
      },
      {
        id: 'calendario',
        header: 'Calendario',
        accessor: (absence) => absence.calendario,
        render: (absence) => absence.calendario,
        width: 145,
        minWidth: 120,
        maxWidth: 240,
        sortable: true,
        className: 'text-metro-muted',
      },
      {
        id: 'totalDias',
        header: 'Días naturales',
        accessor: (absence) => absence.totalDias,
        render: (absence) => absence.totalDias,
        width: 95,
        minWidth: 85,
        maxWidth: 135,
        sortable: true,
        className: 'text-right text-metro-muted',
      },
      {
        id: 'diasTicketMes',
        header: 'Días ticket mes',
        accessor: (absence) => absence.diasTicketMes,
        render: (absence) => absence.diasTicketMes,
        width: 110,
        minWidth: 95,
        maxWidth: 150,
        sortable: true,
        className: 'text-right font-semibold text-metro-text',
      },
      {
        id: 'afectaTicket',
        header: 'Afecta ticket',
        accessor: (absence) => (absence.afectaTicket ? 'Sí' : 'No'),
        render: (absence) => (absence.afectaTicket ? 'Sí' : 'No'),
        width: 105,
        minWidth: 95,
        maxWidth: 150,
        sortable: true,
        className: 'text-metro-muted',
      },
      {
        id: 'actions',
        header: 'Acciones',
        render: (absence) => (
          <button
            className="rounded-md border border-metro-border p-1 text-metro-text hover:border-metro-red"
            onClick={(event) => {
              event.stopPropagation();
              onRemove(absence.id);
            }}
            type="button"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        ),
        width: 82,
        minWidth: 74,
        maxWidth: 110,
        resizable: false,
        isActionColumn: true,
      },
    ],
    [onRemove],
  );

  return (
    <div className="rounded-xl border border-metro-border bg-metro-panel p-2.5">
      <div className="mb-3 flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h3 className="text-base font-bold text-metro-text">Ausencias</h3>
          <p className="text-xs text-metro-muted">
            Importa, revisa y filtra ausencias por mes. Días ticket mes ya descuenta calendario,
            fines de semana y días sin ticket.
          </p>
        </div>
        <div className="flex flex-col items-start gap-1.5 lg:items-end">
          <div className="flex flex-wrap gap-2">
            <ExportPrintButtons payload={exportPayload} />
            <button
              className="inline-flex items-center gap-1.5 rounded-lg border border-metro-border px-3 py-1.5 text-xs font-semibold text-metro-text hover:border-metro-red"
              onClick={onExportModel}
              type="button"
            >
              <FileDown className="h-3.5 w-3.5" />
              Modelo ausencias
            </button>
            <ActionButton iconOnly={false} onClick={onImport} size="sm" variant="import">
              Importar ausencias
            </ActionButton>
          </div>
          {importMessage ? (
            <p className="max-w-sm text-xs text-metro-muted">{importMessage}</p>
          ) : null}
        </div>
      </div>
      <div className="mb-2 flex flex-col gap-2 rounded-lg border border-metro-border bg-metro-surface p-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-xs font-semibold text-metro-muted">
          Ausencias del mes seleccionado: <span className="text-metro-red">{absences.length}</span>
        </div>
        <MonthNavigator
          ariaLabel="Selector mes ausencias"
          month={month}
          onMonthChange={onMonthChange}
          onNextMonth={onNextMonth}
          onPreviousMonth={onPreviousMonth}
          onYearChange={onYearChange}
          year={year}
        />
      </div>
      <DataTable
        ariaLabel="Ausencias Ticket Restaurante"
        columnOrder={preferences.columnOrder}
        columnWidths={preferences.columnWidths}
        onResetColumnWidths={resetColumnWidths}
        columns={absenceColumns}
        emptyMessage="No hay ausencias guardadas."
        getRowId={(absence) => absence.id}
        maxHeightClassName="max-h-[420px]"
        onColumnOrderChange={setColumnOrder}
        onColumnWidthChange={setColumnWidth}
        onRowClick={onEdit}
        onSortChange={setSort}
        rows={absences}
        sort={preferences.sort}
      />
    </div>
  );
}

export function AbsencePreviewModal({
  onAdd,
  onCancel,
  onChange,
  onRemove,
  onSave,
  rows,
}: {
  onAdd: () => void;
  onCancel: () => void;
  onChange: (
    rowId: string,
    field: keyof Omit<TicketRestaurantAbsencePreviewRow, 'id' | 'errors'>,
    value: string | boolean,
  ) => void;
  onRemove: (rowId: string) => void;
  onSave: () => void;
  rows: TicketRestaurantAbsencePreviewRow[];
}) {
  return (
    <ModalShell labelledBy="absence-preview-title" maxWidthClassName="max-w-6xl" onClose={onCancel}>
      <ModalHeader>
        <ModalTitle id="absence-preview-title" subtitle="Edita, añade o elimina filas antes de guardar.">
          Revisar ausencias importadas
        </ModalTitle>
        <ActionButton iconOnly={false} onClick={onAdd} size="sm" variant="add">
          Añadir ausencia manual
        </ActionButton>
      </ModalHeader>
      <ModalBody className="overflow-auto">
          <CompactTable minWidthClassName="min-w-[1050px]">
            <CompactTableHead>
              <tr>
                <th className="px-1 py-1">Nº empleado</th>
                <th className="px-1 py-1">Nombre y apellidos</th>
                <th className="px-1 py-1">Desde</th>
                <th className="px-1 py-1">Hasta</th>
                <th className="px-1 py-1">Motivo</th>
                <th className="px-1 py-1">Total días</th>
                <th className="px-1 py-1">Afecta ticket</th>
                <th className="px-1 py-1">Acciones</th>
              </tr>
            </CompactTableHead>
            <CompactTableBody className="[&>tr:hover]:bg-metro-red/10">
              {rows.map((row) => (
                <tr className={row.errors.length > 0 ? 'bg-metro-red/10' : ''} key={row.id}>
                  <PreviewInput field="empleado" onChange={onChange} row={row} />
                  <PreviewInput field="nombreApellidos" onChange={onChange} row={row} />
                  <PreviewInput field="desde" onChange={onChange} row={row} type="date" />
                  <PreviewInput field="hasta" onChange={onChange} row={row} type="date" />
                  <PreviewInput field="motivo" onChange={onChange} row={row} />
                  <PreviewInput field="totalDias" onChange={onChange} row={row} type="number" />
                  <td className="px-1 py-1 align-top text-center">
                    <input
                      checked={row.afectaTicket}
                      className="h-4 w-4 accent-metro-red"
                      onChange={(event) => onChange(row.id, 'afectaTicket', event.target.checked)}
                      type="checkbox"
                    />
                  </td>
                  <td className="px-1 py-1 align-top">
                    <button
                      className="rounded-md border border-metro-border p-1 text-metro-text hover:border-metro-red"
                      onClick={() => onRemove(row.id)}
                      type="button"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                    {row.errors.length > 0 ? (
                      <p className="mt-1 max-w-48 text-xs text-metro-red">
                        {row.errors.join(' ')}
                      </p>
                    ) : null}
                  </td>
                </tr>
              ))}
            </CompactTableBody>
          </CompactTable>
      </ModalBody>
      <ModalFooter>
        <ActionButton iconOnly={false} onClick={onCancel} variant="secondary">
          Cancelar
        </ActionButton>
        <ActionButton iconOnly={false} onClick={onSave} variant="save">
          Guardar ausencias
        </ActionButton>
      </ModalFooter>
    </ModalShell>
  );
}

function PreviewInput({
  field,
  onChange,
  row,
  type = 'text',
}: {
  field: keyof Omit<TicketRestaurantAbsencePreviewRow, 'id' | 'errors' | 'afectaTicket'>;
  onChange: (
    rowId: string,
    field: keyof Omit<TicketRestaurantAbsencePreviewRow, 'id' | 'errors'>,
    value: string | boolean,
  ) => void;
  row: TicketRestaurantAbsencePreviewRow;
  type?: string;
}) {
  return (
    <td className="px-1 py-1 align-top">
      <Input
        className="mt-0 h-8 min-w-28 px-2 text-xs"
        onChange={(event) => onChange(row.id, field, event.target.value)}
        type={type}
        value={String(row[field])}
      />
    </td>
  );
}
