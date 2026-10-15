import { useMemo, useState } from 'react';
import { BarChart3, CheckCircle2, TrendingDown, TrendingUp } from 'lucide-react';
import { ActionButton } from '../../../components/ui/ActionButton';
import { ModalCloseButton } from '../../../components/ui/ModalCloseButton';
import { ModalFooter, ModalHeader, ModalShell, ModalTitle } from '../../../components/ui/ModalShell';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { formatDate, type Huelga } from './huelgasPageModel';
import type { HuelgaResponseCollection } from './huelgasResponseCollection';
import {
  HUELGA_PERIOD_LABELS,
  buildHuelgaResults,
  formatSeguimiento,
  huelgaExecutiveSummary,
  seguimientoDelta,
  type HuelgaPeriodResult,
  type HuelgaResultPeriod,
} from './huelgasResults';
import { downloadHuelgaResultsWorkbook } from './huelgasResultsExport';

const PERIODS: HuelgaResultPeriod[] = ['noche', 'manana', 'tarde', 'global'];
const SHIFT_PERIODS: HuelgaResultPeriod[] = ['noche', 'manana', 'tarde'];

function escapeHtml(value: string): string {
  return value
    .split('&').join('&amp;')
    .split('<').join('&lt;')
    .split('>').join('&gt;')
    .split('"').join('&quot;')
    .split("'").join('&#039;');
}

function deltaText(value: number | null): string {
  if (value === null) return 'Sin corte anterior comparable';
  const prefix = value > 0 ? '+' : '';
  return `${prefix}${value.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} puntos respecto al corte anterior`;
}

function previousPeriod(period: HuelgaResultPeriod): HuelgaResultPeriod | undefined {
  if (period === 'manana') return 'noche';
  if (period === 'tarde') return 'manana';
  return undefined;
}

