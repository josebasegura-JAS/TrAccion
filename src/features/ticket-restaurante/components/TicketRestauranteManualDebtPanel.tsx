import { AlertTriangle, Ban, Plus, ReceiptText } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ActionButton } from '../../../components/ui/ActionButton';
import { Field, Input, Select, Textarea } from '../../../components/ui/Field';
import { ModalBody, ModalFooter, ModalHeader, ModalShell, ModalTitle } from '../../../components/ui/ModalShell';
import { CompactTable, CompactTableBody, CompactTableHead } from '../../../shared/table/CompactTable';
import {
  splitManualDebtInstallments,
  type TicketManualDebt,
  type TicketManualDebtDraft,
  type TicketMonthCalculation,
  type TicketPerson,
} from '../domain/ticketRestaurante';

const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

function monthLabel(year: number, month: number): string {
  return `${MONTHS[month - 1] ?? month} ${year}`;
}

function monthKey(year: number, month: number): number {
  return year * 12 + month - 1;
}

function addMonths(year: number, month: number, offset: number): { year: number; month: number } {
  const date = new Date(Date.UTC(year, month - 1 + offset, 1));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
}

function pendingManualTickets(calculation: TicketMonthCalculation, debtId: string): number {
  const prefix = `manual-debt:${debtId}:`;
  return calculation.rows.reduce(
    (total, row) => total + row.deudaPendienteDetalle.filter((detail) => detail.id.startsWith(prefix)).length,
    0,
  );
}

function scheduledThrough(debt: TicketManualDebt, year: number, month: number): number {
  const target = monthKey(year, month);
  const installments = splitManualDebtInstallments(debt.totalTickets, debt.months);
  return installments.reduce((total, amount, index) => {
    const scheduled = addMonths(debt.startYear, debt.startMonth, index);
    return monthKey(scheduled.year, scheduled.month) <= target ? total + amount : total;
  }, 0);
}

function debtStatus(
  debt: TicketManualDebt,
  calculation: TicketMonthCalculation,
  year: number,
  month: number,
): { label: string; className: string; applied: number | string; pending: number | string } {
  if (debt.cancelledAt) {
    return { label: 'Anulada', className: 'bg-slate-500/15 text-slate-300', applied: '—', pending: 0 };
  }
  const scheduled = scheduledThrough(debt, year, month);
  const queuedPending = pendingManualTickets(calculation, debt.id);
  const applied = Math.max(0, scheduled - queuedPending);
  const pending = Math.max(0, debt.totalTickets - applied);
  if (applied >= debt.totalTickets) {
    return { label: 'Finalizada', className: 'bg-emerald-500/10 text-emerald-300', applied, pending: 0 };
  }
  if (scheduled === 0) {
    return { label: 'Pendiente', className: 'bg-blue-500/10 text-blue-300', applied: 0, pending: 0 };
  }
  return { label: 'En curso', className: 'bg-amber-500/10 text-amber-300', applied, pending };
}

function emptyDraft(year: number, month: number): TicketManualDebtDraft {
  return {
    empleado: '',
    nombreApellidos: '',
    totalTickets: 1,
    originYear: year,
    originMonth: month,
    startYear: year,
    startMonth: month,
    months: 1,
    reason: '',
    observations: '',
  };
}

