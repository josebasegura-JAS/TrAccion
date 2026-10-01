import { Save } from 'lucide-react';
import { ActionButton } from './ActionButton';

interface FloatingSaveActionProps {
  visible: boolean;
  saving?: boolean;
  pendingLabel?: string;
  buttonLabel?: string;
  savingLabel?: string;
  onSave: () => void | Promise<unknown>;
}

export function FloatingSaveAction({
  visible,
  saving = false,
  pendingLabel = 'Cambios pendientes',
  buttonLabel = 'Guardar cambios',
  savingLabel = 'Guardando…',
  onSave,
}: FloatingSaveActionProps) {
  if (!visible) return null;

  return (
    <div
      aria-live="polite"
      className="fixed bottom-5 right-5 z-[70] flex items-center gap-2 rounded-2xl border border-emerald-400/30 bg-[#0b1725]/95 p-2 shadow-[0_18px_45px_rgba(2,6,23,0.5)] backdrop-blur"
    >
      <span className="hidden px-2 text-xs font-semibold text-emerald-200 sm:inline">
        {saving ? savingLabel : pendingLabel}
      </span>
      <ActionButton
        disabled={saving}
        icon={Save}
        iconOnly={false}
        onClick={() => void onSave()}
        size="sm"
        variant="save"
      >
        {saving ? savingLabel : buttonLabel}
      </ActionButton>
    </div>
  );
}
