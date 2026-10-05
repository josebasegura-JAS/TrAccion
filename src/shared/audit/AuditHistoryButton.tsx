import { useEffect, useState } from 'react';
import { ActionButton } from '../../components/ui/ActionButton';
import { ModalCloseButton } from '../../components/ui/ModalCloseButton';
import { ModalBody, ModalHeader, ModalShell, ModalTitle } from '../../components/ui/ModalShell';
import {
  getAuditEventsForRecordShared,
  type AuditEvent,
  type AuditModule,
} from './auditTrail';

function formatAuditDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function actionLabel(action: AuditEvent['action']): string {
  if (action === 'created') return 'Creación';
  if (action === 'deleted') return 'Eliminación';
  if (action === 'status_changed') return 'Cambio de estado';
  return 'Edición';
}

export function AuditHistoryButton({
  module,
  entityId,
  entityTitle,
  className,
}: {
  module: AuditModule;
  entityId: string;
  entityTitle: string;
  className?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    setIsLoading(true);
    getAuditEventsForRecordShared(module, entityId)
      .then(setEvents)
      .catch(() => setEvents([]))
      .finally(() => setIsLoading(false));
  }, [isOpen, module, entityId]);

  return (
    <>
      <ActionButton
        className={className}
        iconOnly={false}
        onClick={() => setIsOpen(true)}
        type="button"
        variant="history"
      >
        Historial
      </ActionButton>

      {isOpen && (
        <ModalShell labelledBy="audit-history-title" onClose={() => setIsOpen(false)} size="md" stacked>
          <ModalHeader>
            <ModalTitle
              id="audit-history-title"
              subtitle={isLoading ? 'Cargando…' : `${events.length} evento(s) registrados.`}
            >
              Historial de cambios · {entityTitle}
            </ModalTitle>
            <ModalCloseButton label="Cerrar historial" onClick={() => setIsOpen(false)} />
          </ModalHeader>

          <ModalBody>
            {isLoading ? (
              <p className="rounded-lg border border-metro-border bg-metro-panel px-3 py-2 text-sm font-semibold text-metro-muted">
                Cargando historial compartido…
              </p>
            ) : events.length === 0 ? (
              <p className="rounded-lg border border-metro-border bg-metro-panel px-3 py-2 text-sm font-semibold text-metro-muted">
                No hay cambios registrados todavía. Se empezarán a registrar desde esta versión.
              </p>
            ) : (
              <div className="space-y-2">
                {events.map((event) => (
                  <article className="rounded-xl border border-metro-border bg-metro-panel px-3 py-2" key={event.id}>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-bold text-metro-text">{event.summary}</p>
                        <p className="text-xs font-semibold text-metro-muted">
                          {formatAuditDate(event.createdAt)} · {event.user} · {actionLabel(event.action)}
                        </p>
                      </div>
                    </div>
                    {event.changes.length > 0 && (
                      <div className="mt-2 space-y-1 border-t border-metro-border pt-2">
                        {event.changes.map((change) => (
                          <p className="text-xs text-metro-muted" key={`${event.id}-${change.field}`}>
                            <span className="font-bold text-metro-text">{change.label}:</span>{' '}
                            {change.before} <span className="text-metro-red">→</span> {change.after}
                          </p>
                        ))}
                      </div>
                    )}
                  </article>
                ))}
              </div>
            )}
          </ModalBody>
        </ModalShell>
      )}
    </>
  );
}
