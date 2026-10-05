import type { ReactNode } from 'react';
import { Check, type LucideIcon } from 'lucide-react';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { cx } from './loteriaPage.utils';

export function MetricCard({ icon: Icon, label, value, detail }: { icon: LucideIcon; label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-xl border border-metro-border/80 bg-metro-panel/70 px-3 py-2.5">
      <div className="flex items-center gap-2 text-metro-secondary">
        <span className="grid h-6 w-6 place-items-center rounded-md bg-metro-red/10 text-red-300"><Icon size={14} /></span>
        <span className="text-[11px] font-bold">{label}</span>
      </div>
      <p className="mt-1 text-lg font-extrabold leading-none tracking-tight text-metro-text">{value}</p>
      {detail ? <p className="mt-1 truncate text-[11px] text-metro-muted">{detail}</p> : null}
    </div>
  );
}

export function StepCard({
  active,
  done,
  icon: Icon,
  month,
  title,
  detail,
  onClick,
  reviewed,
  onReviewChange,
}: {
  active: boolean;
  done: boolean;
  icon: LucideIcon;
  month: string;
  title: string;
  detail: string;
  onClick: () => void;
  reviewed?: boolean;
  onReviewChange?: (checked: boolean) => void;
}) {
  return (
    <div
      className={cx(
        'rounded-xl border p-3 text-left transition',
        active
          ? 'border-metro-red/70 bg-metro-red/[0.07]'
          : done
            ? 'border-emerald-500/30 bg-emerald-500/[0.045] hover:border-emerald-400/50'
            : 'border-metro-border bg-metro-panel/75 hover:border-metro-red/50',
      )}
    >
      <button className="block w-full text-left" onClick={onClick} type="button">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className={cx(
              'grid h-7 w-7 shrink-0 place-items-center rounded-lg border',
              active ? 'border-metro-red/50 bg-metro-red/10 text-red-300' : 'border-metro-border bg-metro-surface text-metro-secondary',
            )}><Icon size={15} /></span>
            <div className="min-w-0">
              <p className="truncate text-[10px] font-extrabold uppercase tracking-wide text-red-300">{month}</p>
              <p className="truncate text-xs font-extrabold text-metro-text">{title}</p>
            </div>
          </div>
          <span className={cx(
            'grid h-5 w-5 shrink-0 place-items-center rounded-full border',
            done ? 'border-emerald-400 bg-emerald-500 text-white' : 'border-metro-border text-transparent',
          )}><Check size={12} /></span>
        </div>
        <p className="mt-1.5 text-[11px] leading-4 text-metro-muted">{detail}</p>
      </button>
      {onReviewChange ? (
        <label className="mt-2 flex items-center gap-2 border-t border-metro-border/60 pt-2 text-[11px] font-bold text-metro-secondary">
          <input
            checked={Boolean(reviewed)}
            onChange={(event) => onReviewChange(event.target.checked)}
            type="checkbox"
          />
          Mes revisado
        </label>
      ) : null}
    </div>
  );
}

export function SectionShell({ title, subtitle, actions, children }: { title: string; subtitle: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-metro-border bg-metro-panel p-3.5">
      <div className="mb-2.5 flex flex-wrap items-start justify-between gap-2 border-b border-metro-border/75 pb-2.5">
        <div>
          <h3 className="text-sm font-extrabold text-metro-text">{title}</h3>
          <p className="mt-0.5 text-[11px] text-metro-muted">{subtitle}</p>
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function SaveState({ dirty, message }: { dirty: boolean; message: string }) {
  return (
    <StatusBadge size="xs" tone={dirty ? 'warning' : 'success'}>
      {dirty ? 'Cambios sin guardar' : (message || 'Todo guardado')}
    </StatusBadge>
  );
}

export function SummaryPill({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'good' | 'warning' | 'alert' }) {
  return (
    <div className={cx(
      'rounded-lg border px-2.5 py-2',
      tone === 'good'
        ? 'border-emerald-500/30 bg-emerald-500/[0.05]'
        : tone === 'warning'
          ? 'border-amber-500/35 bg-amber-500/[0.07]'
          : tone === 'alert'
            ? 'border-red-500/35 bg-red-500/[0.07]'
            : 'border-metro-border bg-metro-surface/80',
    )}>
      <p className="text-[10px] font-bold uppercase tracking-wide text-metro-muted">{label}</p>
      <p className="mt-0.5 text-sm font-extrabold leading-tight text-metro-text">{value}</p>
    </div>
  );
}
