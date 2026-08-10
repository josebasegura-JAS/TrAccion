import { Calculator, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ActionButton } from '../../../components/ui/ActionButton';
import { ModalBody, ModalFooter, ModalHeader, ModalShell, ModalTitle } from '../../../components/ui/ModalShell';
import {
  calculateMonthlyTicketOrder,
  getEffectiveTicketPrice,
  type TicketPersonCalculation,
  type TicketRestaurantAbsence,
  type TicketCalendar,
  type TicketRestaurantConfig,
} from '../domain/ticketRestaurante';
import type { ExportTablePayload } from '../../../shared/export/types';
import { ExportPrintButtons } from '../../../shared/print/ExportPrintButtons';
import { DataTable, type DataTableColumn } from '../../../shared/table/DataTable';
import { CompactTable, CompactTableBody, CompactTableHead } from '../../../shared/table/CompactTable';
import {
  type TableViewPreferences,
  useTableViewPreferences,
} from '../../../shared/table/useTableViewPreferences';
import { MonthNavigator } from './TicketRestauranteCalendarPanels';
import { formatCurrency } from './ticketRestauranteFormat';

type TicketCalculationTableColumnId =
  | 'empleado'
  | 'nombreApellidos'
  | 'calendario'
  | 'diasTeoricos'
  | 'hojaGastos'
  | 'ausencias'
  | 'deudaEntrante'
  | 'deudaPendiente'
  | 'ticketsFinales'
  | 'importeTicket'
  | 'total';

const TICKET_MONTHLY_TABLE_STORAGE_KEY =
  'traccion.tableView.ticketRestaurante.monthlyCalculation.v2';
const TICKET_CONTRIBUTION_TABLE_STORAGE_KEY =
  'traccion.tableView.ticketRestaurante.contributionCalculation.v2';

const defaultTicketCalculationTablePreferences: TableViewPreferences<TicketCalculationTableColumnId> =
  {
    sort: { columnId: 'empleado', direction: 'asc' },
    columnWidths: {
      empleado: 110,
      nombreApellidos: 230,
      calendario: 160,
      diasTeoricos: 110,
      hojaGastos: 115,
      ausencias: 130,
      deudaEntrante: 120,
      deudaPendiente: 125,
      ticketsFinales: 125,
      importeTicket: 115,
      total: 110,
    },
    columnOrder: null,
  };

const monthlyCalculationTableColumnIds: TicketCalculationTableColumnId[] = [
  'empleado',
  'nombreApellidos',
  'calendario',
  'diasTeoricos',
  'hojaGastos',
  'ausencias',
  'deudaEntrante',
  'deudaPendiente',
  'ticketsFinales',
  'importeTicket',
  'total',
];

const contributionCalculationTableColumnIds: TicketCalculationTableColumnId[] = [
  'empleado',
  'nombreApellidos',
  'calendario',
  'diasTeoricos',
  'ausencias',
  'ticketsFinales',
  'importeTicket',
  'total',
];

