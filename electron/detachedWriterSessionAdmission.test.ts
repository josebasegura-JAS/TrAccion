import { describe, expect, it } from 'vitest';
import type { DetachedWriterRequest } from './detachedCriteriaWriterProtocol.js';
import { assertSupervisedWriterRequestAllowed } from './detachedWriterSessionAdmission.js';

const legacyWrites: DetachedWriterRequest['kind'][] = [
  'detached:save',
  'detached:save-json-batch',
  'detached:save-task',
  'detached:save-session',
  'detached:close-session-atomically',
  'detached:import-session-history',
  'detached:coordination-workflow',
  'detached:save-configuracion',
  'detached:save-lottery',
  'detached:save-sorteos',
  'detached:save-teletrabajo-batch',
  'detached:save-presupuestos',
];

const receiptedWrites: DetachedWriterRequest['kind'][] = [
  'detached:save-criteria-receipted',
  'detached:save-json-batch-receipted',
  'detached:save-task-receipted',
  'detached:save-session-receipted',
  'detached:close-session-atomically-receipted',
  'detached:import-session-history-receipted',
  'detached:coordination-workflow-receipted',
  'detached:save-configuracion-receipted',
  'detached:save-lottery-receipted',
  'detached:save-sorteos-receipted',
  'detached:save-teletrabajo-batch-receipted',
  'detached:save-presupuestos-receipted',
];

describe('PR504 · admisión de escrituras del writer supervisado', () => {
  it.each(legacyWrites)('rechaza %s en una sesión supervisada', (kind) => {
    expect(() => assertSupervisedWriterRequestAllowed(kind, 7)).toThrow('sin recibo');
  });

  it.each(receiptedWrites)('admite %s en una sesión supervisada', (kind) => {
    expect(() => assertSupervisedWriterRequestAllowed(kind, 7)).not.toThrow();
  });

  it.each(legacyWrites)('conserva %s en el protocolo aislado sin sesión', (kind) => {
    expect(() => assertSupervisedWriterRequestAllowed(kind, null)).not.toThrow();
  });
});
