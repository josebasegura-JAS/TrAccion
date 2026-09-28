import { AlertTriangle, Ban, Calculator, Pencil, RotateCcw, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ActionButton } from '../../../components/ui/ActionButton';
import { useAppDialog } from '../../../hooks/useAppDialog';
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
import { exportTicketRestaurantLoadWorkbook } from './ticketRestauranteExport';

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
  onUpdateConfig,
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
  onUpdateConfig?: (config: TicketRestaurantConfig) => Promise<{ ok: boolean; message?: string }>;
  onPreviousMonth: () => void;
  onYearChange: (value: string) => void;
  year: number;
}) {
  const [selectedDetailRow, setSelectedDetailRow] = useState<TicketPersonCalculation | null>(null);
  const [exclusionRow, setExclusionRow] = useState<TicketPersonCalculation | null>(null);
  const [exclusionReason, setExclusionReason] = useState('Baja');
  const [deliveredTickets, setDeliveredTickets] = useState(0);
  const [savingExclusion, setSavingExclusion] = useState(false);
  const [adjustmentRow, setAdjustmentRow] = useState<TicketPersonCalculation | null>(null);
  const [adjustmentTickets, setAdjustmentTickets] = useState(0);
  const [adjustmentReason, setAdjustmentReason] = useState('');
  const [savingAdjustment, setSavingAdjustment] = useState(false);
  const { alert, dialogNode } = useAppDialog();
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
  const activeSickLeaveSuggestions = useMemo(() => {
    if (mode !== 'monthly') return [];
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const normalizeEmployee = (value: string) => value.trim().replace(/^0+(?=\d)/, '');
    const activeEmployees = new Set(
      absences
        .filter((absence) =>
          !absence.deletedAt &&
          absence.afectaTicket &&
          absence.motivo.trim().toUpperCase() === 'ENF' &&
          absence.desde <= today &&
          (!absence.hasta || absence.hasta >= today),
        )
        .map((absence) => normalizeEmployee(absence.empleado)),
    );
    return calculation.rows.filter((row) =>
      !row.manualEntry &&
      !row.excludedFromOrder &&
      activeEmployees.has(normalizeEmployee(row.empleado)),
    );
  }, [absences, calculation.rows, mode]);
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
        render: (row) => (row.manualEntry ? '—' : row.diasTeoricos),
        width: 110,
        minWidth: 95,
        maxWidth: 155,
        sortable: true,
        className: 'text-right text-metro-muted',
        headerClassName: 'text-right',
      },
      {
        id: 'hojaGastos',
        header: mode === 'monthly' ? 'Hoja gastos aplicada' : 'Hoja gastos',
        accessor: (row) => row.hojasGastoMes,
        render: (row) => (row.manualEntry ? '—' : row.hojasGastoMes),
        width: 115,
        minWidth: 100,
        maxWidth: 170,
        sortable: true,
        className: 'text-right text-metro-muted',
        headerClassName: 'text-right',
      },
      {
        id: 'ausencias',
        header: mode === 'monthly' ? 'Descuento total' : 'Ausencias mes',
        accessor: (row) => (mode === 'monthly' ? row.ausenciasAplicadas : row.ausenciasMes),
        render: (row) => row.manualEntry ? '—' : (mode === 'monthly' ? row.ausenciasAplicadas : row.ausenciasMes),
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
          header: 'Deuda aplicada',
          accessor: (row) => Math.max(0, row.ausenciasAplicadas - row.hojasGastoMes),
          render: (row) =>
            row.manualEntry ? '—' : Math.max(0, row.ausenciasAplicadas - row.hojasGastoMes),
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
          render: (row) => (row.manualEntry ? '—' : row.deudaPendiente),
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
            {mode === 'monthly' && row.excludedFromOrder ? (
              <span className="rounded-full border border-amber-500/45 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-bold text-amber-300" title={row.exclusionReason || 'Excluido del pedido'}>
                Excluido
              </span>
            ) : null}
            {mode === 'monthly' && row.manuallyAdjusted && !row.excludedFromOrder ? (
              <span className="rounded-full border border-sky-500/45 bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-bold text-sky-300" title={row.adjustmentReason || 'Pedido ajustado manualmente'}>
                Ajustado
              </span>
            ) : null}
            {row.manualEntry ? (
              <span className="rounded-full border border-metro-border px-1.5 py-0.5 text-xs font-bold text-metro-muted">Manual</span>
            ) : (
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
            )}
            {mode === 'monthly' && !row.manualEntry && onUpdateConfig && !row.excludedFromOrder ? (
              <button
                aria-label={`Ajustar pedido de ${row.nombreApellidos}`}
                className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-metro-border bg-metro-panel text-metro-muted transition hover:border-sky-500 hover:text-sky-300"
                onClick={(event) => {
                  event.stopPropagation();
                  setAdjustmentTickets(row.ticketsFinales);
                  setAdjustmentReason(row.adjustmentReason ?? '');
                  setAdjustmentRow(row);
                }}
                title={row.manuallyAdjusted ? 'Editar ajuste manual del pedido' : 'Ajustar manualmente el pedido'}
                type="button"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            ) : null}
            {mode === 'monthly' && !row.manualEntry && onUpdateConfig ? (
              <button
                aria-label={row.excludedFromOrder ? `Reactivar ${row.nombreApellidos} en el pedido` : `Excluir ${row.nombreApellidos} del pedido`}
                className={`inline-flex h-6 w-6 items-center justify-center rounded-full border transition ${row.excludedFromOrder ? 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100' : 'border-metro-border bg-white text-metro-muted hover:border-metro-red hover:text-metro-red'}`}
                onClick={(event) => {
                  event.stopPropagation();
                  if (row.excludedFromOrder) {
                    const nextExclusions = (config.monthlyOrderExclusions ?? []).filter((item) => !(item.empleado === row.empleado && item.year === year && item.month === month));
                    void onUpdateConfig({ ...config, monthlyOrderExclusions: nextExclusions });
                  } else {
                    setExclusionReason('Baja');
                    setDeliveredTickets(0);
                    setExclusionRow(row);
                  }
                }}
                title={row.excludedFromOrder ? 'Volver a incluir en el pedido' : 'Excluir del pedido de este mes'}
                type="button"
              >
                {row.excludedFromOrder ? <RotateCcw className="h-3.5 w-3.5" /> : <Ban className="h-3.5 w-3.5" />}
              </button>
            ) : null}
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
  }, [config, effectiveTicketPrice, mode, month, onUpdateConfig, year]);

  return (
    <div className="rounded-2xl border border-metro-border bg-metro-panel p-3 shadow-card">
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
          {mode === 'monthly' ? (
            <ActionButton
              disabled={calculation.rows.length === 0}
              onClick={() =>
                void exportTicketRestaurantLoadWorkbook({
                  calculationRows: calculation.rows,
                  config,
                  year,
                  month,
                }).catch((error) =>
                  alert(
                    error instanceof Error ? error.message : 'No se ha podido generar el Excel “A cargar”.',
                    { type: 'error' },
                  ),
                )
              }
              variant="excel"
            >
              A cargar
            </ActionButton>
          ) : null}
          <ExportPrintButtons payload={exportPayload} />
        </div>
      </div>
      {mode === 'monthly' && activeSickLeaveSuggestions.length > 0 && onUpdateConfig ? (
        <div className="mb-3 rounded-xl border border-amber-500/40 bg-metro-panel/80 px-3 py-2.5 text-sm text-metro-text shadow-sm">
          <div className="mb-2 flex items-center gap-2 font-bold text-amber-300">
            <AlertTriangle className="h-4 w-4" />
            Posibles exclusiones: baja ENF activa a fecha de cálculo
          </div>
          <div className="flex flex-wrap gap-2">
            {activeSickLeaveSuggestions.map((row) => (
              <button
                className="rounded-lg border border-amber-500/45 bg-metro-surface px-3 py-1.5 text-xs font-bold text-metro-text transition hover:border-amber-400 hover:bg-amber-500/10"
                key={row.empleado}
                onClick={() => {
                  setExclusionReason('Baja ENF activa');
                  setDeliveredTickets(0);
                  setExclusionRow(row);
                }}
                type="button"
              >
                {row.empleado} · {row.nombreApellidos} · Revisar exclusión
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-metro-muted">La sugerencia no excluye automáticamente a nadie. Confirma cada caso y, si ya se cargaron tickets durante la baja, indica cuántos para recuperarlos como deuda real.</p>
        </div>
      ) : null}
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
      {exclusionRow && onUpdateConfig ? (
        <ModalShell labelledBy="ticket-order-exclusion-title" maxWidthClassName="max-w-lg" onClose={() => setExclusionRow(null)}>
          <ModalHeader>
            <ModalTitle id="ticket-order-exclusion-title" subtitle={`${exclusionRow.empleado} · ${exclusionRow.nombreApellidos} · ${year}-${String(month).padStart(2, '0')}`}>
              Excluir del pedido mensual
            </ModalTitle>
          </ModalHeader>
          <ModalBody className="space-y-3">
            <div className="rounded-xl border border-amber-500/35 bg-amber-500/10 p-3 text-sm leading-relaxed text-metro-secondary">
              Este mes tendrá 0 tickets. La deuda anterior queda congelada y las ausencias del mes excluido no generarán deuda ficticia. Si ya se cargaron tickets durante la baja, indícalos abajo: solo esos tickets se recuperarán en el siguiente pedido.
            </div>
            <label className="block text-sm font-bold text-metro-text">
              Motivo
              <input className="mt-1 w-full rounded-lg border border-metro-border bg-metro-panel px-3 py-2 text-sm font-normal text-metro-text outline-none placeholder:text-metro-muted focus:border-metro-red focus:ring-1 focus:ring-metro-red/30" maxLength={120} onChange={(event) => setExclusionReason(event.target.value)} placeholder="Baja, excedencia, permiso prolongado…" value={exclusionReason} />
            </label>
            <label className="block text-sm font-bold text-metro-text">
              Tickets ya cargados/entregados durante este mes
              <input className="mt-1 w-full rounded-lg border border-metro-border bg-metro-panel px-3 py-2 text-sm font-normal text-metro-text outline-none placeholder:text-metro-muted focus:border-metro-red focus:ring-1 focus:ring-metro-red/30" min={0} onChange={(event) => setDeliveredTickets(Math.max(0, Math.trunc(Number(event.target.value) || 0)))} type="number" value={deliveredTickets} />
              <span className="mt-1 block text-xs font-normal text-metro-muted">Normalmente 0. Si se cargaron por error, esa cantidad será la deuda real del siguiente pedido.</span>
            </label>
          </ModalBody>
          <ModalFooter>
            <ActionButton iconOnly={false} onClick={() => setExclusionRow(null)} size="sm" variant="secondary">Cancelar</ActionButton>
            <ActionButton disabled={savingExclusion || !exclusionReason.trim()} onClick={() => {
              setSavingExclusion(true);
              const nextExclusions = [...(config.monthlyOrderExclusions ?? []).filter((item) => !(item.empleado === exclusionRow.empleado && item.year === year && item.month === month)), { empleado: exclusionRow.empleado, year, month, reason: exclusionReason.trim(), deliveredTickets, createdAt: new Date().toISOString() }];
              void onUpdateConfig({ ...config, monthlyOrderExclusions: nextExclusions }).then((result) => {
                setSavingExclusion(false);
                if (result.ok) setExclusionRow(null);
                else void alert(result.message ?? 'No se ha podido guardar la exclusión.', { type: 'error' });
              });
            }} iconOnly={false} size="sm" variant="primary">Excluir del pedido</ActionButton>
          </ModalFooter>
        </ModalShell>
      ) : null}
      {dialogNode}
      {adjustmentRow && onUpdateConfig ? (
        <ModalShell labelledBy="ticket-order-adjustment-title" maxWidthClassName="max-w-lg" onClose={() => setAdjustmentRow(null)}>
          <ModalHeader>
            <ModalTitle id="ticket-order-adjustment-title" subtitle={`${adjustmentRow.empleado} · ${adjustmentRow.nombreApellidos} · ${year}-${String(month).padStart(2, '0')}`}>
              Ajustar pedido mensual
            </ModalTitle>
          </ModalHeader>
          <ModalBody className="space-y-4">
            <div className="rounded-xl border border-sky-500/30 bg-sky-500/10 p-3 text-sm text-metro-text">
              El cálculo automático propone <strong>{adjustmentRow.automaticTickets ?? adjustmentRow.ticketsFinales} tickets</strong>. El ajuste cambia solo el pedido efectivo; no crea ni elimina deuda automáticamente.
            </div>
            <label className="block text-sm font-bold text-metro-text">
              Tickets a pedir
              <input className="mt-1 w-full rounded-lg border border-metro-border bg-metro-panel px-3 py-2 text-sm font-normal text-metro-text outline-none focus:border-metro-red focus:ring-1 focus:ring-metro-red/30" min={0} onChange={(event) => setAdjustmentTickets(Math.max(0, Number.parseInt(event.target.value || '0', 10) || 0))} type="number" value={adjustmentTickets} />
            </label>
            <label className="block text-sm font-bold text-metro-text">
              Motivo del ajuste <span className="text-metro-red">*</span>
              <textarea className="mt-1 min-h-20 w-full resize-y rounded-lg border border-metro-border bg-metro-panel px-3 py-2 text-sm font-normal text-metro-text outline-none placeholder:text-metro-muted focus:border-metro-red focus:ring-1 focus:ring-metro-red/30" maxLength={300} onChange={(event) => setAdjustmentReason(event.target.value)} placeholder="Indica por qué el pedido efectivo difiere del cálculo automático…" value={adjustmentReason} />
            </label>
          </ModalBody>
          <ModalFooter>
            {adjustmentRow.manuallyAdjusted ? (
              <ActionButton iconOnly={false} onClick={() => {
                const next = (config.monthlyOrderAdjustments ?? []).filter((item) => !(item.empleado === adjustmentRow.empleado && item.year === year && item.month === month));
                void onUpdateConfig({ ...config, monthlyOrderAdjustments: next }).then((result) => { if (result.ok) setAdjustmentRow(null); });
              }} size="sm" variant="secondary">Eliminar ajuste</ActionButton>
            ) : null}
            <ActionButton iconOnly={false} onClick={() => setAdjustmentRow(null)} size="sm" variant="secondary">Cancelar</ActionButton>
            <ActionButton disabled={savingAdjustment || !adjustmentReason.trim()} iconOnly={false} onClick={() => {
              setSavingAdjustment(true);
              const next = [...(config.monthlyOrderAdjustments ?? []).filter((item) => !(item.empleado === adjustmentRow.empleado && item.year === year && item.month === month)), { empleado: adjustmentRow.empleado, year, month, tickets: adjustmentTickets, reason: adjustmentReason.trim(), createdAt: new Date().toISOString() }];
              void onUpdateConfig({ ...config, monthlyOrderAdjustments: next }).then((result) => {
                setSavingAdjustment(false);
                if (result.ok) setAdjustmentRow(null);
              });
            }} size="sm" variant="primary">Guardar ajuste</ActionButton>
          </ModalFooter>
        </ModalShell>
      ) : null}

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
  const automaticTickets = row.automaticTickets ?? row.ticketsFinales;
  const appliedDiscounts = Math.max(0, row.diasTeoricos - automaticTickets);
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
            <DetailStat label="Hoja gastos aplicada" value={row.hojasGastoMes} />
            {mode === 'monthly' ? (
              <DetailStat label="Deuda inicial / arrastrada" value={row.deudaEntrante} />
            ) : null}
            <DetailStat
              label={mode === 'monthly' ? 'Descuento total aplicado' : 'Ausencias mes'}
              value={appliedDiscounts}
            />
            {mode === 'monthly' ? (
              <DetailStat label="Deuda pendiente" value={row.deudaPendiente} />
            ) : null}
          </div>

          <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950">
            <h4 className="mb-2 text-sm font-bold">Cálculo aplicado</h4>
            {mode === 'monthly' ? (
              <div className={`grid gap-2 ${row.manuallyAdjusted ? 'md:grid-cols-6' : 'md:grid-cols-4'}`}>
                <DetailFormulaItem label="Días calendario" value={row.diasTeoricos} />
                <DetailFormulaItem label="Hojas de gasto" value={`-${row.hojasGastoMes}`} />
                <DetailFormulaItem label="Deuda aplicada" value={`-${monthlyDebtDiscounts}`} />
                {row.manuallyAdjusted ? <DetailFormulaItem label="Cálculo automático" value={automaticTickets} /> : null}
                {row.manuallyAdjusted ? <DetailFormulaItem label="Ajuste manual" value={`${row.ticketsFinales - automaticTickets >= 0 ? '+' : ''}${row.ticketsFinales - automaticTickets}`} /> : null}
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

          {mode === 'monthly' && row.manuallyAdjusted ? (
            <section className="rounded-xl border border-sky-500/30 bg-sky-500/10 p-3 text-sm text-metro-text">
              <span className="font-bold">Motivo del ajuste manual:</span> {row.adjustmentReason}
            </section>
          ) : null}

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
    <div className="rounded-2xl border border-metro-border bg-metro-panel p-3">
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
    <section className="rounded-2xl border border-metro-border bg-metro-panel p-4 shadow-card">
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
    <section className="rounded-2xl border border-metro-border bg-metro-panel p-4 shadow-card">
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
