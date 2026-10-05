import { useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import type { useAppDialog } from '../../../hooks/useAppDialog';
import type { Employee } from '../../plantilla/domain/employee';
import { writeJsonStorageAsync } from '../../../services/persistence';
import type { HuelgaPersonalTurno } from './huelgasPersonalImport';
import {
  applyZoneSnapshots,
  asignacionKey,
  buildAsignacionesForPersonal,
  isAsignacionCompleta,
  mergeAsignacionesIntoMaster,
  type HuelgaPuestoAsignacion,
} from './huelgasAssignments';
import type { HuelgaZona } from './huelgasZones';
import type { HuelgaArea } from './huelgasAreas';
import {
  EMPTY_ASSIGNMENT_FILTERS,
  PUESTO_RESPONSABLES_STORAGE_KEY,
  STORAGE_KEY,
  employeeToDraft,
  resolveResidenceOverride,
  sameNormalizedText,
  type AssignmentFilters,
  type AssignmentSortDirection,
  type AssignmentSortKey,
  type Huelga,
} from './huelgasPageModel';

type AlertFn = ReturnType<typeof useAppDialog>['alert'];
type ConfirmFn = ReturnType<typeof useAppDialog>['confirm'];
type UpdateEmployeeFn = (
  employeeId: string,
  draft: ReturnType<typeof employeeToDraft>,
  expectedSnapshot: string,
) => Promise<{ ok: boolean; message?: string }>;

type UseHuelgaAssignmentsParams = {
  alert: AlertFn;
  areas: HuelgaArea[];
  confirm: ConfirmFn;
  employees: Employee[];
  huelgas: Huelga[];
  puestoResponsables: HuelgaPuestoAsignacion[];
  setHuelgas: Dispatch<SetStateAction<Huelga[]>>;
  setPuestoResponsables: Dispatch<SetStateAction<HuelgaPuestoAsignacion[]>>;
  updateEmployeeWithConcurrencyCheck: UpdateEmployeeFn;
  zonas: HuelgaZona[];
};

export function useHuelgaAssignments({
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
}: UseHuelgaAssignmentsParams) {
  const [assignmentTargetId, setAssignmentTargetId] = useState<string | null>(null);
  const [assignmentDraft, setAssignmentDraft] = useState<HuelgaPuestoAsignacion[]>([]);
  const [assignmentSearch, setAssignmentSearch] = useState('');
  const [assignmentFilters, setAssignmentFilters] = useState<AssignmentFilters>(EMPTY_ASSIGNMENT_FILTERS);
  const [assignmentSort, setAssignmentSort] = useState<{
    key: AssignmentSortKey;
    direction: AssignmentSortDirection;
  }>({ key: 'residencia', direction: 'asc' });
  const [assignmentResidenceOverrides, setAssignmentResidenceOverrides] = useState<Record<string, string>>({});
  const [savingAssignments, setSavingAssignments] = useState(false);
  const [personDetailAssignment, setPersonDetailAssignment] = useState<HuelgaPuestoAsignacion | null>(null);
  const [personResidenceDrafts, setPersonResidenceDrafts] = useState<Record<string, string>>({});
  const [savingPersonId, setSavingPersonId] = useState<string | null>(null);

  const assignmentTarget = assignmentTargetId
    ? huelgas.find((item) => item.id === assignmentTargetId) ?? null
    : null;

  const personDetailRows = useMemo(() => {
    if (!assignmentTarget || !personDetailAssignment) return [];
    const targetKey = asignacionKey(personDetailAssignment.residencia, personDetailAssignment.puesto);
    return (assignmentTarget.personalConTurno ?? []).filter((persona) => {
      const residenciaBase = (
        persona.residenciaAsignacion ||
        persona.residenciaPlantilla ||
        persona.residenciaEstacion ||
        ''
      ).trim();
      const residencia = resolveResidenceOverride(assignmentResidenceOverrides, residenciaBase, persona.puesto);
      return asignacionKey(residencia, persona.puesto) === targetKey;
    });
  }, [assignmentResidenceOverrides, assignmentTarget, personDetailAssignment]);

  const assignmentPersonCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const persona of assignmentTarget?.personalConTurno ?? []) {
      const residenciaBase = (
        persona.residenciaAsignacion ||
        persona.residenciaPlantilla ||
        persona.residenciaEstacion ||
        ''
      ).trim();
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
    const now = new Date().toISOString();
    setAssignmentResidenceOverrides((current) => ({ ...current, [targetKey]: value }));
    setAssignmentDraft((current) => current.map((item) =>
      asignacionKey(item.residencia, item.puesto) === targetKey
        ? { ...item, residencia: value, updatedAt: now }
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
      const residenciaBase = (
        persona.residenciaAsignacion ||
        persona.residenciaPlantilla ||
        persona.residenciaEstacion ||
        ''
      ).trim();
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
      return rebuiltAssignments.find(
        (item) => asignacionKey(item.residencia, item.puesto) === asignacionKey(nextResidence, persona.puesto),
      ) ?? null;
    });
    setPersonResidenceDrafts((current) => ({ ...current, [persona.id]: nextResidence }));
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
        await alert(
          `La combinación “${item.residencia} · ${item.puesto}” está duplicada. Revisa la corrección de residencia.`,
          { title: 'Combinación duplicada', type: 'warning' },
        );
        return;
      }
      seenAssignmentKeys.add(key);
    }
    const nextMaster = mergeAsignacionesIntoMaster(puestoResponsables, normalized);
    const now = new Date().toISOString();
    const nextHuelgas = huelgas.map((item) => {
      if (item.id !== assignmentTarget.id) return item;
      const personalConTurno = (item.personalConTurno ?? []).map((persona) => {
        const residenciaBase = (
          persona.residenciaAsignacion ||
          persona.residenciaPlantilla ||
          persona.residenciaEstacion ||
          ''
        ).trim();
        const residenciaCorregida = resolveResidenceOverride(
          assignmentResidenceOverrides,
          residenciaBase,
          persona.puesto,
        );
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
      await alert(
        huelgaResult.message || 'El maestro se ha actualizado, pero no se ha podido guardar la copia de esta huelga.',
        { title: 'Guardado incompleto', type: 'warning' },
      );
      setPuestoResponsables(nextMaster);
      return;
    }

    setPuestoResponsables(nextMaster);
    setHuelgas(nextHuelgas);
    setAssignmentDraft(normalized);
    setAssignmentResidenceOverrides({});
  };

  const syncAssignmentsWithMasters = (nextZonas: HuelgaZona[], nextAreas: HuelgaArea[]) => {
    setAssignmentDraft((current) =>
      applyZoneSnapshots(
        current.map((assignment) => {
          const masterArea = assignment.areaId
            ? nextAreas.find((area) => area.id === assignment.areaId)
            : undefined;
          return masterArea
            ? {
                ...assignment,
                area: masterArea.nombre,
                zonaId: masterArea.zonaId,
              }
            : assignment;
        }),
        nextZonas,
      ),
    );
  };

  return {
    assignmentConfiguredCount,
    assignmentDraft,
    assignmentFilters,
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
  };
}
