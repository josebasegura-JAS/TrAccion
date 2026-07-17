import { useCallback, useEffect, useId, useMemo, type ReactNode } from 'react';
import { setEditorDirty, unregisterDirtyEditor } from '../services/dirtyEditors';
import { useAppDialog } from './useAppDialog';

function serialize(value: unknown): string {
  return JSON.stringify(value);
}

export function useUnsavedChanges({
  currentValue,
  initialValue,
  enabled = true,
  onDiscard,
}: {
  currentValue: unknown;
  initialValue: unknown;
  enabled?: boolean;
  onDiscard: () => void;
}): {
  isDirty: boolean;
  requestClose: () => Promise<void>;
  dialogNode: ReactNode;
} {
  const editorId = useId();
  const { confirm, dialogNode } = useAppDialog();
  const isDirty = useMemo(
    () => enabled && serialize(currentValue) !== serialize(initialValue),
    [currentValue, enabled, initialValue],
  );

  useEffect(() => {
    setEditorDirty(editorId, isDirty);
    return () => unregisterDirtyEditor(editorId);
  }, [editorId, isDirty]);

  const requestClose = useCallback(async () => {
    if (!isDirty) {
      onDiscard();
      return;
    }

    const shouldDiscard = await confirm(
      'Hay cambios sin guardar. Si cierra ahora, se perderán.',
      {
        title: 'Descartar cambios',
        confirmLabel: 'Descartar cambios',
        cancelLabel: 'Seguir editando',
        danger: true,
      },
    );

    if (shouldDiscard) onDiscard();
  }, [confirm, isDirty, onDiscard]);

  return { isDirty, requestClose, dialogNode };
}