export function CalculationPanel({
  absences,
  calendars,
  calculation,
  config,
  mode,
  month,
  exportPayload,
  onMonthChange,
  onNextMonth,
  onPreviousMonth,
  onYearChange,
  year,
}: {
  absences: TicketRestaurantAbsence[];
  calendars: TicketCalendar[];
  calculation: ReturnType<typeof calculateMonthlyTicketOrder>;
  config: TicketRestaurantConfig;
  mode: 'monthly' | 'contribution';
  month: number;
  exportPayload: ExportTablePayload<TicketPersonCalculation>;
  onMonthChange: (value: string) => void;
  onNextMonth: () => void;
  onPreviousMonth: () => void;
  onYearChange: (value: string) => void;
  year: number;
}) {
  const [selectedDetailRow, setSelectedDetailRow] = useState<TicketPersonCalculation | null>(null);
  const validColumnIds =
    mode === 'monthly' ? monthlyCalculationTableColumnIds : contributionCalculationTableColumnIds;
  const { preferences, setSort, setColumnWidth, setColumnOrder, resetColumnWidths } =
    useTableViewPreferences<TicketCalculationTableColumnId>({
      storageKey:
        mode === 'monthly'
          ? TICKET_MONTHLY_TABLE_STORAGE_KEY
          : TICKET_CONTRIBUTION_TABLE_STORAGE_KEY,
      defaultPreferences: defaultTicketCalculationTablePreferences,
      validColumnIds,
    });

  const effectiveTicketPrice = getEffectiveTicketPrice(config, year, month);
  const calculationColumns = useMemo<
    Array<DataTableColumn<TicketPersonCalculation, TicketCalculationTableColumnId>>
  >(() => {
    const baseColumns: Array<
      DataTableColumn<TicketPersonCalculation, TicketCalculationTableColumnId>
    > = [
      {
        id: 'empleado',
        header: 'Nº empleado',
        tone: 'identity',
        accessor: (row) => {
          const employeeNumber = Number(row.empleado.trim());
          return Number.isFinite(employeeNumber) ? employeeNumber : row.empleado;
        },
        render: (row) => row.empleado,
        width: 110,
        minWidth: 95,
        maxWidth: 170,
        sortable: true,
        className: 'font-semibold text-metro-text',
      },
      {
        id: 'nombreApellidos',
        header: 'Nombre y apellidos',
        accessor: (row) => row.nombreApellidos,
        render: (row) => row.nombreApellidos,
        width: 230,
        minWidth: 170,
        maxWidth: 420,
        sortable: true,
        className: 'font-semibold text-metro-text',
      },
      {
        id: 'calendario',
        header: 'Calendario',
        accessor: (row) => row.calendario,
        render: (row) => row.calendario,
        width: 160,
        minWidth: 125,
        maxWidth: 280,
        sortable: true,
        className: 'text-metro-muted',
      },
      {
        id: 'diasTeoricos',
        header: 'Días teóricos',
        accessor: (row) => row.diasTeoricos,
        render: (row) => row.diasTeoricos,
        width: 110,
        minWidth: 95,
        maxWidth: 155,
        sortable: true,
        className: 'text-right text-metro-muted',
        headerClassName: 'text-right',
      },
      {
        id: 'hojaGastos',
        header: 'Hoja gastos',
        accessor: (row) => row.hojasGastoMes,
        render: (row) => row.hojasGastoMes,
        width: 115,
        minWidth: 100,
        maxWidth: 170,
        sortable: true,
        className: 'text-right text-metro-muted',
        headerClassName: 'text-right',
      },
      {
        id: 'ausencias',
        header: mode === 'monthly' ? 'Ausencias aplicadas' : 'Ausencias mes',
        accessor: (row) => (mode === 'monthly' ? row.ausenciasAplicadas : row.ausenciasMes),
        render: (row) => (mode === 'monthly' ? row.ausenciasAplicadas : row.ausenciasMes),
        width: 130,
        minWidth: 105,
        maxWidth: 190,
        sortable: true,
        className: 'text-right text-metro-muted',
        headerClassName: 'text-right',
      },
    ];

    if (mode === 'monthly') {
      baseColumns.push(
        {
          id: 'deudaEntrante',
          tone: 'attention',
          header: 'Deuda entrante',
          accessor: (row) => row.deudaEntrante,
          render: (row) => row.deudaEntrante,
          width: 120,
          minWidth: 105,
          maxWidth: 175,
          sortable: true,
          className: 'text-right text-metro-muted',
          headerClassName: 'text-right',
        },
        {
          id: 'deudaPendiente',
          tone: 'attention',
          header: 'Deuda pendiente',
          accessor: (row) => row.deudaPendiente,
          render: (row) => row.deudaPendiente,
          width: 125,
          minWidth: 110,
          maxWidth: 180,
          sortable: true,
          className: 'text-right text-metro-muted',
          headerClassName: 'text-right',
        },
      );
    }

    baseColumns.push(
      {
        id: 'ticketsFinales',
        tone: 'financial',
        header: mode === 'monthly' ? 'Tickets a pedir' : 'Tickets cotización',
        accessor: (row) => row.ticketsFinales,
        render: (row) => (
          <div className="flex items-center justify-end gap-2">
            <span
              className={
                mode === 'monthly' ? 'font-bold text-emerald-600' : 'font-bold text-metro-text'
              }
            >
              {row.ticketsFinales}
            </span>
            <button
              aria-label={`Ver cálculo de ${row.nombreApellidos}`}
              data-tip="Ver detalle del cálculo"
              className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700 transition hover:border-emerald-400 hover:bg-emerald-100"
              onClick={(event) => {
                event.stopPropagation();
                setSelectedDetailRow(row);
              }}
              title="Ver cálculo"
              type="button"
            >
              <Search className="h-3.5 w-3.5" />
            </button>
          </div>
        ),
        width: 135,
        minWidth: 120,
        maxWidth: 190,
        sortable: true,
        className: 'text-right font-semibold text-metro-text',
        headerClassName: 'text-right',
      },
      {
        id: 'importeTicket',
        tone: 'financial',
        header: 'Importe ticket',
        accessor: () => effectiveTicketPrice,
        render: () => formatCurrency(effectiveTicketPrice),
        width: 115,
        minWidth: 100,
        maxWidth: 165,
        sortable: true,
        className: 'text-right text-metro-muted',
        headerClassName: 'text-right',
      },
      {
        id: 'total',
        tone: 'financial',
        header: 'Total',
        accessor: (row) => row.importe,
        render: (row) => formatCurrency(row.importe),
        width: 110,
        minWidth: 95,
        maxWidth: 160,
        sortable: true,
        className: 'text-right font-semibold text-metro-text',
        headerClassName: 'text-right',
      },
    );

    return baseColumns;
  }, [effectiveTicketPrice, mode]);

  return (
    <div className="rounded-xl border border-metro-border bg-metro-panel p-2.5">
      <div className="mb-3 flex flex-col gap-2 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-base font-bold text-metro-text">
            <Calculator className="h-4 w-4 text-metro-red" />
            {mode === 'monthly' ? 'Cómputo mensual' : 'Cómputo cotización'}
          </h3>
          <p className="text-xs text-metro-muted">
            {mode === 'monthly'
              ? 'Calcula los tickets a pedir con lógica antigua: deuda de ausencias anteriores aplicada a mes vencido.'
              : 'Calcula días con derecho del mes menos ausencias del propio mes, sin arrastre de deuda.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <MonthNavigator
            ariaLabel="Selector mes cálculo"
            month={month}
            onMonthChange={onMonthChange}
            onNextMonth={onNextMonth}
            onPreviousMonth={onPreviousMonth}
            onYearChange={onYearChange}
            year={year}
          />
          <ExportPrintButtons payload={exportPayload} />
        </div>
      </div>
      <DataTable
        ariaLabel={
          mode === 'monthly'
            ? 'Cómputo mensual Ticket Restaurante'
            : 'Cómputo cotización Ticket Restaurante'
        }
        columnOrder={preferences.columnOrder}
        columnWidths={preferences.columnWidths}
        onResetColumnWidths={resetColumnWidths}
        columns={calculationColumns}
        emptyMessage="No hay personas activas para calcular."
        getRowId={(row) => row.empleado}
        maxHeightClassName="max-h-[460px]"
        onColumnOrderChange={setColumnOrder}
        onColumnWidthChange={setColumnWidth}
        onSortChange={setSort}
        rows={calculation.rows}
        sort={preferences.sort}
      />
      {selectedDetailRow ? (
        <CalculationAbsenceDetailModal
          absences={absences}
          calendars={calendars}
          config={config}
          mode={mode}
          month={month}
          onClose={() => setSelectedDetailRow(null)}
          row={selectedDetailRow}
          year={year}
        />
      ) : null}
    </div>
  );
}

export function CalculationAbsenceDetailModal({
  mode,
  month,
  onClose,
  row,
  year,
}: {
  absences: TicketRestaurantAbsence[];
  calendars: TicketCalendar[];
  config: TicketRestaurantConfig;
  mode: 'monthly' | 'contribution';
  month: number;
  onClose: () => void;
  row: TicketPersonCalculation;
  year: number;
}) {
  const appliedDebtRows = row.deudaAplicadaDetalle ?? [];
  const pendingDebtRows = row.deudaPendienteDetalle ?? [];
  const hojaGastoRows = row.hojaGastoDetalle ?? [];
  const appliedDiscounts = Math.max(0, row.diasTeoricos - row.ticketsFinales);
  const monthlyDebtDiscounts = Math.max(0, appliedDiscounts - row.hojasGastoMes);
  const hasDetail =
    appliedDebtRows.length > 0 || pendingDebtRows.length > 0 || hojaGastoRows.length > 0;

  return (
    <ModalShell labelledBy="ticket-calculation-detail-title" maxWidthClassName="max-w-5xl" onClose={onClose}>
      <ModalHeader>
        <ModalTitle
          id="ticket-calculation-detail-title"
          subtitle={`${row.empleado} · ${row.nombreApellidos} · ${
            mode === 'monthly' ? 'Cómputo mensual' : 'Cómputo cotización'
          } · ${year}-${String(month).padStart(2, '0')}`}
        >
          Detalle del cómputo
        </ModalTitle>
      </ModalHeader>
      <ModalBody className="space-y-3">
          <div
            className={`grid gap-2 md:grid-cols-3 ${
              mode === 'monthly' ? 'xl:grid-cols-6' : 'xl:grid-cols-4'
            }`}
          >
            <DetailStat label="Calendario" value={row.calendario} />
            <DetailStat label="Días teóricos" value={row.diasTeoricos} />
            <DetailStat label="Hoja gastos" value={row.hojasGastoMes} />
            {mode === 'monthly' ? (
              <DetailStat label="Deuda entrante" value={row.deudaEntrante} />
            ) : null}
            <DetailStat
              label={mode === 'monthly' ? 'Descuento total' : 'Ausencias mes'}
              value={appliedDiscounts}
            />
            {mode === 'monthly' ? (
              <DetailStat label="Deuda pendiente" value={row.deudaPendiente} />
            ) : null}
          </div>

          <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950">
            <h4 className="mb-2 text-sm font-bold">Cálculo aplicado</h4>
            {mode === 'monthly' ? (
              <div className="grid gap-2 md:grid-cols-4">
                <DetailFormulaItem label="Días calendario" value={row.diasTeoricos} />
                <DetailFormulaItem label="Hojas de gasto" value={`-${row.hojasGastoMes}`} />
                <DetailFormulaItem label="Deuda aplicada" value={`-${monthlyDebtDiscounts}`} />
                <DetailFormulaItem label="Tickets a pedir" value={row.ticketsFinales} strong />
              </div>
            ) : (
              <div className="grid gap-2 md:grid-cols-3">
                <DetailFormulaItem label="Días calendario" value={row.diasTeoricos} />
                <DetailFormulaItem label="Ausencias del mes" value={`-${appliedDiscounts}`} />
                <DetailFormulaItem label="Tickets cotización" value={row.ticketsFinales} strong />
              </div>
            )}
          </section>

          {hasDetail ? (
            <>
              <DetailSection
                emptyMessage="No hay días de ausencia/deuda aplicados en este mes."
                rows={appliedDebtRows}
                title={mode === 'monthly' ? 'Deuda aplicada este mes' : 'Ausencias del mes'}
              />
              {mode === 'monthly' ? (
                <DetailSection
                  emptyMessage="No queda deuda pendiente tras este mes."
                  rows={pendingDebtRows}
                  title="Deuda pendiente"
                />
              ) : null}
              <HojaGastoDetailSection rows={hojaGastoRows} />
            </>
          ) : (
            <div className="rounded-xl border border-dashed border-metro-border bg-metro-panel p-6 text-center text-sm font-semibold text-metro-muted">
              No hay ausencias, deuda ni hojas de gasto vinculadas a esta persona en el cómputo
              seleccionado.
            </div>
          )}
      </ModalBody>
      <ModalFooter>
        <ActionButton iconOnly={false} onClick={onClose} variant="secondary">
          Cerrar
        </ActionButton>
      </ModalFooter>
    </ModalShell>
  );
}

function DetailFormulaItem({
  label,
  strong = false,
  value,
}: {
  label: string;
  strong?: boolean;
  value: number | string;
}) {
  return (
    <div className="rounded-lg border border-emerald-200 bg-white/70 p-2">
      <p className="text-xs font-bold text-emerald-700">{label}</p>
      <p className={`mt-1 text-base font-bold ${strong ? 'text-emerald-700' : 'text-emerald-950'}`}>
        {value}
      </p>
    </div>
  );
}

function DetailStat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-metro-border bg-metro-panel p-2">
      <p className="text-xs font-bold text-metro-muted">{label}</p>
      <p className="mt-1 text-sm font-bold text-metro-text">{value}</p>
    </div>
  );
}

