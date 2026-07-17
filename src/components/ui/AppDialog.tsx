import { AlertTriangle, Check, Info, X, CircleHelp } from 'lucide-react';
import { useRef } from 'react';
import { ModalDatabaseStatus } from '../ModalDatabaseStatus';
import { useModalFocusTrap } from '../../hooks/useModalFocusTrap';

type AppDialogAlertType = 'info' | 'warning' | 'error';

export type AppDialogProps = {
  cancelLabel?: string;
  confirmLabel?: string;
  danger?: boolean;
  message: string;
  mode: 'alert' | 'confirm';
  onCancel?: () => void;
  onConfirm: () => void;
  title?: string;
  type?: AppDialogAlertType;
};

function getDialogIcon({ danger, mode, type }: Pick<AppDialogProps, 'danger' | 'mode' | 'type'>) {
  if (mode === 'confirm') {
    return danger ? <AlertTriangle size={22} /> : <CircleHelp size={22} />;
  }

  if (type === 'warning') {
    return <AlertTriangle size={22} />;
  }

  if (type === 'error') {
    return <X size={22} />;
  }

  return <Info size={22} />;
}

function getIconClassName({ danger, mode, type }: Pick<AppDialogProps, 'danger' | 'mode' | 'type'>): string {
  if (mode === 'confirm') {
    return danger ? 'bg-red-950/40 text-red-200 ring-red-400/30' : 'bg-metro-surface text-metro-muted ring-metro-border';
  }

  if (type === 'warning') {
    return 'bg-yellow-950/30 text-metro-warning ring-yellow-400/30';
  }

  if (type === 'error') {
    return 'bg-red-950/40 text-red-200 ring-red-400/30';
  }

  return 'bg-blue-950/30 text-metro-info ring-blue-400/30';
}

export function AppDialog({
  cancelLabel = 'Cancelar',
  confirmLabel,
  danger = false,
  message,
  mode,
  onCancel,
  onConfirm,
  title,
  type = 'info',
}: AppDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalFocusTrap(dialogRef, () => {
    if (mode === 'confirm') {
      onCancel?.();
      return;
    }
    onConfirm();
  });

  const resolvedTitle = title ?? (mode === 'confirm' ? 'Confirmar acción' : 'Aviso');
  const resolvedConfirmLabel = confirmLabel ?? (mode === 'confirm' ? 'Aceptar' : 'OK');
  const panelClassName = danger
    ? 'border-red-400/30 bg-red-950/20 shadow-red-950/20'
    : 'border-metro-border bg-metro-surface shadow-black/40';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm"
      data-block-editor-shortcuts="true">
      <div
        ref={dialogRef}
        aria-modal="true"
        className={`flex max-h-[calc(100vh-2rem)] w-full max-w-md scale-100 flex-col overflow-hidden rounded-2xl border p-5 font-sans text-metro-text opacity-100 shadow-2xl transition duration-150 ${panelClassName}`}
        role="dialog"
        tabIndex={-1}
      >
        <div className="mb-3 flex shrink-0 justify-end">
          <ModalDatabaseStatus />
        </div>

        <div className="flex min-h-0 flex-1 items-start gap-3 overflow-y-auto">
          <div className={`mt-0.5 shrink-0 rounded-full p-2 ring-1 ${getIconClassName({ danger, mode, type })}`}>
            {getDialogIcon({ danger, mode, type })}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold text-metro-text">{resolvedTitle}</h2>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-metro-muted">{message}</p>
          </div>
        </div>

        <div className="mt-5 flex shrink-0 justify-end gap-2">
          {mode === 'confirm' && (
            <button
              className="rounded-xl border border-metro-border px-4 py-2 text-sm font-semibold text-metro-muted hover:text-metro-text"
              onClick={onCancel}
              type="button"
            >
              {cancelLabel}
            </button>
          )}
          <button
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold text-white shadow-sm ${
              danger ? 'bg-metro-red hover:bg-red-500' : 'bg-metro-info hover:bg-blue-500'
            }`}
            onClick={onConfirm}
            type="button"
          >
            {mode === 'confirm' && !danger ? <Check size={16} /> : null}
            {resolvedConfirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
