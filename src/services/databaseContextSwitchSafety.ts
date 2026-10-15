import { hasDirtyEditors } from './dirtyEditors';
import { hasActiveSharedEditing } from './sharedEditingActivity';

type DatabaseSwitchBlockOptions = {
  hasUnsavedSettings?: boolean;
};

export function databaseContextSwitchBlockReason(
  options: DatabaseSwitchBlockOptions = {},
): string | null {
  if (options.hasUnsavedSettings) {
    return 'Guarda o descarta primero los cambios pendientes de Ajustes antes de cambiar la base de datos.';
  }

  if (hasDirtyEditors()) {
    return 'Guarda o descarta primero los cambios pendientes antes de cambiar la base de datos.';
  }

  if (hasActiveSharedEditing()) {
    return 'Cierra primero la edición en curso antes de cambiar la base de datos.';
  }

  return null;
}

export function didDatabaseContextChange(
  previous: TraccionDatabaseStatus | null,
  next: TraccionDatabaseStatus | null,
): boolean {
  if (!previous || !next) return false;

  if (previous.databaseUuid && next.databaseUuid) {
    if (previous.databaseUuid !== next.databaseUuid) return true;
  }

  return (previous.path ?? '') !== (next.path ?? '');
}
