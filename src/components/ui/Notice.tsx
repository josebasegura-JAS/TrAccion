import {
  CircleCheck,
  CircleX,
  Info,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';

type NoticeTone = 'info' | 'warning' | 'error' | 'success' | 'muted';

type NoticeProps = {
  children: ReactNode;
  className?: string;
  /** Anuncia cambios dinámicos sin convertir todos los avisos estáticos en alertas. */
  live?: 'off' | 'polite' | 'assertive';
  tone?: NoticeTone;
  title?: string;
  actionLabel?: string;
  onAction?: () => void;
};

const toneClassName: Record<NoticeTone, string> = {
  error: 'border-red-400/40 bg-red-950/20 text-red-100',
  info: 'border-blue-400/30 bg-blue-950/20 text-blue-100',
  muted: 'border-metro-border bg-metro-surface text-metro-secondary',
  success: 'border-metro-success/30 bg-metro-success/10 text-emerald-100',
  warning: 'border-amber-400/40 bg-amber-950/20 text-amber-100',
};

const iconByTone: Record<NoticeTone, LucideIcon> = {
  error: CircleX,
  info: Info,
  muted: Info,
  success: CircleCheck,
  warning: TriangleAlert,
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

export function Notice({
  actionLabel,
  children,
  className,
  live = 'off',
  onAction,
  title,
  tone = 'muted',
}: NoticeProps) {
  const Icon = iconByTone[tone];
  const liveProps = live === 'off'
    ? {}
    : {
        'aria-atomic': true as const,
        'aria-live': live,
        role: live === 'assertive' ? ('alert' as const) : ('status' as const),
      };

  return (
    <div
      {...liveProps}
      className={cx(
        'flex items-start gap-2 rounded-xl border px-3 py-2 text-xs',
        toneClassName[tone],
        className,
      )}
    >
      <Icon aria-hidden="true" className="mt-0.5 shrink-0 opacity-90" size={15} strokeWidth={1.9} />
      <div className="min-w-0 flex-1">
        {title ? <p className="font-semibold text-current">{title}</p> : null}
        <div className={cx('leading-5', title ? 'mt-0.5 font-medium opacity-90' : 'font-semibold')}>
          {children}
        </div>
      </div>
      {actionLabel && onAction ? (
        <button
          className="shrink-0 rounded-lg border border-current/20 px-2 py-1 font-semibold text-current transition hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current motion-reduce:transition-none"
          onClick={onAction}
          type="button"
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}
