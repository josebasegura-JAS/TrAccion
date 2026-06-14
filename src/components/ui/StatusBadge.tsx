import type { ReactNode } from 'react';

type StatusBadgeTone = 'success' | 'warning' | 'error' | 'info' | 'muted';
type StatusBadgeSize = 'xs' | 'sm';

type StatusBadgeProps = {
  children: ReactNode;
  className?: string;
  icon?: ReactNode;
  size?: StatusBadgeSize;
  title?: string;
  tone?: StatusBadgeTone;
};

const toneClassName: Record<StatusBadgeTone, string> = {
  error: 'border-red-500/30 bg-red-500/10 text-red-200',
  info: 'border-blue-400/30 bg-blue-500/10 text-blue-100',
  muted: 'border-metro-border bg-slate-950/20 text-metro-muted',
  success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
  warning: 'border-amber-400/30 bg-amber-400/10 text-amber-100',
};

const sizeClassName: Record<StatusBadgeSize, string> = {
  sm: 'gap-2 px-3 py-1 text-xs',
  xs: 'gap-1.5 px-2 py-0.5 text-[11px]',
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

export function StatusBadge({
  children,
  className,
  icon,
  size = 'sm',
  title,
  tone = 'muted',
}: StatusBadgeProps) {
  return (
    <span
      className={cx(
        'inline-flex max-w-full shrink-0 items-center truncate rounded-full border font-bold',
        sizeClassName[size],
        toneClassName[tone],
        className,
      )}
      title={title}
    >
      {icon ? <span className="shrink-0">{icon}</span> : null}
      <span className="truncate">{children}</span>
    </span>
  );
}
