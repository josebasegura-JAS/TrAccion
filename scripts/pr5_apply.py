from pathlib import Path


def replace_once(path: str, old: str, new: str):
    p = Path(path)
    text = p.read_text(encoding='utf-8')
    if old not in text:
        raise SystemExit(f'Pattern not found in {path}: {old[:120]!r}')
    text = text.replace(old, new, 1)
    p.write_text(text, encoding='utf-8')

# 1) Electron atomic import types + implementation.
p = Path('electron/sqlitePersistence.ts')
text = p.read_text(encoding='utf-8')
anchor = "export interface AtomicSessionWorkflowResult {\n  ok: boolean;\n  status: DatabaseStatus;\n  message: string;\n}\n"
insert = anchor + "\nexport interface AtomicSessionHistoryImportTask {\n  externalKey: string;\n  id: string;\n  value: string;\n}\n\nexport interface AtomicSessionHistoryImportSession {\n  externalKey: string;\n  id: string;\n  value: string;\n  taskExternalKeys: string[];\n}\n\nexport interface AtomicSessionHistoryImportPayload {\n  module: 'comite' | 'paritaria';\n  tasks: AtomicSessionHistoryImportTask[];\n  sessions: AtomicSessionHistoryImportSession[];\n}\n\nexport interface AtomicSessionHistoryImportResult {\n  ok: boolean;\n  status: DatabaseStatus;\n  message: string;\n  importedSessionCount: number;\n  createdTaskCount: number;\n}\n"
if anchor not in text:
    raise SystemExit('sqlite type anchor missing')