function DetailSection({
  emptyMessage,
  rows,
  title,
}: {
  emptyMessage: string;
  rows: TicketPersonCalculation['deudaAplicadaDetalle'];
  title: string;
}) {
  return (
    <section className="rounded-xl border border-metro-border bg-metro-panel p-3">
      <h4 className="mb-2 text-sm font-bold text-metro-text">{title}</h4>
      {rows.length > 0 ? (
        <CompactTable>
          <CompactTableHead>
            <tr>
              <th className="px-2 py-1">Fecha</th>
              <th className="px-2 py-1">Origen</th>
              <th className="px-2 py-1">Motivo</th>
              <th className="px-2 py-1 text-right">Días ticket</th>
            </tr>
          </CompactTableHead>
          <CompactTableBody>
            {rows.map((detail) => (
              <tr key={`${detail.id}-${detail.fecha}-${title}`}>
                <td className="px-2 py-1 font-semibold">{formatDisplayDate(detail.fecha)}</td>
                <td className="px-2 py-1">{formatMonthOrigin(detail.mesOrigen)}</td>
                <td className="px-2 py-1">{detail.motivo}</td>
                <td className="px-2 py-1 text-right font-semibold">1</td>
              </tr>
            ))}
          </CompactTableBody>
        </CompactTable>
      ) : (
        <p className="rounded-lg border border-dashed border-metro-border bg-metro-surface p-3 text-xs font-semibold text-metro-muted">
          {emptyMessage}
        </p>
      )}
    </section>
  );
}

