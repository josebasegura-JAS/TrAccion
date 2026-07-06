import { MailPlus, RotateCcw, Save, Upload } from 'lucide-react';
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
import type { ExportColumn } from '../../../shared/export/types';
import { ExportPrintButtons } from '../../../shared/print/ExportPrintButtons';
import { withSharedModuleLocks } from '../../../services/sharedModuleLock';
import type { ModuleHelpSection } from '../../../components/ModuleHelp';
import { ActionButton } from '../../../components/ui/ActionButton';
import { FieldLabel, Input, Textarea } from '../../../components/ui/Field';
import { PageHeader } from '../../../components/ui/PageHeader';

const ESPECIALES_HELP_SECTIONS: ModuleHelpSection[] = [
  {
    title: 'Para qué sirve',
    body: 'Genera el correo Outlook con el que se avisa de que los turnos de conducción de un Servicio Especial ya están publicados en la intranet, con un cuerpo de mensaje fijo (evento, ruta a los turnos en Excel y enlace/nombre en intranet) y gestión de destinatarios Para/CC.',
  },
  {
    title: 'Datos del servicio',
    items: [
      'Evento, fecha y hora identifican el servicio especial; la fecha se usa además para calcular el año que se muestra en el correo y en la ruta de turnos.',
      'Si no se indica una ruta a mano, se propone automáticamente "G:\\DC\\PAS_TURNOS_RRLL\\<año>\\TURNOS" con el año detectado de la fecha o, si falta, del propio texto del evento.',
      'El campo "aparecerá en la Intranet como" añade un párrafo aclaratorio en el correo con el nombre exacto que tiene el evento en la intranet.',
    ],
  },
  {
    title: 'Importar un .msg para rellenar automáticamente',
    items: [
      'Se puede arrastrar o seleccionar un correo .msg de Outlook para detectar automáticamente evento, fecha, hora, una ruta de red (si aparece en el texto) y el nombre del evento en la intranet.',
      'Es una ayuda para rellenar más rápido: conviene revisar los campos detectados antes de generar el correo, porque la detección es por patrones de texto y puede no acertar siempre.',
    ],
  },
  {
    title: 'Destinatarios y borrador',
    items: [
      'Los destinatarios se guardan como libreta reutilizable, cada uno marcado como "Para" o "CC".',
      'Antes de abrir Outlook se puede previsualizar el cuerpo HTML del correo tal y como se enviará.',
      '"Limpiar formulario" vacía los datos del servicio introducidos, sin tocar la libreta de destinatarios guardada.',
    ],
  },
  {
    title: 'Uso recomendado',
    items: [
      'Completa primero datos del servicio y destinatarios antes de generar el borrador Outlook.',
      'Revisa la previsualización HTML para detectar errores de formato o información incompleta.',
      'Si importas un .msg, revisa los campos detectados antes de dar por buena la información.',
    ],
  },
];