text = text.replace(anchor, insert, 1)
func_anchor = "\n\nexport async function closeCoordinationWorkflowAtomically(\n"
func = r'''

export async function importSessionHistoryAtomically(
  payload: AtomicSessionHistoryImportPayload,
): Promise<AtomicSessionHistoryImportResult> {
  return safeDatabaseOperation(
    () => {
      const currentStatus = getSqliteStatus();
      if (
        !currentStatus.ready ||
        currentStatus.phase !== 'active' ||
        isDatabaseWriteBlockedByHeartbeat()
      ) {
        return {
          ok: false,
          status: currentStatus,
          message:
            currentStatus.message ??
            'SQLite no está activo. No se puede importar el histórico de forma segura.',
          importedSessionCount: 0,
          createdTaskCount: 0,
        };
      }

      assertDatabaseWritesAllowed();
      const db = requireDatabase();
      const sessionTable =
        payload.module === 'comite' ? 'comite_session_records' : 'paritaria_session_records';

      const result = db.transaction((): AtomicSessionHistoryImportResult => {
        const parseObject = (value: string): Record<string, unknown> => {
          try {
            const parsed = JSON.parse(value);
            return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {};
          } catch {
            return {};
          }
        };
        const importKeyFrom = (value: unknown): string | null => {
          if (typeof value !== 'string') return null;
          return value.match(/ImportKey:([^\s]+)/)?.[1] ?? null;
        };
        const recordMeta = (value: string) => {
          const parsed = parseObject(value);
          const now = new Date().toISOString();
          return {
            createdAt: typeof parsed.createdAt === 'string' ? parsed.createdAt : now,
            updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : now,
            deletedAt: typeof parsed.deletedAt === 'string' ? parsed.deletedAt : null,
          };
        };

        const taskIdsByExternalKey = new Map<string, string>();
        const existingTaskRows = db.prepare(
          'SELECT id, value_json FROM task_records WHERE deleted_at IS NULL',
        ).all() as Array<{ id?: unknown; value_json?: unknown }>;
        for (const row of existingTaskRows) {
          if (typeof row.id !== 'string' || typeof row.value_json !== 'string') continue;
          const parsed = parseObject(row.value_json);
          const key = importKeyFrom(parsed.observaciones);
          if (key) taskIdsByExternalKey.set(key, row.id);
        }

        let createdTaskCount = 0;
        for (const task of payload.tasks) {
          const knownId = taskIdsByExternalKey.get(task.externalKey);
          if (knownId) continue;
          const duplicateId = db.prepare('SELECT id FROM task_records WHERE id = ?').get(task.id) as { id?: unknown } | undefined;
          if (duplicateId) {
            throw new Error('Una tarea histórica generada ya existe con el mismo identificador. Reintenta la importación.');
          }
          const meta = recordMeta(task.value);
          const inserted = db.prepare(
            `INSERT INTO task_records (id, value_json, created_at, updated_at, deleted_at)
             VALUES (?, ?, ?, ?, ?)`,
          ).run(task.id, task.value, meta.createdAt, meta.updatedAt, meta.deletedAt);
          if (inserted.changes !== 1) throw new Error('No se ha podido crear un punto histórico.');
          taskIdsByExternalKey.set(task.externalKey, task.id);
          createdTaskCount += 1;
        }

        const existingSessionImportKeys = new Set<string>();
        const existingSessionCodeDates = new Set<string>();
        const sessionRows = db.prepare(
          `SELECT value_json FROM ${sessionTable} WHERE deleted_at IS NULL`,
        ).all() as Array<{ value_json?: unknown }>;
        for (const row of sessionRows) {
          if (typeof row.value_json !== 'string') continue;
          const parsed = parseObject(row.value_json);
          const importKey = importKeyFrom(parsed.notes);
          if (importKey) existingSessionImportKeys.add(importKey);
          const code = typeof parsed.code === 'string' ? parsed.code.trim().toLowerCase() : '';
          const date = typeof parsed.date === 'string' ? parsed.date : '';
          if (code && date) existingSessionCodeDates.add(`${code}\u0000${date}`);
        }

        let importedSessionCount = 0;
        for (const session of payload.sessions) {
          const parsed = parseObject(session.value);
          const code = typeof parsed.code === 'string' ? parsed.code.trim().toLowerCase() : '';
          const date = typeof parsed.date === 'string' ? parsed.date : '';
          const codeDate = `${code}\u0000${date}`;
          if (
            existingSessionImportKeys.has(session.externalKey) ||
            (code && date && existingSessionCodeDates.has(codeDate))
          ) {
            continue;
          }

          const taskIds = session.taskExternalKeys.flatMap((externalKey) => {
            const id = taskIdsByExternalKey.get(externalKey);
            return id ? [id] : [];
          });
          const finalValue = JSON.stringify({
            ...parsed,
            items: taskIds,
            treatedTaskIds: taskIds,
            untreatedTaskIds: [],
          });
          const meta = recordMeta(finalValue);
          const duplicateId = db.prepare(`SELECT id FROM ${sessionTable} WHERE id = ?`).get(session.id) as { id?: unknown } | undefined;
          if (duplicateId) throw new Error('Una sesión histórica generada ya existe con el mismo identificador. Reintenta la importación.');
          const inserted = db.prepare(
            `INSERT INTO ${sessionTable} (id, value_json, created_at, updated_at, deleted_at)
             VALUES (?, ?, ?, ?, ?)`,
          ).run(session.id, finalValue, meta.createdAt, meta.updatedAt, meta.deletedAt);
          if (inserted.changes !== 1) throw new Error('No se ha podido crear una sesión histórica.');
          existingSessionImportKeys.add(session.externalKey);
          if (code && date) existingSessionCodeDates.add(codeDate);
          importedSessionCount += 1;
        }

        updateRefreshMetadata(db, new Date().toISOString());
        return {
          ok: true,
          status: currentStatus,
          message: 'Histórico de sesiones y puntos importado de forma atómica.',
          importedSessionCount,
          createdTaskCount,
        };
      })();

      if (result.ok) enqueueLocalBackup(`import:${payload.module}_session_history`);
      return result;
    },
    (nextStatus, message) => ({
      ok: false,
      status: nextStatus,
      message,
      importedSessionCount: 0,
      createdTaskCount: 0,
    }),
  );
}
'''
if func_anchor not in text:
    raise SystemExit('sqlite function anchor missing')
