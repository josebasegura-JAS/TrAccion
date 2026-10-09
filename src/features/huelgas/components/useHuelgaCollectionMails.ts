import { useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import type { useAppDialog } from '../../../hooks/useAppDialog';
import { writeJsonStorageAsync } from '../../../services/persistence';
import type { HuelgaCollectionGroup } from './huelgasCollectionExport';
import { embeddedTemplateForDate, EMBEDDED_HUELGA_TEMPLATES } from './huelgasEmbeddedTemplates';
import { renderHuelgaMailTemplate } from './huelgasMailTemplates';
import type { HuelgaZona } from './huelgasZones';
import { STORAGE_KEY, type Huelga } from './huelgasPageModel';

type AlertFn = ReturnType<typeof useAppDialog>['alert'];
type ConfirmFn = ReturnType<typeof useAppDialog>['confirm'];

type UseHuelgaCollectionMailsParams = {
  alert: AlertFn;
  confirm: ConfirmFn;
  huelgas: Huelga[];
  setHuelgas: Dispatch<SetStateAction<Huelga[]>>;
  zoneDraft: HuelgaZona[];
  zonas: HuelgaZona[];
};

function normalizeKey(value: string): string {
  return value
    .replace(/\u00a0/g, ' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-ES')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitRecipients(value: string): string[] {
  return value
    .split(/[;,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function fileDate(fecha: string): string {
  const [year, month, day] = fecha.split('-');
  return `${day}-${month}-${year}`;
}

function renderTemplateFileName(pattern: string, fecha: string): string {
  return pattern.split('{{FECHA_HUELGA_ARCHIVO}}').join(fileDate(fecha));
}

function outlookDraftApi() {
  if (window.traccion?.createOutlookDraft) return window.traccion.createOutlookDraft;
  if (window.rrllOutlook?.createDraft) return window.rrllOutlook.createDraft;
  return null;
}

export function useHuelgaCollectionMails({
  alert,
  confirm,
  huelgas,
  setHuelgas,
  zoneDraft,
  zonas,
}: UseHuelgaCollectionMailsParams) {
  const [generatingCollectionForId, setGeneratingCollectionForId] = useState<string | null>(null);
  const [mailTargetId, setMailTargetId] = useState<string | null>(null);
  const [mailSpecificNotes, setMailSpecificNotes] = useState<Record<string, string>>({});
  const [mailPreviewZoneId, setMailPreviewZoneId] = useState<string | null>(null);
  const [mailTemplateZoneId, setMailTemplateZoneId] = useState<string | null>(null);

  const mailTarget = mailTargetId ? huelgas.find((item) => item.id === mailTargetId) ?? null : null;

  const mailGroups = useMemo<HuelgaCollectionGroup[]>(() => {
    if (!mailTarget) return [];
    const selectedIds = mailTarget.circuitosZonaIds?.length
      ? new Set(mailTarget.circuitosZonaIds)
      : new Set(zonas.filter((zona) => zona.active && zona.correoActivo).map((zona) => zona.id));

    return zonas
      .filter((zona) => selectedIds.has(zona.id) && zona.active && zona.correoActivo)
      .map((zona) => ({
        zonaId: zona.id,
        zonaNombre: zona.nombre,
        responsableNombre: zona.responsableNombre,
        responsableEmail: zona.responsableEmail,
        asignaciones: [],
        personal: [],
      }));
  }, [mailTarget, zonas]);

  const mailPreviewGroup = mailPreviewZoneId
    ? mailGroups.find((group) => group.zonaId === mailPreviewZoneId) ?? null
    : null;
  const mailTemplateZone = mailTemplateZoneId
    ? zoneDraft.find((zona) => zona.id === mailTemplateZoneId) ?? null
    : null;

  const openCollectionMails = async (huelga: Huelga) => {
    const selectedIds = huelga.circuitosZonaIds?.length
      ? huelga.circuitosZonaIds
      : zonas.filter((zona) => zona.active && zona.correoActivo).map((zona) => zona.id);
    const selected = zonas.filter((zona) => selectedIds.includes(zona.id) && zona.active && zona.correoActivo);
    const incomplete = selected.filter((zona) => !zona.responsableEmail.trim() || !EMBEDDED_HUELGA_TEMPLATES[normalizeKey(zona.nombre)]);

    if (selected.length === 0) {
      await alert('Esta huelga no tiene ningún circuito de recogida activo.', {
        title: 'Sin circuitos',
        type: 'warning',
      });
      return;
    }
    if (incomplete.length > 0) {
      await alert(
        `Revisa la configuración de: ${incomplete.map((zona) => zona.nombre).join(', ')}. Falta destinatario o plantilla Excel.`,
        { title: 'Configuración incompleta', type: 'warning' },
      );
      return;
    }

    setMailSpecificNotes(huelga.instruccionesCorreoPorZona ?? {});
    setMailPreviewZoneId(selected[0]?.id ?? null);
    setMailTargetId(huelga.id);
  };

  const closeCollectionMails = () => {
    if (generatingCollectionForId) return;
    setMailTargetId(null);
    setMailPreviewZoneId(null);
    setMailSpecificNotes({});
  };

  const persistHuelga = async (updated: Huelga): Promise<boolean> => {
    const next = huelgas.map((item) => (item.id === updated.id ? updated : item));
    const result = await writeJsonStorageAsync(STORAGE_KEY, next);
    if (!result.ok) {
      await alert(result.message || 'No se han podido guardar los cambios de la huelga.', {
        title: 'Error de guardado',
        type: 'error',
      });
      return false;
    }
    setHuelgas(next);
    return true;
  };

  const saveMailSpecificNotes = async () => {
    if (!mailTarget) return false;
    const cleaned = Object.fromEntries(
      Object.entries(mailSpecificNotes)
        .map(([key, value]) => [key, String(value).trim()])
        .filter(([, value]) => Boolean(value)),
    );
    return persistHuelga({
      ...mailTarget,
      instruccionesCorreoPorZona: cleaned,
      updatedAt: new Date().toISOString(),
    });
  };

  const renderGroupMail = (group: HuelgaCollectionGroup) => {
    if (!mailTarget) return null;
    const zona = zonas.find((item) => item.id === group.zonaId);
    if (!zona) return null;
    return renderHuelgaMailTemplate({
      fecha: mailTarget.fecha,
      zona,
      personal: [],
      asignaciones: [],
      instruccionesEspecificas: mailSpecificNotes[group.zonaId] ?? '',
      tipo: mailTarget.tipo,
      tramos: mailTarget.tramos,
    });
  };

  const createCollectionMail = async (group: HuelgaCollectionGroup): Promise<string | null> => {
    try {
      if (!mailTarget) return 'No se encuentra la convocatoria.';
      const api = outlookDraftApi();
      if (!api) return 'La generación de borradores de Outlook solo está disponible en la aplicación de escritorio.';
      const zona = zonas.find((item) => item.id === group.zonaId);
      if (!zona) return 'No se encuentra el circuito configurado.';
      const to = splitRecipients(zona.responsableEmail);
      if (to.length === 0) return 'El circuito no tiene destinatarios configurados.';
      const template = EMBEDDED_HUELGA_TEMPLATES[normalizeKey(zona.nombre)];
      if (!template) return 'No se encuentra la plantilla Excel incorporada para este circuito.';
      const rendered = renderGroupMail(group);
      if (!rendered) return 'No se ha podido renderizar la plantilla de correo.';

      const fileName = renderTemplateFileName(
        zona.plantillaExcelNombrePatron || template.fileNamePattern,
        mailTarget.fecha,
      );
      const buffer = await embeddedTemplateForDate(template, mailTarget.fecha);
      if (buffer.byteLength === 0) return `La plantilla Excel de ${group.zonaNombre} se ha generado vacía.`;

      const result = await api({
        subject: rendered.subject,
        html: rendered.html,
        to,
        cc: splitRecipients(zona.correoCc),
        bcc: [],
        attachments: [{ fileName, buffer }],
      });
      if (!result?.ok) return result?.message || 'Outlook no ha confirmado la apertura del borrador.';
      return null;
    } catch (error) {
      return error instanceof Error
        ? `Error al preparar el correo: ${error.message}`
        : 'Error desconocido al generar el Excel o abrir Outlook.';
    }
  };

  const markPrepared = async (zoneIds: string[]) => {
    if (!mailTarget || zoneIds.length === 0) return;
    const now = new Date().toISOString();
    const prepared = { ...(mailTarget.correosPreparadosPorZona ?? {}) };
    const cleanedNotes = Object.fromEntries(
      Object.entries(mailSpecificNotes)
        .map(([key, value]) => [key, String(value).trim()])
        .filter(([, value]) => Boolean(value)),
    );
    zoneIds.forEach((zoneId) => { prepared[zoneId] = now; });
    await persistHuelga({
      ...mailTarget,
      instruccionesCorreoPorZona: cleanedNotes,
      correosPreparadosPorZona: prepared,
      updatedAt: now,
    });
  };

  const generateSingleCollectionMail = async (group: HuelgaCollectionGroup) => {
    if (!mailTarget) return;
    setGeneratingCollectionForId(mailTarget.id);
    try {
      const notesSaved = await saveMailSpecificNotes();
      if (!notesSaved) return;
      const error = await createCollectionMail(group);
      if (error) {
        await alert(error, { title: `No se ha creado el correo de ${group.zonaNombre}`, type: 'warning' });
        return;
      }
      await markPrepared([group.zonaId]);
      await alert(`Borrador de Outlook abierto para ${group.zonaNombre} con su Excel adjunto.`, {
        title: 'Correo preparado',
        type: 'info',
      });
    } finally {
      setGeneratingCollectionForId(null);
    }
  };

  const generateAllCollectionMails = async () => {
    if (!mailTarget || mailGroups.length === 0) return;
    const accepted = await confirm(
      `Se crearán ${mailGroups.length} borrador${mailGroups.length === 1 ? '' : 'es'} de Outlook, uno por circuito, cada uno con su plantilla Excel real adjunta. ¿Continuar?`,
      { title: 'Preparar comunicaciones', confirmLabel: 'Preparar correos', cancelLabel: 'Cancelar' },
    );
    if (!accepted) return;

    const notesSaved = await saveMailSpecificNotes();
    if (!notesSaved) return;
    setGeneratingCollectionForId(mailTarget.id);
    let created = 0;
    const createdZoneIds: string[] = [];
    const failures: string[] = [];
    try {
      for (const group of mailGroups) {
        const error = await createCollectionMail(group);
        if (error) failures.push(`${group.zonaNombre}: ${error}`);
        else {
          created += 1;
          createdZoneIds.push(group.zonaId);
        }
      }
      await markPrepared(createdZoneIds);
    } finally {
      setGeneratingCollectionForId(null);
    }
    if (failures.length > 0) {
      await alert(`Se han creado ${created} de ${mailGroups.length} borradores. Problemas:\n${failures.join('\n')}`, {
        title: 'Preparación incompleta',
        type: 'warning',
      });
      return;
    }
    await alert(`Se han abierto ${created} borrador${created === 1 ? '' : 'es'} de Outlook con sus Excel adjuntos.`, {
      title: 'Comunicaciones preparadas',
      type: 'info',
    });
  };

  const currentMailPreview = mailPreviewGroup ? renderGroupMail(mailPreviewGroup) : null;

  return {
    closeCollectionMails,
    currentMailPreview,
    generateAllCollectionMails,
    generateSingleCollectionMail,
    generatingCollectionForId,
    mailGroups,
    mailPreviewGroup,
    mailPreviewZoneId,
    mailSpecificNotes,
    mailTarget,
    mailTemplateZone,
    openCollectionMails,
    saveMailSpecificNotes,
    setMailPreviewZoneId,
    setMailSpecificNotes,
    setMailTemplateZoneId,
  };
}