const recipientExportColumns: ExportColumn<EspecialRecipient>[] = [
  { key: 'name', header: 'Nombre', value: (recipient) => recipient.name },
  { key: 'email', header: 'Email', value: (recipient) => recipient.email },
  { key: 'type', header: 'Tipo', value: (recipient) => (recipient.type === 'to' ? 'Para' : 'CC') },
];

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
  if (typeof window === 'undefined') {
    return null;
  }

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
  const {
    recipients,
    load,
    createRecipientWithConcurrencyCheck,
    updateRecipientWithConcurrencyCheck,
    removeRecipientWithConcurrencyCheck,
  } = useEspecialesStore();
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
  const [hasOutlookApi, setHasOutlookApi] = useState(() => Boolean(getOutlookDraftApi()));
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const refreshOutlookApiStatus = () => {
      setHasOutlookApi(Boolean(getOutlookDraftApi()));
    };

    refreshOutlookApiStatus();
    const retryTimers = [100, 500, 1500].map((delay) =>
      window.setTimeout(refreshOutlookApiStatus, delay),
    );

    return () => {
      retryTimers.forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

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
    if (!hasOutlookApi) {
      return 'falta API Outlook';
    }
    return '';
  }, [hasOutlookApi, recipientGroups.to.length, serviceDraft.evento]);

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
    const expectedUpdatedAt = editingRecipientId
      ? recipients.find((recipient) => recipient.id === editingRecipientId)?.updatedAt ?? null
      : null;

    void (async () => {
      try {
        const result = await withSharedModuleLocks(
          [{ module: 'especiales', label: 'Especiales' }],
          () =>
            editingRecipientId
              ? updateRecipientWithConcurrencyCheck(editingRecipientId, draft, expectedUpdatedAt)
              : createRecipientWithConcurrencyCheck(draft),
        );

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
      } catch (error) {
        setOutlookStatus(error instanceof Error ? error.message : 'No se ha podido guardar el destinatario.');
        setOutlookStatusTone('error');
      }
    })();
  };

  const editRecipient = (recipient: EspecialRecipient) => {
    setRecipientDraft(toRecipientDraft(recipient));
    setEditingRecipientId(recipient.id);
    setEditingRecipientType(recipient.type);
  };

  const deleteRecipient = (recipientId: string) => {
    const expectedUpdatedAt = recipients.find((recipient) => recipient.id === recipientId)?.updatedAt ?? null;
    void (async () => {
      try {
        const result = await withSharedModuleLocks(
          [{ module: 'especiales', label: 'Especiales' }],
          () => removeRecipientWithConcurrencyCheck(recipientId, expectedUpdatedAt),
        );
        if (!result.ok) {
          setOutlookStatus(result.message);
          setOutlookStatusTone('error');
          return;
        }
        if (editingRecipientId === recipientId) {
          setRecipientDraft(EMPTY_ESPECIAL_RECIPIENT_DRAFT);
          setEditingRecipientId(null);
          setEditingRecipientType('to');
        }
      } catch (error) {
        setOutlookStatus(error instanceof Error ? error.message : 'No se ha podido eliminar el destinatario.');
        setOutlookStatusTone('error');
      }
    })();
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
        <PageHeader
          title="Especiales"
          subtitle="Generación asistida de comunicaciones Outlook para servicios especiales."
          helpSections={ESPECIALES_HELP_SECTIONS}
          helpSubtitle="Guía rápida de comunicaciones Outlook, destinatarios, plantilla HTML y mensajes .msg."
          actions={
            <>
              <ActionButton
                variant="save"
                iconOnly={false}
                disabled={Boolean(draftUnavailableReason) || isGeneratingDraft}
                onClick={() => void createOutlookDraft()}
              >
                <MailPlus size={16} />
                {isGeneratingDraft ? 'Generando borrador en Outlook...' : 'Generar borrador en Outlook'}
              </ActionButton>
              <ActionButton variant="secondary" iconOnly={false} onClick={resetForm}>
                <RotateCcw size={16} /> Limpiar formulario
              </ActionButton>
            </>
          }
        />

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
                <ActionButton
                  variant="secondary"
                  iconOnly={false}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload size={16} /> Seleccionar mensaje
                </ActionButton>
                <ActionButton variant="save" iconOnly={false} onClick={() => void importMessage()}>
                  Importar mensaje
                </ActionButton>
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
              <FieldLabel>
                Evento
                <Input
                  onChange={(event) => setField('evento', event.target.value)}
                  placeholder="Nombre del evento"
                  value={serviceDraft.evento}
                />
              </FieldLabel>
              <FieldLabel>
                Fecha
                <Input
                  onChange={(event) => setField('fecha', event.target.value)}
                  placeholder="DD/MM/AAAA"
                  type="date"
                  value={serviceDraft.fecha}
                />
              </FieldLabel>
              <FieldLabel>
                Hora
                <Input
                  onChange={(event) => setField('hora', event.target.value)}
                  placeholder="HH:mm"
                  type="time"
                  value={serviceDraft.hora}
                />
              </FieldLabel>
              <FieldLabel className="lg:col-span-3">
                Texto Intranet del Servicio Especial
                <Input
                  onChange={(event) =>
                    setServiceDraft((current) => ({
                      ...current,
                      enlace: event.target.value,
                    }))
                  }
                  placeholder="Ej.: BEC Alejandro Sanz Obra Lutxana Vía 2 Domingo"
                  value={serviceDraft.enlace}
                />
              </FieldLabel>
              <FieldLabel className="lg:col-span-3">
                Ruta común / ubicación de turnos
                <Input
                  onChange={(event) => setField('ruta', event.target.value)}
                  placeholder="\\servidor\carpeta\..."
                  value={serviceDraft.ruta}
                />
              </FieldLabel>
              <FieldLabel className="lg:col-span-3">
                Observaciones internas (opcional)
                <Textarea
                  onChange={(event) => setField('observaciones', event.target.value)}
                  placeholder="Solo para uso interno"
                  rows={2}
                  value={serviceDraft.observaciones}
                />
              </FieldLabel>
            </div>

            <div className="rounded-2xl border border-metro-border bg-metro-panel p-4">
              <div className="mb-3 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h3 className="text-base font-bold text-metro-text">Preview del correo</h3>
                  <p className="text-xs font-semibold text-metro-muted">Asunto: {subject}</p>
                </div>
                <ActionButton
                  variant="secondary"
                  iconOnly={false}
                  disabled={!hasEditedPreview}
                  onClick={resetPreview}
                >
                  Regenerar preview
                </ActionButton>
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
                <FieldLabel>
                  Nombre
                  <Input
                    onChange={(event) =>
                      setRecipientDraft((current) => ({ ...current, name: event.target.value }))
                    }
                    value={recipientDraft.name}
                  />
                </FieldLabel>
                <FieldLabel>
                  Email
                  <Input
                    onChange={(event) =>
                      setRecipientDraft((current) => ({ ...current, email: event.target.value }))
                    }
                    type="email"
                    value={recipientDraft.email}
                  />
                </FieldLabel>
                <div className="flex flex-wrap gap-2">
                  <ActionButton variant="save" iconOnly={false} onClick={() => saveRecipient('to')}>
                    <Save size={16} />
                    {editingRecipientId ? 'Guardar cambios' : 'Añadir a Para'}
                  </ActionButton>
                  {!editingRecipientId && (
                    <ActionButton
                      variant="secondary"
                      iconOnly={false}
                      onClick={() => saveRecipient('cc')}
                    >
                      Añadir a CC
                    </ActionButton>
                  )}
                  <ActionButton
                    variant="secondary"
                    iconOnly={false}
                    onClick={() => {
                      setRecipientDraft(EMPTY_ESPECIAL_RECIPIENT_DRAFT);
                      setEditingRecipientId(null);
                      setEditingRecipientType('to');
                    }}
                  >
                    Cancelar
                  </ActionButton>
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
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-bold text-metro-text">
          {title} ({items.length})
        </h3>
        <ExportPrintButtons
          payload={{
            title: `Especiales - ${title}`,
            filename: `especiales-${title}`,
            columns: recipientExportColumns,
            rows: items,
            filterLabel: `Tipo: ${title}`,
          }}
        />
      </div>
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
                      <ActionButton size="sm" variant="edit" onClick={() => onEdit(item)} />
                      <ActionButton size="sm" variant="delete" onClick={() => onDelete(item.id)} />
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
