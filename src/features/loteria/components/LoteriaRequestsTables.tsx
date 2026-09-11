import { useMemo } from 'react';
import { ActionButton } from '../../../components/ui/ActionButton';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { DataTable, type DataTableColumn } from '../../../shared/table/DataTable';
import { useTableViewPreferences } from '../../../shared/table/useTableViewPreferences';
import {
  lotteryRequestAmount,
  lotteryRequestTotalCount,
  type LotteryCampaign,
  type LotteryPaymentMethod,
  type LotteryRequest,
} from '../domain/loteria';
import { cx, dateText, inputClass, isValidEmail, money } from './loteriaPage.utils';

type ParticipantsColumnId =
  | 'employee'
  | 'name'
  | 'type'
  | 'number1'
  | 'number2'
  | 'total'
  | 'email'
  | 'contact'
  | 'actions';

type TrackingColumnId =
  | 'employee'
  | 'name'
  | 'number1'
  | 'number2'
  | 'total'
  | 'amount'
  | 'paid'
  | 'paymentDate'
  | 'paymentMethod'
  | 'paymentNotes';

const participantColumnIds: ParticipantsColumnId[] = [
  'employee', 'name', 'type', 'number1', 'number2', 'total', 'email', 'contact', 'actions',
];

const trackingColumnIds: TrackingColumnId[] = [
  'employee', 'name', 'number1', 'number2', 'total', 'amount', 'paid', 'paymentDate', 'paymentMethod', 'paymentNotes',
];

function compareEmployeeRequests(first: LotteryRequest, second: LotteryRequest): number {
  const firstRaw = first.empleado?.trim() ?? '';
  const secondRaw = second.empleado?.trim() ?? '';
  const firstNumber = /^\d+$/.test(firstRaw) ? Number.parseInt(firstRaw, 10) : null;
  const secondNumber = /^\d+$/.test(secondRaw) ? Number.parseInt(secondRaw, 10) : null;

  if (firstNumber !== null && secondNumber !== null && firstNumber !== secondNumber) {
    return firstNumber - secondNumber;
  }

  return first.nombre.localeCompare(second.nombre, 'es', { sensitivity: 'base' });
}

