import { useEffect, useMemo, useState } from 'react';
import { useAppDialog } from '../../../hooks/useAppDialog';
import { useConfiguracionStore } from '../../configuracion/store/useConfiguracionStore';
import { useEmployeeStore } from '../../plantilla/store/useEmployeeStore';
import { readJsonStorage, writeJsonStorageAsync } from '../../../services/persistence';
import { isHuelgaPuestoAsignaciones, type HuelgaPuestoAsignacion } from './huelgasAssignments';
import { ensureDefaultZonas, isHuelgaZonas, type HuelgaZona } from './huelgasZones';
import { isHuelgaAreas, mergeLegacyAreas, type HuelgaArea } from './huelgasAreas';
import {
  AREAS_STORAGE_KEY,
  PUESTO_RESPONSABLES_STORAGE_KEY,
  STORAGE_KEY,
  ZONAS_STORAGE_KEY,
  formatDate,
  isHuelgas,
  todayIso,
  type Huelga,
} from './huelgasPageModel';
import { useHuelgaAssignments } from './useHuelgaAssignments';
import { useHuelgaCollectionMails } from './useHuelgaCollectionMails';
import { useHuelgaEditor } from './useHuelgaEditor';
import { useHuelgaPersonalImport } from './useHuelgaPersonalImport';
import { useHuelgaZoneMasters } from './useHuelgaZoneMasters';

