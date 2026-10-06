import { describe, expect, it } from 'vitest';
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
