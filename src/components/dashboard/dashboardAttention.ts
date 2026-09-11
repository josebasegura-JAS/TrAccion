import type { Acta } from '../../features/actas/domain/acta';
import type { LicenciaSinSueldoRecord } from '../../features/licencias-sin-sueldo/domain/licenciaSinSueldo';
import type { LotteryCampaign } from '../../features/loteria/domain/loteria';
import { lotteryRequestTotalCount } from '../../features/loteria/domain/loteria';
import type { Task } from '../../features/tareas/domain/task';
import type { TeletrabajoSolicitud } from '../../features/teletrabajo/domain/solicitud';
import type { ManagedSession } from '../../shared/sessions/session';
import type { AppView } from '../../navigation/navigation';

export type DashboardAttentionLevel = 'critical' | 'high' | 'medium' | 'info';
export type DashboardAttentionKind = 'task' | 'session' | 'acta' | 'license' | 'telework' | 'lottery';

export interface DashboardAttentionItem {
  key: string;
  kind: DashboardAttentionKind;
  level: DashboardAttentionLevel;
  score: number;
  title: string;
  subtitle: string;
  trailing: string;
  view: AppView;
  recordId?: string;
}

interface BuildDashboardAttentionInput {
  todayIso: string;
  tasks: Task[];
  sessions: Array<ManagedSession & { module: 'comite' | 'paritaria' }>;
  actas: Acta[];
  licenses: LicenciaSinSueldoRecord[];
  telework: TeletrabajoSolicitud[];
  lotteryCampaign: LotteryCampaign;
}

const DAY_MS = 86_400_000;

function parseIsoDay(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const timestamp = Date.UTC(year, month - 1, day);
  return Number.isNaN(timestamp) ? null : timestamp;
}

export function dayDifference(fromIso: string, toIso: string): number | null {
  const from = parseIsoDay(fromIso);
  const to = parseIsoDay(toIso);
  return from === null || to === null ? null : Math.round((to - from) / DAY_MS);
}

function ageInDays(isoDateTimeOrDate: string, todayIso: string): number | null {
  const date = isoDateTimeOrDate.slice(0, 10);
  const diff = dayDifference(date, todayIso);
  return diff === null ? null : Math.max(0, diff);
}

function dueLabel(days: number): string {
  if (days < 0) return `${Math.abs(days)} d venc.`;
  if (days === 0) return 'Hoy';
  if (days === 1) return 'Mañana';
  return `En ${days} d`;
}

function plural(count: number, singular: string, pluralValue: string): string {
  return count === 1 ? singular : pluralValue;
}

