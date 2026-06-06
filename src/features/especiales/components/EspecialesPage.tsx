import { MailPlus, RotateCcw, Save, Trash2, Upload } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  buildEspecialesHtmlBody,
  buildEspecialesSubject,
  buildTurnosPath,
  detectYearFromText,
  EMPTY_ESPECIAL_RECIPIENT_DRAFT,
  EMPTY_ESPECIAL_SERVICE_DRAFT,
  normalizeTimeInput,
  parseOutlookMsg,
  splitEspecialRecipients,
  type EspecialRecipient,
  type EspecialRecipientDraft,
  type EspecialRecipientType,
  type EspecialServiceDraft,
} from '../domain/especiales';
import { useEspecialesStore } from '../store/useEspecialesStore';

const inputClass =
  'mt-1 w-full rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-sm normal-case text-metro-text outline-none focus:border-metro-red';
const labelClass = 'block text-xs font-semibold uppercase tracking-wide text-metro-muted';
const buttonClass =
  'inline-flex items-center justify-center gap-2 rounded-lg bg-metro-red px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-metro-dark disabled:cursor-not-allowed disabled:bg-metro-secondary';
const secondaryButtonClass =
  'inline-flex items-center justify-center gap-2 rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-sm font-semibold text-metro-text transition hover:border-metro-red hover:text-metro-red disabled:cursor-not-allowed disabled:text-metro-secondary';

function toRecipientDraft(recipient: EspecialRecipient): EspecialRecipientDraft {
  return {
    name: recipient.name,
    email: recipient.email,
    type: recipient.type,
  };
}

function sortRecipients(items: EspecialRecipient[]): EspecialRecipient[] {
  return [...items].sort((first, second) =>
    first.name.localeCompare(second.name, 'es', { sensitivity: 'base', numeric: true }),
  );
}

type OutlookDraftApi = {
  createDraft: (payload: EspecialOutlookDraftPayload) => Promise<EspecialOutlookDraftResult>;
};

function getOutlookDraftApi(): OutlookDraftApi | null {
  if (window.traccion?.createOutlookDraft) {
    return {
      createDraft: (payload) => window.traccion!.createOutlookDraft(payload),
    };
  }

  if (window.rrllOutlook?.createDraft) {
    return {
      createDraft: (payload) =>
        window.rrllOutlook!.createDraft({
          subject: payload.subject,
          htmlBody: payload.html,
          to: payload.to.join(';'),
          cc: payload.cc.join(';'),
        }),
    };
  }

  return null;
}

