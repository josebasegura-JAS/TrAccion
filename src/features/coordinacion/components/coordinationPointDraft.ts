import type { CoordinationMeeting, CoordinationPointStatus } from '../domain/coordinacion';

export type CoordinationPointDraft = {
  result: string;
  status: CoordinationPointStatus;
  responsible: string;
  dueDate: string;
};

export function pointToDraft(point: CoordinationMeeting['points'][number]): CoordinationPointDraft {
  return {
    result: point.result,
    status: point.status,
    responsible: point.responsible ?? '',
    dueDate: point.dueDate ?? '',
  };
}
