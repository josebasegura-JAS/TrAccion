import { useEffect, useMemo, useState } from 'react';
import { useAppDialog } from '../../../hooks/useAppDialog';
import { useConfiguracionStore } from '../../configuracion/store/useConfiguracionStore';
import { useEmployeeStore } from '../../plantilla/store/useEmployeeStore';
import { readJsonStorage, writeJsonStorageAsync } from '../../../services/persistence';
import { parseXlsxRows } from '../../../shared/import/xlsxParser';
import { parseHuelgaPersonalRows, type HuelgaPersonalTurno } from './huelgasPersonalImport';
import { enrichPersonalWithPlantilla, type HuelgaPersonalPlantillaStats } from './huelgasPersonalPlantilla';
import { buildCollectionGroups, type HuelgaCollectionGroup } from './huelgasCollectionExport';
import {
  DEFAULT_HUELGA_MAIL_BODY,
  DEFAULT_HUELGA_MAIL_SUBJECT,
  defaultDeadlineForZone,
  defaultMailEnabledForZone,
  renderHuelgaMailTemplate,
} from './huelgasMailTemplates';
import {
  applyZoneSnapshots,
  buildAsignacionesForPersonal,
  asignacionKey,
  isAsignacionCompleta,
  isHuelgaPuestoAsignaciones,
  mergeAsignacionesIntoMaster,
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
import { HuelgasOverview } from './HuelgasOverview';
import { HuelgaEditorModal } from './HuelgaEditorModal';
import { HuelgaImportModal } from './HuelgaImportModal';
import { HuelgasAssignmentModals } from './HuelgasAssignmentModals';
import { HuelgasZonesModals } from './HuelgasZonesModals';
import { HuelgasCollectionMailsModal } from './HuelgasCollectionMailsModal';
import {
  AREAS_STORAGE_KEY,
  EMPTY_ASSIGNMENT_FILTERS,
  EMPTY_DRAFT,
  PUESTO_RESPONSABLES_STORAGE_KEY,
  STORAGE_KEY,
  ZONAS_STORAGE_KEY,
  createId,
  employeeToDraft,
  isHuelgas,
  resolveResidenceOverride,
  sameNormalizedText,
  todayIso,
  validateDraft,
  type AssignmentFilters,
  type AssignmentSortDirection,
  type AssignmentSortKey,
  type Huelga,
  type HuelgaDraft,
} from './huelgasPageModel';

export function HuelgasPage() {
  const { alert, confirm, dialogNode } = useAppDialog();
  const taskOrigins = useConfiguracionStore((state) => state.taskOrigins);
  const loadConfiguracion = useConfiguracionStore((state) => state.load);
  const employees = useEmployeeStore((state) => state.employees);
  const loadEmployees = useEmployeeStore((state) => state.load);
  const employeesLoading = useEmployeeStore((state) => state.isLoading);
  const updateEmployeeWithConcurrencyCheck = useEmployeeStore((state) => state.updateWithConcurrencyCheck);
  const [huelgas, setHuelgas] = useState<Huelga[]>([]);
  const [draft, setDraft] = useState<HuelgaDraft>(EMPTY_DRAFT);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [importTargetId, setImportTargetId] = useState<string | null>(null);
  const [importFileName, setImportFileName] = useState('');
  const [importPreview, setImportPreview] = useState<HuelgaPersonalTurno[]>([]);
  const [importSkippedRows, setImportSkippedRows] = useState(0);
  const [importPlantillaStats, setImportPlantillaStats] = useState<HuelgaPersonalPlantillaStats | null>(null);
  const [importError, setImportError] = useState('');
  const [importing, setImporting] = useState(false);
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
  const [assignmentTargetId, setAssignmentTargetId] = useState<string | null>(null);
  const [assignmentDraft, setAssignmentDraft] = useState<HuelgaPuestoAsignacion[]>([]);
  const [assignmentSearch, setAssignmentSearch] = useState('');
  const [assignmentFilters, setAssignmentFilters] = useState<AssignmentFilters>(EMPTY_ASSIGNMENT_FILTERS);
  const [assignmentSort, setAssignmentSort] = useState<{ key: AssignmentSortKey; direction: AssignmentSortDirection }>({ key: 'residencia', direction: 'asc' });
  const [assignmentResidenceOverrides, setAssignmentResidenceOverrides] = useState<Record<string, string>>({});
  const [savingAssignments, setSavingAssignments] = useState(false);
  const [personDetailAssignment, setPersonDetailAssignment] = useState<HuelgaPuestoAsignacion | null>(null);
  const [personResidenceDrafts, setPersonResidenceDrafts] = useState<Record<string, string>>({});
  const [savingPersonId, setSavingPersonId] = useState<string | null>(null);
  const [generatingCollectionForId, setGeneratingCollectionForId] = useState<string | null>(null);
  const [mailTargetId, setMailTargetId] = useState<string | null>(null);
  const [mailSpecificNotes, setMailSpecificNotes] = useState<Record<string, string>>({});
  const [mailPreviewZoneId, setMailPreviewZoneId] = useState<string | null>(null);
  const [mailTemplateZoneId, setMailTemplateZoneId] = useState<string | null>(null);

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

  const openNew = () => {
    setEditingId(null);
    setDraft(EMPTY_DRAFT);
    setEditorOpen(true);
  };

  const openEdit = (huelga: Huelga) => {
    setEditingId(huelga.id);
    setDraft({
      fecha: huelga.fecha,
      sindicatos: [...huelga.sindicatos],
      tipo: huelga.tipo,
      tramos: huelga.tramos.map((tramo) => ({ ...tramo })),
      observaciones: huelga.observaciones,
    });
    setEditorOpen(true);
  };

  const toggleSindicato = (sindicato: string) => {
    setDraft((current) => ({
      ...current,
      sindicatos: current.sindicatos.includes(sindicato)
        ? current.sindicatos.filter((item) => item !== sindicato)
        : [...current.sindicatos, sindicato],
    }));
  };

  const addTramo = () => {
    setDraft((current) => ({
      ...current,
      tramos: [...current.tramos, { id: createId('tramo'), inicio: '', fin: '' }],
    }));
  };

  const updateTramo = (id: string, field: 'inicio' | 'fin', value: string) => {
    setDraft((current) => ({
      ...current,
      tramos: current.tramos.map((tramo) => (tramo.id === id ? { ...tramo, [field]: value } : tramo)),
    }));
  };

  const removeTramo = (id: string) => {
    setDraft((current) => ({ ...current, tramos: current.tramos.filter((tramo) => tramo.id !== id) }));
  };

  const save = async () => {
    const validation = validateDraft(draft);
    if (validation) {
      await alert(validation, { title: 'Revisa la convocatoria', type: 'warning' });
      return;
    }

    const now = new Date().toISOString();
    const current = editingId ? huelgas.find((item) => item.id === editingId) : null;
    const normalizedDraft: HuelgaDraft = {
      ...draft,
      sindicatos: [...draft.sindicatos].sort((a, b) => a.localeCompare(b, 'es')),
      tramos: draft.tipo === 'jornada-completa' ? [] : draft.tramos,
      observaciones: draft.observaciones.trim(),
    };
    const record: Huelga = {
      id: current?.id ?? createId('huelga'),
      ...normalizedDraft,
      createdAt: current?.createdAt ?? now,
      updatedAt: now,
      personalConTurno: current?.personalConTurno,
      personalImportadoAt: current?.personalImportadoAt ?? null,
      asignacionesPuesto: current?.asignacionesPuesto,
      instruccionesCorreoPorZona: current?.instruccionesCorreoPorZona,
    };
    const next = current
      ? huelgas.map((item) => (item.id === current.id ? record : item))
      : [...huelgas, record];

    setSaving(true);
    const result = await writeJsonStorageAsync(STORAGE_KEY, next);
    setSaving(false);
    if (!result.ok) {
      await alert(result.message || 'No se ha podido guardar la huelga.', { title: 'Error de guardado', type: 'error' });
      return;
    }

    setHuelgas(next);
    setEditorOpen(false);
  };

  const importTarget = importTargetId ? huelgas.find((item) => item.id === importTargetId) ?? null : null;

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
    setImportTargetId(null);
    setImportFileName('');
    setImportPreview([]);
    setImportSkippedRows(0);
    setImportPlantillaStats(null);
    setImportError('');
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
      await alert(result.message || 'No se ha podido guardar el personal importado.', { title: 'Error de guardado', type: 'error' });
      return;
    }

    setHuelgas(next);
    closeImport();
  };

  const assignmentTarget = assignmentTargetId
    ? huelgas.find((item) => item.id === assignmentTargetId) ?? null
    : null;

  const personDetailRows = useMemo(() => {
    if (!assignmentTarget || !personDetailAssignment) return [];
    const targetKey = asignacionKey(personDetailAssignment.residencia, personDetailAssignment.puesto);
    return (assignmentTarget.personalConTurno ?? []).filter((persona) => {
      const residenciaBase = (persona.residenciaAsignacion || persona.residenciaPlantilla || persona.residenciaEstacion || '').trim();
      const residencia = resolveResidenceOverride(assignmentResidenceOverrides, residenciaBase, persona.puesto);
      return asignacionKey(residencia, persona.puesto) === targetKey;
    });
  }, [assignmentResidenceOverrides, assignmentTarget, personDetailAssignment]);

  const assignmentPersonCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const persona of assignmentTarget?.personalConTurno ?? []) {
      const residenciaBase = (persona.residenciaAsignacion || persona.residenciaPlantilla || persona.residenciaEstacion || '').trim();
      const puesto = persona.puesto.trim();
      if (!residenciaBase || !puesto) continue;
      const residencia = resolveResidenceOverride(assignmentResidenceOverrides, residenciaBase, puesto);
      const key = asignacionKey(residencia, puesto);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [assignmentResidenceOverrides, assignmentTarget]);

  const filteredAssignmentDraft = useMemo(() => {
    const globalQuery = assignmentSearch.trim().toLocaleLowerCase('es-ES');
    const normalize = (value: string) => value.trim().toLocaleLowerCase('es-ES');
    const numericFilter = assignmentFilters.personas.trim();

    const filtered = assignmentDraft.filter((item) => {
      const complete = isAsignacionCompleta(item);
      const personCount = assignmentPersonCounts.get(asignacionKey(item.residencia, item.puesto)) ?? 0;
      const responsable = `${item.zonaResponsableNombre} ${item.zonaResponsableEmail}`.trim();
      const estado = complete ? 'configurado' : 'pendiente';
      const values = [item.residencia, item.puesto, item.area, item.zonaNombre, responsable, estado];
      if (globalQuery && !values.some((value) => normalize(value).includes(globalQuery))) return false;
      if (assignmentFilters.residencia && !normalize(item.residencia).includes(normalize(assignmentFilters.residencia))) return false;
      if (assignmentFilters.puesto && !normalize(item.puesto).includes(normalize(assignmentFilters.puesto))) return false;
      if (assignmentFilters.area && !normalize(item.area).includes(normalize(assignmentFilters.area))) return false;
      if (assignmentFilters.zona && !normalize(item.zonaNombre).includes(normalize(assignmentFilters.zona))) return false;
      if (assignmentFilters.responsable && !normalize(responsable).includes(normalize(assignmentFilters.responsable))) return false;
      if (assignmentFilters.estado && !estado.includes(normalize(assignmentFilters.estado))) return false;
      if (numericFilter && String(personCount) !== numericFilter) return false;
      return true;
    });

    const direction = assignmentSort.direction === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const aCount = assignmentPersonCounts.get(asignacionKey(a.residencia, a.puesto)) ?? 0;
      const bCount = assignmentPersonCounts.get(asignacionKey(b.residencia, b.puesto)) ?? 0;
      const aComplete = isAsignacionCompleta(a);
      const bComplete = isAsignacionCompleta(b);
      let comparison = 0;
      switch (assignmentSort.key) {
        case 'personas': comparison = aCount - bCount; break;
        case 'puesto': comparison = a.puesto.localeCompare(b.puesto, 'es', { sensitivity: 'base' }); break;
        case 'area': comparison = a.area.localeCompare(b.area, 'es', { sensitivity: 'base' }); break;
        case 'zona': comparison = a.zonaNombre.localeCompare(b.zonaNombre, 'es', { sensitivity: 'base' }); break;
        case 'responsable': comparison = a.zonaResponsableNombre.localeCompare(b.zonaResponsableNombre, 'es', { sensitivity: 'base' }); break;
        case 'estado': comparison = Number(aComplete) - Number(bComplete); break;
        case 'residencia':
        default: comparison = a.residencia.localeCompare(b.residencia, 'es', { sensitivity: 'base' }); break;
      }
      if (comparison === 0) comparison = a.puesto.localeCompare(b.puesto, 'es', { sensitivity: 'base' });
      return comparison * direction;
    });
  }, [assignmentDraft, assignmentFilters, assignmentPersonCounts, assignmentSearch, assignmentSort]);

  const assignmentConfiguredCount = useMemo(
    () => assignmentDraft.filter(isAsignacionCompleta).length,
    [assignmentDraft],
  );

  const openAssignments = (huelga: Huelga) => {
    if ((huelga.personalConTurno?.length ?? 0) === 0) return;
    setAssignmentTargetId(huelga.id);
    setAssignmentDraft(
      buildAsignacionesForPersonal(
        huelga.personalConTurno ?? [],
        huelga.asignacionesPuesto ?? [],
        puestoResponsables,
        zonas,
        areas,
      ),
    );
    setAssignmentSearch('');
    setAssignmentFilters(EMPTY_ASSIGNMENT_FILTERS);
    setAssignmentSort({ key: 'residencia', direction: 'asc' });
    setAssignmentResidenceOverrides({});
  };

  const closeAssignments = () => {
    if (savingAssignments) return;
    setAssignmentTargetId(null);
    setAssignmentDraft([]);
    setAssignmentSearch('');
    setAssignmentFilters(EMPTY_ASSIGNMENT_FILTERS);
    setAssignmentResidenceOverrides({});
  };

  const toggleAssignmentSort = (key: AssignmentSortKey) => {
    setAssignmentSort((current) => current.key === key
      ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
      : { key, direction: 'asc' });
  };

  const updateAssignmentFilter = (key: keyof AssignmentFilters, value: string) => {
    setAssignmentFilters((current) => ({ ...current, [key]: value }));
  };

  const updateAssignmentResidence = (residencia: string, puesto: string, value: string) => {
    const targetKey = asignacionKey(residencia, puesto);
    const nextResidencia = value;
    const now = new Date().toISOString();
    setAssignmentResidenceOverrides((current) => ({ ...current, [targetKey]: nextResidencia }));
    setAssignmentDraft((current) => current.map((item) =>
      asignacionKey(item.residencia, item.puesto) === targetKey
        ? { ...item, residencia: nextResidencia, updatedAt: now }
        : item,
    ));
  };

  const updateAssignment = (
    residencia: string,
    puesto: string,
    field: 'areaId' | 'zonaId',
    value: string,
  ) => {
    const targetKey = asignacionKey(residencia, puesto);
    const target = assignmentDraft.find(
      (item) => asignacionKey(item.residencia, item.puesto) === targetKey,
    );
    if (!target) return;
    const now = new Date().toISOString();

    if (field === 'zonaId') {
      const zone = zonas.find((item) => item.id === value);
      const currentArea = target.areaId ? areas.find((item) => item.id === target.areaId) : undefined;
      const areaStillValid = Boolean(currentArea && currentArea.zonaId === value && currentArea.active);
      setAssignmentDraft((current) =>
        current.map((item) =>
          asignacionKey(item.residencia, item.puesto) === targetKey
            ? {
                ...item,
                zonaId: zone?.id ?? '',
                zonaNombre: zone?.nombre ?? '',
                zonaResponsableNombre: zone?.responsableNombre ?? '',
                zonaResponsableEmail: zone?.responsableEmail ?? '',
                areaId: areaStillValid ? item.areaId : '',
                area: areaStillValid ? item.area : '',
                updatedAt: now,
              }
            : item,
        ),
      );
      return;
    }

    const area = areas.find((item) => item.id === value);
    if (!area || area.zonaId !== target.zonaId) return;
    setAssignmentDraft((current) =>
      current.map((item) =>
        asignacionKey(item.residencia, item.puesto) === targetKey
          ? { ...item, areaId: area.id, area: area.nombre, updatedAt: now }
          : item,
      ),
    );
  };

  const openPersonDetail = (assignment: HuelgaPuestoAsignacion) => {
    setPersonDetailAssignment(assignment);
    const targetKey = asignacionKey(assignment.residencia, assignment.puesto);
    const drafts: Record<string, string> = {};
    for (const persona of assignmentTarget?.personalConTurno ?? []) {
      const residenciaBase = (persona.residenciaAsignacion || persona.residenciaPlantilla || persona.residenciaEstacion || '').trim();
      const residencia = resolveResidenceOverride(assignmentResidenceOverrides, residenciaBase, persona.puesto);
      if (asignacionKey(residencia, persona.puesto) === targetKey) {
        drafts[persona.id] = persona.residenciaAsignacion || persona.residenciaPlantilla || persona.residenciaEstacion || '';
      }
    }
    setPersonResidenceDrafts(drafts);
  };

  const closePersonDetail = () => {
    if (savingPersonId) return;
    setPersonDetailAssignment(null);
    setPersonResidenceDrafts({});
  };

  const savePersonResidence = async (persona: HuelgaPersonalTurno) => {
    if (!assignmentTarget) return;
    const nextResidence = (personResidenceDrafts[persona.id] ?? '').trim();
    if (!nextResidence) {
      await alert('La residencia no puede quedar vacía.', { title: 'Revisa la residencia', type: 'warning' });
      return;
    }
    if (!persona.empleado) {
      await alert(
        'Esta persona no está vinculada de forma única con la Plantilla. Revisa primero su identificación antes de modificar el maestro.',
        { title: 'Persona no identificada', type: 'warning' },
      );
      return;
    }
    const employee = employees.find((item) => item.empleado === persona.empleado && !item.deletedAt);
    if (!employee) {
      await alert('No se encuentra esta persona activa en Plantilla. Recarga la información y vuelve a intentarlo.', {
        title: 'Persona no encontrada',
        type: 'warning',
      });
      return;
    }
    if (sameNormalizedText(employee.residencia, nextResidence)) {
      await alert('La residencia indicada ya coincide con la guardada en Plantilla.', { title: 'Sin cambios', type: 'info' });
      return;
    }

    const accepted = await confirm(
      `Vas a cambiar la residencia de ${employee.nombreApellidos} de “${employee.residencia || 'Sin residencia'}” a “${nextResidence}”. Este cambio actualizará también la Plantilla y se utilizará en futuras huelgas. ¿Deseas continuar?`,
      { title: 'Actualizar residencia en Plantilla', confirmLabel: 'Actualizar residencia', cancelLabel: 'Cancelar' },
    );
    if (!accepted) return;

    setSavingPersonId(persona.id);
    const employeeDraft = { ...employeeToDraft(employee), residencia: nextResidence };
    const employeeResult = await updateEmployeeWithConcurrencyCheck(
      employee.empleado,
      employeeDraft,
      JSON.stringify(employee),
    );
    if (!employeeResult.ok) {
      setSavingPersonId(null);
      await alert(employeeResult.message || 'No se ha podido actualizar la residencia en Plantilla.', {
        title: 'Error al actualizar Plantilla',
        type: 'error',
      });
      return;
    }

    const now = new Date().toISOString();
    const updatedPersonal = (assignmentTarget.personalConTurno ?? []).map((item) => {
      if (item.id !== persona.id) return item;
      const residenciaExcel = item.residenciaExcel || item.residenciaEstacion || '';
      return {
        ...item,
        residenciaPlantillaAnterior: item.residenciaPlantilla || employee.residencia || '',
        residenciaPlantilla: nextResidence,
        residenciaAsignacion: nextResidence,
        residenciaCorregidaAt: now,
        plantillaMatch: 'matched' as const,
        residenciaDiscrepante: Boolean(residenciaExcel) && !sameNormalizedText(residenciaExcel, nextResidence),
      };
    });
    const rebuiltAssignments = buildAsignacionesForPersonal(
      updatedPersonal,
      assignmentDraft,
      puestoResponsables,
      zonas,
      areas,
    );
    const nextHuelgas = huelgas.map((item) =>
      item.id === assignmentTarget.id
        ? { ...item, personalConTurno: updatedPersonal, asignacionesPuesto: rebuiltAssignments, updatedAt: now }
        : item,
    );
    const huelgaResult = await writeJsonStorageAsync(STORAGE_KEY, nextHuelgas);
    setSavingPersonId(null);
    if (!huelgaResult.ok) {
      await alert(
        `${huelgaResult.message || 'No se ha podido guardar la corrección en la huelga.'} La residencia sí se ha actualizado en Plantilla.`,
        { title: 'Guardado parcial', type: 'warning' },
      );
      return;
    }

    setHuelgas(nextHuelgas);
    setAssignmentDraft(rebuiltAssignments);
    setAssignmentResidenceOverrides({});
    setPersonDetailAssignment((current) => {
      if (!current) return null;
      return rebuiltAssignments.find((item) => asignacionKey(item.residencia, item.puesto) === asignacionKey(nextResidence, persona.puesto)) ?? null;
    });
    setPersonResidenceDrafts((current) => ({ ...current, [persona.id]: nextResidence }));
  };

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

  const updateZone = (id: string, field: 'nombre' | 'responsableNombre' | 'responsableEmail' | 'correoActivo' | 'correoAsunto' | 'correoCuerpoHtml' | 'correoPlazos' | 'correoInstruccionesHabituales' | 'active', value: string | boolean) => {
    setZoneDraft((current) => current.map((zona) => zona.id === id ? { ...zona, [field]: value, updatedAt: new Date().toISOString() } : zona));
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
      await alert(zoneResult.message || 'No se ha podido guardar el maestro de zonas.', { title: 'Error de guardado', type: 'error' });
      return;
    }
    const areaResult = await writeJsonStorageAsync(AREAS_STORAGE_KEY, normalizedAreas);
    setSavingZones(false);
    if (!areaResult.ok) {
      await alert(areaResult.message || 'No se ha podido guardar el maestro de áreas.', { title: 'Error de guardado', type: 'error' });
      return;
    }

    setZonas(normalizedZones);
    setAreas(normalizedAreas);
    setAssignmentDraft((current) =>
      applyZoneSnapshots(
        current.map((assignment) => {
          const masterArea = assignment.areaId
            ? normalizedAreas.find((area) => area.id === assignment.areaId)
            : undefined;
          return masterArea
            ? {
                ...assignment,
                area: masterArea.nombre,
                zonaId: masterArea.zonaId,
              }
            : assignment;
        }),
        normalizedZones,
      ),
    );
    closeZones();
  };

  const saveAssignments = async () => {
    if (!assignmentTarget) return;

    const normalized = applyZoneSnapshots(assignmentDraft.map((item) => {
      const masterArea = item.areaId ? areas.find((area) => area.id === item.areaId) : undefined;
      return {
        ...item,
        areaId: masterArea?.id ?? '',
        area: masterArea?.nombre ?? '',
        zonaId: masterArea?.zonaId ?? item.zonaId,
        updatedAt: new Date().toISOString(),
      };
    }), zonas);
    const seenAssignmentKeys = new Set<string>();
    for (const item of normalized) {
      if (!item.residencia.trim()) {
        await alert(`El puesto “${item.puesto}” no puede quedarse sin residencia.`, { title: 'Revisa la residencia', type: 'warning' });
        return;
      }
      const key = asignacionKey(item.residencia, item.puesto);
      if (seenAssignmentKeys.has(key)) {
        await alert(`La combinación “${item.residencia} · ${item.puesto}” está duplicada. Revisa la corrección de residencia.`, { title: 'Combinación duplicada', type: 'warning' });
        return;
      }
      seenAssignmentKeys.add(key);
    }
    const nextMaster = mergeAsignacionesIntoMaster(puestoResponsables, normalized);
    const now = new Date().toISOString();
    const nextHuelgas = huelgas.map((item) => {
      if (item.id !== assignmentTarget.id) return item;
      const personalConTurno = (item.personalConTurno ?? []).map((persona) => {
        const residenciaBase = (persona.residenciaAsignacion || persona.residenciaPlantilla || persona.residenciaEstacion || '').trim();
        const residenciaCorregida = resolveResidenceOverride(assignmentResidenceOverrides, residenciaBase, persona.puesto);
        return residenciaCorregida && residenciaCorregida !== residenciaBase
          ? { ...persona, residenciaAsignacion: residenciaCorregida }
          : persona;
      });
      return { ...item, personalConTurno, asignacionesPuesto: normalized, updatedAt: now };
    });

    setSavingAssignments(true);
    const masterResult = await writeJsonStorageAsync(PUESTO_RESPONSABLES_STORAGE_KEY, nextMaster);
    if (!masterResult.ok) {
      setSavingAssignments(false);
      await alert(masterResult.message || 'No se ha podido guardar el maestro de áreas y zonas.', {
        title: 'Error de guardado',
        type: 'error',
      });
      return;
    }

    const huelgaResult = await writeJsonStorageAsync(STORAGE_KEY, nextHuelgas);
    setSavingAssignments(false);
    if (!huelgaResult.ok) {
      await alert(huelgaResult.message || 'El maestro se ha actualizado, pero no se ha podido guardar la copia de esta huelga.', {
        title: 'Guardado incompleto',
        type: 'warning',
      });
      setPuestoResponsables(nextMaster);
      return;
    }

    setPuestoResponsables(nextMaster);
    setHuelgas(nextHuelgas);
    setAssignmentDraft(normalized);
    setAssignmentResidenceOverrides({});
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
      await alert(result.message || 'No se ha podido eliminar la huelga.', { title: 'Error de guardado', type: 'error' });
      return;
    }
    setHuelgas(next);
  };

  const currentMailPreview = mailPreviewGroup ? renderGroupMail(mailPreviewGroup) : null;

  return (
    <div className="ui3-huelgas space-y-3">
      <HuelgasOverview
        huelgas={huelgas}
        sortedHuelgas={sortedHuelgas}
        nextHuelga={nextHuelga ?? null}
        puestoResponsables={puestoResponsables}
        zonas={zonas}
        areas={areas}
        generatingCollectionForId={generatingCollectionForId}
        onOpenZones={openZones}
        onOpenNew={openNew}
        onOpenEdit={openEdit}
        onOpenImport={openImport}
        onOpenAssignments={openAssignments}
        onOpenCollectionMails={(huelga) => void openCollectionMails(huelga)}
        onRemove={(huelga) => void remove(huelga)}
      />

      <HuelgaImportModal
        importTarget={importTarget}
        importFileName={importFileName}
        importPreview={importPreview}
        importSkippedRows={importSkippedRows}
        importPlantillaStats={importPlantillaStats}
        importError={importError}
        importing={importing}
        employeesLoading={employeesLoading}
        employees={employees}
        onClose={closeImport}
        onSelectFile={(file) => void selectImportFile(file)}
        onSave={() => void saveImportedPersonal()}
      />      <HuelgasAssignmentModals
        assignmentTarget={assignmentTarget}
        assignmentDraft={assignmentDraft}
        assignmentConfiguredCount={assignmentConfiguredCount}
        assignmentSearch={assignmentSearch}
        setAssignmentSearch={setAssignmentSearch}
        assignmentFilters={assignmentFilters}
        assignmentSort={assignmentSort}
        filteredAssignmentDraft={filteredAssignmentDraft}
        assignmentPersonCounts={assignmentPersonCounts}
        zonas={zonas}
        areas={areas}
        savingAssignments={savingAssignments}
        personDetailAssignment={personDetailAssignment}
        personDetailRows={personDetailRows}
        employees={employees}
        personResidenceDrafts={personResidenceDrafts}
        setPersonResidenceDrafts={setPersonResidenceDrafts}
        savingPersonId={savingPersonId}
        onOpenZones={openZones}
        onCloseAssignments={closeAssignments}
        onToggleAssignmentSort={toggleAssignmentSort}
        onUpdateAssignmentFilter={updateAssignmentFilter}
        onUpdateAssignmentResidence={updateAssignmentResidence}
        onUpdateAssignment={updateAssignment}
        onOpenPersonDetail={openPersonDetail}
        onClosePersonDetail={closePersonDetail}
        onSavePersonResidence={(persona) => void savePersonResidence(persona)}
        onSaveAssignments={() => void saveAssignments()}
      />

      <HuelgasZonesModals
        zonesOpen={zonesOpen}
        zoneDraft={zoneDraft}
        areaDraft={areaDraft}
        newZoneName={newZoneName}
        setNewZoneName={setNewZoneName}
        newAreaName={newAreaName}
        setNewAreaName={setNewAreaName}
        newAreaZoneId={newAreaZoneId}
        setNewAreaZoneId={setNewAreaZoneId}
        savingZones={savingZones}
        mailTemplateZone={mailTemplateZone}
        setMailTemplateZoneId={setMailTemplateZoneId}
        onCloseZones={closeZones}
        onAddZone={addZone}
        onUpdateZone={updateZone}
        onAddArea={addArea}
        onUpdateArea={updateArea}
        onSaveZones={() => void saveZones()}
      />

      <HuelgasCollectionMailsModal
        mailTarget={mailTarget}
        mailGroups={mailGroups}
        zonas={zonas}
        mailPreviewZoneId={mailPreviewZoneId}
        setMailPreviewZoneId={setMailPreviewZoneId}
        mailPreviewGroup={mailPreviewGroup}
        currentMailPreview={currentMailPreview}
        mailSpecificNotes={mailSpecificNotes}
        setMailSpecificNotes={setMailSpecificNotes}
        generatingCollectionForId={generatingCollectionForId}
        onClose={closeCollectionMails}
        onSaveSpecificNotes={() => void saveMailSpecificNotes()}
        onGenerateSingle={(group) => void generateSingleCollectionMail(group)}
        onGenerateAll={() => void generateAllCollectionMails()}
      />

      <HuelgaEditorModal
        open={editorOpen}
        editingId={editingId}
        draft={draft}
        sindicatos={sindicatos}
        saving={saving}
        onClose={() => setEditorOpen(false)}
        onDraftChange={setDraft}
        onToggleSindicato={toggleSindicato}
        onAddTramo={addTramo}
        onUpdateTramo={updateTramo}
        onRemoveTramo={removeTramo}
        onSave={() => void save()}
      />

      {dialogNode}
    </div>
  );
}
