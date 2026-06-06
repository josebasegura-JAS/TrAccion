export interface EmployeePersistedFields {
  empleado: string;
  nombreApellidos: string;
  puestoNomina: string;
  puestoOrganizativo: string;
  puestoEus: string;
  residencia: string;
  nivelRetributivo: string;
  sexo: string;
  calle: string;
  numero: string;
  piso: string;
  codigoPostal: string;
  poblacion: string;
  provincia: string;
  nif: string;
}

export interface EmployeeDerivedFields {
  dni: string;
  residenciaCast: string;
  residenciaEus: string;
  direccionTeletrabajo: string;
}

export interface Employee extends EmployeePersistedFields, EmployeeDerivedFields {
  deletedAt: string | null;
}

export type EmployeeDraft = EmployeePersistedFields;

export type EmployeeField = keyof EmployeePersistedFields;

export const EMPLOYEE_FIELDS: EmployeeField[] = [
  'empleado',
  'nombreApellidos',
  'puestoNomina',
  'puestoOrganizativo',
  'puestoEus',
  'residencia',
  'nivelRetributivo',
  'sexo',
  'calle',
  'numero',
  'piso',
  'codigoPostal',
  'poblacion',
  'provincia',
  'nif',
];

export const EMPTY_EMPLOYEE_DRAFT: EmployeeDraft = {
  empleado: '',
  nombreApellidos: '',
  puestoNomina: '',
  puestoOrganizativo: '',
  puestoEus: '',
  residencia: '',
  nivelRetributivo: '',
  sexo: '',
  calle: '',
  numero: '',
  piso: '',
  codigoPostal: '',
  poblacion: '',
  provincia: '',
  nif: '',
};
