export const TELETRABAJO_TIPOS_SOLICITUD = ['nueva', 'renovacion'] as const;
export const TELETRABAJO_ESTADOS = ['pendiente', 'analizada', 'aprobada', 'denegada'] as const;
export const TELETRABAJO_DIAS = ['martes', 'miercoles', 'jueves'] as const;

export type TeletrabajoTipoSolicitud = (typeof TELETRABAJO_TIPOS_SOLICITUD)[number];
export type TeletrabajoEstado = (typeof TELETRABAJO_ESTADOS)[number];
export type TeletrabajoDia = (typeof TELETRABAJO_DIAS)[number];

export interface TeletrabajoSolicitud {
  id: string;
  empleado: string;
  nombreApellidos: string;
  puestoNomina: string;
  puestoOrganizativo: string;
  residencia: string;
  dni: string;
  direccionTeletrabajo: string;
  estado: TeletrabajoEstado;
  tipoSolicitud: TeletrabajoTipoSolicitud;
  diasTeletrabajo: TeletrabajoDia[];
  fechaSolicitud: string;
  fechaOrdenador: string;
  fechaCascos: string;
  periodo: string;
  observaciones: string;
  observacionesRrll?: string;
  validacionSeguridadInformatica: boolean;
  validacionPrevencion: boolean;
  validacionJefatura: boolean;
  revisado: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export type TeletrabajoDraft = Pick<
  TeletrabajoSolicitud,
  | 'empleado'
  | 'nombreApellidos'
  | 'puestoNomina'
  | 'puestoOrganizativo'
  | 'residencia'
  | 'dni'
  | 'direccionTeletrabajo'
  | 'estado'
  | 'tipoSolicitud'
  | 'diasTeletrabajo'
  | 'fechaSolicitud'
  | 'fechaOrdenador'
  | 'fechaCascos'
  | 'periodo'
  | 'observaciones'
  | 'observacionesRrll'
  | 'validacionSeguridadInformatica'
  | 'validacionPrevencion'
  | 'validacionJefatura'
  | 'revisado'
>;

export type TeletrabajoTextField = Extract<
  keyof TeletrabajoDraft,
  | 'empleado'
  | 'nombreApellidos'
  | 'puestoNomina'
  | 'puestoOrganizativo'
  | 'residencia'
  | 'dni'
  | 'direccionTeletrabajo'
  | 'fechaSolicitud'
  | 'fechaOrdenador'
  | 'fechaCascos'
  | 'periodo'
>;

export const EMPTY_TELETRABAJO_DRAFT: TeletrabajoDraft = {
  empleado: '',
  nombreApellidos: '',
  puestoNomina: '',
  puestoOrganizativo: '',
  residencia: '',
  dni: '',
  direccionTeletrabajo: '',
  estado: 'pendiente',
  tipoSolicitud: 'nueva',
  diasTeletrabajo: [],
  fechaSolicitud: '',
  fechaOrdenador: '2024-09-01',
  fechaCascos: '2024-09-01',
  periodo: '',
  observaciones: '',
  observacionesRrll: '',
  validacionSeguridadInformatica: false,
  validacionPrevencion: false,
  validacionJefatura: false,
  revisado: false,
};

export function normalizeDiasTeletrabajo(values: readonly string[]): TeletrabajoDia[] {
  return TELETRABAJO_DIAS.filter((day) => values.includes(day));
}
