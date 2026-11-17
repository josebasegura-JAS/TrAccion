/**
 * Motor de escritura real, pero deliberadamente sin ruta de producción.
 * Requiere que el controlador haya garantizado propiedad exclusiva de la
 * conexión y lock SMB. No valida ni adquiere por sí mismo el lock distribuido.
 */
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { createDatabaseLockManager } from './persistence/databaseLockManager.js';
import { withDetachedSqliteSmbLease } from './detachedWriterSmbLease.js';
import type { Database, DatabaseConstructor } from 'better-sqlite3';
import { readDatabaseIdentity } from './persistence/databaseIdentity.js';
import { readCurrentSchemaVersion } from './persistence/schemaMigrations.js';
import { saveDetachedCriteriaRecord } from './detachedCriteriaWriterCore.js';
import { saveDetachedJsonBatch } from './detachedJsonWriterCore.js';
import { saveDetachedTaskRecord } from './detachedTaskWriterCore.js';
import { saveDetachedSessionRecord } from './detachedSessionWriterCore.js';
import { closeDetachedSessionWorkflow } from './detachedAtomicSessionCloseCore.js';
import { importDetachedSessionHistory } from './detachedSessionHistoryImportCore.js';
import { executeDetachedCoordinationWorkflow } from './detachedCoordinationWorkflowCore.js';
import { saveDetachedConfiguracion } from './detachedConfiguracionWriterCore.js';
import { saveDetachedLotterySnapshot } from './detachedLotteryWriterCore.js';
import { saveDetachedSorteos } from './detachedSorteosWriterCore.js';
import { saveDetachedTeletrabajoBatch } from './detachedTeletrabajoBatchCore.js';
import { saveDetachedPresupuestos } from './detachedPresupuestosWriterCore.js';
import { createSerializedDetachedMessageQueue } from './detachedWriterMessageQueue.js';
import { isDetachedWriterRequest, type DetachedWriterResponse } from './detachedCriteriaWriterProtocol.js';

const port = process.parentPort;
if (!port) throw new Error('El escritor aislado requiere utilityProcess.');
const require = createRequire(import.meta.url);
let db: Database | null = null;
let opened = false;
let closing = false;
const seenOperations = new Set<string>();
// Unique to THIS utilityProcess. Never reuse the main process ownerId.
const writerOwnerId = `detached-writer:${process.pid}:${randomUUID()}`;
const smbManager = createDatabaseLockManager({ getOwnerId: () => writerOwnerId });
let activeDatabasePath: string | null = null;

function send(message: DetachedWriterResponse): void {
  port!.postMessage(message);
}

const messageQueue = createSerializedDetachedMessageQueue(async (value: unknown) => {
  const message = value;
  if (!isDetachedWriterRequest(message) || closing) return;
  if (message.kind === 'detached:close') {
    closing = true;
    try {
      db?.close();
      db = null;
      send({ kind: 'detached:closed' });
      process.exit(0);
    } catch {
      // Un cierre incierto NO autoriza reutilizar la conexión.
      process.exit(1);
    }
    return;
  }
  if (message.kind === 'detached:open') {
    if (opened) { send({ kind: 'detached:error' }); return; }
    opened = true;
    try {
      const Ctor = require('better-sqlite3') as DatabaseConstructor;
      const candidate = new Ctor(message.databasePath, { fileMustExist: true });
      try {
        candidate.pragma('busy_timeout = 5000');
        const identity = readDatabaseIdentity(candidate);
        if (!identity || identity.databaseUuid !== message.expected.databaseUuid ||
          identity.applicationId !== message.expected.applicationId ||
          identity.environment !== message.expected.environment ||
          readCurrentSchemaVersion(candidate) !== message.expected.schemaVersion) {
          throw new Error('Identidad o esquema SQLite incorrecto.');
        }
        db = candidate;
        activeDatabasePath = message.databasePath;
        send({ kind: 'detached:opened' });
      } finally {
        if (db !== candidate) candidate.close();
      }
    } catch {
      send({ kind: 'detached:error' });
    }
    return;
  }
  if (!db) { send({ kind: 'detached:error', operationId: message.operationId }); return; }
  if (seenOperations.has(message.operationId)) {
    send({ kind: 'detached:error', operationId: message.operationId });
    return;
  }
  seenOperations.add(message.operationId);
  // Capture the validated connection before entering the async SMB lease callback.
  // The message queue serializes open/write/close requests for this worker.
  const activeDb = db;
  try {
    if (!activeDatabasePath) throw new Error('No existe ruta de conexión SQLite verificada.');
    const response: DetachedWriterResponse = await withDetachedSqliteSmbLease(smbManager, activeDatabasePath, async (): Promise<DetachedWriterResponse> => {
    if (message.kind === 'detached:save-json-batch') {
      const result = saveDetachedJsonBatch(activeDb, message.table, message.records);
      return { kind: 'detached:json-batch-saved', operationId: message.operationId, result };
    } else if (message.kind === 'detached:save-task') {
      const result = await saveDetachedTaskRecord(activeDb, message.payload);
      return { kind: 'detached:task-saved', operationId: message.operationId, result };
    } else if (message.kind === 'detached:save-session') {
      const result = await saveDetachedSessionRecord(activeDb, message.payload);
      return { kind: 'detached:session-saved', operationId: message.operationId, result };
    } else if (message.kind === 'detached:close-session-atomically') {
      const result = closeDetachedSessionWorkflow(activeDb, message.payload);
      return { kind: 'detached:session-closed-atomically', operationId: message.operationId, result };
    } else if (message.kind === 'detached:import-session-history') {
      const result = importDetachedSessionHistory(activeDb, message.payload);
      return { kind: 'detached:session-history-imported', operationId: message.operationId, result };
    } else if (message.kind === 'detached:coordination-workflow') {
      const result = executeDetachedCoordinationWorkflow(activeDb, message.payload);
      return { kind: 'detached:coordination-workflow-done', operationId: message.operationId, result };
    } else if (message.kind === 'detached:save-configuracion') {
      const result = saveDetachedConfiguracion(activeDb, message.payload);
      return { kind: 'detached:configuracion-saved', operationId: message.operationId, result };
    } else if (message.kind === 'detached:save-lottery') {
      const result = saveDetachedLotterySnapshot(activeDb, message.payload);
      return { kind: 'detached:lottery-saved', operationId: message.operationId, result };
    } else if (message.kind === 'detached:save-sorteos') {
      const result = saveDetachedSorteos(activeDb, message.payload);
      return { kind: 'detached:sorteos-saved', operationId: message.operationId, result };
    } else if (message.kind === 'detached:save-teletrabajo-batch') {
      const result = saveDetachedTeletrabajoBatch(activeDb, message.payload);
      return { kind: 'detached:teletrabajo-batch-saved', operationId: message.operationId, result };
    } else if (message.kind === 'detached:save-presupuestos') {
      const result = saveDetachedPresupuestos(activeDb, message.payload);
      return { kind: 'detached:presupuestos-saved', operationId: message.operationId, result };
    } else {
      const result = saveDetachedCriteriaRecord(activeDb, message.record);
      return { kind: 'detached:saved', operationId: message.operationId, result };
    }
    });
    send(response);
  } catch {
    closing = true;
    send({ kind: 'detached:error', operationId: message.operationId });
    process.exit(1);
  }
}, () => {
  // Un fallo fuera del manejo transaccional invalida la sesión completa.
  // El coordinador esperará exit antes de liberar propiedad o reintentar.
  process.exit(1);
});
port.on('message', (event: { data: unknown }) => {
  messageQueue.enqueue(event.data);
});
send({ kind: 'detached:ready' });
