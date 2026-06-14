import type { ReactNode } from 'react';

type NoticeTone = 'info' | 'warning' | 'error' | 'success' | 'muted';

type NoticeProps = {
  children: ReactNode;
  className?: string;
  tone?: NoticeTone;
};

const toneClassName: Record<NoticeTone, string> = {
  error: 'border-red-400/40 bg-red-950/20 text-red-100',
  info: 'border-blue-400/30 bg-blue-950/20 text-blue-100',
  muted: 'border-metro-border bg-metro-surface text-metro-muted',
  success: 'border-metro-success/30 bg-metro-success/10 text-emerald-100',
  warning: 'border-amber-400/40 bg-amber-950/20 text-amber-100',
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

export function Notice({ children, className, tone = 'muted' }: NoticeProps) {
  return (
    <p className={cx('rounded-xl border px-3 py-2 text-xs font-semibold', toneClassName[tone], className)}>
      {children}
    </p>
  );
}
