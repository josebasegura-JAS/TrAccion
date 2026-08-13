import type { HTMLAttributes, ReactNode } from 'react';

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

interface ToolbarProps extends HTMLAttributes<HTMLDivElement> {
  /** Controles de búsqueda y filtrado, ocupan el espacio disponible. */
  filters?: ReactNode;
  /** Acciones secundarias y principal, alineadas al final. */
  actions?: ReactNode;
}

/**
 * Barra compacta y reutilizable para páginas de listado.
 * Mantiene filtros y acciones en una sola línea y habilita desplazamiento
 * horizontal únicamente cuando el ancho disponible no es suficiente.
 */
export function Toolbar({ actions, className, filters, ...props }: ToolbarProps) {
  return (
    <div
      className={cx(
        'flex min-w-0 flex-1 flex-wrap items-center gap-2 rounded-2xl border border-metro-border/80 bg-metro-panel/55 p-2 shadow-sm shadow-slate-950/15',
        className,
      )}
      {...props}
    >
      {filters ? <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{filters}</div> : null}
      {actions ? <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-2">{actions}</div> : null}
    </div>
  );
}
