import type { Task } from '../../tareas/domain/task';
import { readFreshCoordinationTasks } from '../services/coordinationTaskSnapshot';
import {
  coordinationPointStatusLabel,
  useCoordinacionStore as baseCoordinacionStore,
} from './useCoordinacionStoreBase';

const original = baseCoordinacionStore.getState();

async function resolveTasksForCoordination(injectedTasks: Task[]): Promise<Task[]> {
  if (import.meta.env.MODE === 'test') return injectedTasks;
  return readFreshCoordinationTasks();
}

baseCoordinacionStore.setState({
  createDirectionMeeting: async (date, title, tasks) => {
    if (!date.trim() || !title.trim()) return original.createDirectionMeeting(date, title, tasks);
    return original.createDirectionMeeting(date, title, await resolveTasksForCoordination(tasks));
  },
  createOtherAreaMeeting: async (date, title, areaName, referenceTaskId, interlocutors, purpose, tasks) => {
    if (!date.trim() || !title.trim() || !areaName.trim()) {
      return original.createOtherAreaMeeting(date, title, areaName, referenceTaskId, interlocutors, purpose, tasks);
    }
    return original.createOtherAreaMeeting(
      date,
      title,
      areaName,
      referenceTaskId,
      interlocutors,
      purpose,
      await resolveTasksForCoordination(tasks),
    );
  },
  createUnionMeeting: async (date, title, unionName, meetingType, interlocutors, purpose, taskIds, tasks) => {
    if (!date.trim() || !title.trim() || !unionName.trim()) {
      return original.createUnionMeeting(date, title, unionName, meetingType, interlocutors, purpose, taskIds, tasks);
    }
    return original.createUnionMeeting(
      date,
      title,
      unionName,
      meetingType,
      interlocutors,
      purpose,
      taskIds,
      await resolveTasksForCoordination(tasks),
    );
  },
  addTaskPoint: async (meetingId, taskId, tasks) =>
    original.addTaskPoint(meetingId, taskId, await resolveTasksForCoordination(tasks)),
  linkManualPointToTask: async (meetingId, pointId, taskId, tasks) =>
    original.linkManualPointToTask(meetingId, pointId, taskId, await resolveTasksForCoordination(tasks)),
});

export const useCoordinacionStore = baseCoordinacionStore;
export { coordinationPointStatusLabel };
