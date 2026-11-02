import type { ReactNode } from 'react';
import { Check } from 'lucide-react';
import { FieldLabel } from '../../../components/ui/Field';

type StepProps = {
  number: number;
  title: string;
  detail: string;
  active: boolean;
  done: boolean;
  onClick: () => void;
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

export function WorkflowStep({ number, title, detail, active, done, onClick }: StepProps) {
  return (
    <button
      className={cx(
        'flex min-h-[60px] min-w-0 flex-1 items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left transition',
        active
          ? 'border-metro-red bg-metro-red/[0.07] shadow-sm'
          : done
            ? 'border-emerald-500/25 bg-emerald-500/[0.045] hover:border-emerald-500/45'
            : 'border-metro-border bg-metro-surface/55 hover:border-metro-red/40 hover:bg-metro-raised',
      )}
      onClick={onClick}
      type="button"
    >
      <span
        className={cx(
          'grid h-7 w-7 shrink-0 place-items-center rounded-full border text-[11px] font-extrabold',
          done
            ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300'
            : active
              ? 'border-metro-red bg-metro-red text-white'
              : 'border-metro-border bg-metro-panel text-metro-muted',
        )}
      >
        {done ? <Check size={15} /> : number}
      </span>
      <span className="min-w-0 pt-0.5">
        <span className="block text-[13px] font-extrabold leading-4 text-metro-text">{title}</span>
        <span className="mt-0.5 block text-[11px] leading-4 text-metro-muted">{detail}</span>
      </span>
    </button>
  );
}

export function Panel({
  children,
  className,
  title,
  subtitle,
}: {
  children: ReactNode;
  className?: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <section className={cx('rounded-2xl border border-metro-border bg-metro-panel p-4 shadow-sm', className)}>
      <div className="mb-3">
        <h3 className="text-sm font-extrabold text-metro-text">{title}</h3>
        {subtitle ? <p className="mt-0.5 text-xs text-metro-muted">{subtitle}</p> : null}
      </div>
      {children}
    </section>
  );
}

export function Metric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-xl border border-metro-border bg-metro-surface/65 px-3.5 py-3 shadow-sm">
      <p className="text-[11px] font-bold uppercase tracking-wide text-metro-muted">{label}</p>
      <p className="mt-0.5 text-lg font-extrabold text-metro-text">{value}</p>
      {detail ? <p className="text-[11px] text-metro-muted">{detail}</p> : null}
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <FieldLabel className="space-y-1 text-xs">
      {label}
      {children}
    </FieldLabel>
  );
}

