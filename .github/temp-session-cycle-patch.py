from pathlib import Path

p = Path('src/services/globalSearch.ts')
s = p.read_text()
old = "  const shouldBuildLinkedSessionLookup =\n    !parsedQuery.filters.moduleView || parsedQuery.filters.moduleView === 'tareas';\n"
new = "  const shouldBuildLinkedSessionLookup =\n    !parsedQuery.filters.moduleView ||\n    parsedQuery.filters.moduleView === 'comite' ||\n    parsedQuery.filters.moduleView === 'paritaria';\n"
assert old in s
p.write_text(s.replace(old, new, 1))

p = Path('src/shared/sessions/sessionManagementPage.helpers.ts')
s = p.read_text()
anchor = "export function matchesSessionSearch(\n  session: ManagedSession,\n  tasksById: Map<string, Task>,\n  config: SessionModuleConfig,\n  search: string,\n): boolean {\n"
helper = "export function openSessionsReferenceMissingTasks(\n  sessions: ManagedSession[],\n  tasksById: Map<string, Task>,\n): boolean {\n  return sessions.some(\n    (session) =>\n      session.status === 'open' && session.items.some((taskId) => !tasksById.has(taskId)),\n  );\n}\n\n"
assert anchor in s
p.write_text(s.replace(anchor, helper + anchor, 1))

p = Path('src/shared/sessions/SessionManagementPage.tsx')
s = p.read_text()
old_import = "  matchesSessionSearch,\n  groupClosedSessionsByYear,\n  sessionExportColumns,\n  sortOpenSessions,\n"
new_import = "  matchesSessionSearch,\n  groupClosedSessionsByYear,\n  openSessionsReferenceMissingTasks,\n  sessionExportColumns,\n  sortOpenSessions,\n"
assert old_import in s
s = s.replace(old_import, new_import, 1)
anchor = "  const tasksById = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);\n"
addition = "  const tasksById = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);\n  const openSessionNeedsHistoricalTasks = useMemo(\n    () => openSessionsReferenceMissingTasks(sessions, tasksById),\n    [sessions, tasksById],\n  );\n\n  useEffect(() => {\n    if (!openSessionNeedsHistoricalTasks || historicalTasksLoaded) {\n      return;\n    }\n    void loadHistoricalTasks();\n  }, [historicalTasksLoaded, loadHistoricalTasks, openSessionNeedsHistoricalTasks]);\n"
assert anchor in s
p.write_text(s.replace(anchor, addition, 1))

p = Path('src/services/globalSearch.test.ts')
s = p.read_text()
insert = """
  it('finds a linked closed paritaria task when module filter is explicit', () => {
    const results = searchTraccion('modulo:paritaria bolsa horas', {
      committeeSessions: [],
      paritariaSessions: [{ id: 'paritaria-filtered-1', code: 'CP-08/2026', date: '2026-08-20', title: 'Comisión Paritaria agosto', observations: '', notes: '', status: 'closed', items: ['task-filtered-1'], treatedTaskIds: ['task-filtered-1'], untreatedTaskIds: [], closedAt: '2026-08-20T12:00:00.000Z' }],
      tasks: [{ id: 'task-filtered-1', titulo: 'Regularización bolsa horas', descripcion: 'Punto histórico', observaciones: '', fase: 'cerrada', estado: 'cerrada', closedAt: '2026-08-20T12:00:00.000Z' }],
    });

    expect(results).toEqual(expect.arrayContaining([expect.objectContaining({
      moduleView: 'paritaria',
      recordId: 'paritaria-filtered-1',
      matchReason: 'Coincidencia en punto incluido en sesión',
    })]));
  });
"""
idx = s.rfind('\n});\n')
assert idx >= 0
p.write_text(s[:idx] + insert + s[idx:])

Path('src/shared/sessions/sessionManagementPage.helpers.test.ts').write_text("""import { describe, expect, it } from 'vitest';
import type { Task } from '../../features/tareas/domain/task';
import type { ManagedSession } from './session';
import { openSessionsReferenceMissingTasks } from './sessionManagementPage.helpers';

const session = (status: 'open' | 'closed', items: string[]): ManagedSession => ({
  id: 'session-1', date: '2026-10-01', code: 'CP-10/2026', title: 'Sesión', notes: '', observations: '', status,
  items, treatedTaskIds: [], untreatedTaskIds: [], createdAt: '2026-10-01T08:00:00.000Z', updatedAt: '2026-10-01T09:00:00.000Z',
  closedAt: status === 'closed' ? '2026-10-01T09:00:00.000Z' : null,
});

describe('openSessionsReferenceMissingTasks', () => {
  it('requests historical tasks for a reopened session whose closed point is absent from active tasks', () => {
    expect(openSessionsReferenceMissingTasks([session('open', ['closed-task'])], new Map<string, Task>())).toBe(true);
  });

  it('does not require historical tasks when every point is already loaded', () => {
    const tasksById = new Map<string, Task>([['closed-task', { id: 'closed-task' } as Task]]);
    expect(openSessionsReferenceMissingTasks([session('open', ['closed-task'])], tasksById)).toBe(false);
  });

  it('ignores missing points from closed sessions because history view already loads them', () => {
    expect(openSessionsReferenceMissingTasks([session('closed', ['closed-task'])], new Map<string, Task>())).toBe(false);
  });
});
""")