export function buildDashboardAttentionItems({
  todayIso,
  tasks,
  sessions,
  actas,
  licenses,
  telework,
  lotteryCampaign,
}: BuildDashboardAttentionInput): DashboardAttentionItem[] {
  const items: DashboardAttentionItem[] = [];

  const openTasks = tasks.filter((task) => !task.deletedAt && task.estado !== 'cerrada' && task.fase.trim().toLowerCase() !== 'cerrada');
  const overdueTasks = openTasks.filter((task) => task.fechaLimite && task.fechaLimite < todayIso);
  if (overdueTasks.length) {
    const critical = overdueTasks.filter((task) => task.prioridad === 'critica').length;
    items.push({
      key: 'tasks-overdue',
      kind: 'task',
      level: 'critical',
      score: 110 + critical * 3,
      title: `${overdueTasks.length} ${plural(overdueTasks.length, 'tarea vencida', 'tareas vencidas')}`,
      subtitle: critical ? `${critical} de prioridad crítica` : 'Plazo superado',
      trailing: 'Vencidas',
      view: 'tareas',
    });
  }

  const criticalTasks = openTasks.filter((task) => task.prioridad === 'critica' && (!task.fechaLimite || task.fechaLimite >= todayIso));
  if (criticalTasks.length) {
    const nearest = criticalTasks
      .filter((task) => task.fechaLimite)
      .map((task) => dayDifference(todayIso, task.fechaLimite))
      .filter((value): value is number => value !== null)
      .sort((a, b) => a - b)[0];
    items.push({
      key: 'tasks-critical',
      kind: 'task',
      level: 'high',
      score: 96,
      title: `${criticalTasks.length} ${plural(criticalTasks.length, 'tarea crítica', 'tareas críticas')}`,
      subtitle: nearest !== undefined && nearest <= 7 ? `La más próxima vence ${dueLabel(nearest).toLowerCase()}` : 'Requieren atención prioritaria',
      trailing: nearest !== undefined && nearest <= 7 ? dueLabel(nearest) : 'Prioridad',
      view: 'tareas',
    });
  }

  const dueSoonTasks = openTasks.filter((task) => {
    if (!task.fechaLimite || task.fechaLimite < todayIso || task.prioridad === 'critica') return false;
    const days = dayDifference(todayIso, task.fechaLimite);
    return days !== null && days <= 2;
  });
  if (dueSoonTasks.length) {
    const nearest = Math.min(...dueSoonTasks.map((task) => dayDifference(todayIso, task.fechaLimite) ?? 99));
    items.push({
      key: 'tasks-soon',
      kind: 'task',
      level: nearest === 0 ? 'high' : 'medium',
      score: nearest === 0 ? 91 : 78,
      title: `${dueSoonTasks.length} ${plural(dueSoonTasks.length, 'tarea vence', 'tareas vencen')} en ≤2 días`,
      subtitle: 'Conviene cerrarlas antes de que entren en vencimiento',
      trailing: dueLabel(nearest),
      view: 'tareas',
    });
  }

  const overdueActas = actas.filter((acta) => acta.estado !== 'Cerrada' && acta.fechaLimite && acta.fechaLimite < todayIso);
  if (overdueActas.length) {
    items.push({
      key: 'actas-overdue',
      kind: 'acta',
      level: 'critical',
      score: 106,
      title: `${overdueActas.length} ${plural(overdueActas.length, 'acta fuera de plazo', 'actas fuera de plazo')}`,
      subtitle: 'Fecha límite superada',
      trailing: 'Vencidas',
      view: 'actas',
    });
  }

  const actasSoon = actas.filter((acta) => {
    if (acta.estado === 'Cerrada' || !acta.fechaLimite || acta.fechaLimite < todayIso) return false;
    const days = dayDifference(todayIso, acta.fechaLimite);
    return days !== null && days <= 2;
  });
  if (actasSoon.length) {
    const nearest = Math.min(...actasSoon.map((acta) => dayDifference(todayIso, acta.fechaLimite) ?? 99));
    items.push({
      key: 'actas-soon',
      kind: 'acta',
      level: nearest === 0 ? 'high' : 'medium',
      score: nearest === 0 ? 92 : 80,
      title: `${actasSoon.length} ${plural(actasSoon.length, 'acta requiere', 'actas requieren')} actuación inmediata`,
      subtitle: 'Firma, alegaciones o cierre con fecha próxima',
      trailing: dueLabel(nearest),
      view: 'actas',
    });
  }

  sessions.forEach((session) => {
    const pending = session.untreatedTaskIds?.length ?? session.items.length;
    if (!pending || !session.date) return;
    const days = dayDifference(todayIso, session.date);
    if (days === null || days > 7) return;
    const isOverdue = days < 0;
    const level: DashboardAttentionLevel = isOverdue ? 'critical' : days <= 2 ? 'high' : 'medium';
    items.push({
      key: `session-${session.module}-${session.id}`,
      kind: 'session',
      level,
      score: isOverdue ? 108 : days === 0 ? 94 : days <= 2 ? 86 : 66,
      title: `${session.module === 'comite' ? 'Comité' : 'Paritaria'} · ${pending} ${plural(pending, 'punto pendiente', 'puntos pendientes')}`,
      subtitle: session.title || session.code || 'Sesión abierta',
      trailing: dueLabel(days),
      view: session.module,
      recordId: session.id,
    });
  });

  const signatureLicenses = licenses.filter((item) => !item.deletedAt && item.estado === 'pendiente_firma');
  if (signatureLicenses.length) {
    const oldestAge = Math.max(...signatureLicenses.map((item) => ageInDays(item.updatedAt || item.createdAt, todayIso) ?? 0));
    const stale = signatureLicenses.filter((item) => (ageInDays(item.updatedAt || item.createdAt, todayIso) ?? 0) >= 7).length;
    items.push({
      key: 'licenses-signature',
      kind: 'license',
      level: stale ? 'high' : 'medium',
      score: stale ? 84 : 62,
      title: `${signatureLicenses.length} ${plural(signatureLicenses.length, 'licencia pendiente', 'licencias pendientes')} de firma`,
      subtitle: stale ? `${stale} llevan 7 días o más sin cerrar` : 'Pendientes de completar el circuito',
      trailing: oldestAge >= 7 ? `${oldestAge} d` : 'Firma',
      view: 'licencias-sin-sueldo',
    });
  }

  const approvalLicenses = licenses.filter((item) => !item.deletedAt && item.estado === 'pendiente_aprobacion');
  const staleApprovals = approvalLicenses.filter((item) => (ageInDays(item.createdAt, todayIso) ?? 0) >= 7);
  if (staleApprovals.length) {
    const oldestAge = Math.max(...staleApprovals.map((item) => ageInDays(item.createdAt, todayIso) ?? 0));
    items.push({
      key: 'licenses-approval-stale',
      kind: 'license',
      level: 'medium',
      score: 64,
      title: `${staleApprovals.length} ${plural(staleApprovals.length, 'licencia lleva', 'licencias llevan')} ≥7 días pendiente de aprobación`,
      subtitle: 'Revisar si falta decisión o documentación',
      trailing: `${oldestAge} d`,
      view: 'licencias-sin-sueldo',
    });
  }

  const pendingTelework = telework.filter((item) => !item.deletedAt && (item.estado === 'pendiente' || item.estado === 'analizada'));
  const staleTelework = pendingTelework.filter((item) => (ageInDays(item.fechaSolicitud || item.createdAt, todayIso) ?? 0) >= 7);
  if (staleTelework.length) {
    const oldestAge = Math.max(...staleTelework.map((item) => ageInDays(item.fechaSolicitud || item.createdAt, todayIso) ?? 0));
    items.push({
      key: 'telework-stale',
      kind: 'telework',
      level: oldestAge >= 14 ? 'high' : 'medium',
      score: oldestAge >= 14 ? 76 : 58,
      title: `${staleTelework.length} ${plural(staleTelework.length, 'solicitud de teletrabajo envejecida', 'solicitudes de teletrabajo envejecidas')}`,
      subtitle: 'Llevan 7 días o más pendientes de gestión',
      trailing: `${oldestAge} d`,
      view: 'teletrabajo',
    });
  }

  if (lotteryCampaign.workflow.seguimientoIniciado && !lotteryCampaign.workflow.campanaCerrada) {
    const unpaid = lotteryCampaign.requests.filter((request) => !request.pagado && lotteryRequestTotalCount(request) > 0);
    if (unpaid.length) {
      items.push({
        key: 'lottery-unpaid',
        kind: 'lottery',
        level: 'info',
        score: 44,
        title: `${unpaid.length} ${plural(unpaid.length, 'pago de Lotería pendiente', 'pagos de Lotería pendientes')}`,
        subtitle: `Campaña ${lotteryCampaign.year} en seguimiento`,
        trailing: 'Cobros',
        view: 'loteria',
      });
    }
  }

  return items.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, 'es'));
}
