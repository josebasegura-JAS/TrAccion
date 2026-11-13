/**
 * PR9A · Registro local y acotado de fallos de recuperación SQLite.
 * No escribe sobre SMB, no registra SQL, rutas, nombres ni datos de registros.
 * Este archivo es solo diagnóstico: nunca interviene en la lógica de recuperación.
 */
import { app } from 'electron';
import { appendFileSync, existsSync, renameSync, statSync } from 'node:fs';
import path from 'node:path';

export type SqliteRecoveryStage = 'archivo' | 'consulta' | 'esquema' | 'identidad' | 'bloqueo-heartbeat'
  | 'cierre' | 'verificacion' | 'reapertura' | 'validacion-identidad' | 'sin-etapa';

export interface SqliteRecoveryDiagnosticEvent {
  at: string;
  event: 'health' | 'recovery';
  outcome: 'ok' | 'failed' | 'started' | 'skipped';
  stage: SqliteRecoveryStage;
  durationMs: number;
  errorCode?: string;
  errorName?: string;
  errorMessage?: string;
  errorErrno?: number;
  errorSyscall?: string;
  recoveryRequired?: boolean;
  queue?: {
    queuedOperations: number;
    runningOperation: string | null;
    runningMs: number | null;
    timedOut: boolean;
  };
}

const FILE_NAME = 'sqlite-recovery-diagnostics.jsonl';
const MAX_FILE_BYTES = 512 * 1024;
const MAX_MESSAGE_LENGTH = 160;
let healthyChecks = 0;

export function describeSqliteRecoveryError(error: unknown): Pick<SqliteRecoveryDiagnosticEvent, 'errorCode' | 'errorName' | 'errorMessage' | 'errorErrno' | 'errorSyscall'> {
  if (!error || typeof error !== 'object') return { errorName: 'Unknown' };
  const candidate = error as { code?: unknown; name?: unknown; message?: unknown; errno?: unknown; syscall?: unknown };
  const errorCode = typeof candidate.code === 'string' && /^[A-Za-z0-9_]{1,40}$/.test(candidate.code)
    ? candidate.code : undefined;
  const errorErrno = typeof candidate.errno === 'number' && Number.isSafeInteger(candidate.errno)
    ? candidate.errno : undefined;
  const errorSyscall = typeof candidate.syscall === 'string' && /^(?:stat|lstat|open|read|write|close|access|rename|unlink|mkdir|rmdir|scandir|fstat)$/.test(candidate.syscall)
    ? candidate.syscall : undefined;
  const errorName = typeof candidate.name === 'string' && /^[A-Za-z0-9_]{1,40}$/.test(candidate.name)
    ? candidate.name : 'Error';
  // En las excepciones de fs/SQLite el mensaje puede incluir UNC, usuarios o
  // SQL. Conservar solo la categoría/código; el detalle técnico viene de stage.
  // Evita filtrar datos personales en los ficheros que luego se comparten.
  const raw = typeof candidate.message === 'string' ? candidate.message : '';
  const errorMessage = errorCode
    ? `Código ${errorCode}`
    : raw.startsWith('Schema SQLite inesperado') ? 'Schema SQLite inesperado'
    : raw.startsWith('La identidad de la base SQLite') ? 'Identidad SQLite no coincidente'
    : raw.startsWith('Los metadatos de la base SQLite') ? 'Metadatos SQLite no coincidentes'
    : raw.startsWith('La ruta configurada') ? 'Fichero SQLite no válido'
    : raw.startsWith('SQLite no está inicializado') ? 'Conexión SQLite no inicializada'
    : raw ? 'Error sin código normalizado' : 'Sin mensaje';
  return { errorCode, errorName, errorMessage: errorMessage.slice(0, MAX_MESSAGE_LENGTH), errorErrno, errorSyscall };
}

/** Muestrea operaciones saludables para evitar ruido; conserva todos los fallos y lentas. */
export function shouldWriteSqliteHealthDiagnostic(outcome: 'ok' | 'failed' | 'skipped', durationMs: number): boolean {
  if (outcome !== 'ok' || durationMs >= 2_000) return true;
  healthyChecks += 1;
  return healthyChecks % 60 === 1;
}

export function writeSqliteRecoveryDiagnostic(event: Omit<SqliteRecoveryDiagnosticEvent, 'at'>): void {
  try {
    const file = path.join(app.getPath('userData'), FILE_NAME);
    if (existsSync(file) && statSync(file).size > MAX_FILE_BYTES) {
      // Dos generaciones, acotadas en disco; no afecta a incident journal.
      renameSync(file, file + '.previous');
    }
    appendFileSync(file, JSON.stringify({ at: new Date().toISOString(), ...event }) + '\n', 'utf8');
  } catch {
    // El diagnóstico nunca puede bloquear la lógica de recuperación por error de escritura.
  }
}
