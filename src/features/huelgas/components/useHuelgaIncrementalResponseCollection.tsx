import { useMemo, useState } from 'react';
import { useAppDialog } from '../../../hooks/useAppDialog';
import { readJsonStorage, writeJsonStorageAsync } from '../../../services/persistence';
import type { Huelga } from './huelgasPageModel';
import type {
  HuelgaGeneralDetail,
  HuelgaStrikePerson,
} from './huelgasResponseCollection';
import { parseHuelgaResponseWorkbookForImport } from './huelgasParsedResponseTotals';
import {
  analyzeHuelgaResponseWorkbook,
  fileCircuitMismatchWarning,
} from './huelgasResponseValidation';
import type { HuelgaZona } from './huelgasZones';
import { normalizeHuelgaWorkbookForImport } from './huelgasWorkbookCompatibility';
import {
  HUELGAS_IMPORT_HISTORY_STORAGE_KEY,
  blockLabel,
  filterHuelgaDetailWithContent,
  findHuelgaImportConflicts,
  isHuelgaImportHistory,
  makeHuelgaImportBatch,
  mergeHuelgaImportedDetail,
  type HuelgaImportBatch,
  type HuelgaImportHistory,
} from './huelgasIncrementalImports';
import { useHuelgaResponseCollection } from './useHuelgaResponseCollection';

export type HuelgaImportDisplayBatch = HuelgaImportBatch & {
  zoneId: string;
  zoneName: string;
};

type HuelgaMailAttachment = { name: string; size: number; contentBase64?: string };
type HuelgaMailInspection = {
  senderName: string;
  senderEmail: string;
  subject: string;
  receivedAt: string;
  attachments: HuelgaMailAttachment[];
};
type HuelgaMailInspectResult = { ok: boolean; message: string; inspection?: HuelgaMailInspection };

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
  if (name.includes('gmo') && name.includes('linea')) {
    aliases.push(
      'gmo y linea',
      'linea y gmo',
      'gmo linea',
      'linea gmo',
    );
  }
  if (name.includes('instalaciones')) aliases.push('instalaciones');
  if (name === 'oacs' || name.includes('oac')) aliases.push('oacs', 'oac');
  if (name === 'pmc' || name.includes('pmc')) aliases.push('pmc');
  if (name.includes('jefatura') && name.includes('operaciones')) aliases.push('jefatura de operaciones', 'jefatura operaciones');
  if (name.includes('servicios generales') || name.includes('ssgg') || name === 'sscc') aliases.push('servicios generales', 'ssgg', 'sscc', 'servicios centrales');
  return [...new Set(aliases.map(normalizeSearchText).filter((item) => item.length >= 3))];
}

function splitEmails(value: string): string[] {
  return value
    .split(/[;,]/)
    .map((item) => item.trim().toLocaleLowerCase('es-ES'))
    .filter(Boolean);
}

