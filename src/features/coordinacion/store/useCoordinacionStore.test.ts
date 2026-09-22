import { beforeEach, describe, expect, it } from 'vitest';
import type { Task } from '../../tareas/domain/task';
import { EMPTY_COORDINATION_STATE } from '../domain/coordinacion';
import { COORDINATION_STORAGE_KEY, useCoordinacionStore } from './useCoordinacionStore';

function task(id: string, title: string, unionName = 'ELA'): Task {
  return {
    id,
    titulo: title,
    descripcion: `Detalle de ${title}`,
    tipo: 'sindical',
    fase: 'tarea',
    estado: 'pendiente',
    prioridad: 'media',
    fechaLimite: '',
    responsable: 'RRLL',
    origen: '',
    sindicato: unionName,
    observaciones: '',
    mail: '',
    documentLinks: [],
    sessionDocumentCode: '',
    sessionModule: '',
    sessionDate: '',
    seguimiento: [],
    createdAt: '2026-09-22T08:00:00.000Z',
    updatedAt: '2026-09-22T08:00:00.000Z',
    deletedAt: null,
    closedAt: null,
  };
}

describe('useCoordinacionStore — reuniones sindicales', () => {
  beforeEach(() => {
    window.localStorage.clear();
    useCoordinacionStore.setState({ ...EMPTY_COORDINATION_STATE });
  });

  it('crea una reunión con varias tareas y conserva la ficha del sindicato', async () => {
    const tasks = [task('t-1', 'Calendario'), task('t-2', 'Turnos')];
    const result = await useCoordinacionStore.getState().createUnionMeeting(
      '2026-09-22', 'ELA', 'ordinaria', 'Representación y RRLL', 'Seguimiento mensual', ['t-1', 't-2'], tasks,
    );

    expect(result.ok).toBe(true);
    expect(useCoordinacionStore.getState().meetings[0]).toMatchObject({
      area: 'sindicatos', unionName: 'ELA', meetingType: 'ordinaria', interlocutors: 'Representación y RRLL',
    });
    expect(useCoordinacionStore.getState().meetings[0].points.map((point) => point.taskId)).toEqual(['t-1', 't-2']);
  });

  it('arrastra al siguiente guion los asuntos no cerrados y elimina los tratados', async () => {
    const tasks = [task('t-1', 'Calendario'), task('t-2', 'Turnos')];
    const created = await useCoordinacionStore.getState().createUnionMeeting(
      '2026-09-01', 'ELA', 'ordinaria', '', '', ['t-1', 't-2'], tasks,
    );
    const meetingId = created.recordId ?? '';
    const [first, second] = useCoordinacionStore.getState().meetings[0].points;
    await useCoordinacionStore.getState().updatePoint(meetingId, first.id, { status: 'tratado' });
    await useCoordinacionStore.getState().updatePoint(meetingId, second.id, { status: 'pendiente-sindicato' });
    await useCoordinacionStore.getState().closeMeeting(meetingId);

    expect(useCoordinacionStore.getState().unionTaskIds.ELA).toEqual(['t-2']);

    await useCoordinacionStore.getState().createUnionMeeting(
      '2026-10-01', 'ELA', 'seguimiento', '', '', [], tasks,
    );
    expect(useCoordinacionStore.getState().meetings[0].points.map((point) => point.taskId)).toEqual(['t-2']);
  });

  it('migra el estado anterior aunque todavía no tenga unionTaskIds', () => {
    window.localStorage.setItem(COORDINATION_STORAGE_KEY, JSON.stringify({ meetings: [], directionTaskIds: ['t-1'] }));
    useCoordinacionStore.getState().load();
    expect(useCoordinacionStore.getState().directionTaskIds).toEqual(['t-1']);
    expect(useCoordinacionStore.getState().unionTaskIds).toEqual({});
  });
});
