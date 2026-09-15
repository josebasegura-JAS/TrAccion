import {
  BarChart3,
  CalendarCheck2,
  Euro,
  FileSpreadsheet,
  LockKeyhole,
  LockOpen,
  Search,
  Ticket,
  X,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { ActionButton } from '../../../components/ui/ActionButton';
import { useAppDialog } from '../../../hooks/useAppDialog';
import { openWorkbookInExcel } from '../../../shared/export/tableExport';
import type { Employee } from '../../plantilla/domain/employee';
import {
  calculateMonthlyTicketOrder,
  ticketPeopleExistingInMonth,
  normalizeTicketEmployeeNumber,
  type TicketCalendar,
  type TicketManutencionImpact,
  type TicketMonthlySnapshot,
  type TicketPerson,
  type TicketRestaurantAbsence,
  type TicketRestaurantConfig,
} from '../domain/ticketRestaurante';

const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'] as const;
const AREA_COLORS = ['#4F8DF7', '#5BCB78', '#FFAA3D', '#9B6DE3', '#E85D75', '#41B3B3', '#F4C542', '#8C7AE6'];

type AnnualMonthKind = 'actual' | 'current' | 'forecast' | 'inactive';

interface AnnualMonthDetail {
  kind: AnnualMonthKind;
  diasTeoricos: number;
  ausenciasMes: number;
  hojasGastoMes: number;
  deudaEntrante: number;
  ausenciasAplicadas: number;
  deudaPendiente: number;
  tickets: number;
  importe: number;
  calendario: string;
}


interface AnnualPersonRow {
  empleado: string;
  nombreApellidos: string;
  area: string;
  monthlyTickets: number[];
  monthlyAmounts: number[];
  monthlyKinds: AnnualMonthKind[];
  monthlyDetails: Array<AnnualMonthDetail | null>;
  actualTickets: number;
  forecastTickets: number;
  totalTickets: number;
  actualAmount: number;
  forecastAmount: number;
  totalAmount: number;
  monthsWithTickets: number;
  manual: boolean;
}

interface AnnualAreaRow {
  area: string;
  people: number;
  tickets: number;
  amount: number;
  share: number;
  averagePerPerson: number;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(value);
}

function trimString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeText(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').trim();
}

function annualMonthKind(year: number, month: number, isYearClosed: boolean): AnnualMonthKind {
  if (year === 2026 && month < 5) return 'inactive';
  if (isYearClosed) return 'actual';
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  if (year < currentYear) return 'actual';
  if (year > currentYear) return 'forecast';
  if (month < currentMonth) return 'actual';
  if (month === currentMonth) return 'current';
  return 'forecast';
}

function buildForecastConfig(config: TicketRestaurantConfig): TicketRestaurantConfig {
  return {
    ...config,
    // La previsión anual representa derecho teórico por calendario. No anticipa
    // deudas, regularizaciones, ausencias ni notas de gasto todavía inexistentes.
    manualDebts: [],
    debtRegularizations: [],
  };
}

function buildEmployeeAreaMap(employees: readonly Employee[]): Map<string, string> {
  return new Map(
    employees.map((employee) => [
      normalizeTicketEmployeeNumber(employee.empleado),
      trimString(employee.direccionOrganizativa) || trimString(employee.unidad) || 'Sin área',
    ]),
  );
}

async function exportAnnualWorkbook(
  year: number,
  peopleRows: readonly AnnualPersonRow[],
  areaRows: readonly AnnualAreaRow[],
): Promise<void> {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'TrAccion';
  workbook.created = new Date();

  const headerFill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF1F4E78' } };
  const headerFont = { bold: true, color: { argb: 'FFFFFFFF' } };
  const sectionFill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFD9EAF7' } };
  const totalFill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFEAF2F8' } };

  const actualTickets = peopleRows.reduce((sum, row) => sum + row.actualTickets, 0);
  const forecastTickets = peopleRows.reduce((sum, row) => sum + row.forecastTickets, 0);
  const totalTickets = actualTickets + forecastTickets;
  const actualAmount = peopleRows.reduce((sum, row) => sum + row.actualAmount, 0);
  const forecastAmount = peopleRows.reduce((sum, row) => sum + row.forecastAmount, 0);
  const totalAmount = actualAmount + forecastAmount;

  const summary = workbook.addWorksheet('Resumen anual', { views: [{ state: 'frozen', ySplit: 5 }] });
  summary.mergeCells('A1:F1');
  summary.getCell('A1').value = `Ticket Restaurante · Balance anual ${year}`;
  summary.getCell('A1').font = { bold: true, size: 18, color: { argb: 'FF17365D' } };
  summary.getCell('A3').value = 'Indicador';
  summary.getCell('B3').value = 'Valor';
  ['A3', 'B3'].forEach((address) => { summary.getCell(address).fill = headerFill; summary.getCell(address).font = headerFont; });
  [
    ['Tickets reales / en curso', actualTickets],
    ['Previsión resto del año', forecastTickets],
    ['Estimación total anual', totalTickets],
    ['Importe real / en curso', actualAmount],
    ['Importe previsto', forecastAmount],
    ['Estimación importe anual', totalAmount],
    ['Personas con tickets', peopleRows.filter((row) => row.totalTickets > 0).length],
    ['Áreas', areaRows.length],
  ].forEach((values) => summary.addRow(values));
  ['B7', 'B8', 'B9'].forEach((address) => { summary.getCell(address).numFmt = '#,##0.00 [$€-es-ES]'; });
  summary.columns = [{ width: 30 }, { width: 20 }, { width: 3 }, { width: 18 }, { width: 18 }, { width: 18 }];

  summary.addRow([]);
  const areaTitle = summary.addRow(['Distribución por área']);
  areaTitle.getCell(1).font = { bold: true, size: 13 };
  const areaHeader = summary.addRow(['Área', 'Personas', 'Tickets', 'Importe', '% total', 'Media/persona']);
  areaHeader.eachCell((cell) => { cell.fill = headerFill; cell.font = headerFont; });
  areaRows.forEach((row) => summary.addRow([row.area, row.people, row.tickets, row.amount, row.share, row.averagePerPerson]));
  summary.getColumn(4).numFmt = '#,##0.00 [$€-es-ES]';
  summary.getColumn(5).numFmt = '0.0%';
  summary.getColumn(6).numFmt = '#,##0.00 [$€-es-ES]';

  const peopleSheet = workbook.addWorksheet('Por persona', { views: [{ state: 'frozen', ySplit: 2, xSplit: 3 }] });
  const peopleHeaders = ['Nº empleado', 'Nombre y apellidos', 'Área', ...MONTHS, 'Total tickets', 'Importe total', 'Meses con tickets', 'Tipo'];
  peopleSheet.addRow([`Balance anual ${year}`]);
  peopleSheet.mergeCells(1, 1, 1, peopleHeaders.length);
  peopleSheet.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FF17365D' } };
  const peopleHeader = peopleSheet.addRow(peopleHeaders);
  peopleHeader.eachCell((cell) => { cell.fill = headerFill; cell.font = headerFont; });
  const realFill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFE2F0D9' } };
  const currentFill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFC6E0B4' } };
  const forecastFill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFFFF2CC' } };
  const inactiveFill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFF2F2F2' } };
  peopleRows.forEach((row) => {
    const excelRow = peopleSheet.addRow([
      row.empleado,
      row.nombreApellidos,
      row.area,
      ...row.monthlyTickets.map((value, index) => row.monthlyKinds[index] === 'inactive' ? null : value),
      row.totalTickets,
      row.totalAmount,
      row.monthsWithTickets,
      row.manual ? 'Manual' : 'Calendario',
    ]);
    row.monthlyKinds.forEach((kind, index) => {
      const cell = excelRow.getCell(4 + index);
      cell.fill = kind === 'forecast' ? forecastFill : kind === 'current' ? currentFill : kind === 'actual' ? realFill : inactiveFill;
    });
  });
  const peopleTotal = peopleSheet.addRow([
    '', 'TOTAL', '', ...MONTHS.map((_, index) => peopleRows.reduce((sum, row) => sum + row.monthlyTickets[index], 0)), totalTickets, totalAmount, '', '',
  ]);
  peopleTotal.eachCell((cell) => { cell.fill = totalFill; cell.font = { bold: true }; });
  MONTHS.forEach((_, index) => {
    const kinds = peopleRows.map((row) => row.monthlyKinds[index]).filter((kind) => kind !== 'inactive');
    const kind = kinds.includes('forecast') ? 'forecast' : kinds.includes('current') ? 'current' : 'actual';
    peopleTotal.getCell(4 + index).fill = kind === 'forecast' ? forecastFill : kind === 'current' ? currentFill : realFill;
  });
  peopleSheet.getColumn(1).width = 14;
  peopleSheet.getColumn(2).width = 34;
  peopleSheet.getColumn(3).width = 28;
  for (let index = 4; index <= 15; index += 1) peopleSheet.getColumn(index).width = 9;
  peopleSheet.getColumn(16).width = 14;
  peopleSheet.getColumn(17).width = 16;
  peopleSheet.getColumn(17).numFmt = '#,##0.00 [$€-es-ES]';
  peopleSheet.getColumn(18).width = 17;
  peopleSheet.getColumn(19).width = 12;
  peopleSheet.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: peopleHeaders.length } };

  const areaSheet = workbook.addWorksheet('Por área', { views: [{ state: 'frozen', ySplit: 2 }] });
  areaSheet.addRow([`Balance anual por área ${year}`]);
  areaSheet.mergeCells('A1:F1');
  areaSheet.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FF17365D' } };
  const areaSheetHeader = areaSheet.addRow(['Área', 'Personas', 'Tickets', 'Importe total', '% total', 'Media/persona']);
  areaSheetHeader.eachCell((cell) => { cell.fill = headerFill; cell.font = headerFont; });
  areaRows.forEach((row) => areaSheet.addRow([row.area, row.people, row.tickets, row.amount, row.share, row.averagePerPerson]));
  areaSheet.columns = [{ width: 32 }, { width: 14 }, { width: 14 }, { width: 18 }, { width: 12 }, { width: 18 }];
  areaSheet.getColumn(4).numFmt = '#,##0.00 [$€-es-ES]';
  areaSheet.getColumn(5).numFmt = '0.0%';
  areaSheet.getColumn(6).numFmt = '#,##0.00 [$€-es-ES]';
  areaSheet.autoFilter = 'A2:F2';

  const monthly = workbook.addWorksheet('Detalle mensual', { views: [{ state: 'frozen', ySplit: 2 }] });
  monthly.addRow([`Detalle mensual ${year}`]);
  monthly.mergeCells('A1:E1');
  monthly.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FF17365D' } };
  const monthlyHeader = monthly.addRow(['Mes', 'Estado', 'Tickets', 'Importe', 'Personas con tickets']);
  monthlyHeader.eachCell((cell) => { cell.fill = sectionFill; cell.font = { bold: true }; });
  MONTHS.forEach((label, index) => {
    const kinds = peopleRows.map((row) => row.monthlyKinds[index]).filter((kind) => kind !== 'inactive');
    const kind = kinds.includes('forecast') ? 'forecast' : kinds.includes('current') ? 'current' : 'actual';
    const row = monthly.addRow([
      label,
      kind === 'forecast' ? 'Previsión' : kind === 'current' ? 'En curso' : 'Real',
      peopleRows.reduce((sum, person) => sum + person.monthlyTickets[index], 0),
      peopleRows.reduce((sum, person) => sum + person.monthlyAmounts[index], 0),
      peopleRows.filter((person) => person.monthlyTickets[index] > 0).length,
    ]);
    const fill = kind === 'forecast' ? forecastFill : kind === 'current' ? currentFill : realFill;
    row.eachCell((cell) => { cell.fill = fill; });
  });
  monthly.columns = [{ width: 16 }, { width: 16 }, { width: 16 }, { width: 18 }, { width: 22 }];
  monthly.getColumn(4).numFmt = '#,##0.00 [$€-es-ES]';

  const personDetail = workbook.addWorksheet('Detalle por persona', { views: [{ state: 'frozen', ySplit: 2 }] });
  personDetail.addRow([`Detalle anual por persona ${year}`]);
  personDetail.mergeCells('A1:M1');
  personDetail.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FF17365D' } };
  const detailHeader = personDetail.addRow([
    'Nº empleado', 'Persona', 'Área', 'Mes', 'Estado', 'Calendario', 'Días calendario',
    'Ausencias del mes', 'Notas de gasto', 'Deuda entrante', 'Descuentos aplicados', 'Tickets', 'Importe',
  ]);
  detailHeader.eachCell((cell) => { cell.fill = headerFill; cell.font = headerFont; });
  peopleRows.forEach((person) => {
    MONTHS.forEach((monthLabel, index) => {
      const detail = person.monthlyDetails[index];
      const kind = person.monthlyKinds[index];
      const excelRow = personDetail.addRow([
        person.empleado, person.nombreApellidos, person.area, monthLabel,
        kind === 'inactive' ? 'Sin histórico/vigencia' : kind === 'forecast' ? 'Previsión' : kind === 'current' ? 'En curso' : 'Real',
        detail?.calendario ?? '', detail?.diasTeoricos ?? '', detail?.ausenciasMes ?? '', detail?.hojasGastoMes ?? '',
        detail?.deudaEntrante ?? '', detail?.ausenciasAplicadas ?? '',
        kind === 'inactive' ? '' : person.monthlyTickets[index], kind === 'inactive' ? '' : person.monthlyAmounts[index],
      ]);
      const fill = kind === 'forecast' ? forecastFill : kind === 'current' ? currentFill : kind === 'actual' ? realFill : inactiveFill;
      excelRow.eachCell((cell) => { cell.fill = fill; });
    });
  });
  personDetail.columns = [
    { width: 14 }, { width: 34 }, { width: 30 }, { width: 10 }, { width: 20 }, { width: 22 },
    { width: 16 }, { width: 18 }, { width: 16 }, { width: 16 }, { width: 20 }, { width: 12 }, { width: 16 },
  ];
  personDetail.getColumn(13).numFmt = '#,##0.00 [$€-es-ES]';
  personDetail.autoFilter = 'A2:M2';

  const buffer = await workbook.xlsx.writeBuffer();
  await openWorkbookInExcel(buffer, `Balance_anual_ticket_restaurante_${year}.xlsx`);
}

