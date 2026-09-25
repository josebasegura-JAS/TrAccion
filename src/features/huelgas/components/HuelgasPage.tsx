import { useEffect, useMemo, useState } from 'react';
import { FileSpreadsheet, MailPlus, Plus, Search } from 'lucide-react';
import { ActionButton } from '../../../components/ui/ActionButton';
import { RichTextEditor } from '../../../components/ui/RichTextEditor';
import { useAppDialog } from '../../../hooks/useAppDialog';
import { useConfiguracionStore } from '../../configuracion/store/useConfiguracionStore';
import { useEmployeeStore } from '../../plantilla/store/useEmployeeStore';
import type { Employee } from '../../plantilla/domain/employee';
import { readJsonStorage, writeJsonStorageAsync } from '../../../services/persistence';
import { parseXlsxRows } from '../../../shared/import/xlsxParser';
import { parseHuelgaPersonalRows, type HuelgaPersonalTurno } from './huelgasPersonalImport';
import { enrichPersonalWithPlantilla, type HuelgaPersonalPlantillaStats } from './huelgasPersonalPlantilla';
import { buildCollectionGroups, type HuelgaCollectionGroup } from './huelgasCollectionExport';
import {
  HUELGA_MAIL_MARKERS,
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
  isZonaCompleta,
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

      {importTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4" role="presentation">
          <section className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-metro-border bg-metro-app shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="huelga-import-title">
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-metro-border bg-metro-app/95 px-5 py-4 backdrop-blur">
              <div>
                <h2 id="huelga-import-title" className="text-lg font-semibold text-metro-text">Importar personal con turno</h2>
                <p className="mt-1 text-sm text-metro-muted">{formatDate(importTarget.fecha)} · Personal trabajador previsto para ese día de huelga.</p>
              </div>
              <button className="rounded-lg px-2 py-1 text-xl text-metro-muted hover:bg-metro-raised hover:text-metro-text" onClick={closeImport} type="button" aria-label="Cerrar">×</button>
            </div>

            <div className="space-y-4 p-5">
              <section className="rounded-xl border border-metro-border bg-metro-panel/60 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-300"><FileSpreadsheet size={20} /></div>
                    <div>
                      <p className="text-sm font-semibold text-metro-text">Excel de personal por día</p>
                      <p className="mt-1 text-xs text-metro-muted">Columnas esperadas: Resi./Estac., Inicio, Salida, Entrada, Fin, Nombre y Apellidos, Puesto y Turno. La residencia se contrastará con la Plantilla de TrAcción.</p>
                    </div>
                  </div>
                  <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-metro-border bg-metro-panel px-3.5 text-sm font-semibold text-metro-text transition hover:border-metro-red hover:bg-metro-raised">
                    <FileSpreadsheet size={16} /> Seleccionar Excel
                    <input className="sr-only" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={employeesLoading} onChange={(event) => void selectImportFile(event.target.files?.[0] ?? null)} />
                  </label>
                </div>
                {importFileName && <p className="mt-3 text-xs text-metro-muted">Archivo: <span className="font-medium text-metro-text">{importFileName}</span></p>}
                {employeesLoading && <p className="mt-3 text-xs text-amber-200">Cargando Plantilla para poder contrastar la residencia…</p>}
                {!employeesLoading && employees.length === 0 && (
                  <p className="mt-3 text-xs text-amber-200">No hay personas disponibles en Plantilla. Podrás importar, pero la residencia se tomará provisionalmente del Excel y quedará pendiente de contraste.</p>
                )}
              </section>

              {importError && <div className="rounded-xl border border-red-500/40 bg-red-950/25 px-4 py-3 text-sm text-red-200">{importError}</div>}

              {importPreview.length > 0 && (
                <>
                  <div className="grid gap-3 sm:grid-cols-4">
                    <div className="rounded-xl border border-metro-border bg-metro-panel/55 p-3"><p className="text-xs text-metro-muted">Personas detectadas</p><strong className="mt-1 block text-xl text-metro-text">{importPreview.length}</strong></div>
                    <div className="rounded-xl border border-metro-border bg-metro-panel/55 p-3"><p className="text-xs text-metro-muted">Filas omitidas</p><strong className="mt-1 block text-xl text-metro-text">{importSkippedRows}</strong></div>
                    <div className="rounded-xl border border-metro-border bg-metro-panel/55 p-3"><p className="text-xs text-metro-muted">Actualmente importadas</p><strong className="mt-1 block text-xl text-metro-text">{importTarget.personalConTurno?.length ?? 0}</strong></div>
                  </div>

                  {importPlantillaStats && (
                    <section className="rounded-xl border border-metro-border bg-metro-panel/45 p-4">
                      <div className="mb-3">
                        <p className="text-sm font-semibold text-metro-text">Contraste con Plantilla</p>
                        <p className="mt-1 text-xs text-metro-muted">La residencia usada para asignar responsables será la de Plantilla cuando exista una coincidencia única.</p>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-5">
                        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2"><p className="text-[11px] text-emerald-200/80">Encontradas</p><strong className="text-lg text-emerald-200">{importPlantillaStats.encontrados}</strong></div>
                        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2"><p className="text-[11px] text-amber-200/80">No encontradas</p><strong className="text-lg text-amber-200">{importPlantillaStats.noEncontrados}</strong></div>
                        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2"><p className="text-[11px] text-amber-200/80">Ambiguas</p><strong className="text-lg text-amber-200">{importPlantillaStats.ambiguos}</strong></div>
                        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2"><p className="text-[11px] text-amber-200/80">Sin residencia</p><strong className="text-lg text-amber-200">{importPlantillaStats.sinResidenciaPlantilla}</strong></div>
                        <div className="rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-2"><p className="text-[11px] text-sky-200/80">Residencia distinta</p><strong className="text-lg text-sky-200">{importPlantillaStats.residenciaDiscrepante}</strong></div>
                      </div>
                    </section>
                  )}

                  <div className="overflow-hidden rounded-xl border border-metro-border">
                    <div className="border-b border-metro-border bg-metro-raised/60 px-4 py-2.5"><p className="text-xs font-semibold uppercase tracking-wide text-metro-muted">Vista previa · primeras {Math.min(importPreview.length, 8)} personas</p></div>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[980px] text-left text-xs">
                        <thead className="bg-metro-panel text-metro-muted"><tr><th className="px-3 py-2">Nombre y apellidos</th><th className="px-3 py-2">Residencia Plantilla</th><th className="px-3 py-2">Resi./Estac. Excel</th><th className="px-3 py-2">Contraste</th><th className="px-3 py-2">Horario</th><th className="px-3 py-2">Puesto</th><th className="px-3 py-2">Turno</th></tr></thead>
                        <tbody className="divide-y divide-metro-border">
                          {importPreview.slice(0, 8).map((persona) => (
                            <tr key={persona.id}>
                              <td className="px-3 py-2 font-medium text-metro-text">{persona.nombreApellidos}</td>
                              <td className="px-3 py-2 font-medium text-metro-text">{persona.residenciaPlantilla || persona.residenciaAsignacion || '—'}</td>
                              <td className="px-3 py-2 text-metro-muted">{persona.residenciaExcel || persona.residenciaEstacion || '—'}</td>
                              <td className="px-3 py-2">
                                {persona.plantillaMatch === 'matched' ? (
                                  <span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-semibold ${persona.residenciaDiscrepante ? 'border-sky-500/35 bg-sky-500/10 text-sky-200' : 'border-emerald-500/35 bg-emerald-500/10 text-emerald-200'}`}>{persona.residenciaDiscrepante ? 'Coincide · residencia distinta' : 'Encontrada'}</span>
                                ) : persona.plantillaMatch === 'ambiguous' ? (
                                  <span className="inline-flex rounded-full border border-amber-500/35 bg-amber-500/10 px-2 py-1 text-[10px] font-semibold text-amber-200">Ambigua</span>
                                ) : persona.plantillaMatch === 'no-residence' ? (
                                  <span className="inline-flex rounded-full border border-amber-500/35 bg-amber-500/10 px-2 py-1 text-[10px] font-semibold text-amber-200">Sin residencia</span>
                                ) : (
                                  <span className="inline-flex rounded-full border border-amber-500/35 bg-amber-500/10 px-2 py-1 text-[10px] font-semibold text-amber-200">No encontrada</span>
                                )}
                              </td>
                              <td className="whitespace-nowrap px-3 py-2 text-metro-muted">{persona.inicio || '—'}–{persona.fin || '—'}{persona.salida || persona.entrada ? ` · ${persona.salida || '—'} / ${persona.entrada || '—'}` : ''}</td>
                              <td className="px-3 py-2 text-metro-muted">{persona.puesto || '—'}</td>
                              <td className="px-3 py-2 text-metro-muted">{persona.turno || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="sticky bottom-0 flex justify-end gap-2 border-t border-metro-border bg-metro-app/95 px-5 py-4 backdrop-blur">
              <ActionButton variant="secondary" iconOnly={false} onClick={closeImport}>Cancelar</ActionButton>
              <ActionButton variant="import" iconOnly={false} loading={importing} disabled={importPreview.length === 0} onClick={() => void saveImportedPersonal()}>
                Importar {importPreview.length > 0 ? `${importPreview.length} personas` : 'personal'}
              </ActionButton>
            </div>
          </section>
        </div>
      )}

      {assignmentTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4" role="presentation">
          <section className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-metro-border bg-metro-app shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="huelga-assignment-title">
            <div className="flex items-start justify-between gap-4 border-b border-metro-border px-5 py-4">
              <div>
                <h2 id="huelga-assignment-title" className="text-lg font-semibold text-metro-text">Asignación de áreas y zonas</h2>
                <p className="mt-1 text-sm text-metro-muted">
                  {formatDate(assignmentTarget.fecha)} · Define o corrige la residencia y asigna primero la zona; después selecciona una de las áreas disponibles en esa zona. El responsable y email se gestionan a nivel de zona.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <ActionButton variant="secondary" size="sm" iconOnly={false} icon={MapPinned} onClick={openZones}>Gestionar zonas y áreas</ActionButton>
                <button className="rounded-lg px-2 py-1 text-xl text-metro-muted hover:bg-metro-raised hover:text-metro-text" onClick={closeAssignments} type="button" aria-label="Cerrar">×</button>
              </div>
            </div>

            <div className="space-y-4 overflow-y-auto p-5">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-metro-border bg-metro-panel/55 p-3">
                  <p className="text-xs text-metro-muted">Residencia + puesto</p>
                  <strong className="mt-1 block text-xl text-metro-text">{assignmentDraft.length}</strong>
                </div>
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3">
                  <p className="text-xs text-emerald-200/80">Configurados</p>
                  <strong className="mt-1 block text-xl text-emerald-200">{assignmentConfiguredCount}</strong>
                </div>
                <div className={`rounded-xl border p-3 ${assignmentConfiguredCount === assignmentDraft.length ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-amber-500/30 bg-amber-500/10'}`}>
                  <p className={`text-xs ${assignmentConfiguredCount === assignmentDraft.length ? 'text-emerald-200/80' : 'text-amber-200/80'}`}>Pendientes</p>
                  <strong className={`mt-1 block text-xl ${assignmentConfiguredCount === assignmentDraft.length ? 'text-emerald-200' : 'text-amber-200'}`}>{assignmentDraft.length - assignmentConfiguredCount}</strong>
                </div>
              </div>

              <section className="rounded-xl border border-metro-border bg-metro-panel/55 p-4">
                <div className="flex items-start gap-3">
                  <Settings2 className="mt-0.5 shrink-0 text-metro-red" size={19} />
                  <div>
                    <p className="text-sm font-semibold text-metro-text">Configuración reutilizable</p>
                    <p className="mt-1 text-xs leading-5 text-metro-muted">
                      La relación residencia + puesto → área → zona se reutilizará automáticamente en futuras huelgas. La residencia de esta tabla puede ajustarse como agrupación de la huelga; si el dato incorrecto está en una persona concreta, usa «Ver personas» y corrígela allí: esa corrección actualizará también la Plantilla maestra. Los responsables se definen en el maestro de zonas. Esta huelga conservará su propia copia de área, zona y responsable para que los cambios futuros no alteren su histórico.
                    </p>
                  </div>
                </div>
              </section>

              <label className="relative block">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-metro-muted" size={16} />
                <input
                  className="h-10 w-full rounded-xl border border-metro-border bg-metro-panel pl-9 pr-3 text-sm text-metro-text outline-none focus:border-metro-red"
                  placeholder="Buscar residencia, puesto, área, zona o responsable..."
                  value={assignmentSearch}
                  onChange={(event) => setAssignmentSearch(event.target.value)}
                />
              </label>

              <div className="overflow-hidden rounded-xl border border-metro-border">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[980px] text-left text-xs">
                    <thead className="bg-metro-raised/75 text-[11px] text-metro-muted">
                      <tr className="uppercase tracking-wide">
                        {[
                          ['residencia', 'Residencia'],
                          ['puesto', 'Puesto'],
                          ['personas', 'Personas'],
                          ['zona', 'Zona'],
                          ['area', 'Área'],
                          ['responsable', 'Responsable de zona'],
                          ['estado', 'Estado'],
                        ].map(([key, label]) => (
                          <th className={`px-3 py-2.5 font-semibold ${key === 'personas' ? 'w-20 text-center' : key === 'estado' ? 'w-28' : ''}`} key={key}>
                            <button className="inline-flex items-center gap-1 hover:text-metro-text" onClick={() => toggleAssignmentSort(key as AssignmentSortKey)} type="button">
                              {label}
                              <span className="text-[10px]">{assignmentSort.key === key ? (assignmentSort.direction === 'asc' ? '▲' : '▼') : '↕'}</span>
                            </button>
                          </th>
                        ))}
                      </tr>
                      <tr className="border-t border-metro-border/70 normal-case tracking-normal">
                        <th className="px-2 pb-2"><input className="h-8 w-full rounded-md border border-metro-border bg-metro-app px-2 text-[11px] text-metro-text outline-none focus:border-metro-red" placeholder="Filtrar…" value={assignmentFilters.residencia} onChange={(event) => updateAssignmentFilter('residencia', event.target.value)} /></th>
                        <th className="px-2 pb-2"><input className="h-8 w-full rounded-md border border-metro-border bg-metro-app px-2 text-[11px] text-metro-text outline-none focus:border-metro-red" placeholder="Filtrar…" value={assignmentFilters.puesto} onChange={(event) => updateAssignmentFilter('puesto', event.target.value)} /></th>
                        <th className="px-2 pb-2"><input className="h-8 w-full rounded-md border border-metro-border bg-metro-app px-2 text-center text-[11px] text-metro-text outline-none focus:border-metro-red" inputMode="numeric" placeholder="Nº" value={assignmentFilters.personas} onChange={(event) => updateAssignmentFilter('personas', event.target.value.replace(/\D/g, ''))} /></th>
                        <th className="px-2 pb-2"><input className="h-8 w-full rounded-md border border-metro-border bg-metro-app px-2 text-[11px] text-metro-text outline-none focus:border-metro-red" placeholder="Filtrar…" value={assignmentFilters.zona} onChange={(event) => updateAssignmentFilter('zona', event.target.value)} /></th>
                        <th className="px-2 pb-2"><input className="h-8 w-full rounded-md border border-metro-border bg-metro-app px-2 text-[11px] text-metro-text outline-none focus:border-metro-red" placeholder="Filtrar…" value={assignmentFilters.area} onChange={(event) => updateAssignmentFilter('area', event.target.value)} /></th>
                        <th className="px-2 pb-2"><input className="h-8 w-full rounded-md border border-metro-border bg-metro-app px-2 text-[11px] text-metro-text outline-none focus:border-metro-red" placeholder="Filtrar…" value={assignmentFilters.responsable} onChange={(event) => updateAssignmentFilter('responsable', event.target.value)} /></th>
                        <th className="px-2 pb-2"><select className="h-8 w-full rounded-md border border-metro-border bg-metro-app px-2 text-[11px] text-metro-text outline-none focus:border-metro-red" value={assignmentFilters.estado} onChange={(event) => updateAssignmentFilter('estado', event.target.value)}><option value="">Todos</option><option value="configurado">Configurado</option><option value="pendiente">Pendiente</option></select></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-metro-border">
                      {filteredAssignmentDraft.map((item) => {
                        const complete = isAsignacionCompleta(item);
                        const personCount = assignmentPersonCounts.get(asignacionKey(item.residencia, item.puesto)) ?? 0;
                        return (
                          <tr className="align-top hover:bg-metro-raised/35" key={asignacionKey(item.residencia, item.puesto)}>
                            <td className="px-3 py-2">
                              <input
                                className="h-9 w-full rounded-lg border border-metro-border bg-metro-app px-2.5 text-xs font-semibold text-metro-text outline-none focus:border-metro-red"
                                aria-label={`Residencia de ${item.puesto}`}
                                value={item.residencia}
                                onChange={(event) => updateAssignmentResidence(item.residencia, item.puesto, event.target.value)}
                              />
                              <p className="mt-1 text-[10px] text-metro-muted">Agrupación de esta huelga</p>
                            </td>
                            <td className="px-3 py-3">
                              <p className="font-semibold text-metro-text">{item.puesto}</p>
                            </td>
                            <td className="px-3 py-2 text-center">
                              <p className="font-semibold text-metro-text">{personCount}</p>
                              <button
                                className="mt-1 text-[11px] font-semibold text-metro-red hover:underline"
                                type="button"
                                onClick={() => openPersonDetail(item)}
                              >
                                Ver personas
                              </button>
                            </td>
                            <td className="px-3 py-2">
                              <select
                                className="h-9 w-full rounded-lg border border-metro-border bg-metro-app px-2.5 text-xs text-metro-text outline-none focus:border-metro-red"
                                value={item.zonaId}
                                onChange={(event) => updateAssignment(item.residencia, item.puesto, 'zonaId', event.target.value)}
                              >
                                <option value="">Seleccionar zona…</option>
                                {zonas.filter((zona) => zona.active || zona.id === item.zonaId).map((zona) => (
                                  <option key={zona.id} value={zona.id}>{zona.nombre}{zona.active ? '' : ' (inactiva)'}</option>
                                ))}
                              </select>
                            </td>
                            <td className="px-3 py-2">
                              <select
                                className="h-9 w-full rounded-lg border border-metro-border bg-metro-app px-2.5 text-xs text-metro-text outline-none focus:border-metro-red disabled:cursor-not-allowed disabled:opacity-60"
                                value={item.areaId ?? ''}
                                disabled={!item.zonaId}
                                onChange={(event) => updateAssignment(item.residencia, item.puesto, 'areaId', event.target.value)}
                              >
                                <option value="">{item.zonaId ? 'Seleccionar área…' : 'Selecciona primero una zona'}</option>
                                {areas
                                  .filter((area) => area.zonaId === item.zonaId && (area.active || area.id === item.areaId))
                                  .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }))
                                  .map((area) => (
                                    <option key={area.id} value={area.id}>{area.nombre}{area.active ? '' : ' (inactiva)'}</option>
                                  ))}
                              </select>
                            </td>
                            <td className="px-3 py-2">
                              <p className="font-semibold text-metro-text">{item.zonaResponsableNombre || '—'}</p>
                              <p className="mt-1 text-[11px] text-metro-muted">{item.zonaResponsableEmail || 'Sin email'}</p>
                            </td>
                            <td className="px-3 py-3">
                              <span className={`inline-flex rounded-full border px-2 py-1 text-[11px] font-semibold ${complete ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-200' : 'border-amber-500/35 bg-amber-500/10 text-amber-200'}`}>
                                {complete ? 'Configurado' : 'Pendiente'}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {filteredAssignmentDraft.length === 0 && (
                  <div className="px-4 py-8 text-center text-sm text-metro-muted">No hay combinaciones de residencia y puesto que coincidan con la búsqueda.</div>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-metro-border bg-metro-app px-5 py-4">
              <p className="text-xs text-metro-muted">
                Puedes guardar aunque queden combinaciones pendientes. Antes de generar los correos, cada combinación deberá tener Zona y un Área válida del maestro, y cada Zona un responsable con email.
              </p>
              <div className="flex gap-2">
                <ActionButton variant="secondary" iconOnly={false} onClick={closeAssignments}>Cancelar</ActionButton>
                <ActionButton variant="save" iconOnly={false} loading={savingAssignments} onClick={() => void saveAssignments()}>
                  Guardar asignaciones
                </ActionButton>
              </div>
            </div>
          </section>
        </div>
      )}

      {personDetailAssignment && assignmentTarget && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/65 p-4" role="presentation">
          <section
            className="flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-metro-border bg-metro-app shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="huelga-person-detail-title"
          >
            <div className="flex items-start justify-between gap-4 border-b border-metro-border px-5 py-4">
              <div>
                <h2 id="huelga-person-detail-title" className="text-lg font-semibold text-metro-text">Personas de la combinación</h2>
                <p className="mt-1 text-sm text-metro-muted">
                  {personDetailAssignment.residencia} · {personDetailAssignment.puesto} · {personDetailRows.length} personas
                </p>
              </div>
              <button
                className="rounded-lg px-2 py-1 text-xl text-metro-muted hover:bg-metro-raised hover:text-metro-text"
                onClick={closePersonDetail}
                type="button"
                aria-label="Cerrar"
              >
                ×
              </button>
            </div>

            <div className="space-y-4 overflow-y-auto p-5">
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs leading-5 text-amber-100">
                Usa esta vista para localizar la persona que provoca una residencia incorrecta. Al guardar una corrección individual se actualizará también su residencia en Plantilla y el cambio se utilizará en futuras huelgas.
              </div>

              <div className="overflow-hidden rounded-xl border border-metro-border">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1080px] text-left text-xs">
                    <thead className="bg-metro-raised/75 text-[11px] uppercase tracking-wide text-metro-muted">
                      <tr>
                        <th className="px-3 py-2.5 font-semibold">Nº empleado</th>
                        <th className="px-3 py-2.5 font-semibold">Nombre y apellidos</th>
                        <th className="px-3 py-2.5 font-semibold">Residencia Plantilla</th>
                        <th className="px-3 py-2.5 font-semibold">Residencia Excel</th>
                        <th className="px-3 py-2.5 font-semibold">Residencia correcta</th>
                        <th className="px-3 py-2.5 font-semibold">Turno</th>
                        <th className="w-32 px-3 py-2.5 font-semibold">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-metro-border">
                      {personDetailRows.map((persona) => {
                        const linkedEmployee = persona.empleado
                          ? employees.find((employee) => employee.empleado === persona.empleado && !employee.deletedAt)
                          : undefined;
                        const canEditMaster = Boolean(linkedEmployee);
                        const residenceValue = personResidenceDrafts[persona.id] ?? persona.residenciaAsignacion ?? persona.residenciaPlantilla ?? persona.residenciaEstacion ?? '';
                        const plantillaResidence = linkedEmployee?.residencia || persona.residenciaPlantilla || '';
                        return (
                          <tr className="align-top hover:bg-metro-raised/35" key={persona.id}>
                            <td className="px-3 py-3 font-semibold text-metro-text">{persona.empleado || '—'}</td>
                            <td className="px-3 py-3">
                              <p className="font-semibold text-metro-text">{persona.nombreApellidos}</p>
                              <p className="mt-1 text-[11px] text-metro-muted">{persona.puesto}</p>
                            </td>
                            <td className="px-3 py-3 text-metro-text">{plantillaResidence || '—'}</td>
                            <td className="px-3 py-3 text-metro-text">{persona.residenciaExcel || persona.residenciaEstacion || '—'}</td>
                            <td className="px-3 py-2">
                              <div className="flex min-w-[260px] items-center gap-2">
                                <input
                                  className="h-9 min-w-0 flex-1 rounded-lg border border-metro-border bg-metro-app px-2.5 text-xs text-metro-text outline-none focus:border-metro-red disabled:cursor-not-allowed disabled:opacity-60"
                                  value={residenceValue}
                                  disabled={!canEditMaster || savingPersonId === persona.id}
                                  onChange={(event) => setPersonResidenceDrafts((current) => ({ ...current, [persona.id]: event.target.value }))}
                                  aria-label={`Residencia correcta de ${persona.nombreApellidos}`}
                                />
                                <ActionButton
                                  variant="save"
                                  size="sm"
                                  iconOnly={false}
                                  loading={savingPersonId === persona.id}
                                  disabled={!canEditMaster || savingPersonId !== null || sameNormalizedText(plantillaResidence, residenceValue)}
                                  onClick={() => void savePersonResidence(persona)}
                                >
                                  Actualizar
                                </ActionButton>
                              </div>
                              {!canEditMaster && (
                                <p className="mt-1 text-[10px] text-amber-200">No vinculada de forma única con Plantilla</p>
                              )}
                            </td>
                            <td className="px-3 py-3 text-metro-text">{persona.turno || '—'}</td>
                            <td className="px-3 py-3">
                              {persona.plantillaMatch === 'matched' ? (
                                <span className={`inline-flex rounded-full border px-2 py-1 text-[11px] font-semibold ${persona.residenciaDiscrepante ? 'border-amber-500/35 bg-amber-500/10 text-amber-200' : 'border-emerald-500/35 bg-emerald-500/10 text-emerald-200'}`}>
                                  {persona.residenciaDiscrepante ? 'Discrepancia' : 'Coincide'}
                                </span>
                              ) : (
                                <span className="inline-flex rounded-full border border-amber-500/35 bg-amber-500/10 px-2 py-1 text-[11px] font-semibold text-amber-200">
                                  {persona.plantillaMatch === 'ambiguous' ? 'Ambigua' : persona.plantillaMatch === 'no-residence' ? 'Sin residencia' : 'No encontrada'}
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {personDetailRows.length === 0 && (
                  <div className="px-4 py-8 text-center text-sm text-metro-muted">Ya no hay personas en esta combinación después de las correcciones realizadas.</div>
                )}
              </div>
            </div>

            <div className="flex justify-end border-t border-metro-border bg-metro-app px-5 py-4">
              <ActionButton variant="secondary" iconOnly={false} onClick={closePersonDetail}>Cerrar</ActionButton>
            </div>
          </section>
        </div>
      )}

      {zonesOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" role="presentation">
          <section className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-metro-border bg-metro-app shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="huelga-zones-title">
            <div className="flex items-start justify-between gap-4 border-b border-metro-border px-5 py-4">
              <div>
                <h2 id="huelga-zones-title" className="text-lg font-semibold text-metro-text">Zonas y áreas de trabajo</h2>
                <p className="mt-1 text-sm text-metro-muted">Gestiona las zonas, sus responsables y las áreas que pertenecen a cada una. Las asignaciones de huelga elegirán únicamente entre estas áreas.</p>
              </div>
              <button className="rounded-lg px-2 py-1 text-xl text-metro-muted hover:bg-metro-raised hover:text-metro-text" onClick={closeZones} type="button" aria-label="Cerrar">×</button>
            </div>
            <div className="space-y-4 overflow-y-auto p-5">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-metro-border bg-metro-panel/55 p-3"><p className="text-xs text-metro-muted">Zonas</p><strong className="mt-1 block text-xl text-metro-text">{zoneDraft.length}</strong></div>
                <div className="rounded-xl border border-metro-border bg-metro-panel/55 p-3"><p className="text-xs text-metro-muted">Áreas</p><strong className="mt-1 block text-xl text-metro-text">{areaDraft.length}</strong></div>
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3"><p className="text-xs text-emerald-200/80">Activas completas</p><strong className="mt-1 block text-xl text-emerald-200">{zoneDraft.filter(isZonaCompleta).length}</strong></div>
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3"><p className="text-xs text-amber-200/80">Activas pendientes</p><strong className="mt-1 block text-xl text-amber-200">{zoneDraft.filter((zona) => zona.active && !isZonaCompleta(zona)).length}</strong></div>
              </div>

              <div className="flex gap-2 rounded-xl border border-metro-border bg-metro-panel/55 p-3">
                <input className="h-10 flex-1 rounded-xl border border-metro-border bg-metro-app px-3 text-sm text-metro-text outline-none focus:border-metro-red" placeholder="Nueva zona" value={newZoneName} onChange={(event) => setNewZoneName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addZone(); } }} />
                <ActionButton variant="add" iconOnly={false} icon={Plus} onClick={addZone}>Añadir zona</ActionButton>
              </div>

              <div className="overflow-hidden rounded-xl border border-metro-border">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-left text-xs">
                    <thead className="bg-metro-raised/75 text-[11px] uppercase tracking-wide text-metro-muted"><tr><th className="px-3 py-2.5 font-semibold">Zona</th><th className="px-3 py-2.5 font-semibold">Responsable</th><th className="px-3 py-2.5 font-semibold">Email</th><th className="px-3 py-2.5 font-semibold">Correo</th><th className="w-28 px-3 py-2.5 font-semibold">Estado</th></tr></thead>
                    <tbody className="divide-y divide-metro-border">
                      {zoneDraft.map((zona) => (
                        <tr key={zona.id} className="align-top hover:bg-metro-raised/35">
                          <td className="px-3 py-2"><input className="h-9 w-full rounded-lg border border-metro-border bg-metro-app px-2.5 text-xs text-metro-text outline-none focus:border-metro-red" value={zona.nombre} onChange={(event) => updateZone(zona.id, 'nombre', event.target.value)} /></td>
                          <td className="px-3 py-2"><input className="h-9 w-full rounded-lg border border-metro-border bg-metro-app px-2.5 text-xs text-metro-text outline-none focus:border-metro-red" placeholder="Nombre y apellidos" value={zona.responsableNombre} onChange={(event) => updateZone(zona.id, 'responsableNombre', event.target.value)} /></td>
                          <td className="px-3 py-2"><input className="h-9 w-full rounded-lg border border-metro-border bg-metro-app px-2.5 text-xs text-metro-text outline-none focus:border-metro-red" placeholder="correo@empresa.es" type="email" value={zona.responsableEmail} onChange={(event) => updateZone(zona.id, 'responsableEmail', event.target.value)} /></td>
                          <td className="px-3 py-2">
                            <button type="button" onClick={() => setMailTemplateZoneId(zona.id)} className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold ${zona.correoActivo ? 'border-sky-500/35 bg-sky-500/10 text-sky-200' : 'border-metro-border bg-metro-panel text-metro-muted'}`}>
                              <MailPlus size={13} /> {zona.correoActivo ? 'Editar plantilla' : 'Sin envío'}
                            </button>
                          </td>
                          <td className="px-3 py-2">
                            <button type="button" onClick={() => updateZone(zona.id, 'active', !zona.active)} className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${zona.active ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-200' : 'border-metro-border bg-metro-panel text-metro-muted'}`}>{zona.active ? 'Activa' : 'Inactiva'}</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="space-y-3 rounded-xl border border-metro-border bg-metro-panel/45 p-4">
                <div>
                  <h3 className="text-sm font-semibold text-metro-text">Áreas por zona</h3>
                  <p className="mt-1 text-xs text-metro-muted">Cada área pertenece a una zona. Puedes darla de alta, moverla de zona o dejarla inactiva para futuras asignaciones.</p>
                </div>
                <div className="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
                  <select className="h-10 rounded-xl border border-metro-border bg-metro-app px-3 text-sm text-metro-text outline-none focus:border-metro-red" value={newAreaZoneId} onChange={(event) => setNewAreaZoneId(event.target.value)}>
                    <option value="">Seleccionar zona…</option>
                    {zoneDraft.filter((zona) => zona.active).map((zona) => <option key={zona.id} value={zona.id}>{zona.nombre}</option>)}
                  </select>
                  <input className="h-10 rounded-xl border border-metro-border bg-metro-app px-3 text-sm text-metro-text outline-none focus:border-metro-red" placeholder="Nueva área" value={newAreaName} onChange={(event) => setNewAreaName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addArea(); } }} />
                  <ActionButton variant="add" iconOnly={false} icon={Plus} onClick={addArea}>Añadir área</ActionButton>
                </div>
                <div className="overflow-hidden rounded-xl border border-metro-border">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[680px] text-left text-xs">
                      <thead className="bg-metro-raised/75 text-[11px] uppercase tracking-wide text-metro-muted"><tr><th className="px-3 py-2.5 font-semibold">Área</th><th className="px-3 py-2.5 font-semibold">Zona</th><th className="w-28 px-3 py-2.5 font-semibold">Estado</th></tr></thead>
                      <tbody className="divide-y divide-metro-border">
                        {areaDraft
                          .slice()
                          .sort((a, b) => {
                            const zoneA = zoneDraft.find((zona) => zona.id === a.zonaId)?.nombre ?? '';
                            const zoneB = zoneDraft.find((zona) => zona.id === b.zonaId)?.nombre ?? '';
                            const zoneOrder = zoneA.localeCompare(zoneB, 'es', { sensitivity: 'base' });
                            return zoneOrder || a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' });
                          })
                          .map((area) => (
                            <tr key={area.id} className="align-top hover:bg-metro-raised/35">
                              <td className="px-3 py-2"><input className="h-9 w-full rounded-lg border border-metro-border bg-metro-app px-2.5 text-xs text-metro-text outline-none focus:border-metro-red" value={area.nombre} onChange={(event) => updateArea(area.id, 'nombre', event.target.value)} /></td>
                              <td className="px-3 py-2"><select className="h-9 w-full rounded-lg border border-metro-border bg-metro-app px-2.5 text-xs text-metro-text outline-none focus:border-metro-red" value={area.zonaId} onChange={(event) => updateArea(area.id, 'zonaId', event.target.value)}>{zoneDraft.map((zona) => <option key={zona.id} value={zona.id}>{zona.nombre}{zona.active ? '' : ' (inactiva)'}</option>)}</select></td>
                              <td className="px-3 py-2"><button type="button" onClick={() => updateArea(area.id, 'active', !area.active)} className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${area.active ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-200' : 'border-metro-border bg-metro-panel text-metro-muted'}`}>{area.active ? 'Activa' : 'Inactiva'}</button></td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <p className="text-xs leading-5 text-metro-muted">Dar de baja una zona o área la deja inactiva para nuevas asignaciones, pero no elimina su histórico ni las huelgas que ya la tenían asignada.</p>
            </div>
            <div className="flex justify-end gap-2 border-t border-metro-border bg-metro-app px-5 py-4">
              <ActionButton variant="secondary" iconOnly={false} onClick={closeZones}>Cancelar</ActionButton>
              <ActionButton variant="save" iconOnly={false} loading={savingZones} onClick={() => void saveZones()}>Guardar zonas y áreas</ActionButton>
            </div>
          </section>
        </div>
      )}

      {mailTemplateZone && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4" role="presentation">
          <section className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-metro-border bg-metro-app shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="huelga-mail-template-title">
            <div className="flex items-start justify-between gap-4 border-b border-metro-border px-5 py-4">
              <div>
                <h2 id="huelga-mail-template-title" className="text-lg font-semibold text-metro-text">Plantilla de correo · {mailTemplateZone.nombre}</h2>
                <p className="mt-1 text-sm text-metro-muted">Configura el texto habitual de esta Zona. Las variables se sustituirán con los datos de cada huelga.</p>
              </div>
              <button className="rounded-lg px-2 py-1 text-xl text-metro-muted hover:bg-metro-raised hover:text-metro-text" onClick={() => setMailTemplateZoneId(null)} type="button" aria-label="Cerrar">×</button>
            </div>
            <div className="space-y-4 overflow-y-auto p-5">
              <label className="flex items-center gap-3 rounded-xl border border-metro-border bg-metro-panel/55 p-3 text-sm text-metro-text">
                <input
                  type="checkbox"
                  checked={mailTemplateZone.correoActivo}
                  onChange={(event) => updateZone(mailTemplateZone.id, 'correoActivo', event.target.checked)}
                />
                Generar correo para esta Zona
                {!mailTemplateZone.correoActivo && <span className="text-xs text-metro-muted">No aparecerá en la preparación de correos.</span>}
              </label>

              <label className="block space-y-1.5 text-sm font-medium text-metro-text">
                Asunto
                <input
                  className="h-10 w-full rounded-xl border border-metro-border bg-metro-panel px-3 text-sm text-metro-text outline-none focus:border-metro-red"
                  value={mailTemplateZone.correoAsunto}
                  onChange={(event) => updateZone(mailTemplateZone.id, 'correoAsunto', event.target.value)}
                />
              </label>

              <div className="grid gap-4 lg:grid-cols-2">
                <label className="block space-y-1.5 text-sm font-medium text-metro-text">
                  Plazos habituales
                  <textarea
                    className="min-h-24 w-full resize-y rounded-xl border border-metro-border bg-metro-panel px-3 py-2.5 text-sm text-metro-text outline-none focus:border-metro-red"
                    placeholder="Ej. Antes de las 9:45 h los datos de mañana y antes de las 15:00 h los de tarde."
                    value={mailTemplateZone.correoPlazos}
                    onChange={(event) => updateZone(mailTemplateZone.id, 'correoPlazos', event.target.value)}
                  />
                </label>
                <label className="block space-y-1.5 text-sm font-medium text-metro-text">
                  Instrucciones habituales de la Zona
                  <textarea
                    className="min-h-24 w-full resize-y rounded-xl border border-metro-border bg-metro-panel px-3 py-2.5 text-sm text-metro-text outline-none focus:border-metro-red"
                    placeholder="Reglas que se repiten en todas las huelgas de esta Zona."
                    value={mailTemplateZone.correoInstruccionesHabituales}
                    onChange={(event) => updateZone(mailTemplateZone.id, 'correoInstruccionesHabituales', event.target.value)}
                  />
                </label>
              </div>

              <div className="space-y-2">
                <div>
                  <h3 className="text-sm font-semibold text-metro-text">Cuerpo del correo</h3>
                  <p className="mt-1 text-xs text-metro-muted">Puedes pegar texto desde Outlook o Word y aplicar negrita, cursiva y listas.</p>
                </div>
                <RichTextEditor
                  value={mailTemplateZone.correoCuerpoHtml}
                  onChange={(html) => updateZone(mailTemplateZone.id, 'correoCuerpoHtml', html)}
                  placeholder="Plantilla de correo..."
                  minHeightClassName="min-h-[300px]"
                />
              </div>

              <div className="rounded-xl border border-metro-border bg-metro-panel/45 p-4">
                <h3 className="text-sm font-semibold text-metro-text">Variables disponibles</h3>
                <p className="mt-1 text-xs text-metro-muted">Escribe o copia cualquiera de estos marcadores dentro del asunto o del cuerpo.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {HUELGA_MAIL_MARKERS.map((markerValue) => (
                    <button
                      key={markerValue}
                      className="rounded-lg border border-metro-border bg-metro-app px-2.5 py-1.5 font-mono text-[11px] text-metro-text hover:border-metro-red"
                      type="button"
                      onClick={() => void navigator.clipboard?.writeText(markerValue)}
                      title="Copiar marcador"
                    >
                      {markerValue}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-metro-border bg-metro-app px-5 py-4">
              <ActionButton variant="secondary" iconOnly={false} onClick={() => setMailTemplateZoneId(null)}>Volver</ActionButton>
              <ActionButton variant="save" iconOnly={false} onClick={() => setMailTemplateZoneId(null)}>Aplicar a borrador</ActionButton>
            </div>
          </section>
        </div>
      )}

      {mailTarget && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/65 p-4" role="presentation">
          <section className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-metro-border bg-metro-app shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="huelga-mails-title">
            <div className="flex items-start justify-between gap-4 border-b border-metro-border px-5 py-4">
              <div>
                <h2 id="huelga-mails-title" className="text-lg font-semibold text-metro-text">Correos por Zona · {formatDate(mailTarget.fecha)}</h2>
                <p className="mt-1 text-sm text-metro-muted">Revisa el texto real que recibirá cada responsable. SSCC y las zonas con correo desactivado quedan fuera.</p>
              </div>
              <button className="rounded-lg px-2 py-1 text-xl text-metro-muted hover:bg-metro-raised hover:text-metro-text" onClick={closeCollectionMails} type="button" aria-label="Cerrar">×</button>
            </div>

            <div className="grid min-h-0 flex-1 overflow-hidden lg:grid-cols-[320px_1fr]">
              <aside className="overflow-y-auto border-r border-metro-border p-4">
                <div className="space-y-2">
                  {mailGroups.map((group) => {
                    const zona = zonas.find((item) => item.id === group.zonaId);
                    const selected = group.zonaId === mailPreviewZoneId;
                    return (
                      <button
                        key={group.zonaId}
                        className={`w-full rounded-xl border p-3 text-left transition ${selected ? 'border-metro-red bg-metro-red/10' : 'border-metro-border bg-metro-panel/45 hover:bg-metro-raised/40'}`}
                        type="button"
                        onClick={() => setMailPreviewZoneId(group.zonaId)}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <strong className="text-sm text-metro-text">{group.zonaNombre}</strong>
                          <span className="text-[11px] text-metro-muted">{group.personal.length} pers.</span>
                        </div>
                        <p className="mt-1 truncate text-xs text-metro-muted">{zona?.responsableNombre || 'Sin responsable'}</p>
                        <p className="truncate text-[11px] text-metro-muted">{zona?.responsableEmail || 'Sin email'}</p>
                      </button>
                    );
                  })}
                </div>
              </aside>

              <div className="overflow-y-auto p-5">
                {mailPreviewGroup && currentMailPreview ? (
                  <div className="space-y-4">
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="rounded-xl border border-metro-border bg-metro-panel/50 p-3">
                        <p className="text-[11px] uppercase tracking-wide text-metro-muted">Para</p>
                        <p className="mt-1 text-sm font-semibold text-metro-text">{zonas.find((item) => item.id === mailPreviewGroup.zonaId)?.responsableEmail || '—'}</p>
                      </div>
                      <div className="rounded-xl border border-metro-border bg-metro-panel/50 p-3">
                        <p className="text-[11px] uppercase tracking-wide text-metro-muted">Personas con turno</p>
                        <p className="mt-1 text-sm font-semibold text-metro-text">{mailPreviewGroup.personal.length}</p>
                      </div>
                    </div>

                    <label className="block space-y-1.5 text-sm font-medium text-metro-text">
                      Instrucciones específicas de esta huelga
                      <textarea
                        className="min-h-24 w-full resize-y rounded-xl border border-metro-border bg-metro-panel px-3 py-2.5 text-sm text-metro-text outline-none focus:border-metro-red"
                        placeholder="Excepciones o indicaciones válidas solo para esta huelga y esta Zona..."
                        value={mailSpecificNotes[mailPreviewGroup.zonaId] ?? ''}
                        onChange={(event) => setMailSpecificNotes((current) => ({ ...current, [mailPreviewGroup.zonaId]: event.target.value }))}
                      />
                    </label>

                    <div className="rounded-xl border border-metro-border bg-white p-5 text-gray-900 shadow-inner">
                      <div className="mb-4 border-b border-gray-200 pb-3 text-sm">
                        <p><strong>Asunto:</strong> {currentMailPreview.subject}</p>
                      </div>
                      <div className="prose prose-sm max-w-none font-sans" dangerouslySetInnerHTML={{ __html: currentMailPreview.html }} />
                    </div>

                    <div className="flex flex-wrap justify-end gap-2">
                      <ActionButton variant="secondary" iconOnly={false} onClick={() => void saveMailSpecificNotes()}>Guardar instrucciones</ActionButton>
                      <ActionButton variant="primary" iconOnly={false} icon={MailPlus} loading={generatingCollectionForId === mailTarget.id} onClick={() => void generateSingleCollectionMail(mailPreviewGroup)}>Generar este correo</ActionButton>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-metro-border p-8 text-center text-sm text-metro-muted">Selecciona una Zona para revisar su correo.</div>
                )}
              </div>
            </div>

            <div className="flex flex-wrap justify-between gap-2 border-t border-metro-border bg-metro-app px-5 py-4">
              <p className="self-center text-xs text-metro-muted">En esta fase los borradores se crean sin Excel adjunto.</p>
              <div className="flex gap-2">
                <ActionButton variant="secondary" iconOnly={false} onClick={closeCollectionMails}>Cerrar</ActionButton>
                <ActionButton variant="primary" iconOnly={false} icon={MailPlus} loading={generatingCollectionForId === mailTarget.id} onClick={() => void generateAllCollectionMails()}>Generar todos</ActionButton>
              </div>
            </div>
          </section>
        </div>
      )}

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
