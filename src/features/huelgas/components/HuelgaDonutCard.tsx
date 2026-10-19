import { BarChart3, Moon, Sun } from 'lucide-react';
import { HUELGA_PERIOD_LABELS, type HuelgaPeriodResult, type HuelgaResultPeriod } from './huelgasResults';
import { huelgaDistribution, huelgaDonutSvg, huelgaFormatPercent } from './huelgaDonut';

const ICONS = { noche: Moon, manana: Sun, tarde: Sun, global: BarChart3 };
type Props = { result: HuelgaPeriodResult; onSelect?: (period: HuelgaResultPeriod) => void };

export function HuelgaDonutCard({ result, onSelect }: Props) {
  const Icon = ICONS[result.period];
  const segments = huelgaDistribution(result.totals);
  return (
    <article className="min-w-0 rounded-lg border border-metro-border bg-metro-panel/55 p-2.5">
      <div className="mb-1 flex items-center justify-between">
        {onSelect ? (
          <button type="button" onClick={() => onSelect(result.period)} className="inline-flex items-center gap-1.5 text-[11px] font-bold text-metro-text hover:text-metro-red">
            <Icon size={13} className="text-metro-red" />{HUELGA_PERIOD_LABELS[result.period]}
          </button>
        ) : <strong className="inline-flex items-center gap-1.5 text-[11px] text-metro-text"><Icon size={13} className="text-metro-red" />{HUELGA_PERIOD_LABELS[result.period]}</strong>}
        <span className="text-[11px] font-bold tabular-nums text-metro-red">{huelgaFormatPercent(result.totals.seguimiento)}</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="w-[47%] max-w-[155px] shrink-0 text-metro-text" dangerouslySetInnerHTML={{ __html: huelgaDonutSvg(result.totals) }} />
        <div className="min-w-0 flex-1 space-y-2">
          {segments.map((segment) => (
            <div key={segment.key} className="flex items-center justify-between gap-1 text-[10px] text-metro-text">
              <span className="flex items-center gap-1"><span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: segment.color }} />{segment.label}</span>
              <span className="text-right tabular-nums"><strong>{segment.value}</strong><span className="ml-1 text-metro-muted">{huelgaFormatPercent(segment.percentage)}</span></span>
            </div>
          ))}
        </div>
      </div>
    </article>
  );
}
