import { useState } from 'react';
import {
  normalizeTicketRestaurantConfig,
  type TicketRestaurantConfig,
  TICKET_RESTAURANT_MIN_ABSENCE_DATE,
} from '../domain/ticketRestaurante';
import { formatCurrency } from './ticketRestauranteFormat';

export function TicketPriceModal({
  config,
  onClose,
  onSave,
}: {
  config: TicketRestaurantConfig;
  onClose: () => void;
  onSave: (config: TicketRestaurantConfig) => void;
}) {
  const normalizedConfig = normalizeTicketRestaurantConfig(config);
  const latestPrice = normalizedConfig.priceHistory.at(-1) ?? normalizedConfig.priceHistory[0];
  const [amount, setAmount] = useState(
    String(latestPrice?.amount ?? normalizedConfig.importeTicket),
  );
  const [effectiveFrom, setEffectiveFrom] = useState(latestPrice?.effectiveFrom ?? '2026-03-01');
  const parsedAmount = Number(amount.replace(',', '.'));
  const canSave =
    Number.isFinite(parsedAmount) && parsedAmount >= 0 && /^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom);

  const savePrice = () => {
    if (!canSave) return;
    const nextHistory = [
      ...normalizedConfig.priceHistory.filter((entry) => entry.effectiveFrom !== effectiveFrom),
      { amount: parsedAmount, effectiveFrom },
    ].sort((first, second) => first.effectiveFrom.localeCompare(second.effectiveFrom));

    onSave(
      normalizeTicketRestaurantConfig({
        ...normalizedConfig,
        importeTicket: nextHistory.at(-1)?.amount ?? parsedAmount,
        priceHistory: nextHistory,
      }),
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-xl rounded-2xl border border-metro-border bg-metro-surface shadow-card">
        <div className="border-b border-metro-border p-3">
          <h3 className="text-lg font-bold text-metro-text">Precio ticket</h3>
          <p className="text-xs text-metro-muted">
            El cálculo usa el último precio cuya fecha de inicio sea anterior o igual al mes
            calculado.
          </p>
        </div>
        <div className="space-y-3 p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block text-xs font-semibold text-metro-text">
              Importe ticket
              <input
                className="mt-1 w-full rounded-lg border border-metro-border bg-metro-surface px-2.5 py-1.5 text-sm text-metro-text outline-none focus:border-metro-red"
                min="0"
                onChange={(event) => setAmount(event.target.value)}
                step="0.01"
                type="number"
                value={amount}
              />
            </label>
            <label className="block text-xs font-semibold text-metro-text">
              Vigente desde
              <input
                className="mt-1 w-full rounded-lg border border-metro-border bg-metro-surface px-2.5 py-1.5 text-sm text-metro-text outline-none focus:border-metro-red"
                onChange={(event) => setEffectiveFrom(event.target.value)}
                type="date"
                value={effectiveFrom}
              />
            </label>
          </div>
          <div className="rounded-xl border border-metro-border bg-metro-panel p-2">
            <p className="mb-1 text-xs font-bold text-metro-text">Histórico de precios</p>
            <div className="max-h-32 overflow-auto text-xs text-metro-muted">
              {normalizedConfig.priceHistory.map((entry) => (
                <p key={entry.effectiveFrom}>
                  {entry.effectiveFrom}:{' '}
                  <span className="font-semibold text-metro-text">
                    {formatCurrency(entry.amount)}
                  </span>
                </p>
              ))}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-metro-border p-3">
          <button
            className="rounded-lg border border-metro-border px-3 py-1.5 text-xs font-semibold text-metro-text hover:border-metro-red"
            onClick={onClose}
            type="button"
          >
            Cancelar
          </button>
          <button
            className="rounded-lg bg-metro-red px-3 py-1.5 text-xs font-semibold text-white hover:bg-metro-dark disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!canSave}
            onClick={savePrice}
            type="button"
          >
            Guardar precio
          </button>
        </div>
      </div>
    </div>
  );
}

