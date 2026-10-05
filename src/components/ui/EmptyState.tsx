import { Inbox, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { ActionButton } from './ActionButton';

type EmptyStateSize = 'compact' | 'standard';

type EmptyStateProps = {
  title: string;
  description?: string;
  icon?: LucideIcon;
  actionLabel?: string;
  onAction?: () => void;
  secondaryAction?: ReactNode;
  className?: string;
  size?: EmptyStateSize;
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

export function EmptyState({
  title,
  description,
  icon: Icon = Inbox,
  actionLabel,
  onAction,
  secondaryAction,
  className,
  size = 'standard',
}: EmptyStateProps) {
  const compact = size === 'compact';

  return (
    <div
      className={cx(
        'flex flex-col items-center justify-center text-center text-metro-muted',
        compact ? 'gap-1.5 px-3 py-4' : 'gap-2 px-4 py-7',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cx(
          'grid place-items-center rounded-lg border border-metro-border/70 bg-metro-panel/55 text-metro-muted/80',
          compact ? 'h-8 w-8' : 'h-10 w-10',
        )}
      >
        <Icon size={compact ? 17 : 20} strokeWidth={1.8} />
      </span>

      <div className="max-w-xl">
        <p className={cx('font-semibold text-metro-text', compact ? 'text-xs' : 'text-sm')}>
          {title}
        </p>
        {description ? (
          <p className={cx('text-metro-muted', compact ? 'mt-0.5 text-[11px]' : 'mt-1 text-xs')}>
            {description}
          </p>
        ) : null}
      </div>

      {actionLabel && onAction ? (
        <div className={cx('flex flex-wrap items-center justify-center gap-2', compact ? 'mt-1' : 'mt-2')}>
          <ActionButton onClick={onAction} size="sm" variant="primary">
            {actionLabel}
          </ActionButton>
          {secondaryAction}
        </div>
      ) : secondaryAction ? (
        <div className={compact ? 'mt-1' : 'mt-2'}>{secondaryAction}</div>
      ) : null}
    </div>
  );
}