export function EspecialesPage() {
  const { recipients, load, createRecipient, updateRecipient, removeRecipient } =
    useEspecialesStore();
  const [serviceDraft, setServiceDraft] = useState<EspecialServiceDraft>(
    EMPTY_ESPECIAL_SERVICE_DRAFT,
  );
  const [recipientDraft, setRecipientDraft] = useState<EspecialRecipientDraft>(
    EMPTY_ESPECIAL_RECIPIENT_DRAFT,
  );
  const [editingRecipientId, setEditingRecipientId] = useState<string | null>(null);
  const [editingRecipientType, setEditingRecipientType] = useState<EspecialRecipientType>('to');
  const [messageFile, setMessageFile] = useState<File | null>(null);
  const [msgStatus, setMsgStatus] = useState('');
  const [msgStatusIsError, setMsgStatusIsError] = useState(false);
  const [outlookStatus, setOutlookStatus] = useState('');
  const [outlookStatusTone, setOutlookStatusTone] = useState<'neutral' | 'success' | 'error'>(
    'neutral',
  );
  const [isDropActive, setIsDropActive] = useState(false);
  const [isGeneratingDraft, setIsGeneratingDraft] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    load();
  }, [load]);

  const recipientGroups = useMemo(() => splitEspecialRecipients(recipients), [recipients]);
  const generatedPreviewHtml = useMemo(() => buildEspecialesHtmlBody(serviceDraft), [serviceDraft]);
  const [editedPreviewHtml, setEditedPreviewHtml] = useState(generatedPreviewHtml);
  const [hasEditedPreview, setHasEditedPreview] = useState(false);

  useEffect(() => {
    if (hasEditedPreview) {
      return;
    }

    setEditedPreviewHtml(generatedPreviewHtml);
    if (previewRef.current && previewRef.current.innerHTML !== generatedPreviewHtml) {
      previewRef.current.innerHTML = generatedPreviewHtml;
    }
  }, [generatedPreviewHtml, hasEditedPreview]);
  const previewHtml = hasEditedPreview ? editedPreviewHtml : generatedPreviewHtml;
  const subject = useMemo(() => buildEspecialesSubject(serviceDraft), [serviceDraft]);
  const draftUnavailableReason = useMemo(() => {
    if (!recipientGroups.to.length) {
      return 'falta al menos un destinatario válido en Para';
    }
    if (!serviceDraft.evento.trim()) {
      return 'falta evento';
    }
    if (!getOutlookDraftApi()) {
      return 'falta API Outlook';
    }
    return '';
  }, [recipientGroups.to.length, serviceDraft.evento]);

  const setField = (field: keyof EspecialServiceDraft, value: string) => {
    setServiceDraft((current) => ({ ...current, [field]: value }));
  };

  const resetPreview = () => {
    setHasEditedPreview(false);
    setEditedPreviewHtml(generatedPreviewHtml);
    if (previewRef.current) {
      previewRef.current.innerHTML = generatedPreviewHtml;
    }
  };

  const updatePreviewHtml = () => {
    const html = previewRef.current?.innerHTML ?? '';
    setHasEditedPreview(true);
    setEditedPreviewHtml(html);
  };

  const resetForm = () => {
    setServiceDraft(EMPTY_ESPECIAL_SERVICE_DRAFT);
    setMessageFile(null);
    setMsgStatus('');
    setMsgStatusIsError(false);
    setOutlookStatus('');
    setOutlookStatusTone('neutral');
    setHasEditedPreview(false);
  };

  const saveRecipient = (type?: EspecialRecipientType) => {
    const draft = {
      ...recipientDraft,
      type: editingRecipientId ? editingRecipientType : (type ?? recipientDraft.type),
    };
    const result = editingRecipientId
      ? updateRecipient(editingRecipientId, draft)
      : createRecipient(draft);

    if (!result.ok) {
      setOutlookStatus(result.message ?? 'No se ha podido guardar el destinatario.');
      setOutlookStatusTone('error');
      return;
    }

    setRecipientDraft(EMPTY_ESPECIAL_RECIPIENT_DRAFT);
    setEditingRecipientId(null);
    setEditingRecipientType('to');
    setOutlookStatus('');
    setOutlookStatusTone('neutral');
  };

  const editRecipient = (recipient: EspecialRecipient) => {
    setRecipientDraft(toRecipientDraft(recipient));
    setEditingRecipientId(recipient.id);
    setEditingRecipientType(recipient.type);
  };

  const deleteRecipient = (recipientId: string) => {
    removeRecipient(recipientId);
    if (editingRecipientId === recipientId) {
      setRecipientDraft(EMPTY_ESPECIAL_RECIPIENT_DRAFT);
      setEditingRecipientId(null);
      setEditingRecipientType('to');
    }
  };

  const importMessage = async (file = messageFile) => {
    if (!file) {
      setMsgStatus('Selecciona o arrastra primero un archivo .msg.');
      setMsgStatusIsError(true);
      return;
    }

    const parsed = await parseOutlookMsg(file);
    if (!parsed.ok || !parsed.data) {
      setMsgStatus(parsed.message || 'No se ha podido interpretar el mensaje.');
      setMsgStatusIsError(true);
      return;
    }

    const data = parsed.data;
    const year = detectYearFromText(`${data.subject} ${data.fecha}`);
    setHasEditedPreview(false);
    setServiceDraft((current) => ({
      ...current,
      evento: data.evento || data.subject || current.evento,
      fecha: data.fecha || current.fecha,
      hora: normalizeTimeInput(data.hora) || current.hora,
      enlace: data.intranetParagraph || data.intranetName || data.enlace || current.enlace,
      ruta: data.ruta || buildTurnosPath(year) || current.ruta,
      msgSubject: data.subject || current.msgSubject,
    }));

    if (parsed.hasMainData) {
      setMsgStatus('Mensaje importado correctamente');
      setMsgStatusIsError(false);
    } else if (parsed.partial) {
      setMsgStatus(
        'Mensaje importado parcialmente. Revisa los campos antes de generar el borrador.',
      );
      setMsgStatusIsError(true);
    } else {
      setMsgStatus('No se ha podido interpretar el mensaje.');
      setMsgStatusIsError(true);
    }
  };

  const handleSelectedFile = (file: File | null) => {
    setMessageFile(file);
    if (!file) {
      setMsgStatus('');
      setMsgStatusIsError(false);
      return;
    }

    setMsgStatus(`Archivo listo: ${file.name}`);
    setMsgStatusIsError(false);
    void importMessage(file);
  };

  const createOutlookDraft = async () => {
    if (draftUnavailableReason) {
      setOutlookStatus(`No se puede generar el borrador: ${draftUnavailableReason}.`);
      setOutlookStatusTone('error');
      return;
    }

    setIsGeneratingDraft(true);
    setOutlookStatus('Preparando borrador...');
    setOutlookStatusTone('neutral');

    try {
      const currentPreviewHtml = previewRef.current?.innerHTML || previewHtml;
      const payload = {
        subject,
        html: currentPreviewHtml,
        to: recipientGroups.to.map((recipient) => recipient.email),
        cc: recipientGroups.cc.map((recipient) => recipient.email),
      };
      setOutlookStatus('Llamando a Outlook...');
      const outlookApi = getOutlookDraftApi();
      if (!outlookApi) {
        throw new Error(
          'API Outlook no disponible. Abre TrAccion desde Electron, no desde el navegador.',
        );
      }
      const result = await outlookApi.createDraft(payload);
      if (!result?.ok) {
        throw new Error(result?.message || 'Outlook no disponible');
      }
      setOutlookStatus('Borrador abierto en Outlook');
      setOutlookStatusTone('success');
    } catch (error) {
      setOutlookStatus(
        `Error al abrir Outlook: ${error instanceof Error ? error.message : 'error desconocido'}`,
      );
      setOutlookStatusTone('error');
    } finally {
      setIsGeneratingDraft(false);
    }
  };

  return (
    <section className="space-y-4" id="especiales">
      <div className="rounded-2xl border border-metro-border bg-metro-surface p-4 shadow-card">
        <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-metro-red">
              Especiales
            </p>
            <h2 className="text-2xl font-bold text-metro-text">Especiales</h2>
            <p className="mt-0.5 text-base text-metro-muted">
              Generación asistida de comunicaciones Outlook para servicios especiales.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className={buttonClass}
              disabled={Boolean(draftUnavailableReason) || isGeneratingDraft}
              onClick={() => void createOutlookDraft()}
              type="button"
            >
              <MailPlus size={16} />
              {isGeneratingDraft
                ? 'Generando borrador en Outlook...'
                : 'Generar borrador en Outlook'}
            </button>
            <button className={secondaryButtonClass} onClick={resetForm} type="button">
              <RotateCcw size={16} /> Limpiar formulario
            </button>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(340px,420px)]">
          <div className="space-y-4">
            <div
              className={`flex min-h-[120px] flex-col items-center justify-center rounded-2xl border-2 border-dashed p-4 text-center text-sm font-semibold transition ${
                isDropActive
                  ? 'border-metro-red bg-metro-red/10'
                  : 'border-metro-border bg-metro-panel'
              }`}
              onDragEnter={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setIsDropActive(true);
              }}
              onDragLeave={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setIsDropActive(false);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              onDrop={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setIsDropActive(false);
                const files = Array.from(event.dataTransfer.files || []);
                const file = files.find((item) => /\.msg$/i.test(item.name));
                if (!file) {
                  setMsgStatus(
                    'Si el arrastre directo desde Outlook no funciona, guarda primero el correo como archivo .msg.',
                  );
                  setMsgStatusIsError(true);
                  return;
                }
                handleSelectedFile(file);
              }}
            >
              Arrastra aquí el correo .msg del servicio especial o selecciónalo manualmente.
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                <button
                  className={secondaryButtonClass}
                  onClick={() => fileInputRef.current?.click()}
                  type="button"
                >
                  <Upload size={16} /> Seleccionar mensaje
                </button>
                <button className={buttonClass} onClick={() => void importMessage()} type="button">
                  Importar mensaje
                </button>
              </div>
              <input
                ref={fileInputRef}
                accept=".msg"
                className="hidden"
                onChange={(event) => handleSelectedFile(event.target.files?.[0] ?? null)}
                type="file"
              />
            </div>
            {msgStatus && (
              <p
                className={`text-xs font-semibold ${msgStatusIsError ? 'text-metro-red' : 'text-metro-muted'}`}
              >
                {msgStatus}
              </p>
            )}

            <div className="grid gap-3 lg:grid-cols-3">
              <label className={labelClass}>
                Evento
                <input
                  className={inputClass}
                  onChange={(event) => setField('evento', event.target.value)}
                  placeholder="Nombre del evento"
                  value={serviceDraft.evento}
                />
              </label>
              <label className={labelClass}>
                Fecha
                <input
                  className={inputClass}
                  onChange={(event) => setField('fecha', event.target.value)}
                  placeholder="DD/MM/AAAA"
                  type="date"
                  value={serviceDraft.fecha}
                />
              </label>
              <label className={labelClass}>
                Hora
                <input
                  className={inputClass}
                  onChange={(event) => setField('hora', event.target.value)}
                  placeholder="HH:mm"
                  type="time"
                  value={serviceDraft.hora}
                />
              </label>
              <label className={`${labelClass} lg:col-span-3`}>
                Texto Intranet del Servicio Especial
                <input
                  className={inputClass}
                  onChange={(event) =>
                    setServiceDraft((current) => ({
                      ...current,
                      enlace: event.target.value,
                    }))
                  }
                  placeholder="Ej.: BEC Alejandro Sanz Obra Lutxana Vía 2 Domingo"
                  value={serviceDraft.enlace}
                />
              </label>
              <label className={`${labelClass} lg:col-span-3`}>
                Ruta común / ubicación de turnos
                <input
                  className={inputClass}
                  onChange={(event) => setField('ruta', event.target.value)}
                  placeholder="\\servidor\carpeta\..."
                  value={serviceDraft.ruta}
                />
              </label>
              <label className={`${labelClass} lg:col-span-3`}>
                Observaciones internas (opcional)
                <textarea
                  className={inputClass}
                  onChange={(event) => setField('observaciones', event.target.value)}
                  placeholder="Solo para uso interno"
                  rows={2}
                  value={serviceDraft.observaciones}
                />
              </label>
            </div>

            <div className="rounded-2xl border border-metro-border bg-metro-panel p-4">
              <div className="mb-3 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h3 className="text-base font-bold text-metro-text">Preview del correo</h3>
                  <p className="text-xs font-semibold text-metro-muted">Asunto: {subject}</p>
                </div>
                <button
                  className={secondaryButtonClass}
                  disabled={!hasEditedPreview}
                  onClick={resetPreview}
                  type="button"
                >
                  Regenerar preview
                </button>
              </div>
              <div
                ref={previewRef}
                aria-label="Editor del cuerpo del correo"
                className="min-h-[220px] rounded-xl border border-metro-border bg-metro-surface p-4 text-sm leading-relaxed text-metro-text outline-none focus:border-metro-red [&_p]:mb-3 [&_p]:leading-relaxed [&_strong]:font-bold"
                contentEditable
                onInput={updatePreviewHtml}
                role="textbox"
                suppressContentEditableWarning
                style={{ whiteSpace: 'pre-wrap' }}
                dangerouslySetInnerHTML={{ __html: previewHtml }}
              />
            </div>
          </div>

          <aside className="space-y-4">
            {draftUnavailableReason && (
              <p className="rounded-xl border border-metro-warning/30 bg-metro-warning/10 px-3 py-2 text-xs font-semibold text-amber-200">
                No disponible: {draftUnavailableReason}.
              </p>
            )}

            <RecipientTable
              items={sortRecipients(recipientGroups.to)}
              onDelete={deleteRecipient}
              onEdit={editRecipient}
              title="Para"
            />
            <RecipientTable
              items={sortRecipients(recipientGroups.cc)}
              onDelete={deleteRecipient}
              onEdit={editRecipient}
              title="Con copia (CC)"
            />

            <div className="rounded-2xl border border-metro-border bg-metro-panel p-4">
              <h3 className="text-base font-bold text-metro-text">Destinatario</h3>
              <div className="mt-3 space-y-3">
                <label className={labelClass}>
                  Nombre
                  <input
                    className={inputClass}
                    onChange={(event) =>
                      setRecipientDraft((current) => ({ ...current, name: event.target.value }))
                    }
                    value={recipientDraft.name}
                  />
                </label>
                <label className={labelClass}>
                  Email
                  <input
                    className={inputClass}
                    onChange={(event) =>
                      setRecipientDraft((current) => ({ ...current, email: event.target.value }))
                    }
                    type="email"
                    value={recipientDraft.email}
                  />
                </label>
                <div className="flex flex-wrap gap-2">
                  <button className={buttonClass} onClick={() => saveRecipient('to')} type="button">
                    <Save size={16} />
                    {editingRecipientId ? 'Guardar cambios' : 'Añadir a Para'}
                  </button>
                  {!editingRecipientId && (
                    <button
                      className={secondaryButtonClass}
                      onClick={() => saveRecipient('cc')}
                      type="button"
                    >
                      Añadir a CC
                    </button>
                  )}
                  <button
                    className={secondaryButtonClass}
                    onClick={() => {
                      setRecipientDraft(EMPTY_ESPECIAL_RECIPIENT_DRAFT);
                      setEditingRecipientId(null);
                      setEditingRecipientType('to');
                    }}
                    type="button"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            </div>

            {outlookStatus && (
              <p
                className={`rounded-xl px-3 py-2 text-xs font-semibold ${
                  outlookStatusTone === 'success'
                    ? 'bg-green-50 text-metro-success'
                    : outlookStatusTone === 'error'
                      ? 'bg-metro-red/10 text-metro-red'
                      : 'bg-metro-panel text-metro-muted'
                }`}
              >
                {outlookStatus}
              </p>
            )}
          </aside>
        </div>
      </div>
    </section>
  );
}

