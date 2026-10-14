import { readFreshCoordinationTasks } from '../services/coordinationTaskSnapshot';
import {
  coordinationPointStatusLabel,
  useCoordinacionStore as baseCoordinacionStore,
} from './useCoordinacionStoreBase';

const original = baseCoordinacionStore.getState();

baseCoordinacionStore.setState({
  createDirectionMeeting: async (date, title) => {
    if (!date.trim() || !title.trim()) return original.createDirectionMeeting(date, title, []);
    return original.createDirectionMeeting(date, title, await readFreshCoordinationTasks());
  },
  createOtherAreaMeeting: async (date, title, areaName, referenceTaskId, interlocutors, purpose) => {
    if (!date.trim() || !title.trim() || !areaName.trim()) {
      return original.createOtherAreaMeeting(date, title, areaName, referenceTaskId, interlocutors, purpose, []);
    }
    return original.createOtherAreaMeeting(
      date,
      title,
      areaName,
      referenceTaskId,
      interlocutors,
      purpose,
      await readFreshCoordinationTasks(),
    );
  },
  createUnionMeeting: async (date, title, unionName, meetingType, interlocutors, purpose, taskIds) => {
    if (!date.trim() || !title.trim() || !unionName.trim()) {
      return original.createUnionMeeting(date, title, unionName, meetingType, interlocutors, purpose, taskIds, []);
    }
    return original.createUnionMeeting(
      date,
      title,
      unionName,
      meetingType,
      interlocutors,
      purpose,
      taskIds,
      await readFreshCoordinationTasks(),
    );
  },
  addTaskPoint: async (meetingId, taskId) =>
    original.addTaskPoint(meetingId, taskId, await readFreshCoordinationTasks()),
  linkManualPointToTask: async (meetingId, pointId, taskId) =>
    original.linkManualPointToTask(meetingId, pointId, taskId, await readFreshCoordinationTasks()),
});

export const useCoordinacionStore = baseCoordinacionStore;
export { coordinationPointStatusLabel };
