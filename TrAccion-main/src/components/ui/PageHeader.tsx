import { useEffect, type ReactNode } from 'react';
import { useModuleHelpRegistry } from '../../services/moduleHelpRegistry';
import type { ModuleHelpSection } from '../ModuleHelp';

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

interface PageHeaderProps {
  /**
   * Título del módulo. No se pinta en pantalla (la barra superior fija de la
   * app ya indica en qué módulo estás), pero se mantiene como encabezado
   * accesible para lectores de pantalla y como identificador de la ayuda
   * registrada para este módulo.
   */
  title: string;
  /** Indicador de estado ambiental, p. ej. <InlineSaveFeedback />. Se renderiza en línea junto a las acciones. */
  status?: ReactNode;
  /** Buttons / controls aligned to the right (e.g. ActionButton group). */
  actions?: ReactNode;
  /** Si se indica, registra un botón de ayuda con estas secciones junto al nombre del módulo en la cabecera fija de la app. */
  helpSections?: ModuleHelpSection[];
  /** Help dialog title; defaults to `title`. */
  helpTitle?: string;
  /** Help dialog subtitle. */
  helpSubtitle?: string;
  className?: string;
}

/**
 * Barra de cabecera de módulo: ya no repite icono/título/subtítulo (la barra
 * superior fija de la app ya los muestra de forma permanente) ni el botón de
 * ayuda (que ahora vive junto al nombre del módulo, arriba del todo, vía
 * `moduleHelpRegistry`). Aquí solo quedan las acciones del módulo y un hueco
 * para un indicador de estado ambiental.
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
  const setModuleHelp = useModuleHelpRegistry((state) => state.setModuleHelp);
  const clearModuleHelp = useModuleHelpRegistry((state) => state.clearModuleHelp);
  const resolvedHelpTitle = helpTitle ?? title;

  useEffect(() => {
    if (helpSections) {
      setModuleHelp({ title: resolvedHelpTitle, subtitle: helpSubtitle, sections: helpSections });
    }

    return () => {
      clearModuleHelp();
    };
  }, [helpSections, helpSubtitle, resolvedHelpTitle, setModuleHelp, clearModuleHelp]);

  if (!actions && !status) {
    return <h2 className="sr-only">{title}</h2>;
  }

  return (
    <div className={cx('mb-2 flex min-w-0 flex-wrap items-center justify-between gap-2', className)}>
      <h2 className="sr-only">{title}</h2>
      <div className="flex min-w-0 shrink-0 flex-wrap items-center gap-2">{status}</div>
      {actions ? <div className="flex min-w-0 flex-1 flex-wrap justify-end gap-2">{actions}</div> : null}
    </div>
  );
}
