/**
 * Canal de diagnóstico hacia el watchdog independiente.
 * Solo transmite nombres fijos de operaciones, sin SQL, datos, IDs ni rutas SMB.
 * Nunca espera E/S: si el watchdog ha terminado, la app sigue igual.
 */
type WatchdogOperation = { kind: 'operation'; phase: 'start' | 'finish'; name: string; at: number };
type Sender = (message: WatchdogOperation) => void;
let sender: Sender | null = null;

export function registerMainWatchdogOperationSender(next: Sender | null): void {
  sender = next;
}

export function notifyMainWatchdogOperation(phase: WatchdogOperation['phase'], name: string): void {
  // Los nombres proceden de los handlers IPC, pero sanitizar defensivamente.
  if (!/^[a-z][a-z0-9:-]{0,79}$/.test(name)) return;
  try {
    sender?.({ kind: 'operation', phase, name, at: Date.now() });
  } catch {
    // La instrumentación nunca puede impedir que continúe SQLite.
  }
}
