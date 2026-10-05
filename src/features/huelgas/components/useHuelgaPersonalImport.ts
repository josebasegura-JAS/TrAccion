import { useState, type Dispatch, type SetStateAction } from 'react';
import type { useAppDialog } from '../../../hooks/useAppDialog';
import { writeJsonStorageAsync } from '../../../services/persistence';
import { parseXlsxRows } from '../../../shared/import/xlsxParser';
import { buildAsignacionesForPersonal, type HuelgaPuestoAsignacion } from './huelgasAssignments';
import { STORAGE_KEY, type Huelga } from './huelgasPageModel';
import { parseHuelgaPersonalRows, type HuelgaPersonalTurno } from './huelgasPersonalImport';
import { enrichPersonalWithPlantilla, type HuelgaPersonalPlantillaStats } from './huelgasPersonalPlantilla';
import type { HuelgaArea } from './huelgasAreas';
import type { HuelgaZona } from './huelgasZones';

type AlertFn = ReturnType<typeof useAppDialog>['alert'];
type ConfirmFn = ReturnType<typeof useAppDialog>['confirm'];
type Employees = Parameters<typeof enrichPersonalWithPlantilla>[1];

type UseHuelgaPersonalImportParams = {
  alert: AlertFn;
  areas: HuelgaArea[];
  confirm: ConfirmFn;
  employees: Employees;
  huelgas: Huelga[];
  puestoResponsables: HuelgaPuestoAsignacion[];
  setHuelgas: Dispatch<SetStateAction<Huelga[]>>;
  zonas: HuelgaZona[];
};

export function useHuelgaPersonalImport({
  alert,
  areas,
  confirm,
  employees,
  huelgas,
  puestoResponsables,
  setHuelgas,
  zonas,
}: UseHuelgaPersonalImportParams) {
  const [importTargetId, setImportTargetId] = useState<string | null>(null);
  const [importFileName, setImportFileName] = useState('');
  const [importPreview, setImportPreview] = useState<HuelgaPersonalTurno[]>([]);
  const [importSkippedRows, setImportSkippedRows] = useState(0);
  const [importPlantillaStats, setImportPlantillaStats] = useState<HuelgaPersonalPlantillaStats | null>(null);
  const [importError, setImportError] = useState('');
  const [importing, setImporting] = useState(false);

  const importTarget = importTargetId ? huelgas.find((item) => item.id === importTargetId) ?? null : null;

  const resetImport = () => {
    setImportTargetId(null);
    setImportFileName('');
    setImportPreview([]);
    setImportSkippedRows(0);
    setImportPlantillaStats(null);
    setImportError('');
  };

  const openImport = (huelga: Huelga) => {
    setImportTargetId(huelga.id);
    setImportFileName('');
    setImportPreview([]);
    setImportSkippedRows(0);
    setImportPlantillaStats(null);
    setImportError('');
  };

  const closeImport = () => {
    if (importing) return;
    resetImport();
  };

  const selectImportFile = async (file: File | null) => {
    setImportError('');
    setImportPreview([]);
    setImportSkippedRows(0);
    setImportPlantillaStats(null);
    setImportFileName(file?.name ?? '');
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.xlsx')) {
      setImportError('Selecciona un archivo Excel .xlsx con el formato de personal por día.');
      return;
    }

    try {
      const rows = await parseXlsxRows(await file.arrayBuffer());
      const result = parseHuelgaPersonalRows(rows);
      const enriched = enrichPersonalWithPlantilla(result.records, employees);
      setImportPreview(enriched.records);
      setImportPlantillaStats(enriched.stats);
      setImportSkippedRows(result.skippedRows);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'No se ha podido leer el Excel.');
    }
  };

  const saveImportedPersonal = async () => {
    if (!importTarget || importPreview.length === 0) return;

    if ((importTarget.personalConTurno?.length ?? 0) > 0) {
      const accepted = await confirm(
        `Esta huelga ya tiene ${importTarget.personalConTurno?.length ?? 0} personas importadas. ¿Quieres sustituirlas por las ${importPreview.length} del nuevo Excel?`,
        { title: 'Sustituir personal importado', confirmLabel: 'Sustituir', cancelLabel: 'Cancelar' },
      );
      if (!accepted) return;
    }

    const now = new Date().toISOString();
    const asignacionesPuesto = buildAsignacionesForPersonal(
      importPreview,
      importTarget.asignacionesPuesto ?? [],
      puestoResponsables,
      zonas,
      areas,
    );
    const next = huelgas.map((item) =>
      item.id === importTarget.id
        ? {
            ...item,
            personalConTurno: importPreview,
            personalImportadoAt: now,
            asignacionesPuesto,
            updatedAt: now,
          }
        : item,
    );

    setImporting(true);
    const result = await writeJsonStorageAsync(STORAGE_KEY, next);
    setImporting(false);
    if (!result.ok) {
      await alert(result.message || 'No se ha podido guardar el personal importado.', {
        title: 'Error de guardado',
        type: 'error',
      });
      return;
    }

    setHuelgas(next);
    resetImport();
  };

  return {
    closeImport,
    importError,
    importFileName,
    importPlantillaStats,
    importPreview,
    importSkippedRows,
    importTarget,
    importing,
    openImport,
    saveImportedPersonal,
    selectImportFile,
  };
}
