import { useCallback, useEffect, useId, useMemo, useRef, type ReactNode } from 'react';
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
  // Solo proteger diferencias de formularios que han permitido editar. Un
  // bloqueo perdido posteriormente no equivale a descartar esas diferencias.
  const hasBeenEnabled = useRef(enabled);
  if (enabled) hasBeenEnabled.current = true;
  const hasLocalChanges = useMemo(
    () => serialize(currentValue) !== serialize(initialValue),
    [currentValue, initialValue],
  );
  const isDirty = hasBeenEnabled.current && hasLocalChanges;

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
