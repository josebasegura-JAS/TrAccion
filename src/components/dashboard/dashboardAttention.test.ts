import { describe, expect, it } from 'vitest';
import { buildDashboardAttentionItems, dayDifference } from './dashboardAttention';
import { createDefaultLotteryCampaign } from '../../features/loteria/domain/loteria';
import type { Task } from '../../features/tareas/domain/task';

const task = (patch: Partial<Task> = {}): Task => ({
  id: 't1', titulo: 'Tarea', descripcion: '', tipo: 'interna', fase: 'tarea', estado: 'pendiente', prioridad: 'media',
  fechaLimite: '', responsable: '', origen: '', sindicato: '', observaciones: '', mail: '', documentLinks: [],
  sessionDocumentCode: '', sessionModule: '', sessionDate: '', seguimiento: [], createdAt: '2026-09-01T08:00:00.000Z',
  updatedAt: '2026-09-01T08:00:00.000Z', deletedAt: null, closedAt: null, ...patch,
});

describe('dashboardAttention', () => {
  it('calcula diferencias por día sin depender de la hora local', () => {
    expect(dayDifference('2026-09-11', '2026-09-11')).toBe(0);
    expect(dayDifference('2026-09-11', '2026-09-13')).toBe(2);
    expect(dayDifference('2026-09-11', '2026-09-10')).toBe(-1);
  });

  it('prioriza vencimientos por encima de avisos informativos', () => {
    const lottery = createDefaultLotteryCampaign(2026);
    lottery.workflow.seguimientoIniciado = true;
    lottery.requests = [{
      id: 'r1', nombre: 'Persona', email: '', empleado: '1', externa: false, contactoObservaciones: '',
      decimosNumero1: 1, decimosNumero2: 0, pagado: false, fechaPago: null, formaPago: 'efectivo',
      observacionesPago: '', createdAt: '2026-09-01T08:00:00.000Z', updatedAt: '2026-09-01T08:00:00.000Z',
    }];

    const result = buildDashboardAttentionItems({
      todayIso: '2026-09-11',
      tasks: [task({ fechaLimite: '2026-09-10', prioridad: 'alta' })],
      sessions: [], actas: [], licenses: [], telework: [], lotteryCampaign: lottery,
    });

    expect(result[0]?.key).toBe('tasks-overdue');
    expect(result.at(-1)?.key).toBe('lottery-unpaid');
  });

  it('no alerta de tareas cerradas aunque tengan fecha vencida', () => {
    const result = buildDashboardAttentionItems({
      todayIso: '2026-09-11',
      tasks: [task({ fechaLimite: '2026-09-01', estado: 'cerrada' })],
      sessions: [], actas: [], licenses: [], telework: [], lotteryCampaign: createDefaultLotteryCampaign(2026),
    });
    expect(result).toHaveLength(0);
  });
});
