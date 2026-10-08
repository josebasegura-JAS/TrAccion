import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useModuleHelpRegistry } from '../../services/moduleHelpRegistry';
import type { ModuleHelpSection } from '../ModuleHelp';

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

interface PageHeaderProps {
  /**
   * Título del módulo. No se pinta en pantalla (la barra superior fija de la
   * app ya indica en qué módulo estás), pero se mantiene como encabezado
   * accesible cuando existe una barra de acciones del módulo y como
   * identificador de la ayuda registrada para este módulo.
   */
  title: string;
  /** Indicador de estado ambiental, p. ej. <InlineSaveFeedback />. */
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
 * Cabecera funcional del contenido del módulo.
 *
 * La identificación del módulo vive en el Header global. Por eso esta pieza
 * solo debe ocupar altura real cuando hay acciones visibles. Los estados
 * efímeros de guardado, cuando van solos, se muestran como feedback flotante
 * y no reservan una fila vacía entre el Header y el contenido.
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
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return;

    const syncModalState = () => {
      setModalOpen(Boolean(document.querySelector('[data-modal-shell="true"]')));
    };

    syncModalState();
    const observer = new MutationObserver(syncModalState);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (helpSections) {
      setModuleHelp({ title: resolvedHelpTitle, subtitle: helpSubtitle, sections: helpSections });
    }

    return () => {
      clearModuleHelp();
    };
  }, [helpSections, helpSubtitle, resolvedHelpTitle, setModuleHelp, clearModuleHelp]);

  if (!actions) {
    if (!status || modalOpen) {
      return null;
    }

    if (typeof document === 'undefined') {
      return null;
    }

    return createPortal(
      <div
        aria-label={`${title}: estado`}
        className="pointer-events-none fixed bottom-5 right-5 z-[80]"
        data-page-header-status="true"
      >
        {status}
      </div>,
      document.body,
    );
  }

  return (
    <div
      className={cx('mb-2 flex flex-wrap items-center justify-between gap-2', className)}
      data-page-header-actions="true"
    >
      <h2 className="sr-only">{title}</h2>
      {status ? <div className="flex min-w-0 flex-wrap items-center gap-2">{status}</div> : null}
      <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">{actions}</div>
    </div>
  );
}
