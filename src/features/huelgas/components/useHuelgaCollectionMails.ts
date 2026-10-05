import { useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import type { useAppDialog } from '../../../hooks/useAppDialog';
import { writeJsonStorageAsync } from '../../../services/persistence';
import { buildCollectionGroups, type HuelgaCollectionGroup } from './huelgasCollectionExport';
import { renderHuelgaMailTemplate } from './huelgasMailTemplates';
import {
  buildAsignacionesForPersonal,
  isAsignacionCompleta,
  type HuelgaPuestoAsignacion,
} from './huelgasAssignments';
import type { HuelgaZona } from './huelgasZones';
import type { HuelgaArea } from './huelgasAreas';
import { STORAGE_KEY, type Huelga } from './huelgasPageModel';

type AlertFn = ReturnType<typeof useAppDialog>['alert'];
type ConfirmFn = ReturnType<typeof useAppDialog>['confirm'];

type UseHuelgaCollectionMailsParams = {
  alert: AlertFn;
  areas: HuelgaArea[];
  confirm: ConfirmFn;
  huelgas: Huelga[];
  puestoResponsables: HuelgaPuestoAsignacion[];
  setHuelgas: Dispatch<SetStateAction<Huelga[]>>;
  zoneDraft: HuelgaZona[];
  zonas: HuelgaZona[];
};

export function useHuelgaCollectionMails({
  alert,
  areas,
  confirm,
  huelgas,
  puestoResponsables,
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

  const mailGroups = useMemo(() => {
    if (!mailTarget) return [];
    const assignments = buildAsignacionesForPersonal(
      mailTarget.personalConTurno ?? [],
      mailTarget.asignacionesPuesto ?? [],
      puestoResponsables,
      zonas,
      areas,
    );
    return buildCollectionGroups(mailTarget.personalConTurno ?? [], assignments)
      .filter((group) => zonas.find((zona) => zona.id === group.zonaId)?.correoActivo !== false);
  }, [areas, mailTarget, puestoResponsables, zonas]);

  const mailPreviewGroup = mailPreviewZoneId
    ? mailGroups.find((group) => group.zonaId === mailPreviewZoneId) ?? null
    : null;
  const mailTemplateZone = mailTemplateZoneId
    ? zoneDraft.find((zona) => zona.id === mailTemplateZoneId) ?? null
    : null;

  const openCollectionMails = async (huelga: Huelga) => {
    const personal = huelga.personalConTurno ?? [];
    if (personal.length === 0) {
      await alert('Importa primero el personal con turno de esta huelga.', {
        title: 'Falta el personal del día',
        type: 'warning',
      });
      return;
    }

    const assignments = buildAsignacionesForPersonal(
      personal,
      huelga.asignacionesPuesto ?? [],
      puestoResponsables,
      zonas,
      areas,
    );
    const pending = assignments.filter((item) => {
      const zone = zonas.find((zona) => zona.id === item.zonaId);
      return zone?.correoActivo !== false && !isAsignacionCompleta(item);
    });
    if (pending.length > 0) {
      await alert(
        `Hay ${pending.length} combinaciones de residencia + puesto pertenecientes a zonas con correo activo que no tienen Zona, Área válida o responsable/email completos. Complétalas antes de preparar los correos.`,
        { title: 'Áreas y zonas pendientes', type: 'warning' },
      );
      return;
    }

    const groups = buildCollectionGroups(personal, assignments)
      .filter((group) => zonas.find((zona) => zona.id === group.zonaId)?.correoActivo !== false);
    if (groups.length === 0) {
      await alert('No hay zonas con correo activo y destinatario configurado para esta huelga.', {
        title: 'Sin correos que generar',
        type: 'info',
      });
      return;
    }

    setMailSpecificNotes(huelga.instruccionesCorreoPorZona ?? {});
    setMailPreviewZoneId(groups[0]?.zonaId ?? null);
    setMailTargetId(huelga.id);
  };

  const closeCollectionMails = () => {
    if (generatingCollectionForId) return;
    setMailTargetId(null);
    setMailPreviewZoneId(null);
    setMailSpecificNotes({});
  };

  const saveMailSpecificNotes = async () => {
    if (!mailTarget) return;
    const now = new Date().toISOString();
    const cleaned = Object.fromEntries(
      Object.entries(mailSpecificNotes)
        .map(([key, value]) => [key, value.trim()])
        .filter(([, value]) => Boolean(value)),
    );
    const next = huelgas.map((item) => item.id === mailTarget.id
      ? { ...item, instruccionesCorreoPorZona: cleaned, updatedAt: now }
      : item,
    );
    const result = await writeJsonStorageAsync(STORAGE_KEY, next);
    if (!result.ok) {
      await alert(result.message || 'No se han podido guardar las instrucciones específicas.', {
        title: 'Error de guardado',
        type: 'error',
      });
      return;
    }
    setHuelgas(next);
  };

  const renderGroupMail = (group: HuelgaCollectionGroup) => {
    if (!mailTarget) return null;
    const zona = zonas.find((item) => item.id === group.zonaId);
    if (!zona) return null;
    return renderHuelgaMailTemplate({
      fecha: mailTarget.fecha,
      zona,
      personal: group.personal,
      asignaciones: group.asignaciones,
      instruccionesEspecificas: mailSpecificNotes[group.zonaId] ?? '',
    });
  };

  const createCollectionMail = async (group: HuelgaCollectionGroup): Promise<string | null> => {
    const api = window.traccion?.createOutlookDraft;
    if (!api) return 'La generación de borradores de Outlook solo está disponible en la aplicación de escritorio.';
    const zona = zonas.find((item) => item.id === group.zonaId);
    if (!zona) return 'No se encuentra la zona configurada.';
    if (!zona.correoActivo) return null;
    if (!zona.responsableEmail.trim()) return 'La zona no tiene email de responsable.';
    const rendered = renderGroupMail(group);
    if (!rendered) return 'No se ha podido renderizar la plantilla.';
    const result = await api({
      subject: rendered.subject,
      html: rendered.html,
      to: [zona.responsableEmail.trim()],
      cc: [],
      bcc: [],
      attachments: [],
    });
    return result.ok ? null : result.message;
  };

  const generateSingleCollectionMail = async (group: HuelgaCollectionGroup) => {
    if (!mailTarget) return;
    setGeneratingCollectionForId(mailTarget.id);
    try {
      const error = await createCollectionMail(group);
      if (error) {
        await alert(error, { title: `No se ha creado el correo de ${group.zonaNombre}`, type: 'warning' });
        return;
      }
      await alert(`Borrador de Outlook preparado para ${group.zonaNombre}.`, {
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
      `Se crearán ${mailGroups.length} borrador${mailGroups.length === 1 ? '' : 'es'} de Outlook, uno por zona. En esta fase no se adjuntará ningún Excel. ¿Continuar?`,
      { title: 'Generar correos por zona', confirmLabel: 'Generar correos', cancelLabel: 'Cancelar' },
    );
    if (!accepted) return;

    await saveMailSpecificNotes();
    setGeneratingCollectionForId(mailTarget.id);
    let created = 0;
    const failures: string[] = [];
    try {
      for (const group of mailGroups) {
        const error = await createCollectionMail(group);
        if (error) failures.push(`${group.zonaNombre}: ${error}`);
        else created += 1;
      }
    } finally {
      setGeneratingCollectionForId(null);
    }

    if (failures.length > 0) {
      await alert(`Se han creado ${created} de ${mailGroups.length} borradores. Problemas:\n${failures.join('\n')}`, {
        title: 'Generación incompleta',
        type: 'warning',
      });
      return;
    }
    await alert(`Se han creado ${created} borrador${created === 1 ? '' : 'es'} de Outlook sin adjuntos.`, {
      title: 'Correos preparados',
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
