import { useEffect } from 'react';
import type { ReactNode } from 'react';

interface ModalShellProps {
  children: ReactNode;
  /** id del elemento que sirve de título del diálogo (para aria-labelledby). */
  labelledBy: string;
  /** Clase de ancho máximo del panel, p.ej. 'max-w-5xl' (por defecto) o 'max-w-3xl'. */
  maxWidthClassName?: string;
  onClose: () => void;
  /**
   * Un ModalShell puede abrirse encima de otro (p.ej. Grupos de cobertura
   * desde dentro de Puestos Teletrabajo). `stacked` sube el z-index para que
   * quede por encima del primero.
   */
  stacked?: boolean;
}

/**
 * Contenedor común para modales de contenido grande (tablas completas,
 * formularios largos...). Distinto de `AppDialog`, que es un diálogo de
 * alerta/confirmación de tamaño fijo y no está pensado para alojar este tipo
 * de contenido.
 */
export function ModalShell({
  children,
  labelledBy,
  maxWidthClassName = 'max-w-5xl',
  onClose,
  stacked = false,
}: ModalShellProps) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      className={`fixed inset-0 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm ${
        stacked ? 'z-[60]' : 'z-50'
      }`}
    >
      <section
        aria-labelledby={labelledBy}
        aria-modal="true"
        className={`flex max-h-[88vh] w-full ${maxWidthClassName} flex-col rounded-2xl border border-metro-border bg-metro-surface shadow-card`}
        role="dialog"
      >
        {children}
      </section>
    </div>
  );
}
