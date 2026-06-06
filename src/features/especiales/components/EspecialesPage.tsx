import { Edit2, Eye, MailPlus, Plus, Save, Trash2, UsersRound } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  buildEspecialHtml,
  buildEspecialMailDraft,
  buildEspecialSubject,
  EMPTY_ESPECIAL_EVENT_DRAFT,
  EMPTY_ESPECIAL_RECIPIENT_DRAFT,
  splitEspecialRecipients,
  visibleEspecialEvents,
  type EspecialEvent,
  type EspecialEventDraft,
  type EspecialRecipient,
  type EspecialRecipientDraft,
  type EspecialRecipientType,
} from '../domain/especiales';
import { useEspecialesStore } from '../store/useEspecialesStore';

const inputClass =
  'mt-1 w-full rounded-lg border border-metro-border bg-white px-3 py-2 text-sm normal-case text-metro-text outline-none focus:border-metro-red';
const labelClass = 'block text-xs font-semibold uppercase tracking-wide text-metro-muted';
const buttonClass =
  'inline-flex items-center justify-center gap-2 rounded-lg bg-metro-red px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-metro-dark';
const secondaryButtonClass =
  'inline-flex items-center justify-center gap-2 rounded-lg border border-metro-border bg-white px-3 py-2 text-sm font-semibold text-metro-text transition hover:border-metro-red hover:text-metro-red';

function toEventDraft(event: EspecialEvent): EspecialEventDraft {
  return {
    evento: event.evento,
    fecha: event.fecha,
    hora: event.hora,
    enlace: event.enlace,
    ruta: event.ruta,
    observaciones: event.observaciones,
  };
}

function toRecipientDraft(recipient: EspecialRecipient): EspecialRecipientDraft {
  return {
    nombre: recipient.nombre,
    email: recipient.email,
    tipo: recipient.tipo,
  };
}

function sortByText<T>(items: T[], selector: (item: T) => string): T[] {
  return [...items].sort((first, second) =>
    selector(first).localeCompare(selector(second), 'es', { numeric: true, sensitivity: 'base' }),
  );
}

