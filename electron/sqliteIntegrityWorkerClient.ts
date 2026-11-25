import { utilityProcess } from 'electron';
import { fileURLToPath } from 'node:url';
import { createEngineClient } from './sqliteEngineTransport.js';
import type { ExpectedSqliteIdentity } from './persistence/sqliteIntegrityVerification.js';

/** La reapertura no puede comenzar hasta confirmar la salida real del lector. */
export async function verifyIntegrityInWorker(
  file: string,
  identity: ExpectedSqliteIdentity,
): Promise<void> {
  if (identity.environment !== 'test') throw new Error('Motor experimental reservado a pruebas.');
  const child = utilityProcess.fork(fileURLToPath(new URL('./sqliteIntegrityWorker.js', import.meta.url)), [], {
    serviceName: 'TrAcción SQLite integrity test',
  });
  const exited = new Promise<void>((resolve) => {
    child.once('exit', () => resolve());
  });
  const client = createEngineClient({
    postMessage: (message) => child.postMessage(message),
    onMessage: (listener) => { child.on('message', listener); },
    onExit: (listener) => { child.on('exit', listener); },
  });
  try {
    const result = await client.call('verify-integrity', [file, identity], 20_000);
    if (result !== true) throw new Error('Integridad SQLite no confirmada.');
  } finally {
    if (client.getState() !== 'exited') {
      // El worker es de solo lectura; no hay escritura que reconciliar.
      // Si kill no termina, conservar la reserva de la operación hasta exit.
      try { child.kill(); } catch { /* esperar exit */ }
    }
    await exited;
  }
}
