/**
 * PR481: typed, non-production transport for coordinator.startWriter and
 * coordinator.verifyWorkerSmbOwnership. This is NOT a production activation.
 * The caller must still freeze/drain and close the main SQLite handle first.
 */
import type { ExpectedSqliteIdentity } from './persistence/sqliteIntegrityVerification.js';
import type { SqliteWorkerLockProof } from './sqliteWorkerOwnershipVerification.js';
import type { DetachedWriterRequest } from './detachedCriteriaWriterProtocol.js';
import { isDetachedWriterResponse } from './detachedCriteriaWriterProtocol.js';

export interface SupervisedDetachedChild {
  postMessage(message: DetachedWriterRequest): void;
  onMessage(handler: (message: unknown) => void): void;
  onExit(handler: (code: number) => void): void;
  kill(): void;
}

export interface SupervisedDetachedWriterOptions {
  createChild: () => SupervisedDetachedChild;
  databasePath: string;
  expected: ExpectedSqliteIdentity;
  verifyOwnership: (proof: SqliteWorkerLockProof) => Promise<void>;
  onExitConfirmed?: (generation: number, code: number) => void;
  onUncertain?: (generation: number) => void;
  timeoutMs?: number;
}

export function createSupervisedDetachedWriterSession(options: SupervisedDetachedWriterOptions) {
  let active: { generation: number; proof: SqliteWorkerLockProof | null; child: SupervisedDetachedChild;
    exited: boolean; verified: boolean } | null = null;

  return {
    async startWriter(generation: number): Promise<{ generation: number }> {
      if (active || !Number.isSafeInteger(generation) || generation <= 0 ||
          !options.databasePath.trim()) {
        throw new Error('Sesión del worker ya iniciada o generación inválida.');
      }
      const child = options.createChild();
      const session = { generation, proof: null as SqliteWorkerLockProof | null,
        child, exited: false, verified: false };
      active = session;
      const timeoutMs = options.timeoutMs ?? 20_000;
      if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
        throw new Error('Timeout de sesión SQLite inválido.');
      }
      return new Promise<{ generation: number }>((resolve, reject) => {
        let phase: 'ready' | 'opening' | 'opened' | 'failed' = 'ready';
        let settled = false;
        const uncertain = (): void => {
          try { options.onUncertain?.(generation); } catch { /* never unblock */ }
        };
        const fail = (message: string): void => {
          if (phase === 'failed') return;
          phase = 'failed';
          clearTimeout(timeout);
          uncertain();
          if (!settled) { settled = true; reject(new Error(message)); }
          try { child.kill(); } catch { /* exit still required */ }
        };
        const timeout = setTimeout(() => {
          if (phase !== 'opened') fail('Timeout durante inicio del worker: salida incierta.');
        }, timeoutMs);
        timeout.unref?.();
        child.onMessage((raw) => {
          if (session.exited || phase === 'failed' || phase === 'opened') return;
          if (!isDetachedWriterResponse(raw)) { fail('Mensaje inválido del worker SQLite.'); return; }
          if (phase === 'ready' && raw.kind === 'detached:ready') {
            phase = 'opening';
            try {
              child.postMessage({ kind: 'detached:open-session', databasePath: options.databasePath,
                expected: options.expected, generation });
            } catch { fail('Fallo al solicitar apertura al worker.'); }
          } else if (phase === 'opening' && raw.kind === 'detached:session-opened' &&
              raw.generation === generation) {
            session.proof = raw.proof;
            phase = 'opened';
            clearTimeout(timeout);
            settled = true;
            resolve({ generation });
          } else {
            fail('Respuesta inesperada o generación incorrecta del worker.');
          }
        });
        child.onExit((code) => {
          if (session.exited) return;
          session.exited = true;
          clearTimeout(timeout);
          if (phase !== 'failed') uncertain();
          try { options.onExitConfirmed?.(generation, code); } catch { /* supervisor owns recovery */ }
          if (!settled) {
            settled = true;
            reject(new Error('Worker SQLite terminó antes de confirmar la sesión.'));
          }
        });
      });
    },
    async verifyWorkerSmbOwnership(generation: number): Promise<void> {
      if (!active || active.generation !== generation || !active.proof ||
          active.exited || active.verified) {
        throw new Error('El worker no tiene sesión pendiente de verificación SMB.');
      }
      try {
        await options.verifyOwnership(active.proof);
        if (active.exited) throw new Error('Worker SQLite terminó durante la comprobación SMB.');
        active.verified = true;
      } catch (error) {
        try { options.onUncertain?.(generation); } catch { /* no fallback */ }
        try { active.child.kill(); } catch { /* wait for real exit */ }
        throw error;
      }
    },
    snapshot(): { generation: number; exited: boolean; verified: boolean } | null {
      if (!active) return null;
      return { generation: active.generation, exited: active.exited, verified: active.verified };
    },
  };
}