export function EspecialesPage() {
  const {
    events,
    recipients,
    load,
    createEvent,
    updateEvent,
    removeEvent,
    createRecipient,
    updateRecipient,
    removeRecipient,
  } = useEspecialesStore();
  const [eventDraft, setEventDraft] = useState<EspecialEventDraft>(EMPTY_ESPECIAL_EVENT_DRAFT);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [recipientDraft, setRecipientDraft] = useState<EspecialRecipientDraft>(
    EMPTY_ESPECIAL_RECIPIENT_DRAFT,
  );
  const [editingRecipientId, setEditingRecipientId] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(true);
  const [outlookMessage, setOutlookMessage] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, [load]);

  const visibleEvents = useMemo(
    () => sortByText(visibleEspecialEvents(events), (event) => event.evento),
    [events],
  );
  const recipientGroups = useMemo(() => splitEspecialRecipients(recipients), [recipients]);
  const recipientSuggestions = useMemo(
    () =>
      sortByText(
        Array.from(
          new Set(recipients.filter((recipient) => !recipient.deletedAt).map((r) => r.email)),
        ),
        (email) => email,
      ),
    [recipients],
  );
  const previewHtml = useMemo(() => buildEspecialHtml(eventDraft), [eventDraft]);
  const subject = useMemo(() => buildEspecialSubject(eventDraft.evento), [eventDraft.evento]);

  const saveEvent = () => {
    if (!eventDraft.evento.trim()) {
      return;
    }

    if (editingEventId) {
      updateEvent(editingEventId, eventDraft);
    } else {
      const createdId = createEvent(eventDraft);
      setEditingEventId(createdId);
    }
  };

  const resetEvent = () => {
    setEventDraft(EMPTY_ESPECIAL_EVENT_DRAFT);
    setEditingEventId(null);
    setOutlookMessage(null);
  };

  const editEvent = (event: EspecialEvent) => {
    setEventDraft(toEventDraft(event));
    setEditingEventId(event.id);
    setOutlookMessage(null);
  };

  const saveRecipient = () => {
    if (!recipientDraft.email.trim()) {
      return;
    }

    if (editingRecipientId) {
      updateRecipient(editingRecipientId, recipientDraft);
    } else {
      createRecipient(recipientDraft);
    }
    setRecipientDraft(EMPTY_ESPECIAL_RECIPIENT_DRAFT);
    setEditingRecipientId(null);
  };

  const editRecipient = (recipient: EspecialRecipient) => {
    setRecipientDraft(toRecipientDraft(recipient));
    setEditingRecipientId(recipient.id);
  };

  const createOutlookDraft = async () => {
    const mailDraft = buildEspecialMailDraft(eventDraft, recipients);
    if (!mailDraft.subject || !mailDraft.html) {
      return;
    }

    if (!window.traccion?.createOutlookDraft) {
      setOutlookMessage(
        'Outlook no está disponible fuera de Electron. El preview queda operativo.',
      );
      return;
    }

    const result = await window.traccion.createOutlookDraft(mailDraft);
    setOutlookMessage(
      result.ok
        ? 'Borrador de Outlook creado.'
        : `No se pudo crear el borrador de Outlook: ${result.message}`,
    );
  };

  return (
    <section className="space-y-4" id="especiales">
      <div className="rounded-2xl border border-metro-border bg-white p-4 shadow-card">
        <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-metro-red">
              Módulo
            </p>
            <h2 className="text-2xl font-bold text-metro-text">Especiales</h2>
            <p className="mt-0.5 text-base text-metro-muted">
              Gestión de servicios especiales, destinatarios y borrador de correo Outlook.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className={buttonClass} onClick={saveEvent} type="button">
              <Save size={16} /> Guardar
            </button>
            <button
              className={secondaryButtonClass}
              onClick={() => setShowPreview((current) => !current)}
              type="button"
            >
              <Eye size={16} /> Vista previa
            </button>
            <button className={secondaryButtonClass} onClick={createOutlookDraft} type="button">
              <MailPlus size={16} /> Crear borrador Outlook
            </button>
          </div>
        </div>

        <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_430px]">
          <div className="space-y-4">
            <div className="rounded-xl border border-metro-border bg-metro-panel p-3">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-metro-text">
                  {editingEventId ? 'Editar evento especial' : 'Alta de evento especial'}
                </h3>
                <button className={secondaryButtonClass} onClick={resetEvent} type="button">
                  <Plus size={16} /> Nuevo
                </button>
              </div>
              <div className="grid gap-3 lg:grid-cols-2">
                <label className={labelClass}>
                  Evento
                  <input
                    className={inputClass}
                    onChange={(event) =>
                      setEventDraft((current) => ({ ...current, evento: event.target.value }))
                    }
                    value={eventDraft.evento}
                  />
                </label>
                <label className={labelClass}>
                  Fecha
                  <input
                    className={inputClass}
                    onChange={(event) =>
                      setEventDraft((current) => ({ ...current, fecha: event.target.value }))
                    }
                    type="date"
                    value={eventDraft.fecha}
                  />
                </label>
                <label className={labelClass}>
                  Hora
                  <input
                    className={inputClass}
                    onChange={(event) =>
                      setEventDraft((current) => ({ ...current, hora: event.target.value }))
                    }
                    type="time"
                    value={eventDraft.hora}
                  />
                </label>
                <label className={labelClass}>
                  Enlace
                  <input
                    className={inputClass}
                    onChange={(event) =>
                      setEventDraft((current) => ({ ...current, enlace: event.target.value }))
                    }
                    value={eventDraft.enlace}
                  />
                </label>
                <label className={labelClass}>
                  Ruta
                  <input
                    className={inputClass}
                    onChange={(event) =>
                      setEventDraft((current) => ({ ...current, ruta: event.target.value }))
                    }
                    value={eventDraft.ruta}
                  />
                </label>
                <label className={`${labelClass} lg:col-span-2`}>
                  Observaciones
                  <textarea
                    className={`${inputClass} min-h-20 resize-y`}
                    onChange={(event) =>
                      setEventDraft((current) => ({
                        ...current,
                        observaciones: event.target.value,
                      }))
                    }
                    value={eventDraft.observaciones}
                  />
                </label>
              </div>
              <div className="mt-3 rounded-lg border border-metro-border bg-white px-3 py-2 text-sm">
                <span className="font-semibold text-metro-muted">Asunto:</span> {subject}
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <RecipientPanel
                onEdit={editRecipient}
                onRemove={removeRecipient}
                recipients={recipientGroups.para}
                title="Destinatarios Para"
              />
              <RecipientPanel
                onEdit={editRecipient}
                onRemove={removeRecipient}
                recipients={recipientGroups.cc}
                title="Destinatarios CC"
              />
            </div>

            {showPreview && (
              <div className="rounded-xl border border-metro-border bg-white p-3">
                <h3 className="mb-2 text-sm font-bold text-metro-text">Preview HTML</h3>
                <div
                  className="rounded-lg border border-metro-border bg-white p-4 text-sm"
                  dangerouslySetInnerHTML={{ __html: previewHtml }}
                />
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="rounded-xl border border-metro-border bg-metro-panel p-3">
              <div className="mb-3 flex items-center gap-2 text-sm font-bold text-metro-text">
                <UsersRound size={16} className="text-metro-red" />
                {editingRecipientId ? 'Editar destinatario' : 'Añadir destinatario'}
              </div>
              <div className="space-y-3">
                <label className={labelClass}>
                  Nombre
                  <input
                    className={inputClass}
                    onChange={(event) =>
                      setRecipientDraft((current) => ({ ...current, nombre: event.target.value }))
                    }
                    value={recipientDraft.nombre}
                  />
                </label>
                <label className={labelClass}>
                  Email
                  <input
                    className={inputClass}
                    list="especiales-recipient-emails"
                    onChange={(event) =>
                      setRecipientDraft((current) => ({ ...current, email: event.target.value }))
                    }
                    type="email"
                    value={recipientDraft.email}
                  />
                </label>
                <datalist id="especiales-recipient-emails">
                  {recipientSuggestions.map((email) => (
                    <option key={email} value={email} />
                  ))}
                </datalist>
                <label className={labelClass}>
                  Tipo
                  <select
                    className={inputClass}
                    onChange={(event) =>
                      setRecipientDraft((current) => ({
                        ...current,
                        tipo: event.target.value as EspecialRecipientType,
                      }))
                    }
                    value={recipientDraft.tipo}
                  >
                    <option value="para">Para</option>
                    <option value="cc">CC</option>
                  </select>
                </label>
                <div className="flex flex-wrap gap-2">
                  <button className={buttonClass} onClick={saveRecipient} type="button">
                    <Save size={16} /> Guardar destinatario
                  </button>
                  <button
                    className={secondaryButtonClass}
                    onClick={() => {
                      setRecipientDraft(EMPTY_ESPECIAL_RECIPIENT_DRAFT);
                      setEditingRecipientId(null);
                    }}
                    type="button"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-metro-border bg-white p-3">
              <h3 className="mb-2 text-sm font-bold text-metro-text">Eventos guardados</h3>
              <div className="max-h-80 overflow-auto rounded-lg border border-metro-border">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-metro-slate text-white">
                    <tr>
                      <th className="px-3 py-2">Evento</th>
                      <th className="px-3 py-2">Fecha</th>
                      <th className="px-3 py-2">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-metro-border bg-white">
                    {visibleEvents.map((event) => (
                      <tr key={event.id} className="hover:bg-metro-panel">
                        <td className="px-3 py-2 font-semibold text-metro-text">{event.evento}</td>
                        <td className="px-3 py-2 text-metro-muted">{event.fecha}</td>
                        <td className="px-3 py-2">
                          <div className="flex gap-1">
                            <button
                              className="rounded-md p-1 text-metro-info hover:bg-blue-50"
                              onClick={() => editEvent(event)}
                              title="Editar"
                              type="button"
                            >
                              <Edit2 size={14} />
                            </button>
                            <button
                              className="rounded-md p-1 text-metro-red hover:bg-red-50"
                              onClick={() => removeEvent(event.id)}
                              title="Borrar"
                              type="button"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {visibleEvents.length === 0 && (
                      <tr>
                        <td className="px-3 py-6 text-center text-metro-muted" colSpan={3}>
                          Sin eventos especiales guardados.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {outlookMessage && (
              <div className="rounded-xl border border-metro-border bg-white p-3 text-sm text-metro-muted">
                {outlookMessage}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function RecipientPanel({
  title,
  recipients,
  onEdit,
  onRemove,
}: {
  title: string;
  recipients: EspecialRecipient[];
  onEdit: (recipient: EspecialRecipient) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="rounded-xl border border-metro-border bg-white p-3">
      <h3 className="mb-2 text-sm font-bold text-metro-text">{title}</h3>
      <div className="max-h-64 overflow-auto rounded-lg border border-metro-border">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 bg-metro-slate text-white">
            <tr>
              <th className="px-3 py-2">Nombre</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-metro-border bg-white">
            {recipients.map((recipient) => (
              <tr key={recipient.id} className="hover:bg-metro-panel">
                <td className="px-3 py-2 font-semibold text-metro-text">{recipient.nombre}</td>
                <td className="px-3 py-2 text-metro-muted">{recipient.email}</td>
                <td className="px-3 py-2">
                  <div className="flex gap-1">
                    <button
                      className="rounded-md p-1 text-metro-info hover:bg-blue-50"
                      onClick={() => onEdit(recipient)}
                      title="Editar"
                      type="button"
                    >
                      <Edit2 size={14} />
                    </button>
                    <button
                      className="rounded-md p-1 text-metro-red hover:bg-red-50"
                      onClick={() => onRemove(recipient.id)}
                      title="Borrar"
                      type="button"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {recipients.length === 0 && (
              <tr>
                <td className="px-3 py-6 text-center text-metro-muted" colSpan={3}>
                  Sin destinatarios.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
