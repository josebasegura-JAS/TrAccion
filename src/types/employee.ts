export type EmployeeStatus = 'Activo' | 'Pendiente' | 'Baja';

export interface Employee {
  empleado: string;
  nombreApellidos: string;
  puestoNomina: string;
  puestoOrganizativo: string;
  residencia: string;
  tituSuple: string;
  escalafon: string;
  unidad: string;
  direccionArea: string;
  grupo: string;
  familia: string;
  nivelRetributivo: string;
  fechaNacimiento: string;
  sexo: 'M' | 'F' | 'X';
  calle: string;
  numero: string;
  piso: string;
  codigoPostal: string;
  poblacion: string;
  provincia: string;
  telefono: string;
  segundoTelefono: string;
  estadoCivil: string;
  fechaEstadoCivil: string;
  nif: string;
  numeroSeguridadSocial: string;
  carnetConducir: string;
  disponeCoche: 'Sí' | 'No';
  estado: EmployeeStatus;
}

export interface EmployeeDerivedFields {
  residenciaCast: string;
  residenciaEus: string;
  dni: string;
  direccionTeletrabajo: string;
}
