/**
 * PR500 — persistent process-lifecycle tombstone for the experimental writer.
 *
 * A clean IPC ACK, process exit, or a stale SMB lock is NOT permission to
 * reopen main. The marker survives a main-process crash. Only a separate
 * supervised recovery procedure may archive/remove it after validating
 * process termination, database identity, SMB exclusion and journal entries.
 *
 * A persistent local path PER DATABASE / DEVICE is required, never a temp dir.
 * Do not use on production unless cross-process exclusive local ownership
 * and recovery barriers have been independently validated.
 */
import {
  closeSync, existsSync, fsyncSync, openSync, readFileSync,
  renameSync, unlinkSync, writeFileSync,
} from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

export interface DetachedWriterProcessRecord {
  readonly version: 1;
  readonly databaseUuid: string;
  readonly generation: number;
  readonly token: string;
  readonly startedAt: string;
  readonly state: 'launching' | 'exit-confirmed' | 'reconciled';
  readonly exitCode?: number;
}
export interface DetachedWriterProcessStore {
  inspect(): DetachedWriterProcessRecord | null;
  claim(databaseUuid: string, generation: number): DetachedWriterProcessRecord;
  confirmExit(record: DetachedWriterProcessRecord, code: number): void;
  /** Mark reconciliation complete; does not itself permit a new writer. */
  markReconciled(record: DetachedWriterProcessRecord): void;
  /** Only call inside a verified recovery barrier, never during normal startup. */
  archiveReconciled(record: DetachedWriterProcessRecord): string;
}

function validate(record: unknown): DetachedWriterProcessRecord {
  const r = record as Partial<DetachedWriterProcessRecord> | null;
  if (!r || r.version !== 1 || typeof r.databaseUuid !== 'string' ||
      !r.databaseUuid.trim() || !Number.isSafeInteger(r.generation) ||
      !r.generation || r.generation <= 0 || typeof r.token !== 'string' ||
      !r.token.trim() || typeof r.startedAt !== 'string' || !r.startedAt.trim() ||
      (r.state !== 'launching' && r.state !== 'exit-confirmed' && r.state !== 'reconciled') ||
      ((r.state === 'exit-confirmed' || r.state === 'reconciled') && !Number.isSafeInteger(r.exitCode)) ||
      (r.state === 'launching' && r.exitCode !== undefined)) {
    throw new Error('Marcador de proceso escritor SQLite ilegible: cuarentena obligatoria.');
  }
  return r as DetachedWriterProcessRecord;
}

function syncDirectory(directory: string): void {
  if (process.platform === 'win32') return; // Windows directory sync unsupported.
  const fd = openSync(directory, 'r');
  try { fsyncSync(fd); } finally { closeSync(fd); }
}

export function createDetachedWriterProcessStore(file: string): DetachedWriterProcessStore {
  if (!file.trim()) throw new Error('Se requiere ruta persistente para el marcador del escritor.');
  let poisoned = false;
  function healthy(): void {
    if (poisoned) throw new Error('Marcador del escritor incierto: recuperación manual requerida.');
  }
  function read(): DetachedWriterProcessRecord | null {
    healthy();
    return existsSync(file) ? validate(JSON.parse(readFileSync(file, 'utf8'))) : null;
  }
  function replaceState(
    record: DetachedWriterProcessRecord, desired: 'exit-confirmed' | 'reconciled',
    code?: number,
  ): void {
    healthy();
    const current = read();
    const sourceState = desired === 'reconciled' ? 'exit-confirmed' : 'launching';
    if (!current || current.token !== record.token ||
        current.generation !== record.generation ||
        current.databaseUuid !== record.databaseUuid || current.state !== sourceState) {
      throw new Error('Transición de proceso escritor no coincide con sesión persistente.');
    }
    if (desired === 'exit-confirmed' && !Number.isSafeInteger(code)) {
      throw new Error('Salida del writer sin código válido.');
    }
    const temp = file + '.' + randomUUID() + '.tmp';
    try {
      const fd = openSync(temp, 'wx', 0o600);
      try {
        writeFileSync(fd, JSON.stringify({
          ...current, state: desired,
          exitCode: desired === 'exit-confirmed' ? code : current.exitCode,
        }), 'utf8');
        fsyncSync(fd);
      } finally { closeSync(fd); }
      renameSync(temp, file);
      syncDirectory(dirname(file));
    } catch (error) {
      try { unlinkSync(temp); } catch { /* preserve failure */ }
      poisoned = true;
      throw error;
    }
  }
  return {
    inspect: read,
    claim(databaseUuid, generation) {
      healthy();
      if (!databaseUuid.trim() || !Number.isSafeInteger(generation) || generation <= 0) {
        throw new Error('Identidad o generación SQLite inválidas.');
      }
      const record: DetachedWriterProcessRecord = {
        version: 1, databaseUuid, generation, token: randomUUID(),
        startedAt: new Date().toISOString(), state: 'launching',
      };
      // Atomic wx: a marker left by a killed parent or another parent blocks
      // a new writer, INCLUDING a marker marked exit-confirmed. No TTL reclaim.
      let fd: number;
      try { fd = openSync(file, 'wx', 0o600); }
      catch { throw new Error('Existe sesión escritora previa: recuperación exclusiva obligatoria.'); }
      try {
        writeFileSync(fd, JSON.stringify(record), 'utf8');
        fsyncSync(fd);
        closeSync(fd);
        syncDirectory(dirname(file));
        return record;
      } catch (error) {
        try { closeSync(fd); } catch { /* preserve failure */ }
        // A partially-created marker is deliberately retained: never silently
        // unlink it as that would reopen a window for duplicate child launch.
        poisoned = true;
        throw error;
      }
    },
    confirmExit(record, code) {
      replaceState(record, 'exit-confirmed', code);
    },
    markReconciled(record) {
      // Only invoked inside an independently established recovery barrier.
      // The file remains in place: later claim() still fails closed.
      replaceState(record, 'reconciled');
    },
    archiveReconciled(record) {
      healthy();
      const current = read();
      // Archive is a one-way administrative operation. An EXIT marker, a
      // launching process or an old token never permits a new claim.
      if (!current || current.state !== 'reconciled' ||
          current.token !== record.token ||
          current.databaseUuid !== record.databaseUuid ||
          current.generation !== record.generation ||
          current.exitCode !== record.exitCode) {
        throw new Error('Rearme SQLite denegado: marcador no conciliado o sesión distinta.');
      }
      const archive = file + '.reconciled.' + randomUUID() + '.json';
      try {
        // Preserve evidence rather than unlinking the existing marker.
        // A new claim still requires an atomic wx creation of the marker.
        renameSync(file, archive);
        syncDirectory(dirname(file));
        return archive;
      } catch (error) {
        poisoned = true;
        throw error;
      }
    },
  };
}
