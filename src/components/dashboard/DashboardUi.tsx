import type { ReactNode } from 'react';
import { ChevronRight, ExternalLink, X, type LucideIcon } from 'lucide-react';
import type { DashboardPopupItem } from './dashboardTypes';
import { eventTone, formatDisplayDate } from './dashboardUtils';

export function DashboardRecordsModal({
  emptyText,
  eyebrow,
  items,
  onClose,
  onOpenItem,
  subtitle,
  title,
}: {
  emptyText: string;
  eyebrow: string;
  items: DashboardPopupItem[];
  onClose: () => void;
  onOpenItem: (item: DashboardPopupItem) => void;
  subtitle?: string;
  title: string;
}) {
  const visibleItems = items.slice(0, 250);
  const hiddenCount = Math.max(0, items.length - visibleItems.length);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-xl overflow-hidden rounded-[1.5rem] border border-metro-border bg-metro-surface text-metro-text shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-metro-border px-5 py-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-metro-red">
              {eyebrow}
            </p>
            <h3 className="mt-1 text-lg font-black capitalize">{title}</h3>
            {subtitle && <p className="mt-1 text-sm font-medium text-metro-muted">{subtitle}</p>}
          </div>
          <button
            className="rounded-full p-2 text-metro-muted transition hover:bg-metro-panel hover:text-metro-text"
            onClick={onClose}
            type="button"
          >
            <X size={18} />
          </button>
        </div>

        <div className="max-h-[60vh] overflow-auto p-4">
          {visibleItems.length > 0 ? (
            <div className="space-y-3">
              {visibleItems.map((item) => (
                <div
                  className="flex items-center justify-between gap-3 rounded-2xl bg-metro-panel/70 p-3 ring-1 ring-metro-border"
                  key={item.id}
                >
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm font-black text-metro-text">
                      <span
                        className={`h-2.5 w-2.5 shrink-0 rounded-full ${eventTone[item.type]}`}
                      />
                      <span className="truncate">{item.title}</span>
                    </p>
                    <p className="mt-1 truncate text-xs font-medium text-metro-muted">
                      {item.date ? `${formatDisplayDate(item.date)} · ${item.detail}` : item.detail}
                    </p>
                  </div>
                  <button
                    className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-metro-border bg-metro-surface px-3 py-2 text-xs font-black text-metro-secondary transition hover:border-metro-red hover:text-metro-text"
                    onClick={() => onOpenItem(item)}
                    type="button"
                  >
                    Abrir <ExternalLink size={13} />
                  </button>
                </div>
              ))}
              {hiddenCount > 0 && (
                <p className="rounded-2xl bg-metro-panel/70 px-4 py-3 text-sm font-semibold text-metro-muted">
                  Se muestran los primeros 250 registros. Afina desde el módulo para ver los {hiddenCount} restantes.
                </p>
              )}
            </div>
          ) : (
            <p className="rounded-2xl bg-metro-panel/70 px-4 py-3 text-sm font-semibold text-metro-muted">
              {emptyText}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export function DashboardHeaderPill({
  label,
  value,
  tone = 'text-metro-text',
  onClick,
}: {
  label: string;
  value: number;
  tone?: string;
  onClick?: () => void;
}) {
  const content = (
    <>
      <p className={`text-lg font-black ${tone}`}>{value}</p>
      <p className="text-[11px] font-bold text-metro-muted">{label}</p>
    </>
  );

  if (onClick) {
    return (
      <button
        className="rounded-xl bg-metro-panel/70 px-3 py-2 text-left ring-1 ring-metro-border transition hover:bg-white/5 focus:outline-none focus:ring-2 focus:ring-metro-red/40"
        onClick={onClick}
        type="button"
      >
        {content}
      </button>
    );
  }

  return <div className="rounded-xl bg-metro-panel/70 px-3 py-2 ring-1 ring-metro-border">{content}</div>;
}

export function CalendarLegend({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-2">
      <span className={`h-2.5 w-2.5 rounded-full ${className}`} /> {label}
    </span>
  );
}

export function SummaryLine({
  icon: Icon,
  label,
  value,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  onClick?: () => void;
}) {
  return (
    <button
      className="flex w-full items-center justify-between gap-3 rounded-xl bg-metro-panel/70 px-3 py-1.5 text-left ring-1 ring-metro-border transition hover:bg-white/5 focus:outline-none focus:ring-1 focus:ring-metro-red/40"
      onClick={onClick}
      type="button"
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className="rounded-lg bg-metro-raised p-1.5 text-blue-400 shadow-sm">
          <Icon size={15} />
        </span>
        <span className="truncate text-sm font-bold text-metro-secondary">{label}</span>
      </div>
      <span className="text-base font-black text-metro-text">{value}</span>
    </button>
  );
}

export function TodayAlert({
  className,
  title,
  subtitle = 'Requiere atención',
  onClick,
}: {
  className: string;
  title: string;
  subtitle?: string;
  onClick?: () => void;
}) {
  return (
    <button
      className={`w-full rounded-xl border-l-4 bg-metro-panel/70 px-3 py-2 text-left ring-1 ring-metro-border transition hover:bg-white/5 focus:outline-none focus:ring-1 focus:ring-metro-red/40 ${className}`}
      onClick={onClick}
      type="button"
    >
      <p className="text-sm font-black text-metro-text">{title}</p>
      <p className="mt-0.5 text-xs font-medium text-metro-muted">{subtitle}</p>
    </button>
  );
}

export function DashboardList({
  title,
  action,
  children,
  onActionClick,
}: {
  title: string;
  action: string;
  children: ReactNode;
  onActionClick?: () => void;
}) {
  return (
    <article className="rounded-[1.25rem] border border-metro-border bg-metro-surface/90 p-3 text-metro-text shadow-glow">
      <h3 className="mb-3 text-base font-black">{title}</h3>
      <div className="space-y-2">{children}</div>
      <button
        className="mt-3 text-xs font-black text-metro-red hover:text-red-400"
        onClick={onActionClick}
        type="button"
      >
        {action} <ChevronRight className="inline" size={14} />
      </button>
    </article>
  );
}

export function DashboardListRow({
  badge,
  date,
  label,
  meta,
  tone,
  onClick,
}: {
  badge: string;
  date: string;
  label: string;
  meta: string;
  tone: string;
  onClick?: () => void;
}) {
  const rowClassName = `grid w-full grid-cols-[0.75rem_1fr_auto] items-center gap-2 rounded-xl px-2 py-1 text-left text-sm transition ${
    onClick ? 'cursor-pointer hover:bg-white/5 focus:bg-white/5 focus:outline-none' : ''
  }`;
  const content = (
    <>
      <span className={`h-2.5 w-2.5 rounded-full ${tone}`} />
      <div className="min-w-0">
        <p className="truncate font-black text-metro-text">{label}</p>
        <p className="truncate text-xs font-medium text-metro-muted">{meta}</p>
      </div>
      <div className="flex items-center gap-2 text-right text-xs font-black">
        <span className="rounded-full bg-metro-panel px-2 py-1 text-metro-secondary">{badge}</span>
        {date && <span className="text-metro-muted">{date}</span>}
      </div>
    </>
  );

  if (onClick) {
    return (
      <button className={rowClassName} onClick={onClick} type="button">
        {content}
      </button>
    );
  }

  return <div className={rowClassName}>{content}</div>;
}

export function EmptyDashboardRow({ text }: { text: string }) {
  return (
    <p className="rounded-2xl bg-metro-panel/70 px-4 py-3 text-sm font-semibold text-metro-muted">
      {text}
    </p>
  );
}
