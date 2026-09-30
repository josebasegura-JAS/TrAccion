import { Database, Download, FileSpreadsheet, LoaderCircle, RefreshCw, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  getBackgroundActivityState,
  subscribeBackgroundActivity,
  type BackgroundActivity,
} from '../services/backgroundActivity';

const SHOW_DELAY_MS = 800;

function ActivityIcon({ activity }: { activity: BackgroundActivity }) {
  const common = { size: 18, 'aria-hidden': true as const };
  switch (activity.kind) {
    case 'database': return <Database {...common} className="animate-pulse" />;
    case 'sync': return <RefreshCw {...common} className="animate-spin" />;
    case 'import': return <FileSpreadsheet {...common} className="animate-pulse" />;
    case 'export': return <Download {...common} className="animate-bounce" />;
    case 'search': return <Search {...common} className="animate-pulse" />;
    default: return <LoaderCircle {...common} className="animate-spin" />;
  }
}

export function BackgroundActivityIndicator() {
  const [activities, setActivities] = useState(() => getBackgroundActivityState().activities);
  const [visible, setVisible] = useState(false);
  const hasActivities = activities.length > 0;

  useEffect(() => subscribeBackgroundActivity((state) => setActivities(state.activities)), []);

  useEffect(() => {
    if (!hasActivities) {
      setVisible(false);
      return;
    }
    const timer = window.setTimeout(() => setVisible(true), SHOW_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [hasActivities]);

  const current = useMemo(() => activities[activities.length - 1] ?? null, [activities]);
  if (!visible || !current) return null;

  const extraCount = Math.max(0, activities.length - 1);
  return (
    <div className="pointer-events-none fixed right-5 top-20 z-[120]" role="status" aria-live="polite" aria-label={current.label}>
      <div className="flex min-w-[300px] max-w-[390px] items-center gap-3 rounded-xl border border-sky-400/25 bg-slate-950/95 px-3.5 py-3 text-slate-100 shadow-xl backdrop-blur">
        <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-sky-400/20 bg-sky-500/10 text-sky-300">
          <ActivityIcon activity={current} />
          <span className="absolute -right-1 -top-1 h-2.5 w-2.5 animate-ping rounded-full bg-sky-300/70" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-bold">{current.label}</p>
          <p className="mt-0.5 truncate text-[11px] text-slate-400">
            {current.detail ?? 'Puedes seguir trabajando mientras termina.'}
          </p>
        </div>
        {extraCount > 0 && (
          <span className="rounded-full border border-slate-700 bg-slate-900 px-2 py-1 text-[10px] font-bold text-slate-300">
            +{extraCount}
          </span>
        )}
      </div>
    </div>
  );
}