function printResult(huelga: Huelga, collection: HuelgaResponseCollection, result: HuelgaPeriodResult) {
  const max = Math.max(1, ...result.areas.map((area) => area.seguimiento));
  const bars = result.areas.map((area) => `
    <div class="bar-row">
      <div class="bar-label">${escapeHtml(area.nombre)}</div>
      <div class="bar-track"><span style="width:${Math.max(1, (area.seguimiento / max) * 100)}%"></span></div>
      <div class="bar-value">${escapeHtml(formatSeguimiento(area.seguimiento))}</div>
    </div>`).join('');
  const rows = result.areas.map((area) => `
    <tr>
      <td>${escapeHtml(area.nombre)}</td>
      <td>${area.personasTurno}</td><td>${area.serviciosMinimos}</td>
      <td>${area.personasTrabajan}</td><td>${area.personasHuelga}</td><td><strong>${escapeHtml(formatSeguimiento(area.seguimiento))}</strong></td>
    </tr>`).join('');

  const printWindow = window.open('', '_blank', 'width=1100,height=800');
  if (!printWindow) return;
  printWindow.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Resultados huelga</title>
    <style>
      @page{size:A4;margin:13mm}*{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;color:#222;margin:0;font-size:11px}
      .top{border-top:6px solid #b91c2c;padding-top:12px;display:flex;justify-content:space-between;gap:20px}.eyebrow{font-size:10px;font-weight:700;letter-spacing:.08em;color:#777;text-transform:uppercase}.title{font-size:23px;font-weight:800;margin:3px 0}.meta{color:#666}.stamp{text-align:right;color:#666;font-size:10px}
      .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:18px 0}.kpi{border:1px solid #ddd;border-radius:8px;padding:10px}.kpi small{display:block;color:#777;text-transform:uppercase;font-weight:700;font-size:9px}.kpi strong{display:block;font-size:20px;margin-top:4px}.kpi.red strong{color:#b91c2c}
      .summary{border-left:4px solid #b91c2c;background:#f7f7f7;padding:10px 12px;margin:12px 0 16px;line-height:1.45}.section-title{font-size:13px;font-weight:800;margin:18px 0 9px}.bar-row{display:grid;grid-template-columns:185px 1fr 58px;gap:8px;align-items:center;margin:5px 0}.bar-label{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.bar-track{height:10px;background:#ececec;border-radius:99px;overflow:hidden}.bar-track span{display:block;height:100%;background:#b91c2c;border-radius:99px}.bar-value{text-align:right;font-weight:700}
      table{width:100%;border-collapse:collapse;margin-top:8px;font-size:9.5px}th{background:#333;color:white;text-align:right;padding:6px}th:first-child,td:first-child{text-align:left}td{text-align:right;padding:5px 6px;border-bottom:1px solid #ddd}tfoot td{font-weight:800;border-top:2px solid #333}.footer{margin-top:14px;border-top:1px solid #ddd;padding-top:7px;color:#777;font-size:9px}
    </style></head><body>
    <div class="top"><div><div class="eyebrow">Metro Bilbao · Relaciones Laborales · TrAcción</div><div class="title">Resultados de huelga · ${escapeHtml(HUELGA_PERIOD_LABELS[result.period])}</div><div class="meta">${escapeHtml(formatDate(huelga.fecha))} · ${escapeHtml(huelga.sindicatos.join(' · '))}</div></div><div class="stamp"><strong>DATOS VALIDADOS</strong><br>${escapeHtml(new Date(collection.updatedAt).toLocaleString('es-ES'))}</div></div>
    <div class="kpis"><div class="kpi"><small>Personas con turno</small><strong>${result.totals.personasTurno}</strong></div><div class="kpi red"><small>En huelga</small><strong>${result.totals.personasHuelga}</strong></div><div class="kpi red"><small>Seguimiento</small><strong>${escapeHtml(formatSeguimiento(result.totals.seguimiento))}</strong></div><div class="kpi"><small>Trabajan</small><strong>${result.totals.personasTrabajan}</strong></div></div>
    <div class="summary">${escapeHtml(huelgaExecutiveSummary(result))}</div>
    <div class="section-title">Seguimiento por área / circuito</div>${bars || '<p>Sin datos para este corte.</p>'}
    <div class="section-title">Detalle</div><table><thead><tr><th>Área / circuito</th><th>Con turno</th><th>SS.MM.</th><th>Trabajan</th><th>Huelga</th><th>Seguimiento</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><td>TOTAL</td><td>${result.totals.personasTurno}</td><td>${result.totals.serviciosMinimos}</td><td>${result.totals.personasTrabajan}</td><td>${result.totals.personasHuelga}</td><td>${escapeHtml(formatSeguimiento(result.totals.seguimiento))}</td></tr></tfoot></table>
    <div class="footer">Seguimiento = personas en huelga / personas con turno. Los servicios mínimos están incluidos en personas con turno, aunque no en personas que trabajan.</div>
    </body></html>`);
  printWindow.document.close();
  printWindow.focus();
  window.setTimeout(() => printWindow.print(), 150);
}

type Props = {
  target: Huelga | null;
  collection: HuelgaResponseCollection | null;
  onClose: () => void;
};

export function HuelgasResultsModal({ target, collection, onClose }: Props) {
  const [period, setPeriod] = useState<HuelgaResultPeriod>('global');
  const [exporting, setExporting] = useState(false);
  const results = useMemo(() => collection ? buildHuelgaResults(collection) : null, [collection]);

  if (!target || !collection || !results) return null;
  const result = results[period];
  const previous = previousPeriod(period);
  const delta = previous ? seguimientoDelta(result, results[previous]) : null;
  const maxArea = Math.max(1, ...result.areas.map((area) => area.seguimiento));

  const exportExcel = async () => {
    setExporting(true);
    try {
      await downloadHuelgaResultsWorkbook(target, collection, results);
    } finally {
      setExporting(false);
    }
  };

  return (
    <ModalShell labelledBy="huelga-results-title" onClose={onClose} size="xl">
      <ModalHeader>
        <ModalTitle
          id="huelga-results-title"
          subtitle={`${target.sindicatos.join(' · ')} · Datos validados ${new Date(collection.updatedAt).toLocaleString('es-ES')}`}
        >
          Resultados de huelga · {formatDate(target.fecha)}
        </ModalTitle>
        <ModalCloseButton onClick={onClose} />
      </ModalHeader>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex rounded-xl border border-metro-border bg-metro-panel/50 p-1">
            {PERIODS.map((item) => {
              const available = results[item].hasData;
              return (
                <button
                  className={`rounded-lg px-4 py-2 text-xs font-semibold transition ${period === item ? 'bg-metro-red text-white shadow-sm' : 'text-metro-muted hover:bg-metro-raised hover:text-metro-text'} disabled:cursor-not-allowed disabled:opacity-35`}
                  disabled={!available}
                  key={item}
                  onClick={() => setPeriod(item)}
                  type="button"
                >
                  {HUELGA_PERIOD_LABELS[item]}
                </button>
              );
            })}
          </div>
          <StatusBadge tone="success" size="xs"><CheckCircle2 size={12} /> Datos validados</StatusBadge>
        </div>

        <section className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-metro-border bg-metro-panel/45 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-metro-muted">Personas con turno</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-metro-text">{result.totals.personasTurno.toLocaleString('es-ES')}</p>
            <p className="mt-1 text-[10px] text-metro-muted">Incluye servicios mínimos</p>
          </div>
          <div className="rounded-xl border border-metro-border bg-metro-panel/45 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-metro-muted">En huelga</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-metro-red">{result.totals.personasHuelga.toLocaleString('es-ES')}</p>
            <p className="mt-1 text-[10px] text-metro-muted">Personas que secundan</p>
          </div>
          <div className="rounded-xl border border-metro-red/35 bg-metro-red/5 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-metro-muted">Seguimiento</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-metro-red">{formatSeguimiento(result.totals.seguimiento)}</p>
            {period !== 'global' && period !== 'noche' && (
              <p className={`mt-1 inline-flex items-center gap-1 text-[10px] ${delta !== null && delta > 0 ? 'text-amber-300' : 'text-metro-muted'}`}>
                {delta !== null && delta > 0 ? <TrendingUp size={11} /> : delta !== null && delta < 0 ? <TrendingDown size={11} /> : null}
                {deltaText(delta)}
              </p>
            )}
          </div>
          <div className="rounded-xl border border-metro-border bg-metro-panel/45 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-metro-muted">Trabajan</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-metro-text">{result.totals.personasTrabajan.toLocaleString('es-ES')}</p>
            <p className="mt-1 text-[10px] text-metro-muted">SS.MM.: {result.totals.serviciosMinimos.toLocaleString('es-ES')}</p>
          </div>
        </section>

        {period === 'global' && (
          <section className="mt-4 rounded-xl border border-metro-border bg-metro-panel/35 p-4">
            <div className="mb-3 flex items-center gap-2">
              <BarChart3 size={16} className="text-metro-red" />
              <h3 className="text-sm font-semibold text-metro-text">Evolución de la jornada</h3>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              {SHIFT_PERIODS.map((item) => {
                const shift = results[item];
                return (
                  <div className="rounded-lg border border-metro-border bg-metro-panel/55 p-3" key={item}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-metro-text">{HUELGA_PERIOD_LABELS[item]}</span>
                      <strong className="text-sm tabular-nums text-metro-red">{shift.hasData ? formatSeguimiento(shift.totals.seguimiento) : '—'}</strong>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-metro-raised">
                      <div className="h-full rounded-full bg-metro-red" style={{ width: `${Math.min(100, shift.totals.seguimiento)}%` }} />
                    </div>
                    <p className="mt-2 text-[10px] text-metro-muted">{shift.hasData ? `${shift.totals.personasHuelga} huelga / ${shift.totals.personasTurno} con turno` : 'Sin desglose disponible'}</p>
                  </div>
                );
              })}
            </div>
            <p className="mt-3 text-[10px] text-metro-muted">El Global se calcula sobre la suma real de personas en huelga y personas con turno; no es la media aritmética de los tres porcentajes.</p>
          </section>
        )}

        <section className="mt-4 rounded-xl border border-metro-border bg-metro-panel/35 p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-metro-muted">Resumen ejecutivo</h3>
          <p className="mt-2 border-l-2 border-metro-red pl-3 text-sm leading-relaxed text-metro-text">{huelgaExecutiveSummary(result)}</p>
        </section>

        <section className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(520px,1fr)]">
          <div className="rounded-xl border border-metro-border bg-metro-panel/35 p-4">
            <div className="mb-4 flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-metro-text">Seguimiento por área / circuito</h3>
              <span className="text-[10px] text-metro-muted">Ordenado de mayor a menor</span>
            </div>
            <div className="space-y-3">
              {result.areas.map((area) => (
                <div className="grid grid-cols-[minmax(125px,180px)_1fr_58px] items-center gap-2" key={area.id}>
                  <div className="truncate text-xs font-medium text-metro-text" title={area.nombre}>{area.nombre}</div>
                  <div className="h-3 overflow-hidden rounded-full bg-metro-raised">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-metro-red to-red-400"
                      style={{ width: `${area.personasTurno > 0 ? Math.max(2, (area.seguimiento / maxArea) * 100) : 0}%` }}
                    />
                  </div>
                  <div className="text-right text-xs font-bold tabular-nums text-metro-text">{formatSeguimiento(area.seguimiento)}</div>
                </div>
              ))}
              {result.areas.length === 0 && <p className="py-6 text-center text-sm text-metro-muted">No hay desglose disponible para este corte.</p>}
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-metro-border bg-metro-panel/35">
            <div className="border-b border-metro-border px-4 py-3"><h3 className="text-sm font-semibold text-metro-text">Detalle</h3></div>
            <div className="max-h-[330px] overflow-auto">
              <table className="w-full min-w-[600px] text-left text-[11px] text-metro-text">
                <thead className="sticky top-0 bg-metro-panel text-metro-muted">
                  <tr className="border-b border-metro-border">
                    <th className="px-3 py-2">Área / circuito</th><th className="px-2 py-2 text-right">Con turno</th><th className="px-2 py-2 text-right">SS.MM.</th><th className="px-2 py-2 text-right">Trabajan</th><th className="px-2 py-2 text-right">Huelga</th><th className="px-3 py-2 text-right">Seguimiento</th>
                  </tr>
                </thead>
                <tbody>
                  {result.areas.map((area) => (
                    <tr className="border-b border-metro-border/60" key={area.id}>
                      <td className="px-3 py-2 font-medium">{area.nombre}</td><td className="px-2 py-2 text-right tabular-nums">{area.personasTurno}</td><td className="px-2 py-2 text-right tabular-nums">{area.serviciosMinimos}</td><td className="px-2 py-2 text-right tabular-nums">{area.personasTrabajan}</td><td className="px-2 py-2 text-right font-semibold tabular-nums">{area.personasHuelga}</td><td className="px-3 py-2 text-right font-bold tabular-nums text-metro-red">{formatSeguimiento(area.seguimiento)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="sticky bottom-0 bg-metro-panel font-bold">
                  <tr className="border-t-2 border-metro-border"><td className="px-3 py-2">TOTAL</td><td className="px-2 py-2 text-right">{result.totals.personasTurno}</td><td className="px-2 py-2 text-right">{result.totals.serviciosMinimos}</td><td className="px-2 py-2 text-right">{result.totals.personasTrabajan}</td><td className="px-2 py-2 text-right">{result.totals.personasHuelga}</td><td className="px-3 py-2 text-right text-metro-red">{formatSeguimiento(result.totals.seguimiento)}</td></tr>
                </tfoot>
              </table>
            </div>
          </div>
        </section>

        <p className="mt-3 text-[10px] text-metro-muted">Criterio de cálculo: seguimiento = personas en huelga / personas con turno. Los servicios mínimos forman parte de personas con turno, pero no de personas que trabajan.</p>
      </div>

      <ModalFooter className="justify-between">
        <p className="text-xs text-metro-muted">Informe de solo lectura generado a partir de la recogida validada.</p>
        <div className="flex items-center gap-2">
          <ActionButton variant="print" iconOnly={false} disabled={!result.hasData} onClick={() => printResult(target, collection, result)}>Imprimir / PDF</ActionButton>
          <ActionButton variant="excel" iconOnly={false} loading={exporting} onClick={() => void exportExcel()}>Exportar Excel</ActionButton>
        </div>
      </ModalFooter>
    </ModalShell>
  );
}
