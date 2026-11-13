/**
 * PR9D-4C · Una lectura por utilityProcess, con reserva hasta exit confirmado.
 * Ante timeout no se entrega resultado ni se habilita otra operación mientras
 * siga vivo el hijo. No implementa fallback ni reintentos automáticos.
 */
import type { ExpectedSqliteIdentity } from './persistence/sqliteIntegrityVerification.js';
import type { IsolatedJsonTable } from './persistence/isolatedJsonTables.js';
import type { SqliteJsonRecord } from './persistence/jsonRecordRepository.js';
import { isJsonReadResponse, type JsonReadRequest } from './jsonReadWorkerProtocol.js';

export interface JsonReadChild {
  postMessage(message: JsonReadRequest): void;
  kill(): void;
  onMessage(handler: (data: unknown) => void): void;
  onExit(handler: (exitCode: number) => void): void;
}

export function runJsonReadWorker(options: {
  createChild: () => JsonReadChild;
  databasePath: string;
  expected: ExpectedSqliteIdentity;
  table: IsolatedJsonTable;
  timeoutMs?: number;
}): Promise<SqliteJsonRecord[]> {
  const timeoutMs = options.timeoutMs ?? 20_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    return Promise.reject(new Error('Tiempo de espera inválido.'));
  }
  return new Promise((resolve, reject) => {
    let child: JsonReadChild;
    try { child = options.createChild(); }
    catch { reject(new Error('No se pudo iniciar el lector JSON.')); return; }

    let sent = false;
    let outcome: 'ok' | 'failed' | 'timeout' | null = null;
    let records: SqliteJsonRecord[] | null = null;
    let exited = false;
    const kill = () => { try { child.kill(); } catch { /* mantener reserva hasta exit */ } };
    const timer = setTimeout(() => {
      if (exited || outcome) return;
      outcome = 'timeout';
      kill();
    }, timeoutMs);
    timer.unref?.();

    child.onMessage((message) => {
      if (exited || outcome || !isJsonReadResponse(message)) return;
      if (message.kind === 'json:ready') {
        if (sent) return;
        sent = true;
        try {
          child.postMessage({
            kind: 'json:read', databasePath: options.databasePath,
            expected: options.expected, table: options.table,
          });
        } catch {
          outcome = 'failed';
          kill();
        }
        return;
      }
      if (!sent) return;
      outcome = message.kind === 'json:result' ? 'ok' : 'failed';
      if (message.kind === 'json:result') records = message.records;
      try { child.postMessage({ kind: 'json:shutdown' }); }
      catch { kill(); }
    });

    child.onExit((exitCode) => {
      if (exited) return;
      exited = true;
      clearTimeout(timer);
      if (outcome === 'ok' && exitCode === 0 && records !== null) resolve(records);
      else reject(new Error(outcome === 'timeout'
        ? 'Lectura JSON excedió el plazo; proceso auxiliar terminado sin reutilizar el resultado.'
        : 'No se pudo completar la lectura JSON en el proceso auxiliar.'));
    });
  });
}
