/**
 * Motor de escritura real, pero deliberadamente sin ruta de producción.
 * Requiere que el controlador haya garantizado propiedad exclusiva de la
 * conexión y lock SMB. No valida ni adquiere por sí mismo el lock distribuido.
 */
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import { acquireDetachedWriterSessionLease, type DetachedWriterSessionLease } from './detachedWriterSessionLease.js';
import { createDatabaseLockManager } from './persistence/databaseLockManager.js';
import { withDetachedSqliteSmbLease } from './detachedWriterSmbLease.js';
import type { Database, DatabaseConstructor } from 'better-sqlite3';
import { readDatabaseIdentity } from './persistence/databaseIdentity.js';
import { readCurrentSchemaVersion } from './persistence/schemaMigrations.js';
import { saveDetachedCriteriaRecord } from './detachedCriteriaWriterCore.js';
import { saveWithDetachedCommitReceipt } from './detachedWriterCommitReceipt.js';
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
let sessionLease: DetachedWriterSessionLease | null = null;
let activeGeneration: number | null = null;
let activeDatabaseUuid: string | null = null;

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
      if (sessionLease) {
        await sessionLease.close();
        sessionLease = null;
      }
      send({ kind: 'detached:closed' });
      process.exit(0);
    } catch {
      // Un cierre incierto NO autoriza reutilizar la conexión.
      process.exit(1);
    }
    return;
  }
  if (message.kind === 'detached:open' || message.kind === 'detached:open-session') {
    if (opened) { send({ kind: 'detached:error' }); return; }
    opened = true;
    try {
      // Reserve the worker session on this workstation BEFORE opening SQLite.
      // The independent ordinary .lockdir is still acquired per write.
      sessionLease = await acquireDetachedWriterSessionLease(
        smbManager, message.databasePath, hostname(),
      );
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
        await sessionLease.assertOwned();
        db = candidate;
        activeDatabasePath = message.databasePath;
        if (message.kind === 'detached:open-session') {
          activeGeneration = message.generation;
          activeDatabaseUuid = message.expected.databaseUuid;
          const { ownerId, hostname: ownerHost, pid, createdAt } = sessionLease.owner;
          send({ kind: 'detached:session-opened', generation: message.generation,
            proof: { ownerId, hostname: ownerHost, pid, createdAt } });
        } else {
          send({ kind: 'detached:opened' });
        }
      } finally {
        if (db !== candidate) candidate.close();
      }
    } catch {
      // An open failure cannot be retried against an uncertain session.
      // Exit destroys the SQLite handle and the coordinator must observe EXIT.
      send({ kind: 'detached:error' });
      process.exit(1);
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
    if (!activeDatabasePath || !sessionLease) throw new Error('Sesión SQLite aislada no verificada.');
    await sessionLease.assertOwned();
    const response: DetachedWriterResponse = await withDetachedSqliteSmbLease(smbManager, activeDatabasePath, async (): Promise<DetachedWriterResponse> => {
    if (message.kind === 'detached:save-criteria-receipted' ||
        message.kind === 'detached:save-json-batch-receipted' ||
        message.kind === 'detached:save-configuracion-receipted' ||
        message.kind === 'detached:save-presupuestos-receipted' ||
        message.kind === 'detached:save-task-receipted' ||
        message.kind === 'detached:save-session-receipted' ||
        message.kind === 'detached:save-lottery-receipted' ||
        message.kind === 'detached:save-sorteos-receipted' ||
        message.kind === 'detached:save-teletrabajo-batch-receipted' ||
        message.kind === 'detached:close-session-atomically-receipted' ||
        message.kind === 'detached:import-session-history-receipted' ||
        message.kind === 'detached:coordination-workflow-receipted') {
      // A renderer/transport payload cannot nominate a different generation
      // or database identity than the one the worker actually opened.
      if (activeGeneration === null || message.generation !== activeGeneration ||
          activeDatabaseUuid === null || message.databaseUuid !== activeDatabaseUuid) {
        throw new Error('Generación o identidad ajena a la sesión SQLite del worker.');
      }
    }
    if (message.kind === 'detached:save-criteria-receipted') {
      const result = saveWithDetachedCommitReceipt(activeDb, {
        operationId: message.operationId, generation: message.generation,
        databaseUuid: message.databaseUuid,
      }, () => saveDetachedCriteriaRecord(activeDb, message.record));
      return { kind: 'detached:criteria-receipted', operationId: message.operationId, result };
    } else if (message.kind === 'detached:save-json-batch-receipted') {
      const result = saveWithDetachedCommitReceipt(activeDb, {
        operationId: message.operationId, generation: message.generation,
        databaseUuid: message.databaseUuid,
      }, () => saveDetachedJsonBatch(activeDb, message.table, message.records));
      return { kind: 'detached:json-batch-receipted', operationId: message.operationId, result };
    } else if (message.kind === 'detached:save-json-batch') {
      const result = saveDetachedJsonBatch(activeDb, message.table, message.records);
      return { kind: 'detached:json-batch-saved', operationId: message.operationId, result };
    } else if (message.kind === 'detached:save-task-receipted') {
      const result = await saveDetachedTaskRecord(activeDb, message.payload, {
        operationId: message.operationId, generation: message.generation,
        databaseUuid: message.databaseUuid,
      });
      return { kind: 'detached:task-receipted', operationId: message.operationId, result };
    } else if (message.kind === 'detached:save-task') {
      const result = await saveDetachedTaskRecord(activeDb, message.payload);
      return { kind: 'detached:task-saved', operationId: message.operationId, result };
    } else if (message.kind === 'detached:save-session-receipted') {
      const result = await saveDetachedSessionRecord(activeDb, message.payload, {
        operationId: message.operationId, generation: message.generation,
        databaseUuid: message.databaseUuid,
      });
      return { kind: 'detached:session-receipted', operationId: message.operationId, result };
    } else if (message.kind === 'detached:save-session') {
      const result = await saveDetachedSessionRecord(activeDb, message.payload);
      return { kind: 'detached:session-saved', operationId: message.operationId, result };
    } else if (message.kind === 'detached:close-session-atomically-receipted') {
      const result = saveWithDetachedCommitReceipt(activeDb, {
        operationId: message.operationId, generation: message.generation,
        databaseUuid: message.databaseUuid,
      }, () => closeDetachedSessionWorkflow(activeDb, message.payload));
      return { kind: 'detached:session-closed-atomically-receipted', operationId: message.operationId, result };
    } else if (message.kind === 'detached:close-session-atomically') {
      const result = closeDetachedSessionWorkflow(activeDb, message.payload);
      return { kind: 'detached:session-closed-atomically', operationId: message.operationId, result };
    } else if (message.kind === 'detached:import-session-history-receipted') {
      const result = saveWithDetachedCommitReceipt(activeDb, {
        operationId: message.operationId, generation: message.generation,
        databaseUuid: message.databaseUuid,
      }, () => importDetachedSessionHistory(activeDb, message.payload));
      return { kind: 'detached:session-history-imported-receipted', operationId: message.operationId, result };
    } else if (message.kind === 'detached:import-session-history') {
      const result = importDetachedSessionHistory(activeDb, message.payload);
      return { kind: 'detached:session-history-imported', operationId: message.operationId, result };
    } else if (message.kind === 'detached:coordination-workflow-receipted') {
      const result = saveWithDetachedCommitReceipt(activeDb, {
        operationId: message.operationId, generation: message.generation,
        databaseUuid: message.databaseUuid,
      }, () => executeDetachedCoordinationWorkflow(activeDb, message.payload));
      return { kind: 'detached:coordination-workflow-done-receipted', operationId: message.operationId, result };
    } else if (message.kind === 'detached:coordination-workflow') {
      const result = executeDetachedCoordinationWorkflow(activeDb, message.payload);
      return { kind: 'detached:coordination-workflow-done', operationId: message.operationId, result };
    } else if (message.kind === 'detached:save-configuracion-receipted') {
      const result = saveWithDetachedCommitReceipt(activeDb, {
        operationId: message.operationId, generation: message.generation,
        databaseUuid: message.databaseUuid,
      }, () => saveDetachedConfiguracion(activeDb, message.payload));
      return { kind: 'detached:configuracion-receipted', operationId: message.operationId, result };
    } else if (message.kind === 'detached:save-configuracion') {
      const result = saveDetachedConfiguracion(activeDb, message.payload);
      return { kind: 'detached:configuracion-saved', operationId: message.operationId, result };
    } else if (message.kind === 'detached:save-lottery-receipted') {
      const result = saveWithDetachedCommitReceipt(activeDb, {
        operationId: message.operationId, generation: message.generation,
        databaseUuid: message.databaseUuid,
      }, () => saveDetachedLotterySnapshot(activeDb, message.payload));
      return { kind: 'detached:lottery-receipted', operationId: message.operationId, result };
    } else if (message.kind === 'detached:save-lottery') {
      const result = saveDetachedLotterySnapshot(activeDb, message.payload);
      return { kind: 'detached:lottery-saved', operationId: message.operationId, result };
    } else if (message.kind === 'detached:save-sorteos-receipted') {
      const result = saveWithDetachedCommitReceipt(activeDb, {
        operationId: message.operationId, generation: message.generation,
        databaseUuid: message.databaseUuid,
      }, () => saveDetachedSorteos(activeDb, message.payload));
      return { kind: 'detached:sorteos-receipted', operationId: message.operationId, result };
    } else if (message.kind === 'detached:save-sorteos') {
      const result = saveDetachedSorteos(activeDb, message.payload);
      return { kind: 'detached:sorteos-saved', operationId: message.operationId, result };
    } else if (message.kind === 'detached:save-teletrabajo-batch-receipted') {
      const result = saveWithDetachedCommitReceipt(activeDb, {
        operationId: message.operationId, generation: message.generation,
        databaseUuid: message.databaseUuid,
      }, () => saveDetachedTeletrabajoBatch(activeDb, message.payload));
      return { kind: 'detached:teletrabajo-batch-receipted', operationId: message.operationId, result };
    } else if (message.kind === 'detached:save-teletrabajo-batch') {
      const result = saveDetachedTeletrabajoBatch(activeDb, message.payload);
      return { kind: 'detached:teletrabajo-batch-saved', operationId: message.operationId, result };
    } else if (message.kind === 'detached:save-presupuestos-receipted') {
      const result = saveWithDetachedCommitReceipt(activeDb, {
        operationId: message.operationId, generation: message.generation,
        databaseUuid: message.databaseUuid,
      }, () => saveDetachedPresupuestos(activeDb, message.payload));
      return { kind: 'detached:presupuestos-receipted', operationId: message.operationId, result };
    } else if (message.kind === 'detached:save-presupuestos') {
      const result = saveDetachedPresupuestos(activeDb, message.payload);
      return { kind: 'detached:presupuestos-saved', operationId: message.operationId, result };
    } else {
      const result = saveDetachedCriteriaRecord(activeDb, message.record);
      return { kind: 'detached:saved', operationId: message.operationId, result };
    }
    });
    await sessionLease.assertOwned();
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
