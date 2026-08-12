import type { Employee } from '../../plantilla/domain/employee';
import {
  buildActiveEmployeeMap,
  findActiveEmployee,
  normalizeEmployeeNumber,
} from '../../plantilla/domain/employeeMaster';
import type { TeletrabajoDraft, TeletrabajoSolicitud } from './solicitud';

export type TeletrabajoPlantillaFields = Pick<
  TeletrabajoSolicitud,
  | 'empleado'
  | 'nombreApellidos'
  | 'puestoNomina'
  | 'puestoOrganizativo'
  | 'residencia'
  | 'dni'
  | 'direccionTeletrabajo'
>;

export function findActiveEmployeeByEmpleado(
  employees: readonly Employee[],
  empleado: string,
): Employee | null {
  return findActiveEmployee(employees, empleado);
}

export function buildTeletrabajoPlantillaFields(employee: Employee): TeletrabajoPlantillaFields {
  return {
    empleado: employee.empleado,
    nombreApellidos: employee.nombreApellidos,
    puestoNomina: employee.puestoNomina,
    puestoOrganizativo: employee.puestoOrganizativo,
    residencia: employee.residencia,
    dni: employee.dni,
    direccionTeletrabajo: employee.direccionTeletrabajo,
  };
}

export function applyPlantillaDataToTeletrabajoDraft(
  draft: TeletrabajoDraft,
  employee: Employee | null,
): TeletrabajoDraft {
  return employee ? { ...draft, ...buildTeletrabajoPlantillaFields(employee) } : draft;
}

export function applyPlantillaDataToTeletrabajoSolicitud(
  solicitud: TeletrabajoSolicitud,
  employee: Employee | null,
): TeletrabajoSolicitud {
  return employee ? { ...solicitud, ...buildTeletrabajoPlantillaFields(employee) } : solicitud;
}

export function applyPlantillaDataToTeletrabajoSolicitudes(
  solicitudes: readonly TeletrabajoSolicitud[],
  employees: readonly Employee[],
): TeletrabajoSolicitud[] {
  const employeesByEmpleado = buildActiveEmployeeMap(employees);

  return solicitudes.map((solicitud) =>
    applyPlantillaDataToTeletrabajoSolicitud(
      solicitud,
      employeesByEmpleado.get(normalizeEmployeeNumber(solicitud.empleado)) ?? null,
    ),
  );
}
