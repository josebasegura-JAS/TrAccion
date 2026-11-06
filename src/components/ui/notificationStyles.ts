/**
 * Contrato visual común de notificaciones.
 * No contiene duración, colas, lógica de persistencia ni reglas de negocio.
 */
export type NotificationTone = 'success' | 'info' | 'warning' | 'error';
export type NotificationSurface = 'toast' | 'icon';

export const notificationToneStyles: Record<NotificationTone, Record<NotificationSurface, string>> = {
  success: {
    toast: 'border-emerald-400/40 bg-slate-950/95 text-emerald-50',
    icon: 'bg-emerald-950/50 text-emerald-300 ring-emerald-400/30',
  },
  info: {
    toast: 'border-blue-400/40 bg-slate-950/95 text-blue-50',
    icon: 'bg-blue-950/50 text-blue-300 ring-blue-400/30',
  },
  warning: {
    toast: 'border-amber-400/40 bg-slate-950/95 text-amber-50',
    icon: 'bg-amber-950/50 text-amber-300 ring-amber-400/30',
  },
  error: {
    toast: 'border-red-400/40 bg-red-950/95 text-red-50',
    icon: 'bg-red-950/50 text-red-200 ring-red-400/30',
  },
};

export const notificationLayout = {
  toast: 'pointer-events-auto flex items-start gap-3 rounded-xl border px-3 py-3 font-sans text-sm shadow-2xl backdrop-blur',
  icon: 'mt-0.5 inline-flex shrink-0 items-center justify-center rounded-full p-2 ring-1',
  title: 'font-semibold leading-5',
  message: 'whitespace-pre-wrap text-sm leading-5',
  dismiss: 'shrink-0 rounded-md p-1 opacity-70 transition hover:bg-white/10 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-current',
  dialogTitle: 'text-base font-semibold text-metro-text',
  dialogMessage: 'mt-2 whitespace-pre-wrap text-sm leading-6 text-metro-muted',
  inlineSaved: 'inline-flex max-w-[18rem] items-center gap-1.5 px-1 text-xs font-semibold text-emerald-300',
} as const;