text = text.replace(func_anchor, func + func_anchor, 1)
p.write_text(text, encoding='utf-8')

# 2) IPC registration.
replace_once(
    'electron/ipc/registerSesionesIpc.ts',
    '  closeSessionWorkflowAtomically,\n  closeCoordinationWorkflowAtomically,',
    '  closeSessionWorkflowAtomically,\n  importSessionHistoryAtomically,\n  closeCoordinationWorkflowAtomically,',
)
replace_once(
    'electron/ipc/registerSesionesIpc.ts',
    "  ipcMain.handle('sessions:close-workflow-atomically', (_event, payload: unknown) => {",
    "  ipcMain.handle('sessions:import-history-atomically', (_event, payload: unknown) => {\n    if (!payload || typeof payload !== 'object') {\n      return {\n        ok: false,\n        status: getSqliteStatus(),\n        message: 'Payload de importación histórica inválido.',\n        importedSessionCount: 0,\n        createdTaskCount: 0,\n      };\n    }\n    return enqueueSqliteIpc('sessions:import-history-atomically', () =>\n      importSessionHistoryAtomically(payload as Parameters<typeof importSessionHistoryAtomically>[0]),\n    );\n  });\n\n  ipcMain.handle('sessions:close-workflow-atomically', (_event, payload: unknown) => {",
)

# 3) Preload + renderer typing.
replace_once(
    'electron/preload.cts',
    "  closeSessionWorkflowAtomically: (payload: {\n    module: 'comite' | 'paritaria';",
    "  importSessionHistoryAtomically: (payload: {\n    module: 'comite' | 'paritaria';\n    tasks: Array<{ externalKey: string; id: string; value: string }>;\n    sessions: Array<{ externalKey: string; id: string; value: string; taskExternalKeys: string[] }>;\n  }) => ipcRenderer.invoke('sessions:import-history-atomically', payload),\n  closeSessionWorkflowAtomically: (payload: {\n    module: 'comite' | 'paritaria';",
)
replace_once(
    'src/vite-env.d.ts',
    "  closeSessionWorkflowAtomically?: (payload: { module: 'comite' | 'paritaria';",
    "  importSessionHistoryAtomically?: (payload: { module: 'comite' | 'paritaria'; tasks: Array<{ externalKey: string; id: string; value: string }>; sessions: Array<{ externalKey: string; id: string; value: string; taskExternalKeys: string[] }>; }) => Promise<{ ok: boolean; message: string; importedSessionCount: number; createdTaskCount: number }>;\n  closeSessionWorkflowAtomically?: (payload: { module: 'comite' | 'paritaria';",
)

# 4) Export reusable imported record builders.
replace_once(
    'src/features/tareas/store/taskCrud.ts',
    "export async function createManyTasksFromImport(\n",
    "export function buildImportedTaskRecord(\n  entry: { externalKey: string; draft: TaskDraft; closedAt?: string | null },\n  now = new Date().toISOString(),\n): Task {\n  const { externalKey, draft, closedAt } = entry;\n  return normalizeTask({\n    id: createTaskId(),\n    ...draft,\n    sessionDocumentCode: '',\n    sessionModule: '',\n    sessionDate: '',\n    observaciones: `${draft.observaciones ? `${draft.observaciones} ` : ''}ImportKey:${externalKey}`,\n    seguimiento: buildSeguimiento('Tarea importada desde resumen histórico de Comité/Paritaria.', now),\n    createdAt: closedAt ?? now,\n    updatedAt: now,\n    deletedAt: null,\n    closedAt: isTaskClosed(draft) ? (closedAt ?? now) : null,\n  });\n}\n\nexport async function createManyTasksFromImport(\n",
)
old_task_build = """    const task: Task = normalizeTask({\n      id: createTaskId(),\n      ...draft,\n      sessionDocumentCode: '',\n      sessionModule: '',\n      sessionDate: '',\n      observaciones: `${draft.observaciones ? `${draft.observaciones} ` : ''}ImportKey:${externalKey}`,\n      seguimiento: buildSeguimiento('Tarea importada desde resumen histórico de Comité/Paritaria.', now),\n      createdAt: closedAt ?? now,\n      updatedAt: now,\n      deletedAt: null,\n      closedAt: isTaskClosed(draft) ? (closedAt ?? now) : null,\n    });"""
replace_once(
    'src/features/tareas/store/taskCrud.ts',
    old_task_build,
    "    const task = buildImportedTaskRecord({ externalKey, draft, closedAt }, now);",
)

