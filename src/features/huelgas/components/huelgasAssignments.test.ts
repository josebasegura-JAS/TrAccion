import { describe, expect, it } from 'vitest';
import {
  asignacionKey,
  buildAsignacionesForPersonal,
  countPersonasByAsignacion,
  isAsignacionCompleta,
  mergeAsignacionesIntoMaster,
  type HuelgaPuestoAsignacion,
} from './huelgasAssignments';
import type { HuelgaPersonalTurno } from './huelgasPersonalImport';
import type { HuelgaZona } from './huelgasZones';
import type { HuelgaArea } from './huelgasAreas';

const now = '2026-10-05T10:00:00.000Z';

function persona(overrides: Partial<HuelgaPersonalTurno>): HuelgaPersonalTurno {
  return {
    id: 'p-1',
    residenciaEstacion: '',
    inicio: '',
    salida: '',
    entrada: '',
    fin: '',
    nombreApellidos: 'Persona',
    puesto: 'Puesto',
    turno: 'M',
    ...overrides,
  };
}

function zona(id: string, nombre: string, responsableNombre = 'Responsable', responsableEmail = 'resp@example.com'): HuelgaZona {
  return {
    id,
    nombre,
    responsableNombre,
    responsableEmail,
    correoActivo: true,
    correoAsunto: '',
    correoCuerpoHtml: '',
    correoPlazos: '',
    correoInstruccionesHabituales: '',
    correoCc: '',
    plantillaExcelNombrePatron: '',
    active: true,
    createdAt: now,
    updatedAt: now,
  };
}

function area(id: string, nombre: string, zonaId: string, active = true): HuelgaArea {
  return { id, nombre, zonaId, active, createdAt: now, updatedAt: now };
}

function asignacion(overrides: Partial<HuelgaPuestoAsignacion>): HuelgaPuestoAsignacion {
  return {
    residencia: 'Taller Ariz',
    puesto: 'Mecánico',
    area: 'Mantenimiento',
    areaId: 'a-1',
    zonaId: 'z-ariz',
    zonaNombre: 'MM Ariz',
    zonaResponsableNombre: 'Histórico',
    zonaResponsableEmail: 'historico@example.com',
    updatedAt: now,
    ...overrides,
  };
}