export function TicketRestauranteManualDebtPanel({
  people,
  debts,
  calculation,
  year,
  month,
  onCreate,
  onCancel,
}: {
  people: TicketPerson[];
  debts: TicketManualDebt[];
  calculation: TicketMonthCalculation;
  year: number;
  month: number;
  onCreate: (draft: TicketManualDebtDraft) => Promise<{ ok: boolean; message?: string }>;
  onCancel: (id: string, reason: string) => Promise<{ ok: boolean; message?: string }>;
}) {
  const [draft, setDraft] = useState<TicketManualDebtDraft>(() => emptyDraft(year, month));
  const [message, setMessage] = useState('');
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [cancellationReason, setCancellationReason] = useState('');

  const activePeople = useMemo(
    () => people.filter((person) => person.activo && !person.deletedAt),
    [people],
  );
  const installments = useMemo(
    () => splitManualDebtInstallments(draft.totalTickets, draft.months),
    [draft.months, draft.totalTickets],
  );
  const activeDebtTickets = debts
    .filter((debt) => !debt.cancelledAt)
    .reduce((sum, debt) => sum + debt.totalTickets, 0);
  const currentPending = debts
    .filter((debt) => !debt.cancelledAt)
    .reduce((sum, debt) => {
      const status = debtStatus(debt, calculation, year, month);
      return sum + (typeof status.pending === 'number' ? status.pending : 0);
    }, 0);

  const updatePerson = (empleado: string) => {
    const person = activePeople.find((item) => item.empleado === empleado);
    setDraft((current) => ({
      ...current,
      empleado,
      nombreApellidos: person?.nombreApellidos ?? '',
    }));
  };

  const save = async () => {
    setMessage('');
    if (!draft.empleado || draft.totalTickets < 1 || draft.months < 1 || !draft.reason.trim()) {
      setMessage('Completa persona, tickets, meses y motivo.');
      return;
    }
    if (draft.months > draft.totalTickets) {
      setMessage('El número de meses no puede ser mayor que los tickets de deuda.');
      return;
    }
    if (monthKey(draft.startYear, draft.startMonth) < monthKey(draft.originYear, draft.originMonth)) {
      setMessage('El primer mes de descuento no puede ser anterior al mes de origen.');
      return;
    }
    const result = await onCreate(draft);
    if (!result.ok) {
      setMessage(result.message ?? 'No se ha podido guardar la deuda manual.');
      return;
    }
    setDraft(emptyDraft(year, month));
    setMessage('Deuda manual guardada. Se aplicará al pedido mensual según el reparto indicado.');
  };

  const confirmCancellation = async () => {
    if (!cancellingId || !cancellationReason.trim()) return;
    const result = await onCancel(cancellingId, cancellationReason.trim());
    if (!result.ok) {
      setMessage(result.message ?? 'No se ha podido anular la deuda.');
      return;
    }
    setCancellingId(null);
    setCancellationReason('');
    setMessage('Deuda manual anulada.');
  };

  return (
    <div className="space-y-3">
      <section className="rounded-xl border border-metro-border bg-metro-panel p-3">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h3 className="flex items-center gap-2 text-base font-bold text-metro-text">
              <ReceiptText className="h-4 w-4 text-red-300" />
              Deuda manual de tickets
            </h3>
            <p className="mt-0.5 max-w-3xl text-xs text-metro-muted">
              Corrige tickets entregados de más. La deuda se descuenta únicamente del pedido mensual;
              no modifica el cómputo de cotización. Si una cuota no cabe, se arrastra al mes siguiente.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg border border-metro-border bg-metro-surface px-3 py-2">
              <p className="text-[9px] font-semibold uppercase text-metro-muted">Registros</p>
              <p className="text-lg font-extrabold text-metro-text">{debts.length}</p>
            </div>
            <div className="rounded-lg border border-amber-400/20 bg-amber-500/[0.06] px-3 py-2">
              <p className="text-[9px] font-semibold uppercase text-amber-300">Tickets alta</p>
              <p className="text-lg font-extrabold text-metro-text">{activeDebtTickets}</p>
            </div>
            <div className="rounded-lg border border-red-400/20 bg-red-500/[0.06] px-3 py-2">
              <p className="text-[9px] font-semibold uppercase text-red-300">Pendiente ahora</p>
              <p className="text-lg font-extrabold text-metro-text">{currentPending}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-metro-border bg-metro-panel p-3">
        <div className="mb-3 flex items-center gap-2">
          <Plus className="h-4 w-4 text-red-300" />
          <h3 className="text-sm font-bold text-metro-text">Nueva deuda manual</h3>
        </div>
        <div className="grid gap-3 xl:grid-cols-12">
          <Field className="xl:col-span-4" label="Persona" required>
            <Select required value={draft.empleado} onChange={(event) => updatePerson(event.target.value)}>
              <option value="">Seleccionar persona…</option>
              {activePeople.map((person) => (
                <option key={person.empleado} value={person.empleado}>
                  {person.empleado} · {person.nombreApellidos}
                </option>
              ))}
            </Select>
          </Field>
          <Field className="xl:col-span-2" label="Tickets de deuda" required>
            <Input min={1} required type="number" value={draft.totalTickets} onChange={(event) => setDraft((current) => ({ ...current, totalTickets: Math.max(1, Number(event.target.value) || 1) }))} />
          </Field>
          <Field className="xl:col-span-2" label="Meses para descontar" required>
            <Input min={1} max={Math.min(24, Math.max(1, draft.totalTickets))} required type="number" value={draft.months} onChange={(event) => setDraft((current) => ({ ...current, months: Math.min(24, Math.max(1, Number(event.target.value) || 1)) }))} />
          </Field>
          <Field className="xl:col-span-2" label="Mes origen" required>
            <Select required value={draft.originMonth} onChange={(event) => setDraft((current) => ({ ...current, originMonth: Number(event.target.value) }))}>
              {MONTHS.map((label, index) => <option key={label} value={index + 1}>{label}</option>)}
            </Select>
          </Field>
          <Field className="xl:col-span-2" label="Año origen" required>
            <Input min={2020} max={2200} required type="number" value={draft.originYear} onChange={(event) => setDraft((current) => ({ ...current, originYear: Number(event.target.value) || year }))} />
          </Field>
          <Field className="xl:col-span-2" label="Primer mes descuento" required>
            <Select required value={draft.startMonth} onChange={(event) => setDraft((current) => ({ ...current, startMonth: Number(event.target.value) }))}>
              {MONTHS.map((label, index) => <option key={label} value={index + 1}>{label}</option>)}
            </Select>
          </Field>
          <Field className="xl:col-span-2" label="Año descuento" required>
            <Input min={2020} max={2200} required type="number" value={draft.startYear} onChange={(event) => setDraft((current) => ({ ...current, startYear: Number(event.target.value) || year }))} />
          </Field>
          <Field className="xl:col-span-5" label="Motivo" required>
            <Input placeholder="Ej.: tickets cargados de más en junio" required value={draft.reason} onChange={(event) => setDraft((current) => ({ ...current, reason: event.target.value }))} />
          </Field>
          <Field className="xl:col-span-3" label="Observaciones">
            <Input value={draft.observations} onChange={(event) => setDraft((current) => ({ ...current, observations: event.target.value }))} />
          </Field>
        </div>

        <div className="mt-3 flex flex-col gap-2 rounded-lg border border-blue-400/20 bg-blue-500/[0.05] px-3 py-2 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-blue-300">Vista previa del reparto</p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {installments.map((amount, index) => {
                const period = addMonths(draft.startYear, draft.startMonth, index);
                return (
                  <span key={`${period.year}-${period.month}`} className="rounded-full border border-blue-400/20 bg-blue-500/10 px-2 py-1 text-[10px] font-semibold text-blue-200">
                    {monthLabel(period.year, period.month)} · {amount} ticket{amount === 1 ? '' : 's'}
                  </span>
                );
              })}
            </div>
          </div>
          <ActionButton icon={Plus} iconOnly={false} onClick={() => void save()} size="sm" variant="add">
            Guardar deuda
          </ActionButton>
        </div>
        {message ? <p className="mt-2 text-xs font-semibold text-metro-secondary">{message}</p> : null}
      </section>

      <section className="overflow-hidden rounded-xl border border-metro-border bg-metro-panel">
        <div className="border-b border-metro-border px-3 py-2">
          <h3 className="text-sm font-bold text-metro-text">Histórico y seguimiento</h3>
          <p className="text-[10px] text-metro-muted">Situación calculada para {monthLabel(year, month)}.</p>
        </div>
        <div className="overflow-x-auto">
          <CompactTable>
            <CompactTableHead>
              <tr>
                <th className="px-2 py-2">Persona</th>
                <th className="px-2 py-2">Origen</th>
                <th className="px-2 py-2">Motivo</th>
                <th className="px-2 py-2">Total</th>
                <th className="px-2 py-2">Reparto</th>
                <th className="px-2 py-2">Aplicados</th>
                <th className="px-2 py-2">Pendientes</th>
                <th className="px-2 py-2">Estado</th>
                <th className="px-2 py-2">Acciones</th>
              </tr>
            </CompactTableHead>
            <CompactTableBody>
              {debts.length === 0 ? (
                <tr><td className="px-3 py-8 text-center text-sm text-metro-muted" colSpan={9}>No hay deudas manuales registradas.</td></tr>
              ) : debts.map((debt) => {
                const status = debtStatus(debt, calculation, year, month);
                return (
                  <tr className="border-t border-metro-border" key={debt.id}>
                    <td className="px-2 py-2"><p className="font-semibold text-metro-text">{debt.nombreApellidos}</p><p className="text-[10px] text-metro-muted">{debt.empleado}</p></td>
                    <td className="px-2 py-2 text-metro-secondary">{monthLabel(debt.originYear, debt.originMonth)}</td>
                    <td className="max-w-[280px] px-2 py-2"><p className="truncate text-metro-text" title={debt.reason}>{debt.reason}</p>{debt.observations ? <p className="truncate text-[10px] text-metro-muted">{debt.observations}</p> : null}</td>
                    <td className="px-2 py-2 font-bold text-metro-text">{debt.totalTickets}</td>
                    <td className="px-2 py-2 text-metro-secondary">{debt.months} mes{debt.months === 1 ? '' : 'es'}</td>
                    <td className="px-2 py-2 font-semibold text-emerald-300">{status.applied}</td>
                    <td className="px-2 py-2 font-semibold text-amber-300">{status.pending}</td>
                    <td className="px-2 py-2"><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${status.className}`}>{status.label}</span></td>
                    <td className="px-2 py-2">
                      {!debt.cancelledAt && status.label !== 'Finalizada' ? (
                        <button className="inline-flex items-center gap-1 rounded-lg border border-metro-border px-2 py-1 text-[10px] font-semibold text-metro-secondary hover:border-metro-red hover:text-red-300" onClick={() => setCancellingId(debt.id)} type="button">
                          <Ban className="h-3 w-3" /> Anular
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </CompactTableBody>
          </CompactTable>
        </div>
      </section>

      {cancellingId ? (
        <ModalShell labelledBy="cancel-manual-debt-title" maxWidthClassName="max-w-lg" onClose={() => setCancellingId(null)}>
          <ModalHeader>
            <ModalTitle id="cancel-manual-debt-title" subtitle="La deuda dejará de generar nuevas cuotas y se retirará el pendiente manual desde el mes de anulación.">Anular deuda manual</ModalTitle>
          </ModalHeader>
          <ModalBody>
            <div className="flex gap-2 rounded-lg border border-amber-400/20 bg-amber-500/[0.06] p-2 text-xs text-amber-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              Las cuotas ya aplicadas en meses anteriores se conservan en el histórico del cálculo.
            </div>
            <Field className="mt-3" label="Motivo de anulación" required>
              <Textarea rows={3} required value={cancellationReason} onChange={(event) => setCancellationReason(event.target.value)} />
            </Field>
          </ModalBody>
          <ModalFooter>
            <ActionButton iconOnly={false} onClick={() => setCancellingId(null)} size="sm" variant="secondary">Cancelar</ActionButton>
            <ActionButton disabled={!cancellationReason.trim()} icon={Ban} iconOnly={false} onClick={() => void confirmCancellation()} size="sm" variant="delete">Anular deuda</ActionButton>
          </ModalFooter>
        </ModalShell>
      ) : null}
    </div>
  );
}
