import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildRecoverableDraftKey,
  clearRecoverableDraft,
  readRecoverableDraft,
  writeRecoverableDraft,
} from './useRecoverableDraft';

describe('recoverable drafts storage', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.useRealTimers();
  });

  it('builds isolated keys by module and record', () => {
    expect(buildRecoverableDraftKey('tareas', '123')).toBe(
      'traccion:recoverable-draft:tareas:123',
    );
  });

  it('writes, reads and clears a draft', () => {
    const key = buildRecoverableDraftKey('tareas', 'new');
    const value = { titulo: 'Pendiente', descripcion: 'Texto' };

    writeRecoverableDraft(key, value);
    expect(readRecoverableDraft<typeof value>(key)?.value).toEqual(value);

    clearRecoverableDraft(key);
    expect(readRecoverableDraft(key)).toBeNull();
  });

  it('removes expired drafts', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-17T10:00:00.000Z'));
    const key = buildRecoverableDraftKey('teletrabajo', 'abc');
    writeRecoverableDraft(key, { empleado: '123' });

    vi.setSystemTime(new Date('2026-07-25T10:00:00.000Z'));
    expect(readRecoverableDraft(key)).toBeNull();
    expect(window.localStorage.getItem(key)).toBeNull();
  });

  it('discards malformed data safely', () => {
    const key = buildRecoverableDraftKey('tareas', 'broken');
    window.localStorage.setItem(key, '{not-json');

    expect(readRecoverableDraft(key)).toBeNull();
    expect(window.localStorage.getItem(key)).toBeNull();
  });
});
