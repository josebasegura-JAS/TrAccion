export interface EmployeePersistedFields {
  empleado: string;
  nombreApellidos: string;
  puestoNomina: string;
  puestoOrganizativo: string;
  puestoEus: string;
  residencia: string;
  unidad: string;
  nivelRetributivo: string;
  direccionOrganizativa: string;
  antiguedadPuesto: string;
  sexo: string;
  calle: string;
  numero: string;
  piso: string;
  codigoPostal: string;
  poblacion: string;
  provincia: string;
  nif: string;
  telefono1: string;
  telefono2: string;
}

export interface EmployeeDerivedFields {
  dni: string;
  residenciaCast: string;
  residenciaEus: string;
  direccionTeletrabajo: string;
}

export interface Employee extends EmployeePersistedFields, EmployeeDerivedFields {
  /** Correo aprendido desde fuentes fiables (p. ej. remitente confirmado en Ayuda escolar). */
  email?: string;
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
  'unidad',
  'nivelRetributivo',
  'direccionOrganizativa',
  'antiguedadPuesto',
  'sexo',
  'calle',
  'numero',
  'piso',
  'codigoPostal',
  'poblacion',
  'provincia',
  'nif',
  'telefono1',
  'telefono2',
];

export const EMPTY_EMPLOYEE_DRAFT: EmployeeDraft = {
  empleado: '',
  nombreApellidos: '',
  puestoNomina: '',
  puestoOrganizativo: '',
  puestoEus: '',
  residencia: '',
  unidad: '',
  nivelRetributivo: '',
  direccionOrganizativa: '',
  antiguedadPuesto: '',
  sexo: '',
  calle: '',
  numero: '',
  piso: '',
  codigoPostal: '',
  poblacion: '',
  provincia: '',
  nif: '',
  telefono1: '',
  telefono2: '',
};
