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
    if (saving || importingZoneId) return;
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

  const importResponse = async (zoneId: string, file: File) => {
    const current = draft[zoneId];
    const currentZone = zonas.find((zona) => zona.id === zoneId);
    if (!current || !currentZone) return;
    setImportingZoneId(zoneId);
    try {
      const buffer = await file.arrayBuffer();
      const [parsed, workbookFindings] = await Promise.all([
        parseHuelgaResponseWorkbook(buffer),
        analyzeHuelgaResponseWorkbook(buffer),
      ]);
      const mismatchWarning = fileCircuitMismatchWarning(file.name, currentZone, zonas);
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
          sourceFileName: file.name,
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
    } catch (error) {
      await alert(error instanceof Error ? error.message : 'No se ha podido leer el Excel de respuesta.', {
        title: 'Error al importar',
        type: 'error',
      });
    } finally {
      setImportingZoneId(null);
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
    exporting,
    open,
    close,
    updateResponse,
    importResponse,
    save,
    markReviewed,
    exportReport,
    collectionStatusFor,
    dialogNode,
  };
}