export function detectZone(
  attachmentName: string,
  subject: string,
  senderEmail: string,
  zonas: HuelgaZona[],
): HuelgaZona | null {
  const fileText = normalizeSearchText(attachmentName);
  const subjectText = normalizeSearchText(subject);
  const sender = senderEmail.trim().toLocaleLowerCase('es-ES');
  const scored = zonas.map((zona) => {
    const aliases = zoneAliases(zona);
    let score = 0;
    if (aliases.some((alias) => fileText.includes(alias))) score += 10;
    if (aliases.some((alias) => subjectText.includes(alias))) score += 6;
    if (sender && splitEmails(zona.responsableEmail).includes(sender)) score += 4;
    return { zona, score };
  }).sort((a, b) => b.score - a.score);
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

function mergePeople(existing: HuelgaStrikePerson[], incoming: HuelgaStrikePerson[]): HuelgaStrikePerson[] {
  const unique = new Map<string, HuelgaStrikePerson>();
  for (const person of [...existing, ...incoming]) {
    const key = `${normalizeSearchText(person.empleado)}::${normalizeSearchText(person.nombre)}`;
    unique.set(key, person);
  }
  return [...unique.values()];
}

function totalsFromDetail(detail: HuelgaGeneralDetail[]) {
  const sum = (key: 'personasTurno' | 'serviciosMinimos' | 'trabajan' | 'huelga') =>
    detail.reduce((total, row) => total + row[key].hombres + row[key].mujeres, 0);
  return {
    personasTurno: sum('personasTurno'),
    serviciosMinimos: sum('serviciosMinimos'),
    personasTrabajan: sum('trabajan'),
    personasHuelga: sum('huelga'),
  };
}

export function useHuelgaIncrementalResponseCollection(huelgas: Huelga[], zonas: HuelgaZona[]) {
  const base = useHuelgaResponseCollection(huelgas, zonas);
  const { alert, confirm, dialogNode: incrementalDialogNode } = useAppDialog();
  const [incrementalImportingZoneId, setIncrementalImportingZoneId] = useState<string | null>(null);
  const [incrementalImportingMessage, setIncrementalImportingMessage] = useState(false);
  const [importHistory, setImportHistory] = useState<HuelgaImportHistory>(() =>
    readJsonStorage(HUELGAS_IMPORT_HISTORY_STORAGE_KEY, {}, isHuelgaImportHistory),
  );

  const targetHistory = useMemo<HuelgaImportDisplayBatch[]>(() => {
    if (!base.target) return [];
    const byZone = importHistory[base.target.id] ?? {};
    return Object.entries(byZone)
      .flatMap(([zoneId, batches]) => {
        const zoneName = base.responses.find((response) => response.zonaId === zoneId)?.zonaNombre
          ?? zonas.find((zona) => zona.id === zoneId)?.nombre
          ?? zoneId;
        return batches.map((batch) => ({ ...batch, zoneId, zoneName }));
      })
      .sort((a, b) => a.importedAt.localeCompare(b.importedAt));
  }, [base.responses, base.target, importHistory, zonas]);

  const appendHistory = async (huelgaId: string, zoneId: string, batch: HuelgaImportBatch) => {
    const next: HuelgaImportHistory = {
      ...importHistory,
      [huelgaId]: {
        ...(importHistory[huelgaId] ?? {}),
        [zoneId]: [...(importHistory[huelgaId]?.[zoneId] ?? []), batch],
      },
    };
    setImportHistory(next);
    const saved = await writeJsonStorageAsync(HUELGAS_IMPORT_HISTORY_STORAGE_KEY, next);
    if (!saved.ok) {
      await alert(saved.message || 'Los datos se han importado, pero no se ha podido guardar el historial visual de importaciones.', {
        title: 'Historial de importación no guardado',
        type: 'warning',
      });
    }
  };

  const importBuffer = async (zoneId: string, fileName: string, buffer: ArrayBuffer): Promise<boolean> => {
    const target = base.target;
    const current = base.responses.find((response) => response.zonaId === zoneId);
    const zone = zonas.find((item) => item.id === zoneId);
    if (!target || !current) return false;

    const compatibleBuffer = await normalizeHuelgaWorkbookForImport(buffer);
    const [parsed, findings] = await Promise.all([
      parseHuelgaResponseWorkbookForImport(compatibleBuffer),
      analyzeHuelgaResponseWorkbook(compatibleBuffer),
    ]);
    const incoming = await filterHuelgaDetailWithContent(compatibleBuffer, parsed.generalDetail);

    if ((parsed.generalDetail?.length ?? 0) > 0 && incoming.length === 0) {
      await alert('El Excel contiene bloques de seguimiento, pero ninguno tiene datos introducidos. No se ha importado nada.', {
        title: 'Sin datos que importar',
        type: 'info',
      });
      return false;
    }

    if (incoming.length === 0 && !(parsed.generalDetail?.length)) {
      const synthetic = new File([compatibleBuffer], fileName, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      await base.importResponse(zoneId, synthetic);
      return true;
    }

    const conflicts = findHuelgaImportConflicts(current.generalDetail, incoming);
    if (conflicts.length > 0) {
      const labels = conflicts.map(blockLabel).join('\n• ');
      const replace = await confirm(
        `Ya existen datos para:\n• ${labels}\n\nEl resto de bloques del área se conservará. ¿Quieres sustituir únicamente estos bloques por los del nuevo Excel?`,
        {
          title: 'Datos ya importados',
          confirmLabel: 'Sustituir bloques',
          cancelLabel: 'Cancelar importación',
        },
      );
      if (!replace) return false;
    }

    const mergedDetail = mergeHuelgaImportedDetail(current.generalDetail, incoming);
    const totals = totalsFromDetail(mergedDetail);
    const mismatchWarning = zone ? fileCircuitMismatchWarning(fileName, zone, zonas) : null;
    const warnings = [...new Set([
      ...parsed.warnings,
      ...findings,
      ...(mismatchWarning ? [mismatchWarning] : []),
    ])];
    const importedAt = new Date().toISOString();

    base.updateResponse(zoneId, 'generalDetail', mergedDetail);
    base.updateResponse(zoneId, 'personasTurno', totals.personasTurno);
    base.updateResponse(zoneId, 'serviciosMinimos', totals.serviciosMinimos);
    base.updateResponse(zoneId, 'personasTrabajan', totals.personasTrabajan);
    base.updateResponse(zoneId, 'personasHuelga', totals.personasHuelga);
    base.updateResponse(zoneId, 'huelguistas', mergePeople(current.huelguistas, parsed.huelguistas));
    base.updateResponse(zoneId, 'warnings', warnings);
    base.updateResponse(zoneId, 'sourceFileName', fileName);
    base.updateResponse(zoneId, 'importedAt', importedAt);

    await appendHistory(target.id, zoneId, makeHuelgaImportBatch(fileName, importedAt, incoming, conflicts));

    if (warnings.length > 0) {
      await alert(
        `La importación se ha incorporado. Revisa ${warnings.length} aviso${warnings.length === 1 ? '' : 's'} antes de validar el circuito.`,
        { title: 'Importación con avisos', type: 'warning' },
      );
    }
    return true;
  };

  const importResponse = async (zoneId: string, file: File) => {
    setIncrementalImportingZoneId(zoneId);
    try {
      await importBuffer(zoneId, file.name, await file.arrayBuffer());
    } catch (error) {
      await alert(error instanceof Error ? error.message : 'No se ha podido leer el Excel de respuesta.', {
        title: 'Error al importar',
        type: 'error',
      });
    } finally {
      setIncrementalImportingZoneId(null);
    }
  };

  const importOutlookMessage = async (input: File | File[]) => {
    const files = Array.isArray(input) ? input : [input];
    const valid = files.filter((file) => /\.(msg|xlsx|xlsm)$/i.test(file.name));
    const invalid = files.filter((file) => !/\.(msg|xlsx|xlsm)$/i.test(file.name));
    if (invalid.length > 0) {
      await alert(`Se ignorarán formatos no admitidos: ${invalid.map((file) => file.name).join(', ')}.`, {
        title: 'Algunos archivos no se procesarán',
        type: 'warning',
      });
    }

    setIncrementalImportingMessage(true);
    try {
      for (const file of valid) {
        if (/\.(xlsx|xlsm)$/i.test(file.name)) {
          const zone = detectZone(file.name, '', '', zonas);
          if (!zone) {
            await alert(`No se ha podido identificar el circuito de “${file.name}”. Usa el botón Importar Excel del área correspondiente.`, {
              title: 'Circuito no identificado',
              type: 'warning',
            });
            continue;
          }
          setIncrementalImportingZoneId(zone.id);
          await importBuffer(zone.id, file.name, await file.arrayBuffer());
          setIncrementalImportingZoneId(null);
          continue;
        }

        const inspectMessage = window.traccion?.inspectSchoolHelpMessage;
        if (!inspectMessage) throw new Error('La lectura de correos de Outlook solo está disponible en la aplicación de escritorio.');
        const result = await inspectMessage(file.name, await file.arrayBuffer()) as HuelgaMailInspectResult;
        if (!result.ok || !result.inspection) throw new Error(result.message || 'No se ha podido leer el correo.');
        const inspection = result.inspection;
        const attachments = inspection.attachments.filter((attachment) => /\.(xlsx|xlsm)$/i.test(attachment.name) && attachment.contentBase64);
        if (attachments.length === 0) throw new Error('El correo no contiene ningún Excel de seguimiento importable.');

        for (const attachment of attachments) {
          const zone = detectZone(attachment.name, inspection.subject, inspection.senderEmail, zonas);
          if (!zone) {
            await alert(`No se ha podido identificar el circuito de “${attachment.name}”.`, {
              title: 'Circuito no identificado',
              type: 'warning',
            });
            continue;
          }
          setIncrementalImportingZoneId(zone.id);
          await importBuffer(zone.id, attachment.name, base64ToArrayBuffer(attachment.contentBase64 ?? ''));
          setIncrementalImportingZoneId(null);
        }
      }
    } catch (error) {
      await alert(error instanceof Error ? error.message : 'No se ha podido procesar la respuesta.', {
        title: 'Error al importar',
        type: 'error',
      });
    } finally {
      setIncrementalImportingZoneId(null);
      setIncrementalImportingMessage(false);
    }
  };

  return {
    ...base,
    importingZoneId: incrementalImportingZoneId ?? base.importingZoneId,
    importingMessage: incrementalImportingMessage || base.importingMessage,
    importResponse,
    importOutlookMessage,
    importHistory: targetHistory,
    dialogNode: <>{base.dialogNode}{incrementalDialogNode}</>,
  };
}