export function LoteriaParticipantsTable({
  campaign,
  requests,
  onUpdate,
  onRemove,
}: {
  campaign: LotteryCampaign;
  requests: LotteryRequest[];
  onUpdate: (requestId: string, patch: Partial<LotteryRequest>) => void;
  onRemove: (requestId: string) => void;
}) {
  const {
    preferences,
    setSort,
    setColumnWidth,
    setColumnOrder,
    resetColumnWidths,
  } = useTableViewPreferences<ParticipantsColumnId>({
    storageKey: 'traccion.tableView.loteria.participants',
    defaultPreferences: {
      sort: { columnId: 'employee', direction: 'asc' },
      columnWidths: {},
      columnOrder: null,
    },
    validColumnIds: participantColumnIds,
  });

  const columns = useMemo<Array<DataTableColumn<LotteryRequest, ParticipantsColumnId>>>(() => [
    {
      id: 'employee', header: 'Nº empleado', tone: 'identity', width: 105, sortable: true,
      accessor: (request) => request.empleado,
      compare: compareEmployeeRequests,
      emptyValuesLast: true,
      render: (request) => request.empleado ?? '—',
    },
    {
      id: 'name', header: 'Apellidos / nombre', width: 230, minWidth: 180, sortable: true,
      accessor: (request) => request.nombre,
      render: (request) => (
        <input className={inputClass} disabled={!request.externa} value={request.nombre}
          onChange={(event) => onUpdate(request.id, { nombre: event.target.value })} />
      ),
    },
    {
      id: 'type', header: 'Tipo', width: 100, sortable: true,
      accessor: (request) => request.externa ? 'Externa' : 'Plantilla',
      render: (request) => request.externa
        ? <StatusBadge size="xs" tone="warning">Externa</StatusBadge>
        : <StatusBadge size="xs" tone="success">Plantilla</StatusBadge>,
    },
    {
      id: 'number1', header: campaign.numero1 || 'Nº 1', width: 92, sortable: true,
      accessor: (request) => request.decimosNumero1,
      render: (request) => (
        <input className={`${inputClass} text-center`} min="0" step="1" type="number" value={request.decimosNumero1}
          onChange={(event) => onUpdate(request.id, { decimosNumero1: Math.max(0, Number(event.target.value)) })} />
      ),
    },
    {
      id: 'number2', header: campaign.numero2 || 'Nº 2', width: 92, sortable: true,
      accessor: (request) => request.decimosNumero2,
      render: (request) => (
        <input className={`${inputClass} text-center`} min="0" step="1" type="number" value={request.decimosNumero2}
          onChange={(event) => onUpdate(request.id, { decimosNumero2: Math.max(0, Number(event.target.value)) })} />
      ),
    },
    {
      id: 'total', header: 'Total', width: 78, sortable: true,
      accessor: lotteryRequestTotalCount,
      render: (request) => <span className="block text-center font-bold text-metro-text">{lotteryRequestTotalCount(request)}</span>,
    },
    {
      id: 'email', header: 'Email', width: 230, minWidth: 180, sortable: true,
      accessor: (request) => request.email,
      render: (request) => (
        <input className={cx(inputClass, request.email && !isValidEmail(request.email) && 'border-amber-500/60')}
          placeholder="nombre@dominio.es" type="email" value={request.email}
          onChange={(event) => onUpdate(request.id, { email: event.target.value })} />
      ),
    },
    {
      id: 'contact', header: 'Contacto / nota', width: 240, minWidth: 180,
      accessor: (request) => request.contactoObservaciones,
      render: (request) => (
        <input className={inputClass} placeholder="Teléfono, nota breve…" value={request.contactoObservaciones}
          onChange={(event) => onUpdate(request.id, { contactoObservaciones: event.target.value })} />
      ),
    },
    {
      id: 'actions', header: 'Acciones', width: 74, minWidth: 74, maxWidth: 74,
      isActionColumn: true, reorderable: false, resizable: false,
      render: (request) => (
        <div className="flex justify-end">
          <ActionButton onClick={() => onRemove(request.id)} size="sm" title="Eliminar participante" variant="delete" />
        </div>
      ),
    },
  ], [campaign.numero1, campaign.numero2, onRemove, onUpdate]);

  return (
    <DataTable
      ariaLabel="Personas de la campaña de Lotería"
      columns={columns}
      rows={requests}
      getRowId={(request) => request.id}
      sort={preferences.sort}
      onSortChange={setSort}
      columnWidths={preferences.columnWidths}
      onColumnWidthChange={setColumnWidth}
      onResetColumnWidths={resetColumnWidths}
      columnOrder={preferences.columnOrder}
      onColumnOrderChange={setColumnOrder}
      emptyMessage="Todavía no hay participantes. Usa el buscador de Plantilla o el alta de persona externa."
      maxHeightClassName="max-h-[430px]"
      preserveScrollOnRowsChange
    />
  );
}

