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
        'flex min-w-0 flex-1 flex-nowrap items-center gap-2 overflow-x-auto pb-0.5',
        className,
      )}
      {...props}
    >
      {filters ? <div className="flex min-w-max flex-1 items-center gap-2">{filters}</div> : null}
      {actions ? <div className="ml-auto flex min-w-max items-center gap-2">{actions}</div> : null}
    </div>
  );
}
