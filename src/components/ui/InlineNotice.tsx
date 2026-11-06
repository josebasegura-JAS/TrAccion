import type { ReactNode } from 'react';
import { AlertTriangle, Info, XCircle } from 'lucide-react';
import { notificationToneStyles, type NotificationTone } from './notificationStyles';

type InlineNoticeProps = {
  tone: Exclude<NotificationTone, 'success'>;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
};

/** Aviso contextual reutilizable; no cambia lógica ni estado de ningún módulo. */
export function InlineNotice({ tone, children, action, className = '' }: InlineNoticeProps) {
  const Icon = tone === 'error' ? XCircle : tone === 'warning' ? AlertTriangle : Info;
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={`flex min-w-0 flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-xs ${notificationToneStyles[tone].toast} ${className}`}
    >
      <Icon aria-hidden="true" size={15} className="shrink-0" />
      <span className="min-w-0 flex-1 leading-5">{children}</span>
      {action}
    </div>
  );
}
