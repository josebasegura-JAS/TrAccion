import { describe, expect, it } from 'vitest';
import type { Employee } from '../../plantilla/domain/employee';
import {
  rowsToTicketPeopleDrafts,
  splitPlantillaEmployeeName,
  ticketPersonDraftFromEmployee,
} from './importPeople';
import type { TicketCalendar } from './ticketRestaurante';

const employee = (overrides: Partial<Employee> = {}): Employee => ({
  empleado: '00123',
  nombreApellidos: 'García López María',
  puestoNomina: 'Técnica',
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
  nif: '12345678Z',
  dni: '12345678Z',
  residenciaCast: '',
  residenciaEus: '',
  direccionTeletrabajo: '',
  deletedAt: null,
  ...overrides,
});

const calendar: TicketCalendar = {
  id: 'calendar-1',
  nombre: 'General',
  activo: true,
  diasSinTicket: [],
  ticketIsoWeekdays: [1, 2, 3, 4, 5],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  deletedAt: null,
};

describe('ticket restaurante - Plantilla como fuente de personas', () => {
  it('interpreta el formato sin coma de Plantilla como Apellido1 Apellido2 Nombre', () => {
    expect(splitPlantillaEmployeeName('García López María')).toEqual({
      nombre: 'María',
      apellido1: 'García',
      apellido2: 'López',
    });
  });

  it('mantiene el formato corporativo con coma', () => {
    expect(splitPlantillaEmployeeName('García López, María José')).toEqual({
      nombre: 'María José',
      apellido1: 'García',
      apellido2: 'López',
    });
  });

  it('crea el borrador manual desde Plantilla y normaliza el número de empleado', () => {
    expect(ticketPersonDraftFromEmployee(employee(), 'calendar-1')).toMatchObject({
      empleado: '123',
      nombre: 'María',
      apellido1: 'García',
      apellido2: 'López',
      dni: '12345678Z',
      puesto: 'Técnica',
      calendarId: 'calendar-1',
    });
  });

  it('usa Nº empleado como clave al importar y toma los datos actuales de Plantilla', () => {
    const result = rowsToTicketPeopleDrafts(
      [
        ['Nº empleado', 'Calendario'],
        ['000123', 'General'],
      ],
      [employee({ nombreApellidos: 'Martínez Ruiz Ana' })],
      [calendar],
    );

    expect(result.drafts).toHaveLength(1);
    expect(result.drafts[0]).toMatchObject({
      empleado: '123',
      nombre: 'Ana',
      apellido1: 'Martínez',
      apellido2: 'Ruiz',
      calendarId: 'calendar-1',
    });
  });

  it('localiza la cabecera aunque el Excel tenga título y fecha antes de la tabla', () => {
    const result = rowsToTicketPeopleDrafts(
      [
        ['Personas Ticket Restaurante', '', '', '', '', '', '', ''],
        ['Generado: 12/8/2026', '', '', '', '', '', '', ''],
        ['', '', '', '', '', '', '', ''],
        ['Nº empleado', 'Nombre', 'Apellido1', 'Apellido2', 'DNI', 'Puesto', 'Calendario', 'Estado'],
        ['00123', 'Ana María', 'Martínez', 'Ruiz', '87654321X', 'Responsable', 'General', 'Activo'],
      ],
      [employee()],
      [calendar],
    );

    expect(result.drafts).toHaveLength(1);
    expect(result.drafts[0]).toMatchObject({
      empleado: '123',
      nombre: 'Ana María',
      apellido1: 'Martínez',
      apellido2: 'Ruiz',
      dni: '87654321X',
      puesto: 'Responsable',
      calendarId: 'calendar-1',
      activo: true,
    });
  });

  it('prioriza los campos corregidos del Excel para actualizar una persona existente', () => {
    const result = rowsToTicketPeopleDrafts(
      [
        ['Nº empleado', 'Nombre', 'Apellido1', 'Apellido2', 'DNI', 'Puesto', 'Calendario', 'Estado'],
        ['123', 'María', 'García', 'López', '12345678Z', 'Técnica superior', 'General', 'Inactivo'],
      ],
      [employee({ nombreApellidos: 'Dato Antiguo Incorrecto' })],
      [calendar],
    );

    expect(result.drafts[0]).toMatchObject({
      empleado: '123',
      nombre: 'María',
      apellido1: 'García',
      apellido2: 'López',
      dni: '12345678Z',
      puesto: 'Técnica superior',
      activo: false,
    });
  });

});
