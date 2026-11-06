import { describe, expect, it } from 'vitest';
import { resolveEditorDatabaseIndicator } from './editorDatabaseIndicator';
import type { DatabaseStatusBadgeViewModel } from './databaseStatusView';

const active: DatabaseStatusBadgeViewModel = {
  label: 'Base de datos activa',
  detail: 'Compartida',
  title: 'Base de datos activa',
  tone: 'ok',
  requiresAttention: false,
};

describe('indicador de base de datos de los editores', () => {
  it('no muestra verde si está reconectando aunque el último snapshot esté activo', () => {
    const result = resolveEditorDatabaseIndicator(active, 'reconnecting', true, 'Conexión interrumpida');
    expect(result.tone).toBe('warning');
    expect(result.label).toBe('Reconectando base de datos');
    expect(result.requiresAttention).toBe(true);
  });

  it('mantiene amarillo durante recuperación de datos', () => {
    const result = resolveEditorDatabaseIndicator(active, 'syncing', false, 'Recuperando registros');
    expect(result.tone).toBe('warning');
    expect(result.title).toContain('Recuperando');
  });

  it('no da verde si la edición sigue bloqueada por conectividad', () => {
    expect(resolveEditorDatabaseIndicator(active, 'connected', true, '').tone).toBe('warning');
  });

  it('recupera el verde tras la confirmación sin modificar el snapshot', () => {
    expect(resolveEditorDatabaseIndicator(active, 'connected', false, '').tone).toBe('ok');
    expect(active.tone).toBe('ok');
  });

  it('respeta un fallo real de base de datos', () => {
    const error = { ...active, tone: 'error' as const, label: 'Error de base de datos' };
    expect(resolveEditorDatabaseIndicator(error, 'connected', false, '').tone).toBe('error');
  });
});
