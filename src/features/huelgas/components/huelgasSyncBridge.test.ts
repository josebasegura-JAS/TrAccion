import { describe, expect, it, vi } from 'vitest';
import {
  getHuelgasExternalReloadListenerCountForTests,
  notifyHuelgasExternalReload,
  subscribeHuelgasExternalReload,
} from './huelgasSyncBridge';

describe('huelgasSyncBridge', () => {
  it('notifica a la pantalla abierta y permite desuscribirse', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeHuelgasExternalReload(listener);

    expect(getHuelgasExternalReloadListenerCountForTests()).toBeGreaterThan(0);
    notifyHuelgasExternalReload();
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    notifyHuelgasExternalReload();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
