import { useMemo, useState } from 'react';
import { useAppDialog } from '../../../hooks/useAppDialog';
import { readJsonStorage, writeJsonStorageAsync } from '../../../services/persistence';
import type { HuelgaZona } from './huelgasZones';
import type { Huelga } from './huelgasPageModel';
import {
  HUELGAS_RESPONSE_STORAGE_KEY,
  collectionTotals,
  downloadHuelgaResponseReport,
  emptyZoneResponse,
  isHuelgaResponseCollections,
  parseHuelgaResponseWorkbook,
  responseHasData,
  type HuelgaResponseCollections,
  type HuelgaZoneResponse,
} from './huelgasResponseCollection';
import {
  analyzeHuelgaResponseWorkbook,
  fileCircuitMismatchWarning,
  summarizeHuelgaValidation,
  validateHuelgaCollection,
  validateHuelgaZoneResponse,
  type HuelgaValidationIssue,
} from './huelgasResponseValidation';

function circuitIdsFor(huelga: Huelga, zonas: HuelgaZona[]): string[] {
  if (huelga.circuitosZonaIds?.length) return huelga.circuitosZonaIds;
  return zonas.filter((zona) => zona.active && zona.correoActivo).map((zona) => zona.id);
}

function ensureResponses(
  huelga: Huelga,
  zonas: HuelgaZona[],
  existing: Record<string, HuelgaZoneResponse> | undefined,
): Record<string, HuelgaZoneResponse> {
  const selected = new Set(circuitIdsFor(huelga, zonas));
  return Object.fromEntries(
    zonas
      .filter((zona) => selected.has(zona.id))
      .map((zona) => {
        const current = existing?.[zona.id];
        return [zona.id, current ? { ...current, zonaNombre: zona.nombre } : emptyZoneResponse(zona.id, zona.nombre)];
      }),
  );
}

function issueMessage(issues: HuelgaValidationIssue[], maxItems = 8): string {
  const visible = issues.slice(0, maxItems).map((item) => `• ${item.message}`);
  if (issues.length > maxItems) visible.push(`• …y ${issues.length - maxItems} incidencia(s) más.`);
  return visible.join('\n');
}

function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-ES')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function zoneAliases(zona: HuelgaZona): string[] {
  const name = normalizeSearchText(zona.nombre);
  const aliases = [name];
  if (name.includes('mm ariz')) aliases.push('mm ariz', 'ariz');
  if (name.includes('mm sopela')) aliases.push('mm sopela', 'sopela');
  if (name.includes('gmo') && name.includes('linea')) aliases.push('gmo y linea', 'linea y gmo', 'gmo linea');
  if (name.includes('instalaciones')) aliases.push('instalaciones');
  if (name === 'oacs' || name.includes('oac')) aliases.push('oacs', 'oac');
  if (name === 'pmc' || name.includes('pmc')) aliases.push('pmc');
  if (name.includes('jefatura') && name.includes('operaciones')) aliases.push('jefatura de operaciones', 'jefatura operaciones');
  return [...new Set(aliases.map(normalizeSearchText).filter((item) => item.length >= 3))];
}

function splitEmails(value: string): string[] {
  return value
    .split(/[;,]/)
    .map((item) => item.trim().toLocaleLowerCase('es-ES'))
    .filter(Boolean);
}

function detectMessageZone(
  attachmentName: string,
  subject: string,
  senderEmail: string,
  availableZones: HuelgaZona[],
): HuelgaZona | null {
  const fileText = normalizeSearchText(attachmentName);
  const subjectText = normalizeSearchText(subject);
  const sender = senderEmail.trim().toLocaleLowerCase('es-ES');
  const scored = availableZones.map((zona) => {
    const aliases = zoneAliases(zona);
    let score = 0;
    if (aliases.some((alias) => fileText.includes(alias))) score += 10;
    if (aliases.some((alias) => subjectText.includes(alias))) score += 6;
    if (sender && splitEmails(zona.responsableEmail).includes(sender)) score += 4;
    return { zona, score };
  }).sort((first, second) => second.score - first.score);
  if (!scored[0] || scored[0].score <= 0) return null;
  if (scored[1] && scored[1].score === scored[0].score) return null;
  return scored[0].zona;
}