export function LoteriaTrackingTable({
  campaign,
  requests,
  onUpdate,
  onTogglePaid,
}: {
  campaign: LotteryCampaign;
  requests: LotteryRequest[];
  onUpdate: (requestId: string, patch: Partial<LotteryRequest>) => void;
  onTogglePaid: (request: LotteryRequest) => void;
}) {
  const {
    preferences,
    setSort,
    setColumnWidth,
    setColumnOrder,
    resetColumnWidths,
  } = useTableViewPreferences<TrackingColumnId>({
    storageKey: 'traccion.tableView.loteria.tracking',
    defaultPreferences: {
      sort: { columnId: 'employee', direction: 'asc' },
      columnWidths: {},
      columnOrder: null,
    },
    validColumnIds: trackingColumnIds,
  });

  const columns = useMemo<Array<DataTableColumn<LotteryRequest, TrackingColumnId>>>(() => [
    {
      id: 'employee', header: 'Nº empleado', tone: 'identity', width: 105, sortable: true,
      accessor: (request) => request.empleado,
      compare: compareEmployeeRequests,
      emptyValuesLast: true,
      render: (request) => request.empleado ?? 'Externa',
    },
    {
      id: 'name', header: 'Apellidos / nombre', width: 230, minWidth: 180, sortable: true,
      accessor: (request) => request.nombre,
      render: (request) => <span className="font-semibold text-metro-text">{request.nombre}</span>,
    },
    {
      id: 'number1', header: campaign.numero1 || 'Nº 1', width: 92, sortable: true,
      accessor: (request) => request.decimosNumero1,
      render: (request) => (
        <input className={`${inputClass} text-center`} min="0" step="1" type="number" value={request.decimosNumero1}
          onChange={(event) => onUpdate(request.id, { decimosNumero1: Math.max(0, Number(event.target.value)) })} />
      ),
    },
    {
      id: 'number2', header: campaign.numero2 || 'Nº 2', width: 92, sortable: true,
      accessor: (request) => request.decimosNumero2,
      render: (request) => (
        <input className={`${inputClass} text-center`} min="0" step="1" type="number" value={request.decimosNumero2}
          onChange={(event) => onUpdate(request.id, { decimosNumero2: Math.max(0, Number(event.target.value)) })} />
      ),
    },
    {
      id: 'total', header: 'Total', width: 75, sortable: true,
      accessor: lotteryRequestTotalCount,
      render: (request) => <span className="block text-center font-bold text-metro-text">{lotteryRequestTotalCount(request)}</span>,
    },
    {
      id: 'amount', header: 'Importe', tone: 'financial', width: 100, sortable: true,
      accessor: (request) => lotteryRequestAmount(campaign, request),
      render: (request) => <span className="block text-right font-bold text-metro-text">{money(lotteryRequestAmount(campaign, request))}</span>,
    },
    {
      id: 'paid', header: 'Pagado', width: 84, sortable: true,
      accessor: (request) => request.pagado ? 1 : 0,
      render: (request) => (
        <div className="flex justify-center">
          <button aria-label={request.pagado ? 'Marcar como pendiente' : 'Marcar como pagado'}
            className={cx('relative h-5 w-9 rounded-full transition', request.pagado ? 'bg-emerald-500' : 'bg-metro-raised')}
            onClick={() => onTogglePaid(request)} type="button">
            <span className={cx('absolute top-0.5 h-4 w-4 rounded-full bg-white transition', request.pagado ? 'left-[18px]' : 'left-0.5')} />
          </button>
        </div>
      ),
    },
    {
      id: 'paymentDate', header: 'Fecha pago', width: 108, sortable: true,
      accessor: (request) => request.fechaPago,
      render: (request) => dateText(request.fechaPago),
    },
    {
      id: 'paymentMethod', header: 'Forma pago', width: 115, sortable: true,
      accessor: (request) => request.formaPago,
      render: (request) => (
        <select className={inputClass} disabled={!request.pagado} value={request.formaPago}
          onChange={(event) => onUpdate(request.id, { formaPago: event.target.value as LotteryPaymentMethod })}>
          <option value="efectivo">Efectivo</option><option value="bizum">Bizum</option>
        </select>
      ),
    },
    {
      id: 'paymentNotes', header: 'Observaciones pago', width: 260, minWidth: 180,
      accessor: (request) => request.observacionesPago,
      render: (request) => (
        <input className={inputClass} placeholder="Incidencia o nota del cobro" value={request.observacionesPago}
          onChange={(event) => onUpdate(request.id, { observacionesPago: event.target.value })} />
      ),
    },
  ], [campaign, onTogglePaid, onUpdate]);

  return (
    <DataTable
      ariaLabel="Seguimiento de décimos y pagos de Lotería"
      columns={columns}
      rows={requests}
      getRowId={(request) => request.id}
      sort={preferences.sort}
      onSortChange={setSort}
      columnWidths={preferences.columnWidths}
      onColumnWidthChange={setColumnWidth}
      onResetColumnWidths={resetColumnWidths}
      columnOrder={preferences.columnOrder}
      onColumnOrderChange={setColumnOrder}
      emptyMessage="No hay participantes que coincidan con los filtros. Las altas se realizan en Octubre."
      maxHeightClassName="max-h-[470px]"
      preserveScrollOnRowsChange
    />
  );
}
