import { useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useAppDialog } from './useAppDialog';

const DRAFT_VERSION = 1;
const DEFAULT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

type StoredDraft<T> = {
  savedAt: string;
  value: T;
  version: number;
};

function serialize(value: unknown): string {
  return JSON.stringify(value);
}

export function buildRecoverableDraftKey(module: string, recordId: string): string {
  return `traccion:recoverable-draft:${module}:${recordId}`;
}

export function readRecoverableDraft<T>(
  storageKey: string,
  maxAgeMs = DEFAULT_MAX_AGE_MS,
): StoredDraft<T> | null {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<StoredDraft<T>>;
    const savedAtMs = typeof parsed.savedAt === 'string' ? Date.parse(parsed.savedAt) : Number.NaN;
    if (parsed.version !== DRAFT_VERSION || !('value' in parsed) || Number.isNaN(savedAtMs)) {
      window.localStorage.removeItem(storageKey);
      return null;
    }

    if (Date.now() - savedAtMs > maxAgeMs) {
      window.localStorage.removeItem(storageKey);
      return null;
    }

    return parsed as StoredDraft<T>;
  } catch {
    window.localStorage.removeItem(storageKey);
    return null;
  }
}

export function writeRecoverableDraft<T>(storageKey: string, value: T): void {
  const payload: StoredDraft<T> = {
    savedAt: new Date().toISOString(),
    value,
    version: DRAFT_VERSION,
  };
  window.localStorage.setItem(storageKey, JSON.stringify(payload));
}

export function clearRecoverableDraft(storageKey: string): void {
  window.localStorage.removeItem(storageKey);
}

export function useRecoverableDraft<T>({
  currentValue,
  enabled = true,
  initialValue,
  onRecover,
  storageKey,
}: {
  currentValue: T;
  enabled?: boolean;
  initialValue: T;
  onRecover: (value: T) => void;
  storageKey: string;
}): {
  clearDraft: () => void;
  dialogNode: ReactNode;
} {
  const { confirm, dialogNode } = useAppDialog();
  const readyRef = useRef(false);
  // Un permiso de escritura perdido no invalida los cambios locales.
  const initializedKeyRef = useRef<string | null>(null);
  const currentRef = useRef(currentValue);
  const initialRef = useRef(initialValue);
  const onRecoverRef = useRef(onRecover);

  currentRef.current = currentValue;
  initialRef.current = initialValue;
  onRecoverRef.current = onRecover;

  const currentSerialized = useMemo(() => serialize(currentValue), [currentValue]);
  const initialSerialized = useMemo(() => serialize(initialValue), [initialValue]);

  const isDirty = currentSerialized !== initialSerialized;

  const clearDraft = useCallback(() => {
    // Cerrar una consulta que nunca pudo recuperar su borrador no es un
    // descarte explícito de ese borrador anterior.
    if (initializedKeyRef.current === storageKey) clearRecoverableDraft(storageKey);
  }, [storageKey]);

  useEffect(() => {
    let cancelled = false;
    if (initializedKeyRef.current === storageKey) return;
    initializedKeyRef.current = null;
    readyRef.current = false;

    // Una apertura en solo lectura no debe eliminar ni reemplazar un borrador
    // anterior. Se ofrecerá recuperarlo cuando el registro permita editar.
    if (!enabled) return;

    const stored = readRecoverableDraft<T>(storageKey);
    if (!stored || serialize(stored.value) === initialSerialized) {
      if (stored) clearRecoverableDraft(storageKey);
      initializedKeyRef.current = storageKey;
      readyRef.current = true;
      return () => {
        cancelled = true;
      };
    }

    void confirm(
      `Se encontró un borrador sin guardar del ${new Date(stored.savedAt).toLocaleString('es-ES')}. ¿Desea recuperarlo?`,
      {
        title: 'Recuperar borrador',
        confirmLabel: 'Recuperar',
        cancelLabel: 'Descartar borrador',
      },
    ).then((shouldRecover) => {
      if (cancelled) return;

      if (shouldRecover) {
        onRecoverRef.current(stored.value);
      } else {
        clearRecoverableDraft(storageKey);
      }

      initializedKeyRef.current = storageKey;
      readyRef.current = true;
    });

    return () => {
      cancelled = true;
    };
  }, [confirm, enabled, initialSerialized, storageKey]);

  useEffect(() => {
    if (!readyRef.current || initializedKeyRef.current !== storageKey) return;

    // Al perder el bloqueo, conservar inmediatamente el último cambio, incluso
    // si aún no había transcurrido el debounce. No se escribe en SQLite.
    if (!enabled) {
      if (isDirty) writeRecoverableDraft(storageKey, currentValue);
      return;
    }

    if (!isDirty) {
      clearRecoverableDraft(storageKey);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      writeRecoverableDraft(storageKey, currentValue);
    }, 500);

    return () => window.clearTimeout(timeoutId);
  }, [currentValue, enabled, isDirty, storageKey]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      if (!readyRef.current || initializedKeyRef.current !== storageKey) return;
      if (serialize(currentRef.current) === serialize(initialRef.current)) {
        if (enabled) clearRecoverableDraft(storageKey);
        return;
      }
      writeRecoverableDraft(storageKey, currentRef.current);
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [enabled, storageKey]);

  return { clearDraft, dialogNode };
}
