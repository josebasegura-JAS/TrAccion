from pathlib import Path

# Strengthen integrity: a session must resolve every imported point.
p = Path('electron/sqlitePersistence.ts')
t = p.read_text(encoding='utf-8')
old = """          const taskIds = session.taskExternalKeys.flatMap((externalKey) => {\n            const id = taskIdsByExternalKey.get(externalKey);\n            return id ? [id] : [];\n          });\n          const finalValue = JSON.stringify({"""
new = """          const taskIds = session.taskExternalKeys.flatMap((externalKey) => {\n            const id = taskIdsByExternalKey.get(externalKey);\n            return id ? [id] : [];\n          });\n          if (taskIds.length !== session.taskExternalKeys.length) {\n            throw new Error('No se han podido resolver todos los puntos de una sesión histórica. No se ha importado ningún cambio.');\n          }\n          const finalValue = JSON.stringify({"""
if old not in t:
    raise SystemExit('task resolution anchor missing')
p.write_text(t.replace(old, new, 1), encoding='utf-8')

# Force a fresh task snapshot after commit before loading historical tasks.
p = Path('src/shared/sessions/SessionManagementPage.tsx')
t = p.read_text(encoding='utf-8')
old = """          await loadHistoricalTasks();\n          await loadHistoricalSessions();\n          setOpenPanel('history');"""
new = """          await reloadTasksFromStorage();\n          await loadHistoricalTasks();\n          loadHistoricalSessions();\n          setOpenPanel('history');"""
if old not in t:
    raise SystemExit('refresh anchor missing')
p.write_text(t.replace(old, new, 1), encoding='utf-8')

# Replace appended regression tests with tests using the file's existing dynamic persistence pattern.
p = Path('electron/sqlitePersistence.coordinationOcc.test.ts')
t = p.read_text(encoding='utf-8')
start = t.find("  it('importa puntos y sesiones históricas en una única transacción e idempotentemente'")
end = t.rfind('\n});\n')
if start < 0 or end < start:
    raise SystemExit('appended PR5 tests not found')
tests = r'''  it('importa puntos y sesiones históricas en una única transacción e idempotentemente', async () => {
    createSharedDatabase(layout.databasePath);
    writePreferences(layout.userData, layout.sharedDirectory);
    const persistence = await import('./sqlitePersistence.js');
    await persistence.initializeSqlitePersistence();

    const now = new Date().toISOString();
    const taskValue = JSON.stringify({ id: 'hist-task-1', titulo: 'Punto histórico', observaciones: 'ImportKey:T-1', createdAt: now, updatedAt: now, deletedAt: null });
    const sessionValue = JSON.stringify({ id: 'hist-session-1', code: 'C-2025-01', date: '2025-01-10', notes: 'ImportKey:S-1', items: [], treatedTaskIds: [], untreatedTaskIds: [], createdAt: now, updatedAt: now, closedAt: now });
    const payload = { module: 'comite' as const, tasks: [{ externalKey: 'T-1', id: 'hist-task-1', value: taskValue }], sessions: [{ externalKey: 'S-1', id: 'hist-session-1', value: sessionValue, taskExternalKeys: ['T-1'] }] };

    const first = await persistence.importSessionHistoryAtomically(payload);
    expect(first.ok).toBe(true);
    expect(first.createdTaskCount).toBe(1);
    expect(first.importedSessionCount).toBe(1);

    const second = await persistence.importSessionHistoryAtomically(payload);
    expect(second.ok).toBe(true);
    expect(second.createdTaskCount).toBe(0);
    expect(second.importedSessionCount).toBe(0);

    const tasks = await persistence.loadTaskRecordsSnapshot({ mode: 'all' });
    expect(tasks.records.filter((record) => record.id === 'hist-task-1')).toHaveLength(1);
    const sessions = await persistence.loadComiteSessionRecordsSnapshot();
    const sessionRecord = sessions.records.find((record) => record.id === 'hist-session-1');
    expect(sessionRecord).toBeDefined();
    expect((JSON.parse(sessionRecord!.value) as { items: string[] }).items).toEqual(['hist-task-1']);
  });

  it('revierte también los puntos si falla la inserción de una sesión histórica', async () => {
    createSharedDatabase(layout.databasePath);
    writePreferences(layout.userData, layout.sharedDirectory);
    const persistence = await import('./sqlitePersistence.js');
    await persistence.initializeSqlitePersistence();

    const now = new Date().toISOString();
    const seeded = await persistence.saveComiteSessionRecordIfUnchanged({
      id: 'collision',
      value: JSON.stringify({ id: 'collision', code: 'OTHER', date: '2024-01-01', notes: '', createdAt: now, updatedAt: now, deletedAt: null }),
      expectedUpdatedAt: null,
    });
    expect(seeded.ok).toBe(true);

    const result = await persistence.importSessionHistoryAtomically({
      module: 'comite',
      tasks: [{ externalKey: 'ROLL-T', id: 'rollback-task', value: JSON.stringify({ id: 'rollback-task', observaciones: 'ImportKey:ROLL-T', createdAt: now, updatedAt: now, deletedAt: null }) }],
      sessions: [{ externalKey: 'ROLL-S', id: 'collision', value: JSON.stringify({ id: 'collision', code: 'NEW', date: '2025-02-01', notes: 'ImportKey:ROLL-S', createdAt: now, updatedAt: now, closedAt: now }), taskExternalKeys: ['ROLL-T'] }],
    });
    expect(result.ok).toBe(false);

    const tasks = await persistence.loadTaskRecordsSnapshot({ mode: 'all' });
    expect(tasks.records.some((record) => record.id === 'rollback-task')).toBe(false);
  });
'''
p.write_text(t[:start] + tests + t[end:], encoding='utf-8')

print('PR5 integration fixes applied')