export function TicketRestauranteAnnualBalance({
  absences,
  calendars,
  config,
  employees,
  manutenciones,
  people,
  onUpdateConfig,
}: {
  absences: readonly TicketRestaurantAbsence[];
  calendars: readonly TicketCalendar[];
  config: TicketRestaurantConfig;
  employees: readonly Employee[];
  manutenciones: readonly TicketManutencionImpact[];
  people: readonly TicketPerson[];
  onUpdateConfig: (config: TicketRestaurantConfig) => Promise<{ ok: boolean; message?: string }>;
}) {
  const { confirm, dialogNode } = useAppDialog();
  const [year, setYear] = useState(new Date().getFullYear());
  const [mode, setMode] = useState<'people' | 'areas'>('people');
  const [search, setSearch] = useState('');
  const [areaFilter, setAreaFilter] = useState('');
  const [exporting, setExporting] = useState(false);
  const [closingYear, setClosingYear] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [selectedEmployee, setSelectedEmployee] = useState<string | null>(null);
  const areaByEmployee = useMemo(() => buildEmployeeAreaMap(employees), [employees]);
  const yearClosure = config.annualClosures?.[String(year)];
  const isYearClosed = Boolean(yearClosure);

  const peopleRows = useMemo<AnnualPersonRow[]>(() => {
    const byEmployee = new Map<string, AnnualPersonRow>();
    const forecastConfig = buildForecastConfig(config);

    for (let month = 1; month <= 12; month += 1) {
      const key = `${year}-${String(month).padStart(2, '0')}`;
      const monthKind = annualMonthKind(year, month, isYearClosed);
      if (monthKind === 'inactive') continue;
      const snapshot = monthKind === 'actual' && isYearClosed ? config.monthlySnapshots?.[key] : undefined;
      const monthPeople = ticketPeopleExistingInMonth(people, year, month);
      const effectiveConfig = monthKind === 'forecast' ? forecastConfig : config;
      const calculation = snapshot
        ? null
        : calculateMonthlyTicketOrder(
            monthPeople,
            calendars,
            monthKind === 'forecast' ? [] : absences,
            effectiveConfig,
            year,
            month,
            monthKind === 'forecast' ? [] : manutenciones,
          );
      const sourceRows = snapshot
        ? snapshot.rows.map((row) => ({
            empleado: row.empleado,
            nombreApellidos: row.nombreApellidos,
            area: row.area,
            tickets: row.tickets,
            importe: row.importe,
            manual: row.manual,
            detail: null as AnnualMonthDetail | null,
          }))
        : (calculation?.rows ?? []).map((row) => {
            const employeeKey = normalizeTicketEmployeeNumber(row.empleado);
            const manualPerson = (config.manualPeople ?? []).find((item) => normalizeTicketEmployeeNumber(item.empleado) === employeeKey);
            return {
              empleado: row.empleado,
              nombreApellidos: row.nombreApellidos,
              area: manualPerson?.area?.trim() || areaByEmployee.get(employeeKey) || 'Sin área',
              tickets: row.ticketsFinales,
              importe: row.importe,
              manual: row.manualEntry === true,
              detail: {
                kind: monthKind,
                diasTeoricos: row.diasTeoricos,
                ausenciasMes: row.ausenciasMes,
                hojasGastoMes: row.hojasGastoMes,
                deudaEntrante: row.deudaEntrante,
                ausenciasAplicadas: row.ausenciasAplicadas,
                deudaPendiente: row.deudaPendiente,
                tickets: row.ticketsFinales,
                importe: row.importe,
                calendario: row.calendario,
              } satisfies AnnualMonthDetail,
            };
          });

      sourceRows.forEach((row) => {
        const employeeKey = normalizeTicketEmployeeNumber(row.empleado);
        const existing = byEmployee.get(employeeKey) ?? {
          empleado: employeeKey,
          nombreApellidos: row.nombreApellidos,
          area: row.area || 'Sin área',
          monthlyTickets: Array(12).fill(0) as number[],
          monthlyAmounts: Array(12).fill(0) as number[],
          monthlyKinds: Array(12).fill('inactive') as AnnualMonthKind[],
          monthlyDetails: Array(12).fill(null) as Array<AnnualMonthDetail | null>,
          actualTickets: 0,
          forecastTickets: 0,
          totalTickets: 0,
          actualAmount: 0,
          forecastAmount: 0,
          totalAmount: 0,
          monthsWithTickets: 0,
          manual: row.manual,
        };
        existing.monthlyTickets[month - 1] = row.tickets;
        existing.monthlyAmounts[month - 1] = row.importe;
        existing.monthlyKinds[month - 1] = monthKind;
        existing.monthlyDetails[month - 1] = row.detail;
        if (monthKind === 'forecast') {
          existing.forecastTickets += row.tickets;
          existing.forecastAmount += row.importe;
        } else {
          existing.actualTickets += row.tickets;
          existing.actualAmount += row.importe;
        }
        existing.totalTickets += row.tickets;
        existing.totalAmount += row.importe;
        if (row.tickets > 0) existing.monthsWithTickets += 1;
        byEmployee.set(employeeKey, existing);
      });
    }
    return [...byEmployee.values()].sort((a, b) => a.empleado.localeCompare(b.empleado, 'es', { numeric: true, sensitivity: 'base' }));
  }, [absences, areaByEmployee, calendars, config, isYearClosed, manutenciones, people, year]);

  const areaRows = useMemo<AnnualAreaRow[]>(() => {
    const totalAmount = peopleRows.reduce((sum, row) => sum + row.totalAmount, 0);
    const groups = new Map<string, { people: number; tickets: number; amount: number }>();
    peopleRows.forEach((row) => {
      if (row.totalTickets <= 0) return;
      const group = groups.get(row.area) ?? { people: 0, tickets: 0, amount: 0 };
      group.people += 1;
      group.tickets += row.totalTickets;
      group.amount += row.totalAmount;
      groups.set(row.area, group);
    });
    return [...groups.entries()].map(([area, data]) => ({
      area,
      ...data,
      share: totalAmount > 0 ? data.amount / totalAmount : 0,
      averagePerPerson: data.people > 0 ? data.amount / data.people : 0,
    })).sort((a, b) => b.amount - a.amount || a.area.localeCompare(b.area, 'es'));
  }, [peopleRows]);

  const areas = useMemo(() => areaRows.map((row) => row.area).sort((a, b) => a.localeCompare(b, 'es')), [areaRows]);
  const filteredPeople = useMemo(() => {
    const query = normalizeText(search);
    return peopleRows.filter((row) => {
      if (areaFilter && row.area !== areaFilter) return false;
      if (!query) return true;
      return normalizeText(`${row.empleado} ${row.nombreApellidos} ${row.area}`).includes(query);
    });
  }, [areaFilter, peopleRows, search]);
  const filteredAreas = useMemo(() => {
    const query = normalizeText(search);
    return areaRows.filter((row) => (!areaFilter || row.area === areaFilter) && (!query || normalizeText(row.area).includes(query)));
  }, [areaFilter, areaRows, search]);

  const selectedPerson = useMemo(
    () => selectedEmployee ? peopleRows.find((row) => row.empleado === selectedEmployee) ?? null : null,
    [peopleRows, selectedEmployee],
  );

  const actualTickets = peopleRows.reduce((sum, row) => sum + row.actualTickets, 0);
  const forecastTickets = peopleRows.reduce((sum, row) => sum + row.forecastTickets, 0);
  const totalTickets = actualTickets + forecastTickets;
  const actualAmount = peopleRows.reduce((sum, row) => sum + row.actualAmount, 0);
  const forecastAmount = peopleRows.reduce((sum, row) => sum + row.forecastAmount, 0);
  const totalAmount = actualAmount + forecastAmount;
  const peopleWithTickets = peopleRows.filter((row) => row.totalTickets > 0).length;
  const average = peopleWithTickets ? totalAmount / peopleWithTickets : 0;
  const monthlyTotals = MONTHS.map((_, index) => peopleRows.reduce((sum, row) => sum + row.monthlyTickets[index], 0));
  const maxMonthly = Math.max(...monthlyTotals, 1);
  const maxAreaTickets = Math.max(...areaRows.map((row) => row.tickets), 1);

  const canCloseYear = year < new Date().getFullYear();

  const handleCloseYear = async () => {
    if (!canCloseYear) {
      setStatusMessage('El ejercicio solo puede cerrarse cuando el año ha finalizado.');
      return;
    }
    const confirmed = await confirm(
      `Cerrar el ejercicio ${year}? Se guardará una fotografía definitiva de los 12 meses. Podrás reabrirlo después si necesitas hacer una regularización.`,
      { title: 'Cerrar ejercicio', confirmLabel: 'Cerrar ejercicio', cancelLabel: 'Cancelar' },
    );
    if (!confirmed) return;

    setClosingYear(true);
    setStatusMessage('');
    try {
      const closedAt = new Date().toISOString();
      const snapshots: Record<string, TicketMonthlySnapshot> = { ...(config.monthlySnapshots ?? {}) };
      for (let month = 1; month <= 12; month += 1) {
        const key = `${year}-${String(month).padStart(2, '0')}`;
        const calculation = calculateMonthlyTicketOrder(
          ticketPeopleExistingInMonth(people, year, month),
          calendars,
          absences,
          config,
          year,
          month,
          manutenciones,
        );
        snapshots[key] = {
          year,
          month,
          closedAt,
          rows: calculation.rows.map((row) => {
            const employeeKey = normalizeTicketEmployeeNumber(row.empleado);
            const manualPerson = (config.manualPeople ?? []).find((item) => normalizeTicketEmployeeNumber(item.empleado) === employeeKey);
            return {
              empleado: employeeKey,
              nombreApellidos: row.nombreApellidos,
              area: manualPerson?.area?.trim() || areaByEmployee.get(employeeKey) || 'Sin área',
              tickets: row.ticketsFinales,
              importe: row.importe,
              manual: row.manualEntry === true,
            };
          }),
        };
      }
      const annualClosures = {
        ...(config.annualClosures ?? {}),
        [String(year)]: { year, closedAt },
      };
      const result = await onUpdateConfig({ ...config, monthlySnapshots: snapshots, annualClosures });
      setStatusMessage(result.ok ? `Ejercicio ${year} cerrado correctamente.` : result.message ?? 'No se ha podido cerrar el ejercicio.');
    } finally {
      setClosingYear(false);
    }
  };

  const handleReopenYear = async () => {
    const confirmed = await confirm(
      `Reabrir el ejercicio ${year}? El balance volverá a calcularse con los datos actuales y podrás incorporar regularizaciones retroactivas.`,
      { title: 'Reabrir ejercicio', confirmLabel: 'Reabrir ejercicio', cancelLabel: 'Cancelar' },
    );
    if (!confirmed) return;

    setClosingYear(true);
    setStatusMessage('');
    try {
      const snapshots = { ...(config.monthlySnapshots ?? {}) };
      Object.keys(snapshots).forEach((key) => {
        if (key.startsWith(`${year}-`)) delete snapshots[key];
      });
      const annualClosures = { ...(config.annualClosures ?? {}) };
      delete annualClosures[String(year)];
      const result = await onUpdateConfig({ ...config, monthlySnapshots: snapshots, annualClosures });
      setStatusMessage(result.ok ? `Ejercicio ${year} reabierto. El balance vuelve a estar en curso.` : result.message ?? 'No se ha podido reabrir el ejercicio.');
    } finally {
      setClosingYear(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      await exportAnnualWorkbook(year, peopleRows, areaRows);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-metro-border bg-metro-panel p-4 shadow-card">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-blue-500" />
              <h2 className="text-lg font-black text-metro-text">Balance anual de tickets restaurante</h2>
            </div>
            <p className="mt-1 text-xs text-metro-muted">Real acumulado y previsión hasta diciembre. Los meses transcurridos descuentan ausencias y notas de gasto; los futuros se proyectan según cada calendario.</p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-[11px] font-bold uppercase tracking-wide text-metro-muted">
              Año
              <select className="ml-2 h-9 rounded-xl border border-metro-border bg-metro-surface px-3 text-xs font-semibold text-metro-text" value={year} onChange={(event) => setYear(Number(event.target.value))}>
                {Array.from({ length: 7 }, (_, index) => new Date().getFullYear() + 1 - index).map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
            {isYearClosed ? (
              <ActionButton icon={LockOpen} iconOnly={false} loading={closingYear} onClick={() => void handleReopenYear()} size="sm" variant="secondary">
                Reabrir ejercicio
              </ActionButton>
            ) : (
              <ActionButton disabled={!canCloseYear} icon={LockKeyhole} iconOnly={false} loading={closingYear} onClick={() => void handleCloseYear()} size="sm" title={!canCloseYear ? 'Podrás cerrar el ejercicio cuando el año haya finalizado.' : undefined} variant="secondary">
                Cerrar ejercicio
              </ActionButton>
            )}
            <ActionButton icon={FileSpreadsheet} iconOnly={false} onClick={() => void handleExport()} size="sm" variant="secondary">
              {exporting ? 'Generando…' : 'Exportar Excel'}
            </ActionButton>
          </div>
        </div>
      </section>
      <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-metro-muted">
        <span>
          {isYearClosed
            ? `Ejercicio cerrado${yearClosure?.closedAt ? ` el ${new Date(yearClosure.closedAt).toLocaleDateString('es-ES')}` : ''}. El histórico permanece fijo hasta que lo reabras.`
            : year === new Date().getFullYear()
              ? 'Ejercicio en curso: verde = real/en curso con incidencias registradas; amarillo = previsión futura por calendario, sin anticipar ausencias ni notas de gasto.'
              : canCloseYear
                ? 'Ejercicio abierto: puedes incorporar regularizaciones retroactivas y cerrarlo cuando la información sea definitiva.'
                : 'Ejercicio futuro: todavía no hay datos que cerrar.'}
        </span>
        {statusMessage ? <span className="font-semibold text-metro-text">{statusMessage}</span> : null}
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={Ticket} label="Real / en curso" value={actualTickets.toLocaleString('es-ES')} secondary={formatCurrency(actualAmount)} />
        <MetricCard icon={CalendarCheck2} label="Previsión futura" value={forecastTickets.toLocaleString('es-ES')} secondary={formatCurrency(forecastAmount)} />
        <MetricCard icon={Euro} label="Estimación anual" value={totalTickets.toLocaleString('es-ES')} secondary={formatCurrency(totalAmount)} />
        <MetricCard icon={Users} label="Personas con tickets" value={String(peopleWithTickets)} secondary={`Media estimada ${formatCurrency(average)}`} />
      </div>

      <div className="grid gap-2.5 xl:grid-cols-[1.35fr_1fr]">
        <section className="rounded-2xl border border-metro-border bg-metro-panel p-4 shadow-card">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-black text-metro-text">Evolución mensual</h3>
              <p className="text-xs text-metro-muted">Real/en curso en verde · previsión futura en amarillo</p>
            </div>
            <CalendarCheck2 className="h-4 w-4 text-blue-500" />
          </div>
          <div className="flex h-44 items-end gap-2 border-b border-metro-border/80 px-1 pb-1">
            {monthlyTotals.map((value, index) => (
              <div className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1" key={MONTHS[index]}>
                <span className="text-xs font-bold text-metro-muted">{value || ''}</span>
                <div
                  className={`w-full rounded-t-md ${annualMonthKind(year, index + 1, isYearClosed) === 'inactive' ? 'bg-slate-400/20' : annualMonthKind(year, index + 1, isYearClosed) === 'forecast' ? 'bg-amber-400/80' : 'bg-emerald-500/80'}`}
                  style={{ height: `${Math.max(value ? 8 : 1, (value / maxMonthly) * 112)}px` }}
                  title={`${MONTHS[index]}: ${value} tickets · ${annualMonthKind(year, index + 1, isYearClosed) === 'forecast' ? 'previsión' : annualMonthKind(year, index + 1, isYearClosed) === 'current' ? 'en curso' : 'real'}`}
                />
                <span className="text-[11px] font-semibold text-metro-muted">{MONTHS[index]}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-metro-border bg-metro-panel p-4 shadow-card">
          <h3 className="text-sm font-black text-metro-text">Tickets por área</h3>
          <p className="mb-3 text-xs text-metro-muted">Peso de cada área sobre el acumulado</p>
          <div className="space-y-2">
            {areaRows.slice(0, 8).map((row, index) => (
              <div key={row.area}>
                <div className="mb-1 flex items-center justify-between gap-3 text-xs">
                  <span className="truncate font-semibold text-metro-text" title={row.area}>{row.area}</span>
                  <span className="shrink-0 font-bold text-metro-muted">{row.tickets.toLocaleString('es-ES')} · {(row.share * 100).toFixed(1)}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-metro-surface">
                  <div className="h-full rounded-full" style={{ backgroundColor: AREA_COLORS[index % AREA_COLORS.length], width: `${(row.tickets / maxAreaTickets) * 100}%` }} />
                </div>
              </div>
            ))}
            {!areaRows.length ? <p className="py-8 text-center text-xs text-metro-muted">No hay datos para este año.</p> : null}
          </div>
        </section>
      </div>

      <section className="overflow-hidden rounded-2xl border border-metro-border bg-metro-panel shadow-card">
        <div className="flex flex-col gap-2 border-b border-metro-border p-2.5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-2">
            <button className={`h-9 rounded-xl px-3 text-xs font-bold ${mode === 'people' ? 'bg-blue-500 text-white' : 'bg-metro-surface text-metro-muted'}`} onClick={() => setMode('people')} type="button">Personas</button>
            <button className={`h-9 rounded-xl px-3 text-xs font-bold ${mode === 'areas' ? 'bg-blue-500 text-white' : 'bg-metro-surface text-metro-muted'}`} onClick={() => setMode('areas')} type="button">Áreas</button>
          </div>
          <div className="flex flex-1 flex-wrap gap-2 lg:justify-end">
            <label className="relative min-w-[220px] max-w-sm flex-1 lg:flex-none">
              <Search className="pointer-events-none absolute left-2.5 top-2 h-4 w-4 text-metro-muted" />
              <input className="h-9 w-full rounded-xl border border-metro-border bg-metro-surface pl-8 pr-3 text-xs text-metro-text outline-none focus:border-blue-500" onChange={(event) => setSearch(event.target.value)} placeholder={mode === 'people' ? 'Buscar persona, nº o área…' : 'Buscar área…'} value={search} />
            </label>
            <select className="h-9 min-w-[190px] rounded-xl border border-metro-border bg-metro-surface px-3 text-xs font-semibold text-metro-text" onChange={(event) => setAreaFilter(event.target.value)} value={areaFilter}>
              <option value="">Todas las áreas</option>
              {areas.map((area) => <option key={area} value={area}>{area}</option>)}
            </select>
          </div>
        </div>
        {mode === 'people' ? (
          <div className="flex flex-wrap items-center gap-4 border-b border-metro-border/70 px-3 py-2 text-[11px] font-semibold text-metro-muted">
            <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-emerald-500/80" /> Real / mes en curso</span>
            <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-amber-400/80" /> Previsión por calendario</span>
            <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-slate-400/30" /> Sin vigencia</span>
          </div>
        ) : null}

        {mode === 'people' ? (
          <div className="overflow-x-auto">
            <table className="min-w-[1180px] w-full border-collapse text-xs">
              <thead className="bg-metro-surface/80 text-metro-muted">
                <tr>
                  <th className="px-2 py-2 text-left">Nº empleado</th><th className="px-2 py-2 text-left">Persona</th><th className="px-2 py-2 text-left">Área</th>
                  {MONTHS.map((month, index) => {
                    const kind = annualMonthKind(year, index + 1, isYearClosed);
                    return <th className={`px-1.5 py-2 text-right ${kind === 'inactive' ? 'bg-slate-400/5 text-slate-500' : kind === 'forecast' ? 'bg-amber-400/10 text-amber-500' : 'bg-emerald-500/10 text-emerald-500'}`} key={month}>{month}</th>;
                  })}
                  <th className="px-2 py-2 text-right">Total</th><th className="px-2 py-2 text-right">Importe</th><th className="px-2 py-2 text-right">Meses</th>
                </tr>
              </thead>
              <tbody>
                {filteredPeople.map((row) => (
                  <tr className="cursor-pointer border-t border-metro-border/70 hover:bg-metro-surface/60" key={row.empleado} onClick={() => setSelectedEmployee(row.empleado)} title="Ver desglose anual">
                    <td className="px-2 py-1.5 font-bold text-metro-text">{row.empleado}</td>
                    <td className="px-2 py-1.5 text-metro-text"><span className="font-semibold">{row.nombreApellidos}</span>{row.manual ? <span className="ml-1 rounded bg-violet-500/15 px-1 py-0.5 text-[10px] font-bold text-violet-400">MANUAL</span> : null}</td>
                    <td className="max-w-[190px] truncate px-2 py-1.5 text-metro-muted" title={row.area}>{row.area}</td>
                    {row.monthlyTickets.map((tickets, index) => {
                      const kind = row.monthlyKinds[index];
                      const tone = kind === 'forecast'
                        ? 'bg-amber-400/10 font-semibold text-amber-500'
                        : kind === 'current'
                          ? 'bg-emerald-500/15 font-bold text-emerald-500'
                          : kind === 'actual'
                            ? 'bg-emerald-500/[0.07] font-semibold text-emerald-500'
                            : 'bg-slate-500/[0.04] text-metro-muted/45';
                      return <td className={`px-1.5 py-1.5 text-right tabular-nums ${tone}`} key={index}>{kind === 'inactive' ? '—' : tickets}</td>;
                    })}
                    <td className="px-2 py-1.5 text-right font-black tabular-nums text-metro-text">{row.totalTickets}</td>
                    <td className="px-2 py-1.5 text-right font-bold tabular-nums text-metro-text">{formatCurrency(row.totalAmount)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-metro-muted">{row.monthsWithTickets}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-metro-border bg-blue-500/5 font-black text-metro-text">
                <tr>
                  <td className="px-2 py-2" colSpan={3}>TOTAL</td>
                  {MONTHS.map((_, index) => {
                    const kind = annualMonthKind(year, index + 1, isYearClosed);
                    return <td className={`px-1.5 py-2 text-right ${kind === 'forecast' ? 'bg-amber-400/10 text-amber-600' : 'bg-emerald-500/10 text-emerald-600'}`} key={index}>{filteredPeople.reduce((sum, row) => sum + row.monthlyTickets[index], 0)}</td>;
                  })}
                  <td className="px-2 py-2 text-right">{filteredPeople.reduce((sum, row) => sum + row.totalTickets, 0)}</td>
                  <td className="px-2 py-2 text-right">{formatCurrency(filteredPeople.reduce((sum, row) => sum + row.totalAmount, 0))}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-xs">
              <thead className="bg-metro-surface/80 text-metro-muted"><tr><th className="px-3 py-2 text-left">Área</th><th className="px-3 py-2 text-right">Personas</th><th className="px-3 py-2 text-right">Tickets</th><th className="px-3 py-2 text-right">Importe total</th><th className="px-3 py-2 text-right">% total</th><th className="px-3 py-2 text-right">Media/persona</th></tr></thead>
              <tbody>{filteredAreas.map((row) => <tr className="border-t border-metro-border/70" key={row.area}><td className="px-3 py-2 font-bold text-metro-text">{row.area}</td><td className="px-3 py-2 text-right">{row.people}</td><td className="px-3 py-2 text-right font-bold">{row.tickets}</td><td className="px-3 py-2 text-right font-bold">{formatCurrency(row.amount)}</td><td className="px-3 py-2 text-right">{(row.share * 100).toFixed(1)}%</td><td className="px-3 py-2 text-right">{formatCurrency(row.averagePerPerson)}</td></tr>)}</tbody>
            </table>
          </div>
        )}
      </section>

      <div className="grid gap-2 lg:grid-cols-[1fr_auto]">
        <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 px-3 py-2 text-xs text-metro-muted">
          <strong className="text-metro-text">Criterio:</strong> los meses transcurridos y el mes en curso muestran el pedido calculado con ausencias, manutenciones/notas de gasto y regularizaciones registradas. Los meses futuros son una previsión teórica según calendario y vigencia, sin anticipar incidencias. Una incorporación posterior no genera tickets retroactivos. Al cerrar el ejercicio se guarda una fotografía definitiva.
        </div>
        <div className="flex items-center rounded-xl border border-metro-border bg-metro-panel px-3 py-2 text-xs text-metro-muted">
          <Users className="mr-2 h-4 w-4 text-blue-500" /> {peopleRows.filter((row) => row.area === 'Sin área').length} persona(s) sin área asignada
        </div>
      </div>
      {selectedPerson ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/65 p-4" role="dialog" aria-modal="true" aria-label={`Desglose anual de ${selectedPerson.nombreApellidos}`}>
          <section className="flex max-h-[88vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-metro-border bg-metro-panel shadow-2xl">
            <header className="flex items-start justify-between gap-3 border-b border-metro-border px-5 py-4">
              <div><p className="text-[11px] font-bold uppercase tracking-wide text-blue-500">Detalle anual · {year}</p><h3 className="mt-1 text-lg font-black text-metro-text">{selectedPerson.nombreApellidos}</h3><p className="text-xs text-metro-muted">Nº {selectedPerson.empleado} · {selectedPerson.area}</p></div>
              <button className="grid h-9 w-9 place-items-center rounded-xl border border-metro-border bg-metro-surface text-metro-muted hover:text-metro-text" onClick={() => setSelectedEmployee(null)} type="button" aria-label="Cerrar detalle"><X className="h-4 w-4" /></button>
            </header>
            <div className="overflow-auto p-4">
              <div className="mb-3 flex flex-wrap gap-3 text-[11px] font-semibold text-metro-muted"><span><strong className="text-metro-text">Real/en curso:</strong> {selectedPerson.actualTickets} tickets · {formatCurrency(selectedPerson.actualAmount)}</span><span><strong className="text-metro-text">Previsión:</strong> {selectedPerson.forecastTickets} tickets · {formatCurrency(selectedPerson.forecastAmount)}</span><span><strong className="text-metro-text">Estimación anual:</strong> {selectedPerson.totalTickets} tickets · {formatCurrency(selectedPerson.totalAmount)}</span></div>
              <table className="w-full min-w-[980px] border-collapse text-xs">
                <thead className="bg-metro-surface/80 text-metro-muted"><tr><th className="px-2 py-2 text-left">Mes</th><th className="px-2 py-2 text-left">Estado</th><th className="px-2 py-2 text-left">Calendario</th><th className="px-2 py-2 text-right">Días calendario</th><th className="px-2 py-2 text-right">Ausencias</th><th className="px-2 py-2 text-right">Notas gasto</th><th className="px-2 py-2 text-right">Deuda entrante</th><th className="px-2 py-2 text-right">Descuentos aplicados</th><th className="px-2 py-2 text-right">Deuda pendiente</th><th className="px-2 py-2 text-right">Tickets</th><th className="px-2 py-2 text-right">Importe</th></tr></thead>
                <tbody>{MONTHS.map((monthLabel, index) => { const detail = selectedPerson.monthlyDetails[index]; const kind = selectedPerson.monthlyKinds[index]; return (<tr className={`border-t border-metro-border/70 ${kind === 'inactive' ? 'bg-slate-400/[0.03]' : kind === 'forecast' ? 'bg-amber-400/[0.06]' : 'bg-emerald-500/[0.05]'}`} key={monthLabel}><td className="px-2 py-2 font-bold text-metro-text">{monthLabel}</td><td className={`px-2 py-2 font-semibold ${kind === 'forecast' ? 'text-amber-500' : kind === 'inactive' ? 'text-slate-500' : 'text-emerald-500'}`}>{kind === 'inactive' ? 'Fuera histórico / sin vigencia' : kind === 'forecast' ? 'Previsión' : kind === 'current' ? 'En curso' : 'Real'}</td><td className="px-2 py-2 text-metro-muted">{detail?.calendario || '—'}</td><td className="px-2 py-2 text-right tabular-nums">{detail?.diasTeoricos ?? '—'}</td><td className="px-2 py-2 text-right tabular-nums">{detail?.ausenciasMes ?? '—'}</td><td className="px-2 py-2 text-right tabular-nums">{detail?.hojasGastoMes ?? '—'}</td><td className="px-2 py-2 text-right tabular-nums">{detail?.deudaEntrante ?? '—'}</td><td className="px-2 py-2 text-right tabular-nums">{detail?.ausenciasAplicadas ?? '—'}</td><td className="px-2 py-2 text-right tabular-nums">{detail?.deudaPendiente ?? '—'}</td><td className="px-2 py-2 text-right font-black tabular-nums text-metro-text">{kind === 'inactive' ? '—' : selectedPerson.monthlyTickets[index]}</td><td className="px-2 py-2 text-right font-bold tabular-nums text-metro-text">{kind === 'inactive' ? '—' : formatCurrency(selectedPerson.monthlyAmounts[index])}</td></tr>); })}</tbody>
              </table>
              <p className="mt-3 text-[11px] text-metro-muted">En los meses futuros no se anticipan ausencias, notas de gasto ni regularizaciones: la previsión se basa únicamente en el calendario y la vigencia conocida.</p>
            </div>
          </section>
        </div>
      ) : null}
      {dialogNode}
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, secondary }: { icon: LucideIcon; label: string; value: string; secondary?: string }) {
  return (
    <section className="flex items-center gap-3 rounded-2xl border border-metro-border bg-metro-panel p-4 shadow-card">
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-500/10"><Icon className="h-5 w-5 text-blue-500" /></div>
      <div className="min-w-0"><p className="text-xs font-bold text-metro-muted">{label}</p><p className="truncate text-xl font-black text-metro-text">{value}</p>{secondary ? <p className="text-[11px] text-metro-muted">{secondary}</p> : null}</div>
    </section>
  );
}
