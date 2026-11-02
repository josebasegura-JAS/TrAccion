import { useState } from 'react';
import { cashChangesSinceLastClose, cashExpected, cashSnapshot, roundCents, parseCashAmount, type LotteryCashMovement } from '../domain/arqueos';
import type { LotteryCampaign } from '../domain/loteria';
import { inputClass, money } from './loteriaPage.utils';

const uniqueId = () => crypto.randomUUID();

export function LoteriaArqueos({ campaign, onSave, blocked = false }: {
  campaign: LotteryCampaign;
  onSave: (next: LotteryCampaign, message: string) => Promise<boolean>;
  blocked?: boolean;
}) {
  const [counted, setCounted] = useState('');
  const [reason, setReason] = useState('');
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const expected = cashExpected(campaign);
  const countedValue = parseCashAmount(counted, true);
  const validCount = countedValue !== null;
  const difference = validCount && countedValue !== null ? roundCents(countedValue - expected) : null;
  const changes = cashChangesSinceLastClose(campaign);
  const savesAllowed = !saving && !blocked;

  async function closeCash() {
    if (!validCount || !savesAllowed) return;
    setSaving(true);
    try {
      const snapshot = cashSnapshot(campaign, countedValue!, new Date().toISOString(), uniqueId());
      const next = { ...campaign, cashArqueos: [...(campaign.cashArqueos ?? []), snapshot] };
      const ok = await onSave(next, 'Arqueo guardado.');
      if (ok) {
        setCounted('');
        setNotice(snapshot.difference === 0 ? 'Arqueo cuadrado y registrado.' : 'Arqueo registrado con diferencia pendiente de revisar.');
      } else setNotice('No se ha podido guardar el arqueo. Comprueba la conexión y reintenta.');
    } finally { setSaving(false); }
  }

  async function addMovement() {
    const value = parseCashAmount(amount, false);
    if (!reason.trim() || value === null || !savesAllowed) {
      setNotice('Indica un concepto y un importe distinto de cero (negativo para retirar efectivo).');
      return;
    }
    const movement: LotteryCashMovement = { id: uniqueId(), at: new Date().toISOString(), amount: value!, reason: reason.trim() };
    setSaving(true);
    try {
      const ok = await onSave({ ...campaign, cashMovements: [...(campaign.cashMovements ?? []), movement] }, 'Movimiento de caja guardado.');
      if (ok) { setReason(''); setAmount(''); setNotice('Movimiento guardado.'); }
      else setNotice('No se ha podido guardar el movimiento.');
    } finally { setSaving(false); }
  }

  return <div className="space-y-4">
    <section className="rounded-xl border border-metro-border bg-metro-panel p-4 space-y-3">
      <h3 className="text-sm font-bold text-metro-text">Arqueo de caja fuerte</h3>
      <p className="text-xs text-metro-secondary">El primer cierre toma todos los cobros en efectivo registrados como referencia. Los siguientes parten del último efectivo contado, más los cambios de cobros y los movimientos de caja. Guarda los pagos antes de contar.</p>
      {blocked && <p role="alert" className="text-xs text-amber-300">Guarda los cambios pendientes de Lotería antes de registrar un arqueo o un movimiento de caja.</p>}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg bg-metro-surface p-3"><p className="text-xs text-metro-muted">Efectivo esperado</p><strong>{money(expected)}</strong></div>
        <label className="space-y-1 text-xs text-metro-muted">Efectivo contado (€)<input className={inputClass} inputMode="decimal" type="text" value={counted} onChange={(event) => setCounted(event.target.value)} placeholder="0,00" /></label>
        <div className="rounded-lg bg-metro-surface p-3"><p className="text-xs text-metro-muted">Diferencia</p><strong className={difference === null ? '' : difference === 0 ? 'text-emerald-400' : 'text-red-300'}>{difference === null ? '—' : money(difference)}</strong></div>
      </div>
      <button type="button" disabled={!validCount || saving || blocked} className="rounded-lg bg-metro-red px-4 py-2 text-xs font-bold text-white disabled:opacity-40" onClick={() => void closeCash()}>{saving ? 'Guardando…' : 'Guardar arqueo'}</button>
      {notice && <p role="status" className="text-xs text-metro-secondary">{notice}</p>}
    </section>

    <section className="rounded-xl border border-metro-border bg-metro-panel p-4 space-y-3">
      <h3 className="text-sm font-bold text-metro-text">Entradas y salidas de caja</h3>
      <p className="text-xs text-metro-muted">Los cobros de personas se registran solo en Seguimiento, no aquí. Utiliza importes negativos para retiradas de la caja fuerte o devoluciones; positivos para entradas ajenas a esos cobros.</p>
      <div className="flex flex-wrap gap-2 items-end">
        <label className="min-w-52 flex-1 space-y-1 text-xs text-metro-muted">Concepto<input className={inputClass} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Ej.: entrega al lotero" /></label>
        <label className="w-36 space-y-1 text-xs text-metro-muted">Importe (€)<input className={inputClass} value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="-100,00" inputMode="decimal" /></label>
        <button type="button" className="rounded-lg border border-metro-border px-3 py-2 text-xs font-bold text-metro-text disabled:opacity-40" disabled={saving || blocked} onClick={() => void addMovement()}>Registrar movimiento</button>
      </div>
      <ul className="space-y-1 text-xs text-metro-secondary">
        {(campaign.cashMovements ?? []).slice(-8).reverse().map((entry) => <li key={entry.id}>{new Date(entry.at).toLocaleString('es-ES')} · {entry.reason}: {money(entry.amount)}</li>)}
      </ul>
    </section>

    <section className="rounded-xl border border-metro-border bg-metro-panel p-4 space-y-2">
      <h3 className="text-sm font-bold text-metro-text">Cambios desde el último arqueo</h3>
      <ul className="max-h-48 overflow-auto space-y-1 text-xs text-metro-secondary">
        {changes.length ? changes.map((change, index) => <li key={index}>• {change}</li>) : <li>No se han registrado cambios en el efectivo desde el último arqueo.</li>}
      </ul>
    </section>
    <section className="rounded-xl border border-metro-border bg-metro-panel p-4 space-y-2">
      <h3 className="text-sm font-bold text-metro-text">Histórico de arqueos (inmutable)</h3>
      {(campaign.cashArqueos ?? []).length === 0 && <p className="text-xs text-metro-muted">Todavía no hay cierres. Realiza el primer arqueo cuando la caja esté cuadrada.</p>}
      {[...(campaign.cashArqueos ?? [])].reverse().map((entry) => <div key={entry.id} className="rounded-lg border border-metro-border p-2">
        <button type="button" className="w-full text-left text-xs text-metro-text" onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}>
          {new Date(entry.at).toLocaleString('es-ES')} · Esperado {money(entry.expected)} · Contado {money(entry.counted)} · <strong className={entry.difference === 0 ? 'text-emerald-400' : 'text-red-300'}>Diferencia {money(entry.difference)}</strong>
        </button>
        {expandedId === entry.id && <div className="mt-2 max-h-48 overflow-auto border-t border-metro-border pt-2 text-xs text-metro-muted space-y-1">
          <p>Pagos en efectivo al cierre: {money(entry.cashPaid)} · Movimientos acumulados: {money(entry.movementNet)}</p>
          {entry.payments.map((p) => <p key={p.id}>{p.nombre}: {money(p.amount)} · {p.formaPago}</p>)}
          {entry.movements.map((m) => <p key={m.id}>{m.reason}: {money(m.amount)}</p>)}
        </div>}
      </div>)}
    </section>
  </div>;
}
