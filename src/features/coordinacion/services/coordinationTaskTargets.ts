import type { CoordinationState } from '../domain/coordinacion';

function removeTaskFromTargetMap(
  source: Record<string, string[]>,
  taskId: string,
): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(source).map(([name, ids]) => [name, ids.filter((id) => id !== taskId)]),
  );
}

function addTaskToTargetMap(
  source: Record<string, string[]>,
  targetName: string | null,
  taskId: string,
): Record<string, string[]> {
  if (!targetName) return source;
  return {
    ...source,
    [targetName]: [...new Set([...(source[targetName] ?? []), taskId])],
  };
}

export function updateDirectionTarget(
  state: CoordinationState,
  taskId: string,
  enabled: boolean,
): CoordinationState {
  const directionTaskIds = new Set(state.directionTaskIds);
  if (enabled) directionTaskIds.add(taskId);
  else directionTaskIds.delete(taskId);

  return {
    ...state,
    directionTaskIds: [...directionTaskIds],
  };
}

export function updateUnionTarget(
  state: CoordinationState,
  taskId: string,
  unionName: string | null,
): CoordinationState {
  const cleanUnion = unionName?.trim() || null;
  const withoutTask = removeTaskFromTargetMap(state.unionTaskIds, taskId);
  return {
    ...state,
    unionTaskIds: addTaskToTargetMap(withoutTask, cleanUnion, taskId),
  };
}

export function updateAreaTarget(
  state: CoordinationState,
  taskId: string,
  areaName: string | null,
): CoordinationState {
  const cleanArea = areaName?.trim() || null;
  const withoutTask = removeTaskFromTargetMap(state.areaTaskIds, taskId);
  return {
    ...state,
    areaTaskIds: addTaskToTargetMap(withoutTask, cleanArea, taskId),
  };
}

export function updateTaskTargets(
  state: CoordinationState,
  taskId: string,
  targets: { direction: boolean; unionName: string | null; areaName: string | null },
): CoordinationState {
  return updateAreaTarget(
    updateUnionTarget(
      updateDirectionTarget(state, taskId, targets.direction),
      taskId,
      targets.unionName,
    ),
    taskId,
    targets.areaName,
  );
}

export function coordinationTargetsEqual(a: CoordinationState, b: CoordinationState): boolean {
  return JSON.stringify({
    directionTaskIds: a.directionTaskIds,
    unionTaskIds: a.unionTaskIds,
    areaTaskIds: a.areaTaskIds,
  }) === JSON.stringify({
    directionTaskIds: b.directionTaskIds,
    unionTaskIds: b.unionTaskIds,
    areaTaskIds: b.areaTaskIds,
  });
}
