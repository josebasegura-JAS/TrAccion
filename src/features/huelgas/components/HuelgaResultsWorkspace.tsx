import { useMemo, useState } from 'react';
import { BarChart3, CheckCircle2, Printer, TrendingDown, TrendingUp } from 'lucide-react';
import { ActionButton } from '../../../components/ui/ActionButton';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import type { Huelga } from './huelgasPageModel';
import type { HuelgaResponseCollection } from './huelgasResponseCollection';
import {
  HUELGA_PERIOD_LABELS,
  buildHuelgaResults,
  formatSeguimiento,
  huelgaExecutiveSummary,
  seguimientoDelta,
  type HuelgaResultPeriod,
} from './huelgasResults';
import { downloadHuelgaResultsWorkbook } from './huelgasResultsExport';

const PERIODS: HuelgaResultPeriod[] = ['noche', 'manana', 'tarde', 'global'];
const SHIFT_PERIODS: HuelgaResultPeriod[] = ['noche', 'manana', 'tarde'];

function previousPeriod(period: HuelgaResultPeriod): HuelgaResultPeriod | undefined {
  if (period === 'manana') return 'noche';
  if (period === 'tarde') return 'manana';
  return undefined;
}

function deltaText(value: number | null): string {
  if (value === null) return 'Sin corte anterior comparable';
  const prefix = value > 0 ? '+' : '';
  return `${prefix}${value.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} puntos`;
}

type Props = {
  huelga: Huelga;
  collection: HuelgaResponseCollection;
  onOpenPrintable: () => void;
};