function RecipientTable({
  items,
  title,
  onEdit,
  onDelete,
}: {
  items: EspecialRecipient[];
  title: string;
  onEdit: (recipient: EspecialRecipient) => void;
  onDelete: (recipientId: string) => void;
}) {
  return (
    <div className="rounded-2xl border border-metro-border bg-metro-panel p-4">
      <h3 className="mb-3 text-base font-bold text-metro-text">
        {title} ({items.length})
      </h3>
      <div className="overflow-hidden rounded-xl border border-metro-border bg-metro-surface">
        <table className="w-full text-left text-xs">
          <thead className="bg-metro-panel text-metro-muted">
            <tr>
              <th className="px-3 py-2 font-semibold">Nombre</th>
              <th className="px-3 py-2 font-semibold">Email</th>
              <th className="px-3 py-2 text-right font-semibold">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {items.length ? (
              items.map((item) => (
                <tr key={item.id} className="border-t border-metro-border">
                  <td className="px-3 py-2 text-metro-text">{item.name}</td>
                  <td className="px-3 py-2 text-metro-muted">{item.email}</td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1">
                      <button
                        className="rounded-lg border border-metro-border bg-metro-surface p-1.5 text-metro-muted hover:border-metro-red hover:text-metro-red"
                        onClick={() => onEdit(item)}
                        title="Editar"
                        type="button"
                      >
                        <Save size={14} />
                      </button>
                      <button
                        className="rounded-lg border border-metro-border bg-metro-surface p-1.5 text-metro-muted hover:border-metro-red hover:text-metro-red"
                        onClick={() => onDelete(item.id)}
                        title="Eliminar"
                        type="button"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td className="px-3 py-3 text-metro-muted" colSpan={3}>
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
