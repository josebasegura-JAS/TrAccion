import type { Task } from '../../features/tareas/domain/task';
import { escapeHtml } from '../export/tableExport';
import { managedSessionLabel, type ManagedSession, type SessionModuleConfig } from './session';

function formatDate(value: string | null | undefined): string {
  if (!value) {
    return '—';
  }

  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime()) && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return parsed.toLocaleDateString('es-ES');
  }

  return value;
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return '—';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
}

function getSessionStatusLabel(session: ManagedSession): string {
  return session.status === 'closed' ? 'Sesión cerrada' : 'Sesión abierta';
}

function getPointStatus(session: ManagedSession, taskId: string): string {
  if (session.status === 'open') {
    return 'Pendiente de tratar';
  }

  if (session.treatedTaskIds.includes(taskId)) {
    return 'Tratada';
  }

  if (session.untreatedTaskIds.includes(taskId)) {
    return 'No tratada';
  }

  return 'Sin clasificar';
}

function getStatusClass(status: string): string {
  const normalized = status
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  if (normalized.includes('tratada') && !normalized.includes('no tratada')) {
    return 'print-badge print-badge--success';
  }

  if (normalized.includes('abierta') || normalized.includes('pendiente')) {
    return 'print-badge print-badge--warning';
  }

  if (normalized.includes('cerrada')) {
    return 'print-badge print-badge--success';
  }

  if (normalized.includes('no tratada')) {
    return 'print-badge print-badge--orange';
  }

  return 'print-badge print-badge--muted';
}

function taskDetail(task: Task | undefined): string {
  if (!task) {
    return 'Tarea no encontrada o eliminada.';
  }

  return task.descripcion || task.observaciones || 'Sin descripción registrada.';
}

function taskTitle(task: Task | undefined): string {
  return task?.titulo || 'Tarea no encontrada';
}

function taskMeta(task: Task | undefined): string {
  if (!task) {
    return '';
  }

  return [task.origen ? `Origen: ${task.origen}` : '', task.sindicato ? `Sindicato: ${task.sindicato}` : '']
    .filter(Boolean)
    .join(' · ');
}

function buildSummaryCards(session: ManagedSession, generatedAt: Date): string {
  const cards = [
    { label: 'Fecha sesión', value: formatDate(session.date) },
    { label: 'Sesión', value: managedSessionLabel(session) },
    { label: 'Estado', value: getSessionStatusLabel(session) },
    { label: 'Puntos', value: String(session.items.length) },
    { label: 'Cerrada', value: formatDateTime(session.closedAt) },
    { label: 'Impresión', value: generatedAt.toLocaleDateString('es-ES') },
  ];

  return cards
    .map(
      (card) => `
        <section class="print-summary-card print-summary-card--compact">
          <span>${escapeHtml(card.label)}</span>
          <strong>${escapeHtml(card.value)}</strong>
        </section>
      `,
    )
    .join('');
}

export function buildPrintableCommitteeSessionHtml({
  session,
  tasksById,
  config,
  generatedAt = new Date(),
}: {
  session: ManagedSession;
  tasksById: Map<string, Task>;
  config: SessionModuleConfig;
  generatedAt?: Date;
}): string {
  const statusLabel = getSessionStatusLabel(session);
  const rows = session.items
    .map((taskId, index) => {
      const task = tasksById.get(taskId);
      const status = getPointStatus(session, taskId);
      const meta = taskMeta(task);
      return `
        <tr>
          <td class="print-row-number">${index + 1}</td>
          <td>
            <strong class="print-point-title">${escapeHtml(taskTitle(task))}</strong>
            ${meta ? `<small class="print-point-meta">${escapeHtml(meta)}</small>` : ''}
          </td>
          <td>${escapeHtml(taskDetail(task))}</td>
          <td>${escapeHtml(task?.responsable || '—')}</td>
          <td>${escapeHtml(formatDate(task?.fechaLimite))}</td>
          <td><span class="${getStatusClass(status)}">${escapeHtml(status)}</span></td>
        </tr>
      `;
    })
    .join('');

  return `
    <article class="print-document print-session-document">
      <header class="print-report-header print-session-header">
        <div>
          <h1>${escapeHtml(config.title)}</h1>
          <p class="print-header-subtitle">${escapeHtml(session.title || managedSessionLabel(session))}</p>
        </div>
        <div class="print-header-pill ${session.status === 'closed' ? 'print-header-pill--success' : 'print-header-pill--warning'}">
          ${escapeHtml(statusLabel)}
        </div>
      </header>

      <section class="print-summary-grid print-session-summary-grid">
        ${buildSummaryCards(session, generatedAt)}
      </section>

      ${session.notes ? `
        <section class="print-session-notes">
          <span>Notas de la sesión</span>
          <p>${escapeHtml(session.notes)}</p>
        </section>
      ` : ''}

      <section class="print-table-section">
        <div class="print-section-title">
          <span class="print-section-icon">☰</span>
          <h2>Orden del día / puntos tratados</h2>
        </div>
        <table class="print-table print-session-table">
          <thead>
            <tr>
              <th class="print-row-number-heading">Nº</th>
              <th>Punto del orden del día</th>
              <th>Detalle / acuerdos</th>
              <th>Responsable</th>
              <th>Plazo</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>${rows || '<tr><td colspan="6" class="print-empty">No hay puntos asociados a esta sesión.</td></tr>'}</tbody>
        </table>
      </section>

      <section class="print-session-observations">
        <div>
          <span>Observaciones generales</span>
          <p>Documento generado desde la sesión registrada en la aplicación RRLL. Revisar el contenido antes de su distribución formal.</p>
        </div>
        <div>
          <span>Resumen</span>
          <p>${escapeHtml(session.items.length)} punto${session.items.length === 1 ? '' : 's'} en el orden del día · ${escapeHtml(statusLabel.toLowerCase())}.</p>
        </div>
      </section>

      <footer class="print-footer">
        <span>Relaciones Laborales MB</span>
        <span>Página <span class="print-page-number"></span></span>
      </footer>
    </article>
  `;
}