function HojaGastoDetailSection({ rows }: { rows: TicketPersonCalculation['hojaGastoDetalle'] }) {
  return (
    <section className="rounded-xl border border-metro-border bg-metro-panel p-3">
      <h4 className="mb-2 text-sm font-bold text-metro-text">Hojas de gasto</h4>
      {rows.length > 0 ? (
        <CompactTable>
          <CompactTableHead>
            <tr>
              <th className="px-2 py-1">Fecha</th>
              <th className="px-2 py-1 text-right">Días ticket</th>
            </tr>
          </CompactTableHead>
          <CompactTableBody>
            {rows.map((detail) => (
              <tr key={detail.id}>
                <td className="px-2 py-1 font-semibold">{formatDisplayDate(detail.fecha)}</td>
                <td className="px-2 py-1 text-right font-semibold">1</td>
              </tr>
            ))}
          </CompactTableBody>
        </CompactTable>
      ) : (
        <p className="rounded-lg border border-dashed border-metro-border bg-metro-surface p-3 text-xs font-semibold text-metro-muted">
          No hay hojas de gasto aplicadas en este mes.
        </p>
      )}
    </section>
  );
}

function formatDisplayDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return `${value.slice(8, 10)}/${value.slice(5, 7)}/${value.slice(0, 4)}`;
}

function formatMonthOrigin(value: string): string {
  if (!/^\d{4}-\d{2}$/.test(value)) return value;
  return `${value.slice(5, 7)}/${value.slice(0, 4)}`;
}
