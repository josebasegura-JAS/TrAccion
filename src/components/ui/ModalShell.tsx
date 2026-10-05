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

const LEGACY_DIALOG_SELECTOR = '[data-legacy-modal="true"][role="dialog"][aria-modal="true"]';
const LEGACY_FOCUSABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'iframe',
  'object',
  'embed',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

type LegacyDialogEntry = {
  dialog: HTMLElement;
  returnFocus: HTMLElement | null;
  temporaryReturnFocus: boolean;
};

const legacyDialogStack: LegacyDialogEntry[] = [];
let lastInteractionTarget: HTMLElement | null = null;

function getLegacyFocusableElements(dialog: HTMLElement): HTMLElement[] {
  return Array.from(dialog.querySelectorAll<HTMLElement>(LEGACY_FOCUSABLE_SELECTOR)).filter(
    (element) => !element.closest('[aria-hidden="true"], [inert]'),
  );
}

function getTopLegacyDialog(): LegacyDialogEntry | undefined {
  for (let index = legacyDialogStack.length - 1; index >= 0; index -= 1) {
    const entry = legacyDialogStack[index];
    if (entry.dialog.isConnected) return entry;
  }
  return undefined;
}

function ensureReturnFocusTarget(element: HTMLElement | null): {
  element: HTMLElement | null;
  temporary: boolean;
} {
  if (!element || !element.isConnected) return { element: null, temporary: false };

  const naturallyFocusable = element.matches(
    'a[href], button, input, select, textarea, [contenteditable="true"], [tabindex]',
  );
  if (naturallyFocusable) return { element, temporary: false };

  element.setAttribute('tabindex', '-1');
  return { element, temporary: true };
}

function registerLegacyDialog(dialog: HTMLElement) {
  if (legacyDialogStack.some((entry) => entry.dialog === dialog)) return;

  const activeElement =
    document.activeElement instanceof HTMLElement && document.activeElement !== document.body
      ? document.activeElement
      : lastInteractionTarget;

  const returnTarget = ensureReturnFocusTarget(activeElement);
  legacyDialogStack.push({
    dialog,
    returnFocus: returnTarget.element,
    temporaryReturnFocus: returnTarget.temporary,
  });

  if (!dialog.hasAttribute('tabindex')) dialog.tabIndex = -1;

  queueMicrotask(() => {
    if (getTopLegacyDialog()?.dialog !== dialog || !dialog.isConnected) return;
    const firstFocusable = getLegacyFocusableElements(dialog)[0] ?? dialog;
    firstFocusable.focus();
  });
}

function unregisterLegacyDialog(dialog: HTMLElement) {
  const index = legacyDialogStack.findIndex((entry) => entry.dialog === dialog);
  if (index < 0) return;

  const [entry] = legacyDialogStack.splice(index, 1);
  const returnFocus = entry.returnFocus;

  queueMicrotask(() => {
    if (!returnFocus?.isConnected) return;
    returnFocus.focus();
    if (entry.temporaryReturnFocus) {
      returnFocus.removeAttribute('tabindex');
    }
  });
}

function visitLegacyDialogs(node: Node, callback: (dialog: HTMLElement) => void) {
  if (!(node instanceof HTMLElement)) return;
  if (node.matches(LEGACY_DIALOG_SELECTOR)) callback(node);
  node.querySelectorAll<HTMLElement>(LEGACY_DIALOG_SELECTOR).forEach(callback);
}

function startLegacyDialogAccessibilityBridge() {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return;

  const runtime = globalThis as typeof globalThis & {
    __traccionLegacyDialogAccessibilityStarted?: boolean;
  };
  if (runtime.__traccionLegacyDialogAccessibilityStarted) return;
  runtime.__traccionLegacyDialogAccessibilityStarted = true;

  document.addEventListener(
    'pointerdown',
    (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      lastInteractionTarget =
        target.closest<HTMLElement>(
          'button, a[href], input, select, textarea, [role="button"], [tabindex], tr',
        ) ?? target;
    },
    true,
  );

  document.addEventListener(
    'keydown',
    (event) => {
      const entry = getTopLegacyDialog();
      if (!entry) return;

      const { dialog } = entry;
      if (event.key === 'Escape') {
        const closeControl = dialog.querySelector<HTMLElement>(
          '[data-modal-close="true"], button[aria-label^="Cerrar" i], button[title^="Cerrar" i]',
        );
        if (!closeControl) return;
        event.preventDefault();
        event.stopPropagation();
        closeControl.click();
        return;
      }

      if (event.key !== 'Tab') return;

      const focusable = getLegacyFocusableElements(dialog);
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      const focusInside = active instanceof Node && dialog.contains(active);

      if (event.shiftKey) {
        if (!focusInside || active === first) {
          event.preventDefault();
          last.focus();
        }
        return;
      }

      if (!focusInside || active === last) {
        event.preventDefault();
        first.focus();
      }
    },
    true,
  );

  document.querySelectorAll<HTMLElement>(LEGACY_DIALOG_SELECTOR).forEach(registerLegacyDialog);

  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.removedNodes.forEach((node) => visitLegacyDialogs(node, unregisterLegacyDialog));
      mutation.addedNodes.forEach((node) => visitLegacyDialogs(node, registerLegacyDialog));
    });
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

/**
 * Compatibilidad temporal y explícita para diálogos antiguos que todavía no
 * han migrado su JSX a ModalShell. Solo actúa sobre overlays marcados con
 * `data-legacy-modal="true"`, evitando capturar AppDialog u otros diálogos que
 * ya gestionan foco y Escape mediante su propio hook.
 */
startLegacyDialogAccessibilityBridge();

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
        data-modal-shell="true"
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
