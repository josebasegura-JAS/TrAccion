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
import { downloadHuelgaResponseReport } from './huelgasResponseCollection';
import { downloadHuelgaGroupedReport } from './huelgasGroupedReport';
import { HuelgaDonutCard } from './HuelgaDonutCard';
import { huelgaDistribution, huelgaDonutSvg, huelgaFormatPercent } from './huelgaDonut';

const PERIODS: HuelgaResultPeriod[] = ['noche', 'manana', 'tarde', 'global'];

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

function printHtml(html: string) {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '1px';
  iframe.style.height = '1px';
  iframe.style.border = '0';
  iframe.style.opacity = '0';

  const cleanup = () => {
    if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
  };

  iframe.onload = () => {
    const printWindow = iframe.contentWindow;
    if (!printWindow) {
      cleanup();
      return;
    }
    const afterPrint = () => {
      printWindow.removeEventListener('afterprint', afterPrint);
      cleanup();
    };
    printWindow.addEventListener('afterprint', afterPrint);
    window.setTimeout(() => {
      printWindow.focus();
      printWindow.print();
      window.setTimeout(cleanup, 3000);
    }, 80);
  };

  document.body.appendChild(iframe);
  iframe.srcdoc = html;
}

function printResult(huelga: Huelga, collection: HuelgaResponseCollection, result: HuelgaPeriodResult, provisional: boolean) {
  const max = Math.max(1, ...result.areas.map((area) => area.seguimiento));
  const bars = result.areas.map((area) => `
    <div class="bar-row">
      <div class="bar-label">${escapeHtml(area.nombre)}</div>
      <div class="bar-track"><span style="width:${Math.max(1, (area.seguimiento / max) * 100)}%"></span></div>
      <div class="bar-value">${escapeHtml(formatSeguimiento(area.seguimiento))}</div>
    </div>`).join('');
  const allResults = buildHuelgaResults(collection);
  const donutCards = PERIODS.map((item) => {
    const shift = allResults[item];
    const legend = huelgaDistribution(shift.totals).map((segment) => `<div class="legend-row"><span class="dot" style="background:${segment.color}"></span><span>${segment.label}</span><strong>${segment.value} · ${escapeHtml(huelgaFormatPercent(segment.percentage))}</strong></div>`).join('');
    return `<div class="donut-card"><div class="donut-heading">${escapeHtml(HUELGA_PERIOD_LABELS[item])}<strong>${escapeHtml(formatSeguimiento(shift.totals.seguimiento))}</strong></div><div class="donut-body"><div class="donut-svg">${huelgaDonutSvg(shift.totals)}</div><div class="legend">${legend}</div></div></div>`;
  }).join('');
  const rows = result.areas.map((area) => `
    <tr>
      <td>${escapeHtml(area.nombre)}</td>
      <td>${area.personasTurno}</td><td>${area.serviciosMinimos}</td>
      <td>${area.personasTrabajan}</td><td>${area.personasHuelga}</td><td><strong>${escapeHtml(formatSeguimiento(area.seguimiento))}</strong></td>
    </tr>`).join('');

  printHtml(`<!doctype html><html><head><meta charset="utf-8"><title>Resultados huelga</title>
    <style>
      @page{size:A4 landscape;margin:10mm}*{box-sizing:border-box}html,body{background:#fff}body{font-family:Arial,Helvetica,sans-serif;color:#222;margin:0;font-size:10px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
      .top{border-top:6px solid #b91c2c;padding-top:10px;display:flex;justify-content:space-between;gap:20px}.eyebrow{font-size:9px;font-weight:700;letter-spacing:.08em;color:#777;text-transform:uppercase}.title{font-size:21px;font-weight:800;margin:3px 0}.meta{color:#666}.stamp{text-align:right;color:#666;font-size:9px}
      .kpis{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin:14px 0}.kpi{border:1px solid #ddd;border-radius:7px;padding:8px}.kpi small{display:block;color:#777;text-transform:uppercase;font-weight:700;font-size:8px}.kpi strong{display:block;font-size:18px;margin-top:3px}.kpi.red strong{color:#b91c2c}
      .summary{border-left:4px solid #b91c2c;background:#f7f7f7;padding:8px 10px;margin:10px 0 12px;line-height:1.4}.section-title{font-size:12px;font-weight:800;margin:13px 0 7px}.bar-row{display:grid;grid-template-columns:180px 1fr 58px;gap:8px;align-items:center;margin:4px 0}.bar-label{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.bar-track{height:9px;background:#ececec;border-radius:99px;overflow:hidden}.bar-track span{display:block;height:100%;background:#b91c2c;border-radius:99px}.bar-value{text-align:right;font-weight:700}
      .donut-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px;margin:8px 0 12px;break-inside:avoid}
      .donut-card{border:1px solid #d9dee7;border-radius:7px;padding:7px;min-width:0;break-inside:avoid}
      .donut-heading{font-weight:800;display:flex;justify-content:space-between;gap:4px}
      .donut-heading strong{color:#b91c2c}
      .donut-body{display:flex;align-items:center;gap:5px}
      .donut-svg{width:45%;min-width:0;color:#1f2937}
      .donut-svg svg{display:block;width:100%;height:auto}
      .legend{flex:1;min-width:0}
      .legend-row{display:flex;align-items:center;gap:3px;font-size:8px;white-space:nowrap;margin:5px 0}
      .legend-row strong{margin-left:auto;font-size:8px}
      .dot{width:7px;height:7px;border-radius:50%;flex:none}
      .print-bottom{display:grid;grid-template-columns:1fr 1.08fr;gap:14px;align-items:start}
      .print-bottom>div{min-width:0}
      table{width:100%;border-collapse:collapse;margin-top:6px;font-size:9px;break-inside:avoid}th{background:#333;color:white;text-align:right;padding:5px;border:1px solid #666}th:first-child,td:first-child{text-align:left}td{text-align:right;padding:4px 5px;border:1px solid #ddd}tfoot td{font-weight:800;background:#f3d1d1;border-top:2px solid #333}.footer{margin-top:10px;border-top:1px solid #ddd;padding-top:6px;color:#777;font-size:8px}
    </style></head><body>
    <div class="top"><div><div class="eyebrow">Metro Bilbao · Relaciones Laborales · TrAcción</div><div class="title">Resultados de huelga · ${escapeHtml(HUELGA_PERIOD_LABELS[result.period])}</div><div class="meta">${escapeHtml(formatDate(huelga.fecha))} · ${escapeHtml(huelga.sindicatos.join(' · '))}</div></div><div class="stamp"><strong>${provisional ? 'RESULTADOS PROVISIONALES' : 'DATOS VALIDADOS'}</strong><br>${escapeHtml(new Date(collection.updatedAt).toLocaleString('es-ES'))}</div></div>
    <div class="kpis"><div class="kpi"><small>Personas con turno</small><strong>${result.totals.personasTurno}</strong></div><div class="kpi red"><small>En huelga</small><strong>${result.totals.personasHuelga}</strong></div><div class="kpi red"><small>Seguimiento</small><strong>${escapeHtml(formatSeguimiento(result.totals.seguimiento))}</strong></div><div class="kpi"><small>Trabajan</small><strong>${result.totals.personasTrabajan}</strong></div><div class="kpi"><small>SS.MM.</small><strong>${result.totals.serviciosMinimos}</strong></div></div>
    <div class="summary">${escapeHtml(huelgaExecutiveSummary(result))}</div>
    <div class="section-title">Distribución de la jornada</div><div class="donut-grid">${donutCards}</div>
    <div class="print-bottom"><div><div class="section-title">Seguimiento por área / circuito</div>${bars || '<p>Sin datos para este corte.</p>'}</div><div>
    <div class="section-title">Detalle</div><table><thead><tr><th>Área / circuito</th><th>Con turno</th><th>SS.MM.</th><th>Trabajan</th><th>Huelga</th><th>Seguimiento</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><td>TOTAL</td><td>${result.totals.personasTurno}</td><td>${result.totals.serviciosMinimos}</td><td>${result.totals.personasTrabajan}</td><td>${result.totals.personasHuelga}</td><td>${escapeHtml(formatSeguimiento(result.totals.seguimiento))}</td></tr></tfoot></table>
    </div></div><div class="footer">Seguimiento = personas en huelga / personas con turno. Los servicios mínimos están incluidos en personas con turno, aunque no en personas que trabajan.</div>
    </body></html>`);
}

