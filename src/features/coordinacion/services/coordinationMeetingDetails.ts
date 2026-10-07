import { writeJsonStorageAsync } from '../../../services/persistence';
import type { CoordinationMeeting, CoordinationState } from '../domain/coordinacion';
import { COORDINATION_STORAGE_KEY, useCoordinacionStore } from '../store/useCoordinacionStore';

export type CoordinationMeetingDetailsDraft = Pick<
  CoordinationMeeting,
  'title' | 'date' | 'interlocutors' | 'purpose'
>;

export type CoordinationMeetingDetailsResult = { ok: boolean; message: string };

export function buildUpdatedMeetingDetailsState(
  state: CoordinationState,
  meetingId: string,
  draft: CoordinationMeetingDetailsDraft,
  now = new Date().toISOString(),
): { state: CoordinationState | null; error: string | null } {
  const meeting = state.meetings.find((item) => item.id === meetingId);
  if (!meeting) return { state: null, error: 'No se ha encontrado la reunión.' };
  if (meeting.status === 'closed') {
    return { state: null, error: 'La reunión está cerrada. Reábrela antes de editar sus datos.' };
  }

  const title = draft.title?.trim() ?? '';
  const date = draft.date.trim();
  if (!title) return { state: null, error: 'Indica un título para la reunión.' };
  if (!date) return { state: null, error: 'Selecciona la fecha de la reunión.' };

  return {
    error: null,
    state: {
      meetings: state.meetings.map((item) => item.id === meetingId ? {
        ...item,
        title,
        date,
        interlocutors: draft.interlocutors?.trim() ?? '',
        purpose: draft.purpose?.trim() ?? '',
        updatedAt: now,
      } : item),
      directionTaskIds: state.directionTaskIds,
      unionTaskIds: state.unionTaskIds,
      areaTaskIds: state.areaTaskIds,
    },
  };
}

export async function updateCoordinationMeetingDetails(
  meetingId: string,
  draft: CoordinationMeetingDetailsDraft,
): Promise<CoordinationMeetingDetailsResult> {
  const current = useCoordinacionStore.getState();
  const built = buildUpdatedMeetingDetailsState(current, meetingId, draft);
  if (!built.state) return { ok: false, message: built.error ?? 'No se ha podido editar la reunión.' };

  const result = await writeJsonStorageAsync(COORDINATION_STORAGE_KEY, built.state);
  if (!result.ok) return { ok: false, message: result.message };

  useCoordinacionStore.setState(built.state);
  return { ok: true, message: 'Datos de la reunión actualizados.' };
}
