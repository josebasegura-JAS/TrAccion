import { useRef } from 'react';
import type { ReactNode } from 'react';
import { useModalFocusTrap } from '../../hooks/useModalFocusTrap';

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

interface ModalShellProps {
  children: ReactNode;
  /** id del elemento que sirve de título del diálogo (para aria-labelledby). */
  labelledBy: string;
  /** Clase de ancho máximo del panel, p.ej. 'max-w-5xl' o 'max-w-3xl'. */
  maxWidthClassName?: string;
  onClose: () => void;
  panelClassName?: string;
  stacked?: boolean;
}

/** Contenedor común para editores y modales de contenido amplio. */
export function ModalShell({
  children,
  labelledBy,
  maxWidthClassName = 'max-w-5xl',
  onClose,
  panelClassName,
  stacked = false,
}: ModalShellProps) {
  const dialogRef = useRef<HTMLElement>(null);
  useModalFocusTrap(dialogRef, onClose);

  return (
    <div
      data-block-editor-shortcuts="true"
      className={cx(
        'fixed inset-0 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm',
        stacked ? 'z-[60]' : 'z-50',
      )}
    >
      <section
        ref={dialogRef}
        aria-labelledby={labelledBy}
        aria-modal="true"
        className={cx(
          'flex max-h-[calc(100vh-2rem)] w-full flex-col overflow-hidden rounded-2xl border border-metro-border bg-metro-surface shadow-2xl',
          maxWidthClassName,
          panelClassName,
        )}
        role="dialog"
        tabIndex={-1}
      >
        {children}
      </section>
    </div>
  );
}

export function ModalHeader({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <header
      className={cx(
        'flex shrink-0 items-start justify-between gap-3 border-b border-metro-border px-4 py-3',
        className,
      )}
    >
      {children}
    </header>
  );
}

export function ModalTitle({
  children,
  id,
  subtitle,
}: {
  children: ReactNode;
  id: string;
  subtitle?: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <h2 className="truncate text-base font-bold text-metro-text" id={id}>
        {children}
      </h2>
      {subtitle ? <p className="mt-0.5 text-xs text-metro-muted">{subtitle}</p> : null}
    </div>
  );
}

export function ModalBody({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx('min-h-0 flex-1 overflow-y-auto px-4 py-3', className)}>{children}</div>
  );
}

export function ModalFooter({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <footer
      className={cx(
        'flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-metro-border px-4 py-3',
        className,
      )}
    >
      {children}
    </footer>
  );
}
