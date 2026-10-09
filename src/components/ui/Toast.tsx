import {
  AlertTriangle,
  CheckCircle2,
  Info,
  X,
  XCircle,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  ToastContext,
  type ToastApi,
  type ToastItem,
  type ToastOptions,
  type ToastTone,
} from './toastContext';

const DEFAULT_DURATION_BY_TONE: Record<ToastTone, number> = {
  success: 3_000,
  info: 4_500,
  warning: 6_000,
  error: 8_000,
};
const MAX_VISIBLE_TOASTS = 4;

const toneClassName: Record<ToastTone, string> = {
  error: 'border-red-400/40 bg-red-950/95 text-red-50',
  info: 'border-blue-400/35 bg-slate-950/95 text-blue-50',
  success: 'border-emerald-400/35 bg-slate-950/95 text-emerald-50',
  warning: 'border-amber-400/40 bg-slate-950/95 text-amber-50',
};

function toastSignature(tone: ToastTone, message: string, options?: ToastOptions): string {
  return `${tone}\u0000${options?.title?.trim() ?? ''}\u0000${message.trim()}`;
}

function ToastIcon({ tone }: { tone: ToastTone }) {
  const props = { 'aria-hidden': true, className: 'mt-0.5 shrink-0', size: 18 } as const;
  if (tone === 'success') return <CheckCircle2 {...props} />;
  if (tone === 'error') return <XCircle {...props} />;
  if (tone === 'warning') return <AlertTriangle {...props} />;
  return <Info {...props} />;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextIdRef = useRef(1);
  const timeoutRefs = useRef(new Map<number, number>());
  const signatureToIdRef = useRef(new Map<string, number>());
  const idToSignatureRef = useRef(new Map<number, string>());

  const forgetToast = useCallback((id: number) => {
    const signature = idToSignatureRef.current.get(id);
    if (signature && signatureToIdRef.current.get(signature) === id) {
      signatureToIdRef.current.delete(signature);
    }
    idToSignatureRef.current.delete(id);
  }, []);

  useEffect(() => () => {
    timeoutRefs.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
    timeoutRefs.current.clear();
    signatureToIdRef.current.clear();
    idToSignatureRef.current.clear();
  }, []);

  const dismiss = useCallback((id: number) => {
    const timeoutId = timeoutRefs.current.get(id);
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId);
      timeoutRefs.current.delete(id);
    }
    forgetToast(id);
    setItems((current) => current.filter((item) => item.id !== id));
  }, [forgetToast]);

  const push = useCallback((tone: ToastTone, message: string, options?: ToastOptions) => {
    const signature = toastSignature(tone, message, options);
    const existingId = signatureToIdRef.current.get(signature);
    const id = existingId ?? nextIdRef.current++;

    if (existingId !== undefined) {
      const existingTimeout = timeoutRefs.current.get(existingId);
      if (existingTimeout !== undefined) {
        window.clearTimeout(existingTimeout);
        timeoutRefs.current.delete(existingId);
      }
    }

    signatureToIdRef.current.set(signature, id);
    idToSignatureRef.current.set(id, signature);

    setItems((current) => {
      const refreshed = [
        ...current.filter((item) => item.id !== id),
        { id, message, options, tone },
      ];
      const visible = refreshed.slice(-MAX_VISIBLE_TOASTS);
      const visibleIds = new Set(visible.map((item) => item.id));

      for (const item of current) {
        if (visibleIds.has(item.id)) continue;
        const timeoutId = timeoutRefs.current.get(item.id);
        if (timeoutId !== undefined) {
          window.clearTimeout(timeoutId);
          timeoutRefs.current.delete(item.id);
        }
        forgetToast(item.id);
      }

      return visible;
    });

    const durationMs = Math.max(1_500, options?.durationMs ?? DEFAULT_DURATION_BY_TONE[tone]);
    const timeoutId = window.setTimeout(() => {
      timeoutRefs.current.delete(id);
      forgetToast(id);
      setItems((current) => current.filter((item) => item.id !== id));
    }, durationMs);
    timeoutRefs.current.set(id, timeoutId);
    return id;
  }, [forgetToast]);

  const api = useMemo<ToastApi>(() => ({
    dismiss,
    error: (message, options) => push('error', message, options),
    info: (message, options) => push('info', message, options),
    success: (message, options) => push('success', message, options),
    warning: (message, options) => push('warning', message, options),
  }), [dismiss, push]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-label="Notificaciones"
        className="pointer-events-none fixed right-4 top-4 z-[100] flex w-[min(26rem,calc(100vw-2rem))] flex-col gap-2"
      >
        {items.map((item) => {
          const assertive = item.tone === 'error';
          return (
            <div
              aria-atomic="true"
              aria-live={assertive ? 'assertive' : 'polite'}
              className={`pointer-events-auto flex items-start gap-3 rounded-xl border px-3 py-3 text-sm shadow-2xl backdrop-blur ${toneClassName[item.tone]}`}
              key={item.id}
              role={assertive ? 'alert' : 'status'}
            >
              <ToastIcon tone={item.tone} />
              <div className="min-w-0 flex-1">
                {item.options?.title ? <p className="font-bold">{item.options.title}</p> : null}
                <p className="whitespace-pre-wrap leading-5 opacity-95">{item.message}</p>
              </div>
              <button
                aria-label="Cerrar notificación"
                className="shrink-0 rounded-md p-1 opacity-70 transition hover:bg-white/10 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-current"
                onClick={() => dismiss(item.id)}
                type="button"
              >
                <X aria-hidden="true" size={16} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
