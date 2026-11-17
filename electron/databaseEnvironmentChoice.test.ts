import { beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => ({
  listeners: new Map<string, (...args: unknown[]) => void>(),
  webListeners: new Map<string, (...args: unknown[]) => void>(),
  closed: false,
  loadedUrl: '',
  options: null as Record<string, unknown> | null,
  shown: false,
}));

vi.mock('electron', () => ({
  BrowserWindow: class {
    webContents = {
      on: (name: string, handler: (...args: unknown[]) => void) =>
        fake.webListeners.set(name, handler),
    };
    constructor(options: Record<string, unknown>) { fake.options = options; }
    once(name: string, handler: (...args: unknown[]) => void) { fake.listeners.set(name, handler); }
    loadURL(url: string) {
      fake.loadedUrl = url;
      return Promise.resolve();
    }
    isDestroyed() { return fake.closed; }
    show() { fake.shown = true; }
    close() {
      fake.closed = true;
      fake.listeners.get('closed')?.();
    }
  },
}));

import { promptDatabaseEnvironment } from './databaseEnvironmentChoice.js';

beforeEach(() => {
  fake.listeners.clear();
  fake.webListeners.clear();
  fake.closed = false;
  fake.loadedUrl = '';
  fake.options = null;
  fake.shown = false;
});

async function click(choice: 'production' | 'test' | 'cancel') {
  const promise = promptDatabaseEnvironment();
  const preventDefault = vi.fn();
  fake.webListeners.get('will-navigate')?.(
    {preventDefault},
    'https://traccion-startup.invalid/' + choice,
  );
  expect(preventDefault).toHaveBeenCalledOnce();
  return promise;
}

describe('PR508: selector de arranque', () => {
  it('acepta producción aunque cierre el selector', async () => {
    expect(await click('production')).toBe('production');
    expect(fake.closed).toBe(true);
  });
  it('acepta pruebas sin confundirlas con cancelación', async () => {
    expect(await click('test')).toBe('test');
    expect(fake.closed).toBe(true);
  });
  it('cerrar con X devuelve cancelación', async () => {
    const pending = promptDatabaseEnvironment();
    fake.listeners.get('closed')?.();
    expect(await pending).toBeNull();
  });
  it('usa paleta corporativa oscura y no permite scroll', () => {
    promptDatabaseEnvironment();
    const html = decodeURIComponent(fake.loadedUrl.split(',').slice(1).join(','));
    expect(html).toContain('background:#08111F');
    expect(html).toContain('background:#DC2626');
    expect(html).toContain('overflow:hidden');
    expect(html).toContain('Abrir entorno de pruebas');
    expect(fake.options).toMatchObject({width:455,height:365});
    fake.listeners.get('closed')?.();
  });
});