# Session imported builder reused by store and page.
replace_once(
    'src/shared/sessions/createSessionStore.ts',
    "function addTaskToSession(session: ManagedSession, taskId: string): ManagedSession {",
    "export function buildImportedManagedSession(\n  config: SessionModuleConfig,\n  entry: { externalKey: string; draft: ManagedSessionDraft; taskIds: string[] },\n  now = new Date().toISOString(),\n): ManagedSession {\n  const { externalKey, draft, taskIds } = entry;\n  const closedAt = draft.date ? `${draft.date}T00:00:00.000Z` : now;\n  return {\n    id: createSessionId(config.moduleId),\n    date: draft.date,\n    code: draft.code.trim(),\n    title: draft.title.trim() || `${config.newSessionDefaultTitle} ${draft.date}`.trim(),\n    notes: `${draft.notes.trim() ? `${draft.notes.trim()} ` : ''}ImportKey:${externalKey}`,\n    observations: draft.observations.trim(),\n    status: 'closed',\n    items: taskIds,\n    treatedTaskIds: taskIds,\n    untreatedTaskIds: [],\n    createdAt: closedAt,\n    updatedAt: now,\n    closedAt,\n  };\n}\n\nfunction addTaskToSession(session: ManagedSession, taskId: string): ManagedSession {",
)
# Replace both duplicated session object blocks by builder calls using a broad exact fragment.
old_session_obj = """          const closedAt = draft.date ? `${draft.date}T00:00:00.000Z` : now;\n\n          const importedSessionId = createSessionId(config.moduleId);\n          importedSessionIds.add(importedSessionId);\n          importedSessions.push({\n            id: importedSessionId,\n            date: draft.date,\n            code: draft.code.trim(),\n            title: draft.title.trim() || `${config.newSessionDefaultTitle} ${draft.date}`.trim(),\n            notes: `${draft.notes.trim() ? `${draft.notes.trim()} ` : ''}ImportKey:${externalKey}`,\n            observations: draft.observations.trim(),\n            status: 'closed',\n            items: taskIds,\n            treatedTaskIds: taskIds,\n            untreatedTaskIds: [],\n            createdAt: closedAt,\n            updatedAt: now,\n            closedAt,\n          });"""
p = Path('src/shared/sessions/createSessionStore.ts')
t = p.read_text(encoding='utf-8')
if old_session_obj in t:
    t = t.replace(old_session_obj, "          const importedSession = buildImportedManagedSession(config, { externalKey, draft, taskIds }, now);\n          importedSessionIds.add(importedSession.id);\n          importedSessions.push(importedSession);", 1)
# second block has wrapped title formatting
old2 = """            const closedAt = draft.date ? `${draft.date}T00:00:00.000Z` : now;\n\n            const importedSessionId = createSessionId(config.moduleId);\n            importedSessionIds.add(importedSessionId);\n            importedSessions.push({\n              id: importedSessionId,\n              date: draft.date,\n              code: draft.code.trim(),\n              title:\n                draft.title.trim() || `${config.newSessionDefaultTitle} ${draft.date}`.trim(),\n              notes: `${draft.notes.trim() ? `${draft.notes.trim()} ` : ''}ImportKey:${externalKey}`,\n              observations: draft.observations.trim(),\n              status: 'closed',\n              items: taskIds,\n              treatedTaskIds: taskIds,\n              untreatedTaskIds: [],\n              createdAt: closedAt,\n              updatedAt: now,\n              closedAt,\n            });"""
if old2 not in t:
    raise SystemExit('second session import block missing')