describe('huelgasAssignments — caracterización', () => {
  it('la clave ignora tildes, mayúsculas, NBSP y espacios duplicados', () => {
    expect(asignacionKey('  TÁLLER\u00a0 ARIZ ', ' Supervisión   de Estaciones ')).toBe(
      asignacionKey('taller ariz', 'supervision de estaciones'),
    );
  });

  it('prioriza residenciaAsignacion sobre plantilla y Excel al contar personas', () => {
    const counts = countPersonasByAsignacion([
      persona({ puesto: 'Mecánico', residenciaEstacion: 'Excel', residenciaPlantilla: 'Plantilla', residenciaAsignacion: 'Manual' }),
      persona({ id: 'p-2', puesto: 'Mecánico', residenciaEstacion: 'Excel', residenciaPlantilla: 'Plantilla' }),
      persona({ id: 'p-3', puesto: '', residenciaEstacion: 'Excel' }),
    ]);

    expect(counts.get(asignacionKey('Manual', 'Mecánico'))).toBe(1);
    expect(counts.get(asignacionKey('Plantilla', 'Mecánico'))).toBe(1);
    expect([...counts.values()].reduce((sum, value) => sum + value, 0)).toBe(2);
  });

  it('una asignación guardada en la huelga tiene prioridad y conserva el snapshot histórico de zona', () => {
    const current = asignacion({ zonaResponsableNombre: 'Responsable histórico', zonaResponsableEmail: 'old@example.com' });
    const result = buildAsignacionesForPersonal(
      [persona({ residenciaEstacion: 'Taller Ariz', puesto: 'Mecánico' })],
      [current],
      [asignacion({ zonaResponsableNombre: 'Maestro antiguo' })],
      [zona('z-ariz', 'MM Ariz', 'Responsable nuevo', 'new@example.com')],
      [area('a-1', 'Mantenimiento', 'z-ariz')],
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      zonaResponsableNombre: 'Responsable histórico',
      zonaResponsableEmail: 'old@example.com',
    });
  });

  it('una asignación nueva desde maestro refresca el snapshot con el responsable actual de la zona', () => {
    const result = buildAsignacionesForPersonal(
      [persona({ residenciaEstacion: 'Taller Ariz', puesto: 'Mecánico' })],
      [],
      [asignacion({ zonaResponsableNombre: 'Antiguo', zonaResponsableEmail: 'old@example.com' })],
      [zona('z-ariz', 'MM Ariz', 'Nuevo', 'new@example.com')],
      [area('a-1', 'Mantenimiento', 'z-ariz')],
    );

    expect(result[0]).toMatchObject({
      areaId: 'a-1',
      area: 'Mantenimiento',
      zonaId: 'z-ariz',
      zonaResponsableNombre: 'Nuevo',
      zonaResponsableEmail: 'new@example.com',
    });
  });

  it('la regla por puesto Supervisión de Estaciones prevalece sobre la residencia', () => {
    const result = buildAsignacionesForPersonal(
      [persona({ residenciaEstacion: 'Taller Ariz', puesto: 'Supervisión de Estaciones' })],
      [],
      [],
      [zona('z-ariz', 'MM Ariz'), zona('z-linea', 'GMO y Línea', 'Línea', 'linea@example.com')],
    );

    expect(result[0]).toMatchObject({
      zonaId: 'z-linea',
      zonaNombre: 'GMO y Línea',
      zonaResponsableNombre: 'Línea',
    });
  });

  it('aplica zonas automáticas por residencia solo cuando la asignación está vacía', () => {
    const zonas = [
      zona('z-ariz', 'MM Ariz'),
      zona('z-sopela', 'MM Sopela'),
      zona('z-sscc', 'SSCC'),
    ];
    const result = buildAsignacionesForPersonal([
      persona({ id: '1', residenciaEstacion: 'Taller Ariz', puesto: 'A' }),
      persona({ id: '2', residenciaEstacion: 'Sopela Taller', puesto: 'B' }),
      persona({ id: '3', residenciaEstacion: 'Oficinas Centrales', puesto: 'C' }),
    ], [], [], zonas);

    expect(result.map((item) => [item.residencia, item.zonaNombre])).toEqual([
      ['Oficinas Centrales', 'SSCC'],
      ['Sopela Taller', 'MM Sopela'],
      ['Taller Ariz', 'MM Ariz'],
    ]);
  });

  it('soporta maestro legacy sin residencia usando el puesto como fallback', () => {
    const legacy = asignacion({ residencia: '', puesto: 'Mecánico', area: 'Legacy', areaId: '' });
    const result = buildAsignacionesForPersonal(
      [persona({ residenciaEstacion: 'Otra Residencia', puesto: 'Mecánico' })],
      [],
      [legacy],
      [zona('z-ariz', 'MM Ariz')],
    );

    expect(result[0].area).toBe('Legacy');
  });

  it('considera completa solo una asignación con residencia, área, areaId y snapshot de zona completos', () => {
    expect(isAsignacionCompleta(asignacion({}))).toBe(true);
    expect(isAsignacionCompleta(asignacion({ areaId: '' }))).toBe(false);
    expect(isAsignacionCompleta(asignacion({ zonaResponsableEmail: '   ' }))).toBe(false);
  });

  it('al fusionar maestro elimina entradas legacy sin residencia y sustituye por clave residencia+puesto', () => {
    const merged = mergeAsignacionesIntoMaster(
      [
        asignacion({ residencia: '', puesto: 'Mecánico', area: 'Legacy' }),
        asignacion({ residencia: 'Taller Ariz', puesto: 'Mecánico', area: 'Anterior' }),
      ],
      [asignacion({ residencia: 'Taller Ariz', puesto: 'Mecánico', area: 'Nueva' })],
    );

    expect(merged).toHaveLength(1);
    expect(merged[0].area).toBe('Nueva');
  });
});