export function HuelgaResultsWorkspace({ huelga, collection, onOpenPrintable }: Props) {
  const [period, setPeriod] = useState<HuelgaResultPeriod>('global');
  const [exporting, setExporting] = useState(false);
  const results = useMemo(() => buildHuelgaResults(collection), [collection]);
  const result = results[period];
  const previous = previousPeriod(period);
  const delta = previous ? seguimientoDelta(result, results[previous]) : null;
  const maxArea = Math.max(1, ...result.areas.map((area) => area.seguimiento));

  const exportExcel = async () => {
    setExporting(true);
    try {
      await downloadHuelgaResultsWorkbook(huelga, collection, results);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-2.5">
      <section className="sticky top-0 z-10 rounded-xl border border-metro-border bg-metro-panel/95 p-2.5 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="overflow-x-auto">
            <div className="inline-flex min-w-max rounded-lg border border-metro-border bg-metro-panel/55 p-1">
              {PERIODS.map((item) => (
                <button
                  key={item}
                  type="button"
                  disabled={!results[item].hasData}
                  onClick={() => setPeriod(item)}
                  className={`rounded-md px-2.5 py-1.5 text-[11px] font-semibold transition ${period === item ? 'bg-metro-red text-white' : 'text-metro-muted hover:bg-metro-raised hover:text-metro-text'} disabled:cursor-not-allowed disabled:opacity-35`}
                >
                  {HUELGA_PERIOD_LABELS[item]}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusBadge tone="success" size="xs"><CheckCircle2 size={12} /> Datos validados</StatusBadge>
            <ActionButton variant="print" size="sm" icon={Printer} iconOnly={false} disabled={!result.hasData} onClick={onOpenPrintable}>Imprimir / PDF</ActionButton>
            <ActionButton variant="excel" size="sm" iconOnly={false} loading={exporting} onClick={() => void exportExcel()}>Excel</ActionButton>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5">
        <div className="rounded-lg border border-metro-border bg-metro-panel/45 px-3 py-2">
          <p className="text-[9px] font-semibold uppercase tracking-wide text-metro-muted">Con turno</p>
          <p className="mt-0.5 text-xl font-bold tabular-nums text-metro-text">{result.totals.personasTurno.toLocaleString('es-ES')}</p>
        </div>
        <div className="rounded-lg border border-metro-border bg-metro-panel/45 px-3 py-2">
          <p className="text-[9px] font-semibold uppercase tracking-wide text-metro-muted">En huelga</p>
          <p className="mt-0.5 text-xl font-bold tabular-nums text-metro-red">{result.totals.personasHuelga.toLocaleString('es-ES')}</p>
        </div>
        <div className="rounded-lg border border-metro-red/35 bg-metro-red/5 px-3 py-2">
          <p className="text-[9px] font-semibold uppercase tracking-wide text-metro-muted">Seguimiento</p>
          <p className="mt-0.5 text-xl font-bold tabular-nums text-metro-red">{formatSeguimiento(result.totals.seguimiento)}</p>
          {period !== 'global' && period !== 'noche' && (
            <p className={`mt-0.5 inline-flex items-center gap-1 text-[9px] ${delta !== null && delta > 0 ? 'text-amber-300' : 'text-metro-muted'}`}>
              {delta !== null && delta > 0 ? <TrendingUp size={10} /> : delta !== null && delta < 0 ? <TrendingDown size={10} /> : null}
              {deltaText(delta)} vs. anterior
            </p>
          )}
        </div>
        <div className="rounded-lg border border-metro-border bg-metro-panel/45 px-3 py-2">
          <p className="text-[9px] font-semibold uppercase tracking-wide text-metro-muted">Trabajan</p>
          <p className="mt-0.5 text-xl font-bold tabular-nums text-metro-text">{result.totals.personasTrabajan.toLocaleString('es-ES')}</p>
        </div>
        <div className="rounded-lg border border-metro-border bg-metro-panel/45 px-3 py-2">
          <p className="text-[9px] font-semibold uppercase tracking-wide text-metro-muted">SS.MM.</p>
          <p className="mt-0.5 text-xl font-bold tabular-nums text-metro-text">{result.totals.serviciosMinimos.toLocaleString('es-ES')}</p>
          <p className="text-[9px] text-metro-muted">Incluidos en con turno</p>
        </div>
      </section>

      <section className="rounded-xl border border-metro-border bg-metro-panel/35 p-3">
        <p className="text-[9px] font-semibold uppercase tracking-wide text-metro-muted">Resumen ejecutivo · {HUELGA_PERIOD_LABELS[period]}</p>
        <p className="mt-1.5 border-l-2 border-metro-red pl-3 text-xs leading-relaxed text-metro-text">{huelgaExecutiveSummary(result)}</p>
      </section>

      {period === 'global' && (
        <section className="rounded-xl border border-metro-border bg-metro-panel/35 p-3">
          <div className="mb-2 flex items-center gap-2"><BarChart3 size={14} className="text-metro-red" /><h3 className="text-xs font-semibold text-metro-text">Evolución de la jornada</h3></div>
          <div className="grid gap-2 md:grid-cols-3">
            {SHIFT_PERIODS.map((item) => {
              const shift = results[item];
              return (
                <button key={item} type="button" disabled={!shift.hasData} onClick={() => shift.hasData && setPeriod(item)} className="rounded-lg border border-metro-border bg-metro-panel/55 p-2.5 text-left transition hover:border-metro-red disabled:cursor-default disabled:opacity-60">
                  <div className="flex items-center justify-between gap-2"><span className="text-[11px] font-semibold text-metro-text">{HUELGA_PERIOD_LABELS[item]}</span><strong className="text-xs tabular-nums text-metro-red">{shift.hasData ? formatSeguimiento(shift.totals.seguimiento) : '—'}</strong></div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-metro-raised"><div className="h-full rounded-full bg-metro-red" style={{ width: `${Math.min(100, shift.totals.seguimiento)}%` }} /></div>
                  <p className="mt-1.5 text-[9px] text-metro-muted">{shift.hasData ? `${shift.totals.personasHuelga} huelga / ${shift.totals.personasTurno} con turno` : 'Sin desglose disponible'}</p>
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-[9px] text-metro-muted">Global suma personas reales y calcula el porcentaje sobre el acumulado; no promedia porcentajes.</p>
        </section>
      )}

      <section className="grid gap-2.5 lg:grid-cols-[minmax(0,0.95fr)_minmax(470px,1.05fr)]">
        <div className="rounded-xl border border-metro-border bg-metro-panel/35 p-3">
          <div className="mb-2.5 flex items-center justify-between gap-2"><h3 className="text-xs font-semibold text-metro-text">Seguimiento por área / circuito</h3><span className="text-[9px] text-metro-muted">Mayor a menor</span></div>
          <div className="space-y-2">
            {result.areas.map((area) => (
              <div className="grid grid-cols-[minmax(105px,155px)_1fr_50px] items-center gap-2" key={area.id}>
                <div className="truncate text-[11px] font-medium text-metro-text" title={area.nombre}>{area.nombre}</div>
                <div className="h-2 overflow-hidden rounded-full bg-metro-raised"><div className="h-full rounded-full bg-metro-red" style={{ width: `${area.personasTurno > 0 ? Math.max(2, (area.seguimiento / maxArea) * 100) : 0}%` }} /></div>
                <div className="text-right text-[11px] font-bold tabular-nums text-metro-text">{formatSeguimiento(area.seguimiento)}</div>
              </div>
            ))}
            {result.areas.length === 0 && <p className="py-5 text-center text-xs text-metro-muted">No hay desglose disponible para este corte.</p>}
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-metro-border bg-metro-panel/35">
          <div className="border-b border-metro-border px-3 py-2"><h3 className="text-xs font-semibold text-metro-text">Detalle</h3></div>
          <div className="max-h-[290px] overflow-auto">
            <table className="w-full min-w-[540px] text-left text-[10px] text-metro-text">
              <thead className="sticky top-0 bg-metro-panel text-metro-muted"><tr className="border-b border-metro-border"><th className="px-2.5 py-1.5">Área / circuito</th><th className="px-2 py-1.5 text-right">Turno</th><th className="px-2 py-1.5 text-right">SS.MM.</th><th className="px-2 py-1.5 text-right">Trabajan</th><th className="px-2 py-1.5 text-right">Huelga</th><th className="px-2.5 py-1.5 text-right">%</th></tr></thead>
              <tbody>{result.areas.map((area) => <tr className="border-b border-metro-border/60" key={area.id}><td className="max-w-[190px] truncate px-2.5 py-1.5 font-medium" title={area.nombre}>{area.nombre}</td><td className="px-2 py-1.5 text-right tabular-nums">{area.personasTurno}</td><td className="px-2 py-1.5 text-right tabular-nums">{area.serviciosMinimos}</td><td className="px-2 py-1.5 text-right tabular-nums">{area.personasTrabajan}</td><td className="px-2 py-1.5 text-right font-semibold tabular-nums">{area.personasHuelga}</td><td className="px-2.5 py-1.5 text-right font-bold tabular-nums text-metro-red">{formatSeguimiento(area.seguimiento)}</td></tr>)}</tbody>
              <tfoot className="sticky bottom-0 bg-metro-panel font-bold"><tr className="border-t-2 border-metro-border"><td className="px-2.5 py-1.5">TOTAL</td><td className="px-2 py-1.5 text-right">{result.totals.personasTurno}</td><td className="px-2 py-1.5 text-right">{result.totals.serviciosMinimos}</td><td className="px-2 py-1.5 text-right">{result.totals.personasTrabajan}</td><td className="px-2 py-1.5 text-right">{result.totals.personasHuelga}</td><td className="px-2.5 py-1.5 text-right text-metro-red">{formatSeguimiento(result.totals.seguimiento)}</td></tr></tfoot>
            </table>
          </div>
        </div>
      </section>

      <p className="text-[9px] text-metro-muted">Criterio: seguimiento = personas en huelga / personas con turno. Los servicios mínimos están incluidos en personas con turno, pero no en personas que trabajan.</p>
    </div>
  );
}
