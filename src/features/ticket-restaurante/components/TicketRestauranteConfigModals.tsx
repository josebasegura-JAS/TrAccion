import { useState } from 'react';
import { ActionButton } from '../../../components/ui/ActionButton';
import { Field, Input, Textarea } from '../../../components/ui/Field';
import { ModalBody, ModalFooter, ModalHeader, ModalShell, ModalTitle } from '../../../components/ui/ModalShell';
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
    <ModalShell labelledBy="ticket-price-title" maxWidthClassName="max-w-xl" onClose={onClose}>
      <ModalHeader>
        <ModalTitle
          id="ticket-price-title"
          subtitle="El cálculo usa el último precio cuya fecha de inicio sea anterior o igual al mes calculado."
        >
          Precio ticket
        </ModalTitle>
      </ModalHeader>
      <ModalBody className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-2">
          <Field label="Importe ticket">
            <Input
              min="0"
              onChange={(event) => setAmount(event.target.value)}
              step="0.01"
              type="number"
              value={amount}
            />
          </Field>
          <Field label="Vigente desde">
            <Input
              onChange={(event) => setEffectiveFrom(event.target.value)}
              type="date"
              value={effectiveFrom}
            />
          </Field>
        </div>
        <section className="rounded-xl bg-metro-panel p-2.5">
          <h4 className="mb-1 text-xs font-bold text-metro-text">Histórico de precios</h4>
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
        </section>
      </ModalBody>
      <ModalFooter>
        <ActionButton iconOnly={false} onClick={onClose} variant="secondary">
          Cancelar
        </ActionButton>
        <ActionButton disabled={!canSave} iconOnly={false} onClick={savePrice} variant="save">
          Guardar precio
        </ActionButton>
      </ModalFooter>
    </ModalShell>
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
    <ModalShell labelledBy="ticket-rules-title" maxWidthClassName="max-w-3xl" onClose={onClose}>
      <ModalHeader>
        <ModalTitle
          id="ticket-rules-title"
          subtitle="Parámetros mínimos del módulo. Los días sin pedido se gestionan en cada calendario."
        >
          Reglas de cálculo
        </ModalTitle>
      </ModalHeader>
      <ModalBody className="space-y-3">
        <Field
          hint={`No puede ser anterior al ${TICKET_RESTAURANT_MIN_ABSENCE_DATE}: el módulo excluye las ausencias que empiezan antes de esa fecha.`}
          label="Fecha inicio cómputo deuda"
        >
          <Input
            min={TICKET_RESTAURANT_MIN_ABSENCE_DATE}
            onChange={(event) => setDebtStartDate(event.target.value)}
            type="date"
            value={debtStartDate}
          />
        </Field>
        <Field
          hint="Formato: Calendario: motivo1, motivo2. Ejemplo: Liberados: SIN"
          label="Motivos que no descuentan por calendario"
        >
          <Textarea
            className="h-20"
            onChange={(event) => setNonDiscountableRulesText(event.target.value)}
            value={nonDiscountableRulesText}
          />
        </Field>
        <section className="rounded-xl bg-metro-panel p-3 text-xs text-metro-muted">
          <h4 className="mb-1 font-bold text-metro-text">Cómo calcula el cómputo mensual</h4>
          <p>
            Aplica a mes vencido la deuda de ausencias anteriores desde la fecha de inicio. No
            descuenta ausencias del propio mes; las deja para el siguiente mes con días disponibles.
          </p>
          <h4 className="mb-1 mt-3 font-bold text-metro-text">Cómo calcula el cómputo de cotización</h4>
          <p>
            Días con derecho del calendario del mes seleccionado menos ausencias del propio mes que
            descuentan ticket. No arrastra deuda pendiente.
          </p>
          <p className="mt-3 font-semibold text-metro-text">Aplicar deuda a mes vencido: Sí, fijo.</p>
        </section>
      </ModalBody>
      <ModalFooter>
        <ActionButton iconOnly={false} onClick={onClose} variant="secondary">
          Cancelar
        </ActionButton>
        <ActionButton iconOnly={false} onClick={saveRules} variant="save">
          Guardar reglas
        </ActionButton>
      </ModalFooter>
    </ModalShell>
  );
}
