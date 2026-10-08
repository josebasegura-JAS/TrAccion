import { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { ActionButton } from './ActionButton';

interface FloatingSaveActionProps {
  visible: boolean;
  saving?: boolean;
  pendingLabel?: string;
  buttonLabel?: string;
  savingLabel?: string;
  /**
   * Evita duplicar el guardado mientras la toolbar de acciones de PageHeader
   * esté realmente visible. Si el usuario hace scroll y deja de verla, el
   * guardado flotante vuelve a aparecer.
   */
  suppressWhenPageHeaderHasActions?: boolean;
  /**
   * Selector opcional de un guardado fijo de la pantalla. El flotante se
   * oculta mientras ese control sea visible y aparece al quedar fuera del
   * viewport.
   */
  suppressWhenSelectorVisible?: string;
  onSave: () => void | Promise<unknown>;
}

function elementIsVisibleInViewport(element: Element | null): boolean {
  if (!element || typeof window === 'undefined') return false;
  const rect = element.getBoundingClientRect();
  return rect.width > 0
    && rect.height > 0
    && rect.bottom > 0
    && rect.right > 0
    && rect.top < window.innerHeight
    && rect.left < window.innerWidth;
}

function useSelectorVisibility(enabled: boolean, selector: string | undefined): boolean {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (!enabled || !selector || typeof document === 'undefined' || typeof window === 'undefined') {
      setIsVisible(false);
      return undefined;
    }

    const refresh = () => {
      setIsVisible(elementIsVisibleInViewport(document.querySelector(selector)));
    };

    refresh();
    window.addEventListener('scroll', refresh, true);
    window.addEventListener('resize', refresh);

    const observer = new MutationObserver(refresh);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      window.removeEventListener('scroll', refresh, true);
      window.removeEventListener('resize', refresh);
      observer.disconnect();
    };
  }, [enabled, selector]);

  return isVisible;
}

export function FloatingSaveAction({
  visible,
  saving = false,
  pendingLabel = 'Cambios pendientes',
  buttonLabel = 'Guardar cambios',
  savingLabel = 'Guardando…',
  suppressWhenPageHeaderHasActions = true,
  suppressWhenSelectorVisible,
  onSave,
}: FloatingSaveActionProps) {
  const pageHeaderActionsVisible = useSelectorVisibility(
    suppressWhenPageHeaderHasActions,
    '[data-page-header-actions="true"]',
  );
  const fixedSaveActionVisible = useSelectorVisibility(
    Boolean(suppressWhenSelectorVisible),
    suppressWhenSelectorVisible,
  );

  if (!visible || pageHeaderActionsVisible || fixedSaveActionVisible) return null;

  return (
    <>
      {/*
        Compatibilidad con pantallas que todavía conservan un <p> de estado
        inmediatamente después del guardado flotante (Coordinación). Mientras
        saving=true, el flotante es el único feedback de progreso. En cuanto
        termina, el texto vuelve a mostrarse para warning o error.
      */}
      <style>{`
        [data-floating-save-action="true"][data-saving="true"] + p {
          display: none !important;
        }
      `}</style>
      <div
        aria-live="polite"
        className="fixed bottom-5 right-5 z-[70] flex items-center gap-2 rounded-xl border border-metro-border bg-[#0b1725]/95 p-2 shadow-[0_14px_38px_rgba(2,6,23,0.42)] backdrop-blur"
        data-floating-save-action="true"
        data-saving={saving ? 'true' : 'false'}
      >
        <span className="hidden px-2 text-xs font-semibold text-metro-muted sm:inline">
          {saving ? savingLabel : pendingLabel}
        </span>
        <ActionButton
          disabled={saving}
          icon={Save}
          iconOnly={false}
          loading={saving}
          onClick={() => void onSave()}
          size="sm"
          variant="save"
        >
          {saving ? savingLabel : buttonLabel}
        </ActionButton>
      </div>
    </>
  );
}
