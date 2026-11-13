/**
 * PR9D-4B: un worker por lectura, sin timeout que libere una operación viva.
 * El resultado se acepta únicamente cuando el child confirma exit(0).
 */
import type { ExpectedSqliteIdentity } from './persistence/sqliteIntegrityVerification.js';
import type { SqliteComiteSessionRecord } from './persistence/sesionesRepository.js';
import { isSessionReadResponse, type SessionReadRequest, type SessionReadKind } from './sessionReadWorkerProtocol.js';

export interface SessionReadChild {
 postMessage(message: SessionReadRequest): void;
 kill(): void;
 onMessage(listener: (message: unknown) => void): void;
 onExit(listener: (code: number) => void): void;
}

export function runSessionReadWorker(options: {
 createChild: () => SessionReadChild;
 databasePath: string;
 expected: ExpectedSqliteIdentity;
 module: SessionReadKind;
 id?: string;
 timeoutMs?: number;
}): Promise<SqliteComiteSessionRecord[]> {
 const timeoutMs = options.timeoutMs ?? 20_000;
 if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) return Promise.reject(new Error('Timeout de lectura inválido.'));
 return new Promise((resolve,reject) => {
   let child: SessionReadChild;
   try { child = options.createChild(); }
   catch { reject(new Error('No se pudo iniciar el lector de sesiones.')); return; }
   let sent = false;
   let outcome: 'ok' | 'failed' | 'timeout' | null = null;
   let data: SqliteComiteSessionRecord[] | null = null;
   let exited = false;
   const kill = () => { try { child.kill(); } catch { /* esperar exit */ } };
   const timer = setTimeout(() => {
     if (exited || outcome) return;
     outcome = 'timeout';
     kill();
   }, timeoutMs);
   timer.unref?.();
   child.onMessage((message) => {
     if (exited || outcome || !isSessionReadResponse(message)) return;
     if (message.kind === 'session:ready') {
       if (sent) return;
       sent = true;
       try { child.postMessage({
         kind: 'session:read', databasePath: options.databasePath,
         expected: options.expected, module: options.module,
         ...(options.id === undefined ? {} : { id: options.id }),
       }); } catch { outcome = 'failed'; kill(); }
       return;
     }
     if (!sent) return;
     if (message.kind === 'session:result') {
       outcome = 'ok';
       data = message.records;
     } else {
       outcome = 'failed';
     }
     try { child.postMessage({ kind: 'session:shutdown' }); }
     catch { kill(); }
   });
   child.onExit((code) => {
     if (exited) return;
     exited = true;
     clearTimeout(timer);
     if (outcome === 'ok' && code === 0 && data !== null) resolve(data);
     else reject(new Error(outcome === 'timeout'
       ? 'Lectura de Comité/Paritaria agotó el plazo; worker terminado sin reutilizar datos.'
       : 'No se pudo verificar la lectura de Comité/Paritaria en el proceso auxiliar.'));
   });
 });
}
