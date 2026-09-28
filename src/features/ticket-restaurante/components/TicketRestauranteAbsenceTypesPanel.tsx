import { useMemo, useState } from 'react';
import { ActionButton } from '../../../components/ui/ActionButton';
import type { TicketRestaurantAbsence, TicketRestaurantConfig } from '../domain/ticketRestaurante';

function normalizeMotive(value: string): string {
  return value.trim().toUpperCase();
}

export function TicketRestauranteAbsenceTypesPanel({
  absences,
  config,
  onSave,
}: {
  absences: TicketRestaurantAbsence[];
  config: TicketRestaurantConfig;
  onSave: (rules: Array<{ motivo: string; descuentaTicket: boolean }>) => Promise<void>;
}) {
  const motives = useMemo(() => {
    const values = new Set<string>();
    (config.absenceTypeRules ?? []).forEach((rule) => values.add(normalizeMotive(rule.motivo)));
    absences.filter((row) => !row.deletedAt).forEach((row) => {
      const motive = normalizeMotive(row.motivo);
      if (motive) values.add(motive);
    });
    return [...values].sort((a, b) => a.localeCompare(b, 'es'));
  }, [absences, config.absenceTypeRules]);

  const initial = () => Object.fromEntries(
    motives.map((motivo) => {
      const configured = (config.absenceTypeRules ?? []).find((rule) => normalizeMotive(rule.motivo) === motivo);
      return [motivo, configured?.descuentaTicket ?? true];
    }),
  );
  const [draft, setDraft] = useState<Record<string, boolean>>(initial);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await onSave(motives.map((motivo) => ({ motivo, descuentaTicket: draft[motivo] ?? true })));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-2xl border border-metro-border bg-metro-panel p-4 shadow-card">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-metro-text">Tipos de ausencia</h3>
          <p className="mt-1 max-w-3xl text-xs text-metro-muted">
            Define una sola vez qué motivos descuentan Ticket Restaurante. Al importar el Excel,
            la regla se aplicará automáticamente. Guardar también actualiza las ausencias ya importadas.
          </p>
        </div>
        <ActionButton disabled={saving} iconOnly={false} onClick={() => void save()} variant="save">
          {saving ? 'Guardando…' : 'Guardar reglas'}
        </ActionButton>
      </div>
      <div className="overflow-hidden rounded-xl border border-metro-border">
        <table className="w-full text-sm">
          <thead className="bg-metro-surface text-left text-xs text-metro-muted">
            <tr><th className="px-3 py-2">Ausencia</th><th className="px-3 py-2">Descuenta ticket</th><th className="px-3 py-2">Registros importados</th></tr>
          </thead>
          <tbody className="divide-y divide-metro-border">
            {motives.map((motivo) => {
              const count = absences.filter((row) => !row.deletedAt && normalizeMotive(row.motivo) === motivo).length;
              return <tr key={motivo} className="bg-metro-panel">
                <td className="px-3 py-2 font-bold text-metro-text">{motivo}</td>
                <td className="px-3 py-2">
                  <label className="inline-flex items-center gap-2 text-xs font-semibold text-metro-text">
                    <input checked={draft[motivo] ?? true} onChange={(e) => setDraft((current) => ({ ...current, [motivo]: e.target.checked }))} type="checkbox" />
                    {draft[motivo] ?? true ? 'Sí, descuenta' : 'No descuenta'}
                  </label>
                </td>
                <td className="px-3 py-2 text-xs text-metro-muted">{count}</td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-metro-muted">
        TEX queda configurada inicialmente como «No descuenta». La edición individual de una ausencia sigue disponible para excepciones concretas.
      </p>
    </section>
  );
}
