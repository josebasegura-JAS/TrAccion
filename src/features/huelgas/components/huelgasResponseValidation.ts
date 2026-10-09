import type { HuelgaZona } from './huelgasZones';
import type { HuelgaZoneResponse } from './huelgasResponseCollection';

export type HuelgaValidationSeverity = 'error' | 'warning';

export type HuelgaValidationIssue = {
  severity: HuelgaValidationSeverity;
  message: string;
  zonaId?: string;
  empleado?: string;
};

export type HuelgaValidationSummary = {
  errors: number;
  warnings: number;
  issues: HuelgaValidationIssue[];
};

function normalize(value: string): string {
  return value
    .replace(/\u00a0/g, ' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-ES')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeEmployee(value: string): string {
  return normalize(value).replace(/\s+/g, '');
}

function issue(
  severity: HuelgaValidationSeverity,
  message: string,
  zonaId?: string,
  empleado?: string,
): HuelgaValidationIssue {
  return { severity, message, zonaId, empleado };
}

function importedWarningIssue(message: string, zonaId: string): HuelgaValidationIssue {
  const blocking = /^\s*\[ERROR\]\s*/i.test(message);
  return issue(blocking ? 'error' : 'warning', message.replace(/^\s*\[ERROR\]\s*/i, ''), zonaId);
}

export function validateHuelgaZoneResponse(response: HuelgaZoneResponse): HuelgaValidationIssue[] {
  const issues = response.warnings.map((message) => importedWarningIssue(message, response.zonaId));

  if (!response.sourceFileName.trim()) {
    issues.push(issue('error', 'No hay un Excel de respuesta importado para este circuito.', response.zonaId));
  }
  if (response.personasTurno === null) issues.push(issue('error', 'Falta personas con turno.', response.zonaId));
  if (response.serviciosMinimos === null) issues.push(issue('error', 'Falta servicios mínimos.', response.zonaId));
  if (response.personasTrabajan === null) issues.push(issue('error', 'Falta personas que trabajan.', response.zonaId));
  if (response.personasHuelga === null) issues.push(issue('error', 'Falta personas en huelga.', response.zonaId));

  if (
    response.personasTurno !== null &&
    response.serviciosMinimos !== null &&
    response.personasTrabajan !== null &&
    response.personasHuelga !== null
  ) {
    const classified = response.serviciosMinimos + response.personasTrabajan + response.personasHuelga;
    if (classified !== response.personasTurno) {
      issues.push(issue(
        'error',
        `La suma SS.MM. + trabajan + huelga (${classified}) no coincide con las personas con turno (${response.personasTurno}).`,
        response.zonaId,
      ));
    }
  }

  const employees = new Map<string, string[]>();
  for (const person of response.huelguistas) {
    const employee = person.empleado.trim();
    const name = person.nombre.trim();
    if (!employee) issues.push(issue('error', `Huelguista sin nº de empleado: ${name || 'sin nombre'}.`, response.zonaId));
    if (!name) issues.push(issue('error', `El empleado ${employee || '(sin nº)'} no tiene nombre y apellidos.`, response.zonaId, employee));
    if (!employee) continue;
    const key = normalizeEmployee(employee);
    employees.set(key, [...(employees.get(key) ?? []), name]);
  }

  for (const [employee, names] of employees) {
    if (names.length > 1) {
      issues.push(issue(
        'error',
        `El nº de empleado ${employee} aparece más de una vez en el listado nominal de huelga.`,
        response.zonaId,
        employee,
      ));
    }
  }

  if (
    response.personasHuelga !== null &&
    response.huelguistas.length > 0 &&
    response.personasHuelga !== response.huelguistas.length
  ) {
    issues.push(issue(
      'error',
      `El total de personas en huelga (${response.personasHuelga}) no coincide con el listado nominal detectado (${response.huelguistas.length}).`,
      response.zonaId,
    ));
  }

  return issues;
}

export function validateHuelgaCollection(responses: HuelgaZoneResponse[]): HuelgaValidationIssue[] {
  const issues = responses.flatMap(validateHuelgaZoneResponse);

  for (const response of responses) {
    if (!response.reviewed) {
      issues.push(issue('error', 'El circuito todavía no está marcado como revisado.', response.zonaId));
    }
  }

  const employeeZones = new Map<string, { employee: string; zones: Set<string> }>();
  for (const response of responses) {
    for (const person of response.huelguistas) {
      const employee = person.empleado.trim();
      if (!employee) continue;
      const key = normalizeEmployee(employee);
      const current = employeeZones.get(key) ?? { employee, zones: new Set<string>() };
      current.zones.add(response.zonaNombre);
      employeeZones.set(key, current);
    }
  }

  for (const { employee, zones } of employeeZones.values()) {
    if (zones.size > 1) {
      issues.push(issue(
        'error',
        `El empleado ${employee} figura en huelga en varios circuitos: ${[...zones].join(', ')}.`,
        undefined,
        employee,
      ));
    }
  }

  return issues;
}

export function summarizeHuelgaValidation(issues: HuelgaValidationIssue[]): HuelgaValidationSummary {
  return {
    errors: issues.filter((item) => item.severity === 'error').length,
    warnings: issues.filter((item) => item.severity === 'warning').length,
    issues,
  };
}

export function fileCircuitMismatchWarning(
  fileName: string,
  currentZone: HuelgaZona,
  zones: HuelgaZona[],
): string | null {
  const normalizedFile = normalize(fileName);
  const currentName = normalize(currentZone.nombre);
  if (currentName.length >= 5 && normalizedFile.includes(currentName)) return null;

  const other = zones.find((zone) => {
    if (zone.id === currentZone.id) return false;
    const zoneName = normalize(zone.nombre);
    return zoneName.length >= 5 && normalizedFile.includes(zoneName);
  });
  return other
    ? `[ERROR] El nombre del fichero parece corresponder al circuito «${other.nombre}», no a «${currentZone.nombre}».`
    : null;
}

const EMPLOYEE_HEADERS = ['n empleado', 'no empleado', 'numero empleado', 'empleado'];
const NAME_HEADERS = ['nombre y apellidos', 'nombre apellidos', 'nombre'];
const MINIMUM_HEADERS = ['servicio minimo', 'servicios minimos', 'ssmm'];
const SITUATION_HEADERS = ['situacion', 'estado'];

function headerIndex(texts: string[], aliases: string[]): number {
  return texts.findIndex((text) => aliases.includes(normalize(text)));
}

function isMinimumValue(value: string): boolean {
  const normalized = normalize(value);
  return ['si', 's', 'x', '1'].includes(normalized) || normalized.includes('minimo');
}

export async function analyzeHuelgaResponseWorkbook(buffer: ArrayBuffer): Promise<string[]> {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const findings: string[] = [];

  for (const worksheet of workbook.worksheets) {
    for (let row = 1; row <= Math.min(worksheet.actualRowCount, 100); row += 1) {
      const texts = Array.from({ length: Math.min(worksheet.actualColumnCount, 40) }, (_, index) =>
        worksheet.getCell(row, index + 1).text,
      );
      const employeeIndex = headerIndex(texts, EMPLOYEE_HEADERS);
      const nameIndex = headerIndex(texts, NAME_HEADERS);
      const minimumIndex = headerIndex(texts, MINIMUM_HEADERS);
      const situationIndex = headerIndex(texts, SITUATION_HEADERS);
      if (nameIndex < 0 || (employeeIndex < 0 && situationIndex < 0 && minimumIndex < 0)) continue;

      const seenEmployees = new Set<string>();
      let consecutiveBlankRows = 0;
      for (let dataRow = row + 1; dataRow <= worksheet.actualRowCount; dataRow += 1) {
        const employee = employeeIndex >= 0 ? worksheet.getCell(dataRow, employeeIndex + 1).text.trim() : '';
        const name = worksheet.getCell(dataRow, nameIndex + 1).text.trim();
        const minimum = minimumIndex >= 0 ? worksheet.getCell(dataRow, minimumIndex + 1).text.trim() : '';
        const situation = situationIndex >= 0 ? worksheet.getCell(dataRow, situationIndex + 1).text.trim() : '';

        if (!employee && !name && !minimum && !situation) {
          consecutiveBlankRows += 1;
          if (consecutiveBlankRows >= 3) break;
          continue;
        }
        consecutiveBlankRows = 0;
        if (!employee && !name) continue;

        if (employeeIndex >= 0 && (!employee || !name)) {
          findings.push(`[ERROR] ${worksheet.name}: fila ${dataRow} incompleta; falta ${!employee ? 'nº de empleado' : 'nombre y apellidos'}.`);
        }

        if (employee) {
          const employeeKey = normalizeEmployee(employee);
          if (seenEmployees.has(employeeKey)) {
            findings.push(`[ERROR] ${worksheet.name}: el empleado ${employee} aparece repetido en la tabla.`);
          }
          seenEmployees.add(employeeKey);
        }

        const normalizedSituation = normalize(situation);
        const isStrike = normalizedSituation.includes('huelga') && !normalizedSituation.startsWith('no huelga');
        const isWorking = normalizedSituation.includes('trabaja') || normalizedSituation.includes('trabajo');
        const isMinimum = isMinimumValue(minimum);
        if (isStrike && isWorking) {
          findings.push(`[ERROR] ${worksheet.name}: ${employee || name} figura simultáneamente como huelga y trabajando.`);
        }
        if (isStrike && isMinimum) {
          findings.push(`[ERROR] ${worksheet.name}: ${employee || name} figura simultáneamente en huelga y como servicio mínimo.`);
        }
      }
      break;
    }
  }

  return [...new Set(findings)];
}
