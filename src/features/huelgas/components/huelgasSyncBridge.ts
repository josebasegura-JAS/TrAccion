type HuelgasExternalReloadListener = () => void;

const listeners = new Set<HuelgasExternalReloadListener>();

export function subscribeHuelgasExternalReload(listener: HuelgasExternalReloadListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function notifyHuelgasExternalReload(): void {
  listeners.forEach((listener) => listener());
}

export function getHuelgasExternalReloadListenerCountForTests(): number {
  return listeners.size;
}
