import type { Employee } from '../../plantilla/domain/employee';
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
  const normalizedEmpleado = empleado.trim();
  if (!normalizedEmpleado) {
    return null;
  }

  return (
    employees.find(
      (employee) => !employee.deletedAt && employee.empleado.trim() === normalizedEmpleado,
    ) ?? null
  );
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
  const employeesByEmpleado = new Map(
    employees
      .filter((employee) => !employee.deletedAt)
      .map((employee): [string, Employee] => [employee.empleado.trim(), employee]),
  );

  return solicitudes.map((solicitud) =>
    applyPlantillaDataToTeletrabajoSolicitud(
      solicitud,
      employeesByEmpleado.get(solicitud.empleado.trim()) ?? null,
    ),
  );
}