export function useHuelgasPageController() {
  const { alert, confirm, dialogNode } = useAppDialog();
  const taskOrigins = useConfiguracionStore((state) => state.taskOrigins);
  const loadConfiguracion = useConfiguracionStore((state) => state.load);
  const employees = useEmployeeStore((state) => state.employees);
  const loadEmployees = useEmployeeStore((state) => state.load);
  const employeesLoading = useEmployeeStore((state) => state.isLoading);
  const updateEmployeeWithConcurrencyCheck = useEmployeeStore((state) => state.updateWithConcurrencyCheck);
  const [huelgas, setHuelgas] = useState<Huelga[]>([]);
  const [puestoResponsables, setPuestoResponsables] = useState<HuelgaPuestoAsignacion[]>([]);
  const [zonas, setZonas] = useState<HuelgaZona[]>([]);
  const [areas, setAreas] = useState<HuelgaArea[]>([]);

  const {
    addTramo,
    draft,
    editingId,
    editorOpen,
    openEdit,
    openNew,
    removeTramo,
    save,
    saving,
    setDraft,
    setEditorOpen,
    toggleSindicato,
    updateTramo,
  } = useHuelgaEditor({ alert, huelgas, setHuelgas, zonas });

  const {
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
  } = useHuelgaPersonalImport({
    alert,
    areas,
    confirm,
    employees,
    huelgas,
    puestoResponsables,
    setHuelgas,
    zonas,
  });

  const {
    assignmentConfiguredCount,
    assignmentDraft,
    assignmentFilters,
    assignmentPersonCounts,
    assignmentSearch,
    assignmentSort,
    assignmentTarget,
    closeAssignments,
    closePersonDetail,
    filteredAssignmentDraft,
    openAssignments,
    openPersonDetail,
    personDetailAssignment,
    personDetailRows,
    personResidenceDrafts,
    saveAssignments,
    savePersonResidence,
    savingAssignments,
    savingPersonId,
    setAssignmentSearch,
    setPersonResidenceDrafts,
    syncAssignmentsWithMasters,
    toggleAssignmentSort,
    updateAssignment,
    updateAssignmentFilter,
    updateAssignmentResidence,
  } = useHuelgaAssignments({
    alert,
    areas,
    confirm,
    employees,
    huelgas,
    puestoResponsables,
    setHuelgas,
    setPuestoResponsables,
    updateEmployeeWithConcurrencyCheck,
    zonas,
  });

  const {
    addArea,
    addZone,
    areaDraft,
    closeZones,
    newAreaName,
    newAreaZoneId,
    newZoneName,
    openZones,
    saveZones,
    savingZones,
    setNewAreaName,
    setNewAreaZoneId,
    setNewZoneName,
    updateArea,
    updateZone,
    zoneDraft,
    zonesOpen,
  } = useHuelgaZoneMasters({
    alert,
    areas,
    setAreas,
    setZonas,
    syncAssignmentsWithMasters,
    zonas,
  });

  const {
    closeCollectionMails,
    currentMailPreview,
    generateAllCollectionMails,
    generateSingleCollectionMail,
    generatingCollectionForId,
    mailGroups,
    mailPreviewGroup,
    mailPreviewZoneId,
    mailRecipientsByZone,
    mailSpecificNotes,
    mailTarget,
    mailTemplateZone,
    openCollectionMails,
    saveMailSpecificNotes,
    setMailPreviewZoneId,
    setMailSpecificNotes,
    setMailTemplateZoneId,
    updateMailRecipients,
  } = useHuelgaCollectionMails({
    alert,
    confirm,
    huelgas,
    setHuelgas,
    zoneDraft,
    zonas,
  });

  useEffect(() => {
    loadConfiguracion();
    loadEmployees();
    setHuelgas(readJsonStorage(STORAGE_KEY, [], isHuelgas));
    const storedAssignments = readJsonStorage(
      PUESTO_RESPONSABLES_STORAGE_KEY,
      [],
      isHuelgaPuestoAsignaciones,
    );
    setPuestoResponsables(storedAssignments);
    const storedZonas = readJsonStorage(ZONAS_STORAGE_KEY, [], isHuelgaZonas);
    const nextZonas = ensureDefaultZonas(storedZonas);
    setZonas(nextZonas);
    if (JSON.stringify(nextZonas) !== JSON.stringify(storedZonas)) {
      void writeJsonStorageAsync(ZONAS_STORAGE_KEY, nextZonas);
    }

    const storedHuelgas = readJsonStorage(STORAGE_KEY, [], isHuelgas);
    const historicalAssignments = storedHuelgas.flatMap((huelga) => huelga.asignacionesPuesto ?? []);
    const storedAreas = readJsonStorage(AREAS_STORAGE_KEY, [], isHuelgaAreas);
    const nextAreas = mergeLegacyAreas(storedAreas, [...storedAssignments, ...historicalAssignments]);
    setAreas(nextAreas);
    if (nextAreas.length !== storedAreas.length) {
      void writeJsonStorageAsync(AREAS_STORAGE_KEY, nextAreas);
    }
  }, [loadConfiguracion, loadEmployees]);

  const sindicatos = useMemo(
    () =>
      taskOrigins
        .filter((origin) => origin.tipo === 'sindicato' && origin.active && !origin.deletedAt)
        .map((origin) => origin.nombre)
        .sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' })),
    [taskOrigins],
  );

  const sortedHuelgas = useMemo(
    () => [...huelgas].sort((a, b) => b.fecha.localeCompare(a.fecha)),
    [huelgas],
  );

  const nextHuelga = useMemo(
    () =>
      huelgas
        .filter((huelga) => huelga.fecha >= todayIso())
        .sort((a, b) => a.fecha.localeCompare(b.fecha))[0] ?? null,
    [huelgas],
  );

  const remove = async (huelga: Huelga) => {
    const accepted = await confirm(
      `¿Eliminar la convocatoria del ${formatDate(huelga.fecha)}?`,
      { title: 'Eliminar huelga', confirmLabel: 'Eliminar', cancelLabel: 'Cancelar' },
    );
    if (!accepted) return;

    const next = huelgas.filter((item) => item.id !== huelga.id);
    const result = await writeJsonStorageAsync(STORAGE_KEY, next);
    if (!result.ok) {
      await alert(result.message || 'No se ha podido eliminar la huelga.', {
        title: 'Error de guardado',
        type: 'error',
      });
      return;
    }
    setHuelgas(next);
  };

  return {
    huelgas,
    sortedHuelgas,
    nextHuelga,
    puestoResponsables,
    zonas,
    areas,
    generatingCollectionForId,
    openZones,
    openNew,
    openEdit,
    openImport,
    openAssignments,
    openCollectionMails,
    remove,
    importTarget,
    importFileName,
    importPreview,
    importSkippedRows,
    importPlantillaStats,
    importError,
    importing,
    employeesLoading,
    employees,
    closeImport,
    selectImportFile,
    saveImportedPersonal,
    assignmentTarget,
    assignmentDraft,
    assignmentConfiguredCount,
    assignmentSearch,
    setAssignmentSearch,
    assignmentFilters,
    assignmentSort,
    filteredAssignmentDraft,
    assignmentPersonCounts,
    savingAssignments,
    personDetailAssignment,
    personDetailRows,
    personResidenceDrafts,
    setPersonResidenceDrafts,
    savingPersonId,
    closeAssignments,
    toggleAssignmentSort,
    updateAssignmentFilter,
    updateAssignmentResidence,
    updateAssignment,
    openPersonDetail,
    closePersonDetail,
    savePersonResidence,
    saveAssignments,
    zonesOpen,
    zoneDraft,
    areaDraft,
    newZoneName,
    setNewZoneName,
    newAreaName,
    setNewAreaName,
    newAreaZoneId,
    setNewAreaZoneId,
    savingZones,
    mailTemplateZone,
    setMailTemplateZoneId,
    closeZones,
    addZone,
    updateZone,
    addArea,
    updateArea,
    saveZones,
    mailTarget,
    mailGroups,
    mailPreviewZoneId,
    setMailPreviewZoneId,
    mailPreviewGroup,
    currentMailPreview,
    mailRecipientsByZone,
    updateMailRecipients,
    mailSpecificNotes,
    setMailSpecificNotes,
    closeCollectionMails,
    saveMailSpecificNotes,
    generateSingleCollectionMail,
    generateAllCollectionMails,
    editorOpen,
    editingId,
    draft,
    sindicatos,
    saving,
    setEditorOpen,
    setDraft,
    toggleSindicato,
    addTramo,
    updateTramo,
    removeTramo,
    save,
    dialogNode,
  };
}
