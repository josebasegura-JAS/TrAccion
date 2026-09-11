import type { ReactNode } from 'react';
import { Check, type LucideIcon } from 'lucide-react';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { cx } from './loteriaPage.utils';

export function MetricCard({ icon: Icon, label, value, detail }: { icon: LucideIcon; label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-xl border border-metro-border bg-metro-panel px-3 py-2.5">
      <div className="flex items-center gap-2 text-metro-secondary">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-metro-red/10 text-red-300"><Icon size={15} /></span>
        <span className="text-[11px] font-bold">{label}</span>
      </div>
      <p className="mt-1 text-xl font-extrabold tracking-tight text-metro-text">{value}</p>
      {detail ? <p className="text-[11px] text-metro-muted">{detail}</p> : null}
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
}: {
  active: boolean;
  done: boolean;
  icon: LucideIcon;
  month: string;
  title: string;
  detail: string;
  onClick: () => void;
}) {
  return (
    <button
      className={cx(
        'rounded-xl border p-3 text-left transition',
        active
          ? 'border-metro-red bg-metro-red/10 shadow-[0_0_0_1px_rgba(218,41,28,0.2)]'
          : done
            ? 'border-emerald-500/35 bg-emerald-500/[0.07] hover:border-emerald-400/60'
            : 'border-metro-border bg-metro-panel hover:border-metro-red/60',
      )}
      onClick={onClick}
      type="button"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={cx(
            'grid h-8 w-8 place-items-center rounded-lg border',
            active ? 'border-metro-red/50 bg-metro-red/10 text-red-300' : 'border-metro-border bg-metro-surface text-metro-secondary',
          )}><Icon size={16} /></span>
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-wide text-red-300">{month}</p>
            <p className="text-xs font-extrabold text-metro-text">{title}</p>
          </div>
        </div>
        <span className={cx(
          'grid h-5 w-5 place-items-center rounded-full border',
          done ? 'border-emerald-400 bg-emerald-500 text-white' : 'border-metro-border text-transparent',
        )}><Check size={12} /></span>
      </div>
      <p className="mt-2 text-xs leading-5 text-metro-muted">{detail}</p>
    </button>
  );
}

export function SectionShell({ title, subtitle, actions, children }: { title: string; subtitle: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-metro-border bg-metro-panel p-3 md:p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3 border-b border-metro-border pb-3">
        <div>
          <h3 className="text-sm font-extrabold text-metro-text">{title}</h3>
          <p className="mt-1 text-xs text-metro-muted">{subtitle}</p>
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function SaveState({ dirty, message }: { dirty: boolean; message: string }) {
  return (
    <StatusBadge tone={dirty ? 'warning' : 'success'}>
      {dirty ? 'Cambios sin guardar' : (message || 'Todo guardado')}
    </StatusBadge>
  );
}

export function SummaryPill({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'good' | 'warning' | 'alert' }) {
  return (
    <div className={cx(
      'rounded-lg border px-2.5 py-2',
      tone === 'good'
        ? 'border-emerald-500/35 bg-emerald-500/[0.07]'
        : tone === 'warning'
          ? 'border-amber-500/45 bg-amber-500/10'
          : tone === 'alert'
            ? 'border-red-500/45 bg-red-500/10'
            : 'border-metro-border bg-metro-surface',
    )}>
      <p className="text-[11px] font-bold uppercase tracking-wide text-metro-muted">{label}</p>
      <p className="mt-0.5 text-sm font-extrabold text-metro-text">{value}</p>
    </div>
  );
}