type Props = {
  target: Huelga | null;
  collection: HuelgaResponseCollection | null;
  onClose: () => void;
  provisional: boolean;
};

export function HuelgasResultsModal({ target, collection, onClose, provisional }: Props) {
  const [period, setPeriod] = useState<HuelgaResultPeriod>('global');
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const results = useMemo(() => collection ? buildHuelgaResults(collection) : null, [collection]);

  if (!target || !collection || !results) return null;
  const result = results[period];
  const previous = previousPeriod(period);
  const delta = previous ? seguimientoDelta(result, results[previous]) : null;
  const maxArea = Math.max(1, ...result.areas.map((area) => area.seguimiento));

  const exportHistoric = async (grouped: boolean) => {
    if (!target || !collection) return;
    setExportError(null);
    setExporting(true);
    try {
      if (grouped) await downloadHuelgaGroupedReport(target.fecha);
      else await downloadHuelgaResponseReport(target.fecha, target.sindicatos, Object.values(collection.responses));
    } catch (error) {
      setExportError(error instanceof Error ? error.message : 'No se ha podido generar el informe.');
    } finally {
      setExporting(false);
    }
  };

  const exportExcel = async () => {
    setExporting(true);
    try {
      await downloadHuelgaResultsWorkbook(target, collection, results);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : 'No se ha podido exportar el Excel.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <ModalShell labelledBy="huelga-results-title" onClose={onClose} size="xl">
      <ModalHeader>
        <ModalTitle
          id="huelga-results-title"
          subtitle={`${target.sindicatos.join(' · ')} · ${provisional ? 'Resultados provisionales' : 'Datos validados'} ${new Date(collection.updatedAt).toLocaleString('es-ES')}`}
        >
          Resultados de huelga · {formatDate(target.fecha)}
        </ModalTitle>
        <ModalCloseButton onClick={onClose} />
      </ModalHeader>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {provisional && <p className="mb-3 text-xs text-amber-400">Informe provisional: solo circuitos revisados sin errores. Los pendientes no se incluyen. La Excel maestra y el informe agrupado deben guardarse juntos, con sus nombres originales.</p>}
        {exportError && <p role="alert" className="mb-3 text-xs text-red-400">{exportError}</p>}
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
          <div className="flex flex-wrap items-center gap-2"><StatusBadge tone={provisional ? 'warning' : 'success'} size="xs"><CheckCircle2 size={12} /> {provisional ? 'Resultados provisionales' : 'Datos validados'}</StatusBadge><ActionButton variant="excel" size="sm" loading={exporting} onClick={() => void exportHistoric(false)}>Excel maestra</ActionButton><ActionButton variant="excel" size="sm" loading={exporting} onClick={() => void exportHistoric(true)}>Informe agrupado</ActionButton></div>
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

        <section className="mt-4 rounded-xl border border-metro-border bg-metro-panel/35 p-4">
          <div className="mb-3 flex items-center gap-2"><BarChart3 size={16} className="text-metro-red" /><h3 className="text-sm font-semibold text-metro-text">Evolución de la jornada</h3></div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{PERIODS.map((item) => <HuelgaDonutCard key={item} result={results[item]} onSelect={item === 'global' ? undefined : setPeriod} />)}</div>
        </section>

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
          <ActionButton variant="print" iconOnly={false} disabled={!result.hasData} onClick={() => printResult(target, collection, result, provisional)}>Imprimir / PDF</ActionButton>
          <ActionButton variant="excel" iconOnly={false} loading={exporting} onClick={() => void exportExcel()}>Exportar Excel</ActionButton>
        </div>
      </ModalFooter>
    </ModalShell>
  );
}
