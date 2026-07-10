import type { HTMLAttributes, ReactNode } from 'react';

type CountBadgeTone = 'accent' | 'muted';
type CountBadgeSize = 'xs' | 'sm';

interface CountBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  children: ReactNode;
  className?: string;
  size?: CountBadgeSize;
  tone?: CountBadgeTone;
}

const toneClassName: Record<CountBadgeTone, string> = {
  accent: 'border-transparent bg-metro-red/10 text-red-200',
  muted: 'border-metro-border bg-metro-surface text-metro-muted',
};

const sizeClassName: Record<CountBadgeSize, string> = {
  sm: 'px-3 py-1 text-xs',
  xs: 'px-2 py-0.5 text-[11px]',
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

/**
 * Pastilla para conteos ("N registros", "N seguimientos"...). Distinta de
 * `StatusBadge`: no representa un estado, solo resume una cantidad, así que
 * no usa la paleta semántica (success/warning/error/info).
 */
export function CountBadge({
  children,
  className,
  size = 'sm',
  tone = 'accent',
  ...rest
}: CountBadgeProps) {
  return (
    <span
      className={cx(
        'inline-flex shrink-0 items-center rounded-full border font-bold',
        sizeClassName[size],
        toneClassName[tone],
        className,
      )}
      {...rest}
    >
      {children}
    </span>
  );
}
