import { useEffect, useMemo, useState } from 'react';
import { useAppDialog } from '../../../hooks/useAppDialog';
import { useConfiguracionStore } from '../../configuracion/store/useConfiguracionStore';
import { useEmployeeStore } from '../../plantilla/store/useEmployeeStore';
import { readJsonStorage, writeJsonStorageAsync } from '../../../services/persistence';
import { buildCollectionGroups, type HuelgaCollectionGroup } from './huelgasCollectionExport';
import {
  DEFAULT_HUELGA_MAIL_BODY,
  DEFAULT_HUELGA_MAIL_SUBJECT,
  defaultDeadlineForZone,
  defaultMailEnabledForZone,
  renderHuelgaMailTemplate,
} from './huelgasMailTemplates';
import {
  buildAsignacionesForPersonal,
  isAsignacionCompleta,
  isHuelgaPuestoAsignaciones,
  type HuelgaPuestoAsignacion,
} from './huelgasAssignments';
import {
  createZonaId,
  ensureDefaultZonas,
  isHuelgaZonas,
  type HuelgaZona,
} from './huelgasZones';
import {
  createAreaId,
  isHuelgaAreas,
  mergeLegacyAreas,
  type HuelgaArea,
} from './huelgasAreas';
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
import { useHuelgaEditor } from './useHuelgaEditor';
import { useHuelgaPersonalImport } from './useHuelgaPersonalImport';

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
  const [zonesOpen, setZonesOpen] = useState(false);
  const [zoneDraft, setZoneDraft] = useState<HuelgaZona[]>([]);
  const [areaDraft, setAreaDraft] = useState<HuelgaArea[]>([]);
  const [newZoneName, setNewZoneName] = useState('');
  const [newAreaName, setNewAreaName] = useState('');
  const [newAreaZoneId, setNewAreaZoneId] = useState('');
  const [savingZones, setSavingZones] = useState(false);
  const [generatingCollectionForId, setGeneratingCollectionForId] = useState<string | null>(null);
  const [mailTargetId, setMailTargetId] = useState<string | null>(null);
  const [mailSpecificNotes, setMailSpecificNotes] = useState<Record<string, string>>({});
  const [mailPreviewZoneId, setMailPreviewZoneId] = useState<string | null>(null);
  const [mailTemplateZoneId, setMailTemplateZoneId] = useState<string | null>(null);

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
  } = useHuelgaEditor({ alert, huelgas, setHuelgas });

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

  const openZones = () => {
    setZoneDraft(ensureDefaultZonas(zonas));
    setAreaDraft(areas);
    setNewZoneName('');
    setNewAreaName('');
    setNewAreaZoneId(zonas.find((zona) => zona.active)?.id ?? '');
    setZonesOpen(true);
  };

  const closeZones = () => {
    if (savingZones) return;
    setZonesOpen(false);
    setZoneDraft([]);
    setAreaDraft([]);
    setNewZoneName('');
    setNewAreaName('');
    setNewAreaZoneId('');
  };

  const addZone = () => {
    const nombre = newZoneName.trim();
    if (!nombre) return;
    if (zoneDraft.some((zona) => zona.nombre.localeCompare(nombre, 'es', { sensitivity: 'base' }) === 0)) return;
    const now = new Date().toISOString();
    setZoneDraft((current) => [...current, {
      id: createZonaId(), nombre, responsableNombre: '', responsableEmail: '',
      correoActivo: defaultMailEnabledForZone(nombre), correoAsunto: DEFAULT_HUELGA_MAIL_SUBJECT,
      correoCuerpoHtml: DEFAULT_HUELGA_MAIL_BODY, correoPlazos: defaultDeadlineForZone(nombre),
      correoInstruccionesHabituales: '', active: true, createdAt: now, updatedAt: now,
    }].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' })));
    setNewZoneName('');
  };

  const updateZone = (
    id: string,
    field: 'nombre' | 'responsableNombre' | 'responsableEmail' | 'correoActivo' | 'correoAsunto' | 'correoCuerpoHtml' | 'correoPlazos' | 'correoInstruccionesHabituales' | 'active',
    value: string | boolean,
  ) => {
    setZoneDraft((current) => current.map((zona) =>
      zona.id === id ? { ...zona, [field]: value, updatedAt: new Date().toISOString() } : zona,
    ));
  };

  const addArea = () => {
    const nombre = newAreaName.trim();
    if (!nombre || !newAreaZoneId) return;
    const duplicated = areaDraft.some(
      (area) =>
        area.zonaId === newAreaZoneId &&
        area.nombre.localeCompare(nombre, 'es', { sensitivity: 'base' }) === 0,
    );
    if (duplicated) return;
    const now = new Date().toISOString();
    setAreaDraft((current) =>
      [...current, {
        id: createAreaId(),
        nombre,
        zonaId: newAreaZoneId,
        active: true,
        createdAt: now,
        updatedAt: now,
      }].sort((a, b) => {
        const zoneOrder = a.zonaId.localeCompare(b.zonaId, 'es', { sensitivity: 'base' });
        return zoneOrder || a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' });
      }),
    );
    setNewAreaName('');
  };

  const updateArea = (
    id: string,
    field: 'nombre' | 'zonaId' | 'active',
    value: string | boolean,
  ) => {
    setAreaDraft((current) =>
      current.map((area) =>
        area.id === id ? { ...area, [field]: value, updatedAt: new Date().toISOString() } : area,
      ),
    );
  };

  const saveZones = async () => {
    const normalizedZones = zoneDraft.map((zona) => ({
      ...zona,
      nombre: zona.nombre.trim(),
      responsableNombre: zona.responsableNombre.trim(),
      responsableEmail: zona.responsableEmail.trim(),
      correoAsunto: zona.correoAsunto.trim(),
      correoPlazos: zona.correoPlazos.trim(),
      correoInstruccionesHabituales: zona.correoInstruccionesHabituales.trim(),
    }));
    if (normalizedZones.some((zona) => !zona.nombre)) {
      await alert('Todas las zonas deben tener un nombre.', { title: 'Revisa las zonas', type: 'warning' });
      return;
    }
    const zoneNames = new Set<string>();
    for (const zona of normalizedZones) {
      const key = zona.nombre.toLocaleLowerCase('es-ES');
      if (zoneNames.has(key)) {
        await alert(`La zona “${zona.nombre}” está duplicada.`, { title: 'Revisa las zonas', type: 'warning' });
        return;
      }
      zoneNames.add(key);
    }

    const normalizedAreas = areaDraft.map((area) => ({ ...area, nombre: area.nombre.trim() }));
    if (normalizedAreas.some((area) => !area.nombre || !area.zonaId)) {
      await alert('Todas las áreas deben tener nombre y una zona asignada.', { title: 'Revisa las áreas', type: 'warning' });
      return;
    }
    const areaNames = new Set<string>();
    for (const area of normalizedAreas) {
      const key = `${area.zonaId}::${area.nombre.toLocaleLowerCase('es-ES')}`;
      if (areaNames.has(key)) {
        await alert(`El área “${area.nombre}” está duplicada dentro de la misma zona.`, { title: 'Revisa las áreas', type: 'warning' });
        return;
      }
      areaNames.add(key);
    }

    setSavingZones(true);
    const zoneResult = await writeJsonStorageAsync(ZONAS_STORAGE_KEY, normalizedZones);
    if (!zoneResult.ok) {
      setSavingZones(false);
      await alert(zoneResult.message || 'No se ha podido guardar el maestro de zonas.', {
        title: 'Error de guardado',
        type: 'error',
      });
      return;
    }
    const areaResult = await writeJsonStorageAsync(AREAS_STORAGE_KEY, normalizedAreas);
    setSavingZones(false);
    if (!areaResult.ok) {
      await alert(areaResult.message || 'No se ha podido guardar el maestro de áreas.', {
        title: 'Error de guardado',
        type: 'error',
      });
      return;
    }

    setZonas(normalizedZones);
    setAreas(normalizedAreas);
    syncAssignmentsWithMasters(normalizedZones, normalizedAreas);
    closeZones();
  };

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

  const currentMailPreview = mailPreviewGroup ? renderGroupMail(mailPreviewGroup) : null;

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
