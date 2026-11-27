import { describe, expect, it } from 'vitest';
import { hydrateEmployee } from '../../plantilla/domain/derived';
import { EMPTY_EMPLOYEE_DRAFT } from '../../plantilla/domain/employee';
import { EMPTY_TELETRABAJO_DRAFT, type TeletrabajoSolicitud } from './solicitud';
import { applyPlantillaDataToTeletrabajoDraft, applyPlantillaDataToTeletrabajoSolicitudes } from './plantillaData';
import { getTeletrabajoIncidentMeta, matchesIncidentFilter } from './incidentView';
import { buildPuestosByKey, buildSolicitudesByPeriodoPuestoCount } from './semaforo';
import { buildGruposCoberturaByIdMap } from './gruposCobertura';
import { buildSolicitudesForNewPeriodo } from '../store/teletrabajoSolicitudes.helpers';
const stamp = '2026-01-01T00:00:00.000Z';
const employee = hydrateEmployee({ ...EMPTY_EMPLOYEE_DRAFT, empleado: '100', nombreApellidos: 'Persona ficticia', puestoOrganizativo: 'Administración', antiguedadPuesto: '2024-01-01' });
const draft = { ...EMPTY_TELETRABAJO_DRAFT, empleado: '100', puestoOrganizativo: 'Administración', periodo: '2026-2027', fechaSolicitud: '2026-07-01' };
const record: TeletrabajoSolicitud = { ...draft, diasTeletrabajo: ['martes'], id: 'a', createdAt: stamp, updatedAt: stamp, deletedAt: null };
const puestos = buildPuestosByKey([{ id: 'p', puesto: 'Administración', maxSolicitudes: 1, dotacionComputable: 3, grupoCoberturaId: null, observaciones: '', createdAt: stamp, updatedAt: stamp, deletedAt: null }]);
const employees = new Map([['100', employee]]);
const grupos = buildGruposCoberturaByIdMap([]);
describe('T7A: expedientes de Teletrabajo', () => {
  it('actualiza datos maestros sin alterar estado ni días solicitados', () => {
    const next = applyPlantillaDataToTeletrabajoDraft({ ...draft, estado: 'aprobada', diasTeletrabajo: ['jueves'] }, employee);
    expect(next).toMatchObject({ nombreApellidos: employee.nombreApellidos, estado: 'aprobada', diasTeletrabajo: ['jueves'] });
  });
  it('cruza números de empleado normalizados y no sustituye datos de personas de baja', () => {
    const inactive = hydrateEmployee({ ...EMPTY_EMPLOYEE_DRAFT, empleado: '200', nombreApellidos: 'Baja' }, stamp);
    const previous = { ...record, id: 'b', empleado: '200', nombreApellidos: 'Histórico' };
    const next = applyPlantillaDataToTeletrabajoSolicitudes([{ ...record, empleado: '00100' }, previous], [employee, inactive]);
    expect(next[0].nombreApellidos).toBe(employee.nombreApellidos);
    expect(next[1]).toBe(previous);
  });
  it('mantiene pendiente de decisión manual una solicitud revisada sin incidencias', () => {
    const reviewed = { ...record, revisado: true };
    const counts = buildSolicitudesByPeriodoPuestoCount([reviewed], puestos);
    const meta = getTeletrabajoIncidentMeta(reviewed, puestos, counts, employees, grupos);
    expect(meta).toMatchObject({ status: 'ok', isReviewedPending: true, isReadyToApprove: false });
    expect(matchesIncidentFilter(reviewed, 'revisadasPendientes', puestos, counts, employees, grupos)).toBe(true);
    expect(matchesIncidentFilter(reviewed, 'listasAprobar', puestos, counts, employees, grupos)).toBe(false);
  });
  it('solo considera lista para aprobar una analizada revisada sin incidencias', () => {
    const reviewed = { ...record, estado: 'analizada' as const, revisado: true };
    const counts = buildSolicitudesByPeriodoPuestoCount([reviewed], puestos);
    expect(matchesIncidentFilter(reviewed, 'listasAprobar', puestos, counts, employees, grupos)).toBe(true);
    expect(matchesIncidentFilter({ ...reviewed, revisado: false }, 'listasAprobar', puestos, counts, employees, grupos)).toBe(false);
    expect(matchesIncidentFilter(reviewed, 'listasAprobar', new Map(), counts, employees, grupos)).toBe(false);
  });
  it('distingue incidencias bloqueantes de datos pendientes de revisión', () => {
    const counts = buildSolicitudesByPeriodoPuestoCount([record], puestos);
    expect(getTeletrabajoIncidentMeta(record, new Map(), counts, employees, grupos).status).toBe('blocked');
    expect(getTeletrabajoIncidentMeta(record, puestos, counts, new Map(), grupos).status).toBe('review');
    expect(matchesIncidentFilter(record, 'bloqueantes', puestos, counts, new Map(), grupos)).toBe(false);
    expect(matchesIncidentFilter(record, 'conflictos', puestos, counts, new Map(), grupos)).toBe(true);
  });
  it('renueva solo expedientes aprobados o analizados activos y reinicia las validaciones', () => {
    const approved = { ...record, estado: 'aprobada' as const, revisado: true, modalidadTramitacion: 'ordinaria' as const, validacionDireccion: true };
    const result = buildSolicitudesForNewPeriodo([approved, { ...approved, id: 'b', empleado: '200', deletedAt: stamp }, { ...record, id: 'c', empleado: '300' }], { periodo: '2027-2028', sourcePeriodo: '2026-2027', copyFromPrevious: true });
    expect(result.created).toHaveLength(1);
    expect(result.created[0]).toMatchObject({ periodo: '2027-2028', estado: 'pendiente', tipoSolicitud: 'renovacion', fechaSolicitud: '', revisado: false, validacionDireccion: false });
    expect(result.created[0].id).not.toBe('a');
    expect(result.created[0].modalidadTramitacion).toBeUndefined();
  });
  it('no crea otra renovación si la persona ya tiene expediente activo en destino', () => {
    const approved = { ...record, estado: 'aprobada' as const };
    expect(buildSolicitudesForNewPeriodo([approved, { ...record, id: 'b', periodo: '2027-2028' }], { periodo: '2027-2028', sourcePeriodo: '2026-2027', copyFromPrevious: true })).toEqual({ created: [], ignored: 1 });
  });
});
