import type { Employee } from '../../plantilla/domain/employee';
import type { HuelgaPersonalTurno } from './huelgasPersonalImport';

export type HuelgaPersonalPlantillaStats = {
  total: number;
  encontrados: number;
  noEncontrados: number;
  ambiguos: number;
  sinResidenciaPlantilla: number;
  residenciaDiscrepante: number;
};

function clean(value: string): string {
  return value.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalizeName(value: string): string {
  return clean(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-ES')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenKey(value: string): string {
  return normalizeName(value).split(' ').filter(Boolean).sort().join('|');
}

function normalizeComparable(value: string): string {
  return clean(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-ES');
}

function buildIndex(employees: Employee[], keyOf: (name: string) => string): Map<string, Employee[]> {
  const index = new Map<string, Employee[]>();
  for (const employee of employees) {
    if (employee.deletedAt) continue;
    const key = keyOf(employee.nombreApellidos);
    if (!key) continue;
    const current = index.get(key) ?? [];
    current.push(employee);
    index.set(key, current);
  }
  return index;
}

export function enrichPersonalWithPlantilla(
  personal: HuelgaPersonalTurno[],
  employees: Employee[],
): { records: HuelgaPersonalTurno[]; stats: HuelgaPersonalPlantillaStats } {
  const exactIndex = buildIndex(employees, normalizeName);
  const tokenIndex = buildIndex(employees, tokenKey);

  const stats: HuelgaPersonalPlantillaStats = {
    total: personal.length,
    encontrados: 0,
    noEncontrados: 0,
    ambiguos: 0,
    sinResidenciaPlantilla: 0,
    residenciaDiscrepante: 0,
  };

  const records = personal.map((persona) => {
    const exactCandidates = exactIndex.get(normalizeName(persona.nombreApellidos)) ?? [];
    const fallbackCandidates = exactCandidates.length === 0
      ? tokenIndex.get(tokenKey(persona.nombreApellidos)) ?? []
      : [];
    const candidates = exactCandidates.length > 0 ? exactCandidates : fallbackCandidates;

    if (candidates.length === 0) {
      stats.noEncontrados += 1;
      return {
        ...persona,
        residenciaExcel: persona.residenciaEstacion,
        residenciaPlantilla: '',
        residenciaAsignacion: persona.residenciaEstacion,
        empleado: '',
        plantillaMatch: 'not-found' as const,
        residenciaDiscrepante: false,
      };
    }

    if (candidates.length > 1) {
      stats.ambiguos += 1;
      return {
        ...persona,
        residenciaExcel: persona.residenciaEstacion,
        residenciaPlantilla: '',
        residenciaAsignacion: persona.residenciaEstacion,
        empleado: '',
        plantillaMatch: 'ambiguous' as const,
        residenciaDiscrepante: false,
      };
    }

    const employee = candidates[0];
    const residenciaPlantilla = clean(employee.residencia || employee.residenciaCast || '');
    const residenciaExcel = clean(persona.residenciaEstacion);
    const discrepante = Boolean(
      residenciaPlantilla &&
      residenciaExcel &&
      normalizeComparable(residenciaPlantilla) !== normalizeComparable(residenciaExcel),
    );

    if (!residenciaPlantilla) {
      stats.sinResidenciaPlantilla += 1;
      return {
        ...persona,
        residenciaExcel,
        residenciaPlantilla: '',
        residenciaAsignacion: residenciaExcel,
        empleado: employee.empleado,
        plantillaMatch: 'no-residence' as const,
        residenciaDiscrepante: false,
      };
    }

    stats.encontrados += 1;
    if (discrepante) stats.residenciaDiscrepante += 1;

    return {
      ...persona,
      residenciaExcel,
      residenciaPlantilla,
      residenciaAsignacion: residenciaPlantilla,
      empleado: employee.empleado,
      plantillaMatch: 'matched' as const,
      residenciaDiscrepante: discrepante,
    };
  });

  return { records, stats };
}
