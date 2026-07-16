import type { ReactNode } from 'react';
import { ModuleHelpButton, type ModuleHelpSection } from '../ModuleHelp';

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

interface PageHeaderProps {
  /**
   * Título del módulo. Ya no se muestra en pantalla (la barra superior fija
   * de la app siempre indica en qué módulo estás), pero se mantiene como
   * encabezado accesible para lectores de pantalla y como valor por defecto
   * del título del diálogo de ayuda.
   */
  title: string;
  /** Indicador de estado ambiental, p. ej. <InlineSaveFeedback />. Se renderiza en línea junto al botón de ayuda, no como línea aparte. */
  status?: ReactNode;
  /** Buttons / controls aligned to the right (e.g. ActionButton group). */
  actions?: ReactNode;
  /** If provided, renders a ModuleHelpButton next to the actions using these sections. */
  helpSections?: ModuleHelpSection[];
  /** Help dialog title; defaults to `title`. */
  helpTitle?: string;
  /** Help dialog subtitle. */
  helpSubtitle?: string;
  className?: string;
}

/**
 * Barra de cabecera de módulo: solo botón de ayuda + acciones + un hueco para
 * un indicador de estado ambiental (p. ej. "Guardado"). Deliberadamente NO
 * repite el icono/título/subtítulo del módulo: la barra superior fija de la
 * app (`Header.tsx`) ya los muestra de forma permanente, así que duplicarlos
 * aquí solo restaba espacio de trabajo sin aportar orientación adicional.
 * El título sigue existiendo como prop por accesibilidad (encabezado oculto
 * para lectores de pantalla) y para el diálogo de ayuda.
 */
export function PageHeader({
  actions,
  className,
  helpSections,
  helpSubtitle,
  helpTitle,
  status,
  title,
}: PageHeaderProps) {
  const resolvedHelpTitle = helpTitle ?? title;

  return (
    <div className={cx('mb-3 flex flex-wrap items-center justify-between gap-3', className)}>
      <h2 className="sr-only">{title}</h2>
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        {helpSections ? (
          <ModuleHelpButton
            title={resolvedHelpTitle}
            subtitle={helpSubtitle}
            sections={helpSections}
          />
        ) : null}
        {status}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}