export function TicketRulesModal({
  config,
  onClose,
  onSave,
}: {
  config: TicketRestaurantConfig;
  onClose: () => void;
  onSave: (config: TicketRestaurantConfig) => void;
}) {
  const normalizedConfig = normalizeTicketRestaurantConfig(config);
  const [debtStartDate, setDebtStartDate] = useState(normalizedConfig.rules.debtStartDate);
  const [nonDiscountableRulesText, setNonDiscountableRulesText] = useState(
    Object.entries(normalizedConfig.rules.nonDiscountableMotivesByCalendar)
      .map(([calendar, motives]) => `${calendar}: ${motives.join(', ')}`)
      .join('\n'),
  );

  const parseNonDiscountableRules = (): Record<string, string[]> =>
    Object.fromEntries(
      nonDiscountableRulesText
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line): [string, string[]] => {
          // Solo el primer ':' separa calendario de motivos; los motivos
          // pueden contener ':' sin truncarse.
          const separatorIndex = line.indexOf(':');
          const calendar = separatorIndex >= 0 ? line.slice(0, separatorIndex) : line;
          const motives = separatorIndex >= 0 ? line.slice(separatorIndex + 1) : '';
          return [
            calendar.trim(),
            motives
              .split(',')
              .map((motivo) => motivo.trim())
              .filter(Boolean),
          ];
        })
        .filter(([calendar]) => Boolean(calendar)),
    );

  const saveRules = () => {
    onSave(
      normalizeTicketRestaurantConfig({
        ...normalizedConfig,
        rules: {
          debtStartDate,
          nonDiscountableMotivesByCalendar: parseNonDiscountableRules(),
        },
      }),
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-2xl border border-metro-border bg-metro-surface shadow-card">
        <div className="border-b border-metro-border p-3">
          <h3 className="text-lg font-bold text-metro-text">Reglas de cálculo</h3>
          <p className="text-xs text-metro-muted">
            Parámetros mínimos del módulo. Los días sin pedido se gestionan marcando días sin ticket
            en cada calendario.
          </p>
        </div>
        <div className="max-h-[70vh] space-y-3 overflow-auto p-3">
          <label className="block text-xs font-semibold text-metro-text">
            Fecha inicio cómputo deuda
            <input
              className="mt-1 w-full rounded-lg border border-metro-border bg-metro-surface px-2.5 py-1.5 text-sm text-metro-text outline-none focus:border-metro-red"
              min={TICKET_RESTAURANT_MIN_ABSENCE_DATE}
              onChange={(event) => setDebtStartDate(event.target.value)}
              type="date"
              value={debtStartDate}
            />
            <span className="mt-1 block text-[11px] font-normal text-metro-muted">
              No puede ser anterior al {TICKET_RESTAURANT_MIN_ABSENCE_DATE}: el módulo excluye por
              diseño las ausencias que empiezan antes de esa fecha.
            </span>
          </label>

          <label className="block text-xs font-semibold text-metro-text">
            Motivos que no descuentan por calendario
            <textarea
              className="mt-1 h-20 w-full rounded-lg border border-metro-border bg-metro-surface px-2.5 py-1.5 text-sm text-metro-text outline-none focus:border-metro-red"
              onChange={(event) => setNonDiscountableRulesText(event.target.value)}
              value={nonDiscountableRulesText}
            />
            <span className="mt-1 block text-[11px] text-metro-muted">
              Formato: Calendario: motivo1, motivo2. Ejemplo: Liberados: SIN
            </span>
          </label>

          <div className="rounded-xl border border-metro-border bg-metro-panel p-3 text-xs text-metro-muted">
            <p className="mb-1 font-bold text-metro-text">Cómo calcula el cómputo mensual</p>
            <p>
              Cómputo mensual = lógica antigua: aplica a mes vencido la deuda de ausencias
              anteriores desde la fecha de inicio. No descuenta ausencias del propio mes; las deja
              para el siguiente mes con días de calendario disponibles.
            </p>
            <p className="mb-1 mt-3 font-bold text-metro-text">
              Cómo calcula el cómputo de cotización
            </p>
            <p>
              Cómputo cotización = días con derecho del calendario del mes seleccionado menos
              ausencias del propio mes que descuentan ticket. No arrastra deuda pendiente.
            </p>
            <p className="mt-3 font-semibold text-metro-text">
              Aplicar deuda a mes vencido: Sí, fijo.
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-metro-border p-3">
          <button
            className="rounded-lg border border-metro-border px-3 py-1.5 text-xs font-semibold text-metro-text hover:border-metro-red"
            onClick={onClose}
            type="button"
          >
            Cancelar
          </button>
          <button
            className="rounded-lg bg-metro-red px-3 py-1.5 text-xs font-semibold text-white hover:bg-metro-dark"
            onClick={saveRules}
            type="button"
          >
            Guardar reglas
          </button>
        </div>
      </div>
    </div>
  );
}