t = t.replace(old2, "            const importedSession = buildImportedManagedSession(config, { externalKey, draft, taskIds }, now);\n            importedSessionIds.add(importedSession.id);\n            importedSessions.push(importedSession);", 1)
p.write_text(t, encoding='utf-8')

# 5) Switch UI importer to single atomic IPC.
p = Path('src/shared/sessions/SessionManagementPage.tsx')
t = p.read_text(encoding='utf-8')
t = t.replace("import type { ManagedSessionStateStore } from './createSessionStore';", "import { buildImportedManagedSession, type ManagedSessionStateStore } from './createSessionStore';", 1)
t = t.replace("import { useTaskStore } from '../../features/tareas/store/useTaskStore';", "import { useTaskStore } from '../../features/tareas/store/useTaskStore';\nimport { buildImportedTaskRecord } from '../../features/tareas/store/taskCrud';", 1)
t = t.replace("    createManyFromImport,\n", "", 1)
old_confirm = """          const taskIdsByExternalKey = await createManyFromImport(importableTasks);\n          const importedSessionsResult = await importSessionsWithConcurrencyCheck(\n            importableSessions.map((session) => ({\n              externalKey: session.externalKey,\n              draft: session.draft,\n              taskIds: session.taskExternalKeys.flatMap((externalKey) => {\n                const taskId = taskIdsByExternalKey[externalKey];\n                return taskId ? [taskId] : [];\n              }),\n            })),\n          );\n          if (!importedSessionsResult.ok) {\n            throw new Error(importedSessionsResult.message);\n          }\n\n          loadTasks();\n          setOpenPanel('history');\n          setImportPreview(null);\n          await alert(\n            importedSessionsResult.importedCount > 0\n              ? `Importación completada: ${importedSessionsResult.importedCount} sesiones históricas y ${importableTasks.length} puntos históricos procesados.`\n              : 'No se han creado sesiones nuevas. Ya existían sesiones con el mismo código y fecha.',\n            { type: 'info' },\n          );"""
new_confirm = """          const atomicImport = window.traccion?.importSessionHistoryAtomically;\n          if (!atomicImport) {\n            throw new Error('La importación histórica transaccional no está disponible. Reinicia TrAcción antes de continuar.');\n          }\n          const now = new Date().toISOString();\n          const taskPayload = importableTasks.map((task) => {\n            const record = buildImportedTaskRecord(task, now);\n            return { externalKey: task.externalKey, id: record.id, value: JSON.stringify(record) };\n          });\n          const sessionPayload = importableSessions.map((session) => {\n            const record = buildImportedManagedSession(\n              config,\n              { externalKey: session.externalKey, draft: session.draft, taskIds: [] },\n              now,\n            );\n            return {\n              externalKey: session.externalKey,\n              id: record.id,\n              value: JSON.stringify(record),\n              taskExternalKeys: session.taskExternalKeys,\n            };\n          });\n          const importedSessionsResult = await atomicImport({\n            module: moduleImportKind,\n            tasks: taskPayload,\n            sessions: sessionPayload,\n          });\n          if (!importedSessionsResult.ok) throw new Error(importedSessionsResult.message);\n\n          await loadHistoricalTasks();\n          await loadHistoricalSessions();\n          setOpenPanel('history');\n          setImportPreview(null);\n          await alert(\n            importedSessionsResult.importedSessionCount > 0\n              ? `Importación completada: ${importedSessionsResult.importedSessionCount} sesiones históricas y ${importedSessionsResult.createdTaskCount} puntos históricos nuevos.`\n              : 'No se han creado sesiones nuevas. El histórico ya estaba importado.',\n            { type: 'info' },\n          );"""
if old_confirm not in t:
    raise SystemExit('confirmImport old block missing')
