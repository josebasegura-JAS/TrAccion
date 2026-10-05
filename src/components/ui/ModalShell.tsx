import { useRef } from 'react';
import type { ReactNode } from 'react';
import { useModalFocusTrap } from '../../hooks/useModalFocusTrap';

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl';

const MODAL_SIZE_CLASS: Record<ModalSize, string> = {
  sm: 'max-w-lg',
  md: 'max-w-3xl',
  lg: 'max-w-5xl',
  xl: 'max-w-6xl',
};

interface ModalShellProps {
  children: ReactNode;
  /** Bloquea los atajos globales de editores mientras el modal está abierto. */
  blockEditorShortcuts?: boolean;
  /** id del elemento que sirve de título del diálogo (para aria-labelledby). */
  labelledBy: string;
  /**
   * Tamaño semántico del diálogo. Preferir size sobre maxWidthClassName en código nuevo.
   * sm ≈ confirmación/detalle breve, md ≈ formulario, lg ≈ editor amplio, xl ≈ tablas/previews.
   */
  size?: ModalSize;
  /** Compatibilidad para casos especiales que todavía necesiten un ancho explícito. */
  maxWidthClassName?: string;
  onClose: () => void;
  panelClassName?: string;
  stacked?: boolean;
}

/** Contenedor común para editores y modales de contenido amplio. */
export function ModalShell({
  blockEditorShortcuts = true,
  children,
  labelledBy,
  size = 'lg',
  maxWidthClassName,
  onClose,
  panelClassName,
  stacked = false,
}: ModalShellProps) {
  const dialogRef = useRef<HTMLElement>(null);
  useModalFocusTrap(dialogRef, onClose);

  return (
    <div
      data-block-editor-shortcuts={blockEditorShortcuts ? 'true' : undefined}
      className={cx(
        'fixed inset-0 flex items-center justify-center bg-slate-950/72 p-2.5 backdrop-blur-[1px]',
        stacked ? 'z-[60]' : 'z-50',
      )}
    >
      <section
        ref={dialogRef}
        aria-labelledby={labelledBy}
        aria-modal="true"
        className={cx(
          'flex max-h-[calc(100vh-1.25rem)] w-full flex-col overflow-hidden rounded-xl border border-metro-border/75 bg-metro-surface shadow-[0_18px_48px_rgba(2,6,23,0.42)]',
          maxWidthClassName ?? MODAL_SIZE_CLASS[size],
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
        'flex shrink-0 items-start justify-between gap-3 border-b border-metro-border/65 bg-metro-panel/35 px-4 py-2.5',
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
  return <div className={cx('min-h-0 flex-1 overflow-y-auto px-4 py-3', className)}>{children}</div>;
}

export function ModalFooter({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <footer
      className={cx(
        'flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-metro-border/65 bg-metro-panel/25 px-4 py-2.5',
        className,
      )}
    >
      {children}
    </footer>
  );
}
