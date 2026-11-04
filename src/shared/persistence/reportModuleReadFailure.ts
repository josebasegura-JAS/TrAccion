import { emitPersistenceFeedback } from '../../services/persistenceFeedback';

/** El fallo de lectura no equivale a que el repositorio esté vacío. */
export function reportModuleReadFailure(key: string, moduleName: string, error: unknown): void {
  const detail = error instanceof Error ? error.message : String(error);
  console.error(`[${moduleName}] No se ha podido leer el repositorio compartido.`, error);
  emitPersistenceFeedback({
    kind: 'error',
    operation: 'read',
    key,
    updatedAt: new Date().toISOString(),
    message: `${moduleName}: no se ha podido actualizar desde SQLite. Se conserva la última información cargada. ${detail}`,
  });
}