function base64ToArrayBuffer(value: string): ArrayBuffer {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

type HuelgaMailAttachment = { name: string; size: number; contentBase64?: string };
type HuelgaMailInspection = {
  senderName: string;
  senderEmail: string;
  subject: string;
  receivedAt: string;
  attachments: HuelgaMailAttachment[];
};
type HuelgaMailInspectResult = { ok: boolean; message: string; inspection?: HuelgaMailInspection };

export function useHuelgaResponseCollection(huelgas: Huelga[], zonas: HuelgaZona[]) {
  const { alert, confirm, dialogNode } = useAppDialog();
  const [collections, setCollections] = useState<HuelgaResponseCollections>(() =>
    readJsonStorage(HUELGAS_RESPONSE_STORAGE_KEY, {}, isHuelgaResponseCollections),
  );
  const [targetId, setTargetId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, HuelgaZoneResponse>>({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [importingZoneId, setImportingZoneId] = useState<string | null>(null);
  const [importingMessage, setImportingMessage] = useState(false);
  const [exporting, setExporting] = useState(false);

  const target = targetId ? huelgas.find((item) => item.id === targetId) ?? null : null;
  const responses = useMemo(() => Object.values(draft), [draft]);
  const totals = useMemo(() => collectionTotals(responses), [responses]);
  const receivedCount = useMemo(() => responses.filter(responseHasData).length, [responses]);
  const reviewedCount = useMemo(() => responses.filter((response) => response.reviewed).length, [responses]);
  const validationByZone = useMemo<Record<string, HuelgaValidationIssue[]>>(
    () => Object.fromEntries(responses.map((response) => [response.zonaId, validateHuelgaZoneResponse(response)])),
    [responses],
  );
  const collectionIssues = useMemo(() => validateHuelgaCollection(responses), [responses]);
  const validationSummary = useMemo(() => summarizeHuelgaValidation(collectionIssues), [collectionIssues]);
  const globalIssues = useMemo(() => collectionIssues.filter((item) => !item.zonaId), [collectionIssues]);

  const open = (huelga: Huelga) => {
    setTargetId(huelga.id);
    setDraft(ensureResponses(huelga, zonas, collections[huelga.id]?.responses));
    setDirty(false);
  };

  const close = async () => {
    if (saving || importingZoneId || importingMessage) return;
    if (dirty) {
      const accepted = await confirm('Hay cambios de recogida sin guardar. ¿Cerrar y descartarlos?', {
        title: 'Cambios sin guardar',
        confirmLabel: 'Descartar cambios',
        cancelLabel: 'Seguir editando',
        danger: true,
      });
      if (!accepted) return;
    }
    setTargetId(null);
    setDraft({});
    setDirty(false);
  };

  const updateResponse = <K extends keyof HuelgaZoneResponse>(zoneId: string, field: K, value: HuelgaZoneResponse[K]) => {
    setDraft((current) => ({
      ...current,
      [zoneId]: { ...current[zoneId], [field]: value, reviewed: field === 'reviewed' ? Boolean(value) : false },
    }));
    setDirty(true);
  };

  const importResponseBuffer = async (zoneId: string, fileName: string, buffer: ArrayBuffer): Promise<boolean> => {
    const current = draft[zoneId];
    const currentZone = zonas.find((zona) => zona.id === zoneId);
    if (!current || !currentZone) return false;
    const [parsed, workbookFindings] = await Promise.all([
      parseHuelgaResponseWorkbook(buffer),
      analyzeHuelgaResponseWorkbook(buffer),
    ]);
    const mismatchWarning = fileCircuitMismatchWarning(fileName, currentZone, zonas);
    const warnings = [...new Set([
      ...parsed.warnings,
      ...workbookFindings,
      ...(mismatchWarning ? [mismatchWarning] : []),
    ])];
    setDraft((responsesDraft) => ({
      ...responsesDraft,
      [zoneId]: {
        ...responsesDraft[zoneId],
        ...parsed,
        warnings,
        sourceFileName: fileName,
        importedAt: new Date().toISOString(),
        reviewed: false,
      },
    }));
    setDirty(true);
    if (warnings.length > 0) {
      const blocking = warnings.filter((message) => /^\s*\[ERROR\]/i.test(message));
      await alert(
        `${blocking.length > 0 ? 'Se han detectado inconsistencias que deben corregirse antes de validar el circuito.' : 'El Excel se ha importado, pero conviene revisar algunos datos.'}\n${warnings.map((message) => message.replace(/^\s*\[ERROR\]\s*/i, '• ')).join('\n')}`,
        { title: blocking.length > 0 ? 'Inconsistencias detectadas' : 'Importación con avisos', type: 'warning' },
      );
    }
    return true;
  };

  const importResponse = async (zoneId: string, file: File) => {
    setImportingZoneId(zoneId);
    try {
      await importResponseBuffer(zoneId, file.name, await file.arrayBuffer());
    } catch (error) {
      await alert(error instanceof Error ? error.message : 'No se ha podido leer el Excel de respuesta.', {
        title: 'Error al importar',
        type: 'error',
      });
    } finally {
      setImportingZoneId(null);
    }
  };

  const importOutlookMessage = async (file: File) => {
    if (!target) return;
    if (!/\.msg$/i.test(file.name)) {
      await alert('Arrastra un correo de Outlook en formato .msg.', { title: 'Formato no válido', type: 'warning' });
      return;
    }
    const inspectMessage = window.traccion?.inspectSchoolHelpMessage;
    if (!inspectMessage) {
      await alert('La lectura de correos de Outlook solo está disponible en la aplicación de escritorio.', {
        title: 'Outlook no disponible',
        type: 'error',
      });
      return;
    }

    setImportingMessage(true);
    try {
      const result = await inspectMessage(file.name, await file.arrayBuffer()) as HuelgaMailInspectResult;
      if (!result.ok || !result.inspection) throw new Error(result.message || 'No se ha podido leer el correo.');
      const inspection = result.inspection;
      const excelAttachments = inspection.attachments.filter(
        (attachment) => /\.(xlsx|xlsm)$/i.test(attachment.name) && Boolean(attachment.contentBase64),
      );
      if (excelAttachments.length === 0) {
        throw new Error('El correo no contiene ningún Excel .xlsx/.xlsm que TrAcción pueda importar.');
      }

      const selectedIds = new Set(circuitIdsFor(target, zonas));
      const availableZones = zonas.filter((zona) => selectedIds.has(zona.id));
      const unresolved: string[] = [];
      const duplicatedZones = new Set<string>();
      const matches: Array<{ attachment: HuelgaMailAttachment; zona: HuelgaZona }> = [];

      for (const attachment of excelAttachments) {
        const zona = detectMessageZone(attachment.name, inspection.subject, inspection.senderEmail, availableZones);
        if (!zona) {
          unresolved.push(attachment.name);
          continue;
        }
        if (matches.some((match) => match.zona.id === zona.id)) {
          duplicatedZones.add(zona.nombre);
          continue;
        }
        matches.push({ attachment, zona });
      }

      if (duplicatedZones.size > 0) {
        throw new Error(`El correo contiene más de un Excel que parece corresponder al mismo circuito: ${[...duplicatedZones].join(', ')}.`);
      }
      if (matches.length === 0) {
        throw new Error(`No se ha podido identificar el circuito del Excel. Asunto: “${inspection.subject || '(sin asunto)'}”. Puedes seguir usando “Importar Excel” manualmente.`);
      }

      let imported = 0;
      for (const { attachment, zona } of matches) {
        const existing = draft[zona.id];
        if (responseHasData(existing)) {
          const replace = await confirm(
            `${zona.nombre} ya figura como recibido (${existing?.sourceFileName || 'datos existentes'}). ¿Sustituirlo por ${attachment.name}?`,
            {
              title: 'Respuesta ya recibida',
              confirmLabel: 'Sustituir',
              cancelLabel: 'Conservar actual',
            },
          );
          if (!replace) continue;
        }
        await importResponseBuffer(zona.id, attachment.name, base64ToArrayBuffer(attachment.contentBase64 ?? ''));
        imported += 1;
      }

      const unresolvedSuffix = unresolved.length > 0
        ? `\nNo se han podido asignar automáticamente: ${unresolved.join(', ')}.`
        : '';
      if (imported > 0) {
        await alert(
          `Correo de ${inspection.senderName || inspection.senderEmail || 'Outlook'} procesado. ${imported} circuito${imported === 1 ? '' : 's'} incorporado${imported === 1 ? '' : 's'}.${unresolvedSuffix}`,
          { title: 'Respuesta de huelga recibida', type: 'info' },
        );
      } else if (unresolved.length > 0) {
        await alert(`No se ha incorporado ningún Excel.${unresolvedSuffix}`, {
          title: 'Revisa el correo',
          type: 'warning',
        });
      }
    } catch (error) {
      await alert(error instanceof Error ? error.message : 'No se ha podido procesar el correo de Outlook.', {
        title: 'Error al leer la respuesta',
        type: 'error',
      });
    } finally {
      setImportingMessage(false);
    }
  };

  const save = async (): Promise<boolean> => {
    if (!target) return false;
    const next: HuelgaResponseCollections = {
      ...collections,
      [target.id]: {
        huelgaId: target.id,
        responses: draft,
        updatedAt: new Date().toISOString(),
      },
    };
    setSaving(true);
    const result = await writeJsonStorageAsync(HUELGAS_RESPONSE_STORAGE_KEY, next);
    setSaving(false);
    if (!result.ok) {
      await alert(result.message || 'No se ha podido guardar la recogida de datos.', {
        title: 'Error de guardado',
        type: 'error',
      });
      return false;
    }
    setCollections(next);
    setDirty(false);
    return true;
  };

  const markReviewed = async (zoneId: string) => {
    const response = draft[zoneId];
    if (!response) return;
    const issues = validateHuelgaZoneResponse(response);
    const errors = issues.filter((item) => item.severity === 'error');
    if (errors.length > 0) {
      await alert(issueMessage(errors), { title: 'Corrige las inconsistencias del circuito', type: 'error' });
      return;
    }
    const warnings = issues.filter((item) => item.severity === 'warning');
    if (warnings.length > 0) {
      const accepted = await confirm(
        `Quedan ${warnings.length} advertencia(s) no bloqueante(s):\n${issueMessage(warnings)}\n\n¿Confirmas que las has revisado?`,
        {
          title: 'Confirmar revisión del circuito',
          confirmLabel: 'Sí, marcar revisado',
          cancelLabel: 'Seguir revisando',
        },
      );
      if (!accepted) return;
    }
    updateResponse(zoneId, 'reviewed', true);
  };

  const exportReport = async () => {
    if (!target) return;
    const issues = validateHuelgaCollection(responses);
    const errors = issues.filter((item) => item.severity === 'error');
    if (errors.length > 0) {
      await alert(
        `No se puede generar la Excel maestra mientras existan errores o circuitos sin revisar.\n${issueMessage(errors)}`,
        { title: 'Consolidación bloqueada', type: 'error' },
      );
      return;
    }
    if (dirty) {
      const saved = await save();
      if (!saved) return;
    }
    setExporting(true);
    try {
      await downloadHuelgaResponseReport(target.fecha, target.sindicatos, responses);
    } catch (error) {
      await alert(error instanceof Error ? error.message : 'No se ha podido generar el informe consolidado.', {
        title: 'Error al exportar',
        type: 'error',
      });
    } finally {
      setExporting(false);
    }
  };

  const collectionStatusFor = (huelga: Huelga) => {
    const selectedIds = circuitIdsFor(huelga, zonas);
    const stored = collections[huelga.id]?.responses ?? {};
    const received = selectedIds.filter((zoneId) => responseHasData(stored[zoneId])).length;
    const reviewed = selectedIds.filter((zoneId) => stored[zoneId]?.reviewed).length;
    return { total: selectedIds.length, received, reviewed };
  };

  return {
    target,
    responses,
    totals,
    receivedCount,
    reviewedCount,
    validationByZone,
    validationSummary,
    globalIssues,
    dirty,
    saving,
    importingZoneId,
    importingMessage,
    exporting,
    open,
    close,
    updateResponse,
    importResponse,
    importOutlookMessage,
    save,
    markReviewed,
    exportReport,
    collectionStatusFor,
    dialogNode,
  };
}