t = t.replace(old_confirm, new_confirm, 1)
# Remove now-unused destructured method.
t = t.replace("    importSessionsWithConcurrencyCheck,\n", "", 1)
p.write_text(t, encoding='utf-8')

# 6) Add atomic regression tests to existing coordination/session SQLite test file.
p = Path('electron/sqlitePersistence.coordinationOcc.test.ts')
t = p.read_text(encoding='utf-8')
t = t.replace("  createCoordinationTaskAtomically,", "  createCoordinationTaskAtomically,\n  importSessionHistoryAtomically,", 1)
marker = "\n});\n"
pos = t.rfind(marker)
if pos < 0:
    raise SystemExit('test describe end missing')
tests = r'''

  it('importa puntos y sesiones históricas en una única transacción e idempotentemente', async () => {
    const now = new Date().toISOString();
    const taskValue = JSON.stringify({ id: 'hist-task-1', titulo: 'Punto histórico', observaciones: 'ImportKey:T-1', createdAt: now, updatedAt: now, deletedAt: null });
    const sessionValue = JSON.stringify({ id: 'hist-session-1', code: 'C-2025-01', date: '2025-01-10', notes: 'ImportKey:S-1', items: [], treatedTaskIds: [], untreatedTaskIds: [], createdAt: now, updatedAt: now, closedAt: now });
    const payload = { module: 'comite' as const, tasks: [{ externalKey: 'T-1', id: 'hist-task-1', value: taskValue }], sessions: [{ externalKey: 'S-1', id: 'hist-session-1', value: sessionValue, taskExternalKeys: ['T-1'] }] };
    const first = await importSessionHistoryAtomically(payload);
    expect(first.ok).toBe(true);
    expect(first.createdTaskCount).toBe(1);
    expect(first.importedSessionCount).toBe(1);
    const second = await importSessionHistoryAtomically(payload);
    expect(second.ok).toBe(true);
    expect(second.createdTaskCount).toBe(0);
    expect(second.importedSessionCount).toBe(0);
    const taskCount = database!.prepare("SELECT COUNT(*) AS total FROM task_records WHERE id = 'hist-task-1'").get() as { total: number };
    const sessionRow = database!.prepare("SELECT value_json FROM comite_session_records WHERE id = 'hist-session-1'").get() as { value_json: string };
    expect(taskCount.total).toBe(1);
    expect((JSON.parse(sessionRow.value_json) as { items: string[] }).items).toEqual(['hist-task-1']);
  });

  it('revierte también los puntos si falla la inserción de una sesión histórica', async () => {
    const now = new Date().toISOString();
    database!.prepare("INSERT INTO comite_session_records (id, value_json, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, NULL)").run('collision', JSON.stringify({ id: 'collision', code: 'OTHER', date: '2024-01-01', notes: '' }), now, now);
    const result = await importSessionHistoryAtomically({
      module: 'comite',
      tasks: [{ externalKey: 'ROLL-T', id: 'rollback-task', value: JSON.stringify({ id: 'rollback-task', observaciones: 'ImportKey:ROLL-T', createdAt: now, updatedAt: now, deletedAt: null }) }],
      sessions: [{ externalKey: 'ROLL-S', id: 'collision', value: JSON.stringify({ id: 'collision', code: 'NEW', date: '2025-02-01', notes: 'ImportKey:ROLL-S', createdAt: now, updatedAt: now, closedAt: now }), taskExternalKeys: ['ROLL-T'] }],
    });
    expect(result.ok).toBe(false);
    const task = database!.prepare("SELECT id FROM task_records WHERE id = 'rollback-task'").get();
    expect(task).toBeUndefined();
  });
'''
t = t[:pos] + tests + t[pos:]
p.write_text(t, encoding='utf-8')

print('PR5 transformations applied')
