import { useEffect } from 'react';

const EDITOR_SHORTCUT_BLOCKER_SELECTOR = '[data-block-editor-shortcuts="true"]';

export function useEditorShortcuts({
  canSave,
  enabled = true,
  onClose,
  onSave,
}: {
  canSave: boolean;
  enabled?: boolean;
  onClose: () => void;
  onSave: () => void;
}) {
  useEffect(() => {
    if (!enabled) return undefined;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return;
      if (document.querySelector(EDITOR_SHORTCUT_BLOCKER_SELECTOR)) return;

      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onClose();
        return;
      }

      const isSaveShortcut =
        (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 's';
      if (!isSaveShortcut) return;

      event.preventDefault();
      event.stopPropagation();
      if (!event.repeat && canSave) onSave();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canSave, enabled, onClose, onSave]);
}
