import { X } from 'lucide-react';
import type { ButtonHTMLAttributes } from 'react';

interface ModalCloseButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** Texto accesible y del tooltip. Por defecto "Cerrar". */
  label?: string;
}

/**
 * Botón de cierre unificado para modales, editores y paneles. Sustituye a las
 * distintas variantes hechas a mano (X / XCircle, rounded-lg / rounded-xl,
 * bg-surface / bg-panel...) para que todos los cierres se vean y se comporten
 * igual, con tooltip rápido incluido.
 */
export function ModalCloseButton({ className, label = 'Cerrar', ...props }: ModalCloseButtonProps) {
  return (
    <button
      aria-label={label}
      className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-metro-border bg-metro-surface text-metro-muted transition hover:border-metro-red hover:text-metro-text focus:outline-none focus:ring-2 focus:ring-metro-red/50 ${className ?? ''}`}
      data-tip={label}
      type="button"
      {...props}
    >
      <X size={17} />
    </button>
  );
}
