import { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { ActionButton } from './ActionButton';

interface FloatingSaveActionProps {
  visible: boolean;
  saving?: boolean;
  pendingLabel?: string;
  buttonLabel?: string;
  savingLabel?: string;
  /** Evita duplicar una acción de guardado flotante si la pantalla ya tiene una toolbar de acciones visible. */
  suppressWhenPageHeaderHasActions?: boolean;
  onSave: () => void | Promise<unknown>;
}

export function FloatingSaveAction({
  visible,
  saving = false,
  pendingLabel = 'Cambios pendientes',
  buttonLabel = 'Guardar cambios',
  savingLabel = 'Guardando…',
  suppressWhenPageHeaderHasActions = true,
  onSave,
}: FloatingSaveActionProps) {
  const [pageHasHeaderActions, setPageHasHeaderActions] = useState(false);

  useEffect(() => {
    if (!suppressWhenPageHeaderHasActions || typeof document === 'undefined') {
      setPageHasHeaderActions(false);
      return undefined;
    }

    const refresh = () => {
      setPageHasHeaderActions(Boolean(document.querySelector('[data-page-header-actions="true"]')));
    };

    refresh();

    const observer = new MutationObserver(refresh);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, [suppressWhenPageHeaderHasActions]);

  if (!visible || pageHasHeaderActions) return null;

  return (
    <div
      aria-live="polite"
      className="fixed bottom-5 right-5 z-[70] flex items-center gap-2 rounded-xl border border-metro-border bg-[#0b1725]/95 p-2 shadow-[0_14px_38px_rgba(2,6,23,0.42)] backdrop-blur"
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
  );
}
