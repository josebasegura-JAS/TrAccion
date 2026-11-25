import { describe, expect, it, vi } from 'vitest';
import path from 'node:path';

vi.mock('electron', () => ({
  app: { getPath: () => path.resolve('default-user-data') },
}));

describe('contexto local de persistencia', () => {
  it('mantiene la ruta histórica y fija una ruta explícita sin permitir cambios', async () => {
    const runtime = await import('./persistenceRuntime.js');
    expect(runtime.getPersistenceUserDataPath()).toBe(path.resolve('default-user-data'));
    expect(() => runtime.configurePersistenceUserDataPath('relative')).toThrow('no absoluta');
    const isolated = path.resolve('isolated-user-data');
    runtime.configurePersistenceUserDataPath(isolated);
    runtime.configurePersistenceUserDataPath(isolated);
    expect(runtime.getPersistenceUserDataPath()).toBe(isolated);
    expect(() => runtime.configurePersistenceUserDataPath(path.resolve('other'))).toThrow('cambiar');
  });
});
