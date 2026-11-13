/**
 * PR9C · Supervisión del utilityProcess de prueba.
 * No hace acceso a SQLite, no reintenta escrituras ni reinicia procesos.
 * Una solicitud vencida requiere confirmar el evento exit antes de cualquier
 * futura sustitución. El propietario de la instancia decide qué hacer después.
 */
import { isSqliteWorkerProbeResponse, type SqliteWorkerProbeRequest } from './sqliteWorkerProbeProtocol.js';

export type SqliteProbeState = 'starting' | 'ready' | 'unresponsive' | 'exited' | 'stopped';

export interface SqliteProbeChild {
  postMessage(message: SqliteWorkerProbeRequest): void;
  kill(): boolean;
  onMessage(listener: (data: unknown) => void): void;
  onExit(listener: (code: number) => void): void;
}

export interface SqliteProbeSupervisorOptions {
  createChild: () => SqliteProbeChild;
  onState: (state: SqliteProbeState) => void;
  intervalMs?: number;
  timeoutMs?: number;
}

export function startSqliteWorkerProbeSupervisor(options: SqliteProbeSupervisorOptions): {
  getState: () => SqliteProbeState;
  stop: () => void;
} {
  const intervalMs = options.intervalMs ?? 2_000;
  const timeoutMs = options.timeoutMs ?? 6_000;
  if (!Number.isFinite(intervalMs) || intervalMs <= 0
      || !Number.isFinite(timeoutMs) || timeoutMs <= intervalMs) {
    throw new Error('Intervalos inválidos para la supervisión del proceso auxiliar.');
  }

  const child = options.createChild();
  let state: SqliteProbeState = 'starting';
  let sequence = 0;
  let pending: { id: number; startedAt: number } | null = null;
  let exited = false;
  let stopping = false;

  const update = (next: SqliteProbeState): void => {
    if (state === next) return;
    state = next;
    options.onState(next);
  };

  child.onMessage((data) => {
    if (stopping || exited || state === 'unresponsive' || !isSqliteWorkerProbeResponse(data)) return;
    if (data.kind === 'probe:ready') {
      update('ready');
      return;
    }
    if (pending?.id === data.id) pending = null;
  });

  child.onExit(() => {
    exited = true;
    clearInterval(interval);
    pending = null;
    // Si se solicitó stop, no considerar exit un fallo; en ambos casos
    // la salida real queda confirmada por este evento, nunca por kill().
    update(stopping ? 'stopped' : 'exited');
  });

  const interval = setInterval(() => {
    if (stopping || exited || state === 'unresponsive') return;
    const now = Date.now();
    if (pending) {
      if (now - pending.startedAt >= timeoutMs) {
        update('unresponsive');
        // kill() únicamente solicita la terminación; la salida no queda
        // confirmada hasta onExit. No se crea otro proceso aquí.
        try { child.kill(); } catch { /* seguir a la espera de exit */ }
      }
      return;
    }
    const id = ++sequence;
    pending = { id, startedAt: now };
    try {
      child.postMessage({ kind: 'probe:ping', id });
    } catch {
      update('unresponsive');
      try { child.kill(); } catch { /* esperar exit */ }
    }
  }, intervalMs);
  interval.unref?.();

  return {
    getState: () => state,
    stop: () => {
      if (stopping || exited) return;
      stopping = true;
      clearInterval(interval);
      // Este worker es de prueba y NO tiene ninguna transacción SQLite.
      // En fases posteriores, su terminación exigirá reconciliar E/S incierta.
      try { child.postMessage({ kind: 'probe:shutdown' }); } catch { /* ya cerrado */ }
      try { child.kill(); } catch { /* evento exit puede tardar */ }
    },
  };
}
