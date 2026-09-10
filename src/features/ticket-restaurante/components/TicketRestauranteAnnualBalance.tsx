import {
  BarChart3,
  Building2,
  CalendarCheck2,
  Euro,
  FileSpreadsheet,
  Search,
  Ticket,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { ActionButton } from '../../../components/ui/ActionButton';
import { openWorkbookInExcel } from '../../../shared/export/tableExport';
import type { Employee } from '../../plantilla/domain/employee';
import {
  calculateMonthlyTicketOrder,
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

interface AnnualPersonRow {
  empleado: string;
  nombreApellidos: string;
  area: string;
  monthlyTickets: number[];
  monthlyAmounts: number[];
  totalTickets: number;
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

function lastMonthToInclude(year: number): number {
  const now = new Date();
  if (year < now.getFullYear()) return 12;
  if (year > now.getFullYear()) return 0;
  return now.getMonth() + 1;
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

  const totalTickets = peopleRows.reduce((sum, row) => sum + row.totalTickets, 0);
  const totalAmount = peopleRows.reduce((sum, row) => sum + row.totalAmount, 0);

  const summary = workbook.addWorksheet('Resumen anual', { views: [{ state: 'frozen', ySplit: 5 }] });
  summary.mergeCells('A1:F1');
  summary.getCell('A1').value = `Ticket Restaurante · Balance anual ${year}`;
  summary.getCell('A1').font = { bold: true, size: 18, color: { argb: 'FF17365D' } };
  summary.getCell('A3').value = 'Indicador';
  summary.getCell('B3').value = 'Valor';
  ['A3', 'B3'].forEach((address) => { summary.getCell(address).fill = headerFill; summary.getCell(address).font = headerFont; });
  [
    ['Total tickets', totalTickets],
    ['Importe total', totalAmount],
    ['Personas con tickets', peopleRows.filter((row) => row.totalTickets > 0).length],
    ['Áreas', areaRows.length],
    ['Importe medio por persona', peopleRows.length ? totalAmount / peopleRows.length : 0],
  ].forEach((values) => summary.addRow(values));
  summary.getCell('B5').numFmt = '#,##0.00 [$€-es-ES]';
  summary.getCell('B8').numFmt = '#,##0.00 [$€-es-ES]';
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
  peopleRows.forEach((row) => {
    peopleSheet.addRow([
      row.empleado,
      row.nombreApellidos,
      row.area,
      ...row.monthlyTickets,
      row.totalTickets,
      row.totalAmount,
      row.monthsWithTickets,
      row.manual ? 'Manual' : 'Calendario',
    ]);
  });
  const peopleTotal = peopleSheet.addRow([
    '', 'TOTAL', '', ...MONTHS.map((_, index) => peopleRows.reduce((sum, row) => sum + row.monthlyTickets[index], 0)), totalTickets, totalAmount, '', '',
  ]);
  peopleTotal.eachCell((cell) => { cell.fill = totalFill; cell.font = { bold: true }; });
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
  monthly.mergeCells('A1:D1');
  monthly.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FF17365D' } };
  const monthlyHeader = monthly.addRow(['Mes', 'Tickets', 'Importe', 'Personas con tickets']);
  monthlyHeader.eachCell((cell) => { cell.fill = sectionFill; cell.font = { bold: true }; });
  MONTHS.forEach((label, index) => monthly.addRow([
    label,
    peopleRows.reduce((sum, row) => sum + row.monthlyTickets[index], 0),
    peopleRows.reduce((sum, row) => sum + row.monthlyAmounts[index], 0),
    peopleRows.filter((row) => row.monthlyTickets[index] > 0).length,
  ]));
  monthly.columns = [{ width: 16 }, { width: 16 }, { width: 18 }, { width: 22 }];
  monthly.getColumn(3).numFmt = '#,##0.00 [$€-es-ES]';

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
  const [year, setYear] = useState(new Date().getFullYear());
  const [mode, setMode] = useState<'people' | 'areas'>('people');
  const [search, setSearch] = useState('');
  const [areaFilter, setAreaFilter] = useState('');
  const [exporting, setExporting] = useState(false);
  const [consolidating, setConsolidating] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const areaByEmployee = useMemo(() => buildEmployeeAreaMap(employees), [employees]);

  const peopleRows = useMemo<AnnualPersonRow[]>(() => {
    const byEmployee = new Map<string, AnnualPersonRow>();
    const maxMonth = lastMonthToInclude(year);
    for (let month = 1; month <= maxMonth; month += 1) {
      const key = `${year}-${String(month).padStart(2, '0')}`;
      const snapshot = config.monthlySnapshots?.[key];
      const sourceRows = snapshot
        ? snapshot.rows.map((row) => ({
            empleado: row.empleado,
            nombreApellidos: row.nombreApellidos,
            area: row.area,
            tickets: row.tickets,
            importe: row.importe,
            manual: row.manual,
          }))
        : calculateMonthlyTicketOrder(people, calendars, absences, config, year, month, manutenciones).rows.map((row) => {
            const employeeKey = normalizeTicketEmployeeNumber(row.empleado);
            const manualPerson = (config.manualPeople ?? []).find((item) => normalizeTicketEmployeeNumber(item.empleado) === employeeKey);
            return {
              empleado: row.empleado,
              nombreApellidos: row.nombreApellidos,
              area: manualPerson?.area?.trim() || areaByEmployee.get(employeeKey) || 'Sin área',
              tickets: row.ticketsFinales,
              importe: row.importe,
              manual: row.manualEntry === true,
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
          totalTickets: 0,
          totalAmount: 0,
          monthsWithTickets: 0,
          manual: row.manual,
        };
        existing.monthlyTickets[month - 1] = row.tickets;
        existing.monthlyAmounts[month - 1] = row.importe;
        existing.totalTickets += row.tickets;
        existing.totalAmount += row.importe;
        if (row.tickets > 0) existing.monthsWithTickets += 1;
        byEmployee.set(employeeKey, existing);
      });
    }
    return [...byEmployee.values()].sort((a, b) => a.empleado.localeCompare(b.empleado, 'es', { numeric: true, sensitivity: 'base' }));
  }, [absences, areaByEmployee, calendars, config, manutenciones, people, year]);

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

  const totalTickets = peopleRows.reduce((sum, row) => sum + row.totalTickets, 0);
  const totalAmount = peopleRows.reduce((sum, row) => sum + row.totalAmount, 0);
  const peopleWithTickets = peopleRows.filter((row) => row.totalTickets > 0).length;
  const average = peopleWithTickets ? totalAmount / peopleWithTickets : 0;
  const monthlyTotals = MONTHS.map((_, index) => peopleRows.reduce((sum, row) => sum + row.monthlyTickets[index], 0));
  const maxMonthly = Math.max(...monthlyTotals, 1);
  const maxAreaTickets = Math.max(...areaRows.map((row) => row.tickets), 1);

  const closedMonthLimit = (() => {
    const now = new Date();
    if (year < now.getFullYear()) return 12;
    if (year > now.getFullYear()) return 0;
    return Math.max(0, now.getMonth());
  })();
  const consolidatedMonths = Array.from({ length: closedMonthLimit }, (_, index) => index + 1).filter((month) =>
    Boolean(config.monthlySnapshots?.[`${year}-${String(month).padStart(2, '0')}`]),
  ).length;

  const handleConsolidate = async () => {
    if (closedMonthLimit <= 0) {
      setStatusMessage('No hay meses vencidos para consolidar en este año.');
      return;
    }
    setConsolidating(true);
    setStatusMessage('');
    try {
      const snapshots: Record<string, TicketMonthlySnapshot> = { ...(config.monthlySnapshots ?? {}) };
      const closedAt = new Date().toISOString();
      for (let month = 1; month <= closedMonthLimit; month += 1) {
        const key = `${year}-${String(month).padStart(2, '0')}`;
        if (snapshots[key]) continue;
        const calculation = calculateMonthlyTicketOrder(people, calendars, absences, config, year, month, manutenciones);
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
      const result = await onUpdateConfig({ ...config, monthlySnapshots: snapshots });
      setStatusMessage(result.ok ? `Histórico consolidado: ${closedMonthLimit} mes(es) cerrados.` : result.message ?? 'No se ha podido consolidar el histórico.');
    } finally {
      setConsolidating(false);
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
    <div className="space-y-2.5">
      <section className="rounded-xl border border-metro-border bg-metro-panel p-3 shadow-card">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-blue-500" />
              <h2 className="text-lg font-black text-metro-text">Balance anual de tickets restaurante</h2>
            </div>
            <p className="mt-1 text-xs text-metro-muted">Acumulado del año por persona, área y mes. En el año actual se incluyen los meses transcurridos hasta hoy.</p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-[11px] font-bold uppercase tracking-wide text-metro-muted">
              Año
              <select className="ml-2 h-9 rounded-lg border border-metro-border bg-metro-surface px-3 text-sm font-semibold text-metro-text" value={year} onChange={(event) => setYear(Number(event.target.value))}>
                {Array.from({ length: 7 }, (_, index) => new Date().getFullYear() + 1 - index).map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
            <ActionButton icon={CalendarCheck2} iconOnly={false} loading={consolidating} onClick={() => void handleConsolidate()} size="sm" variant="secondary">
              Consolidar cerrados
            </ActionButton>
            <ActionButton icon={FileSpreadsheet} iconOnly={false} onClick={() => void handleExport()} size="sm" variant="secondary">
              {exporting ? 'Generando…' : 'Exportar Excel'}
            </ActionButton>
          </div>
        </div>
      </section>
      <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-[10px] text-metro-muted">
        <span>{consolidatedMonths}/{closedMonthLimit} mes(es) vencidos consolidados. Los meses consolidados no cambian aunque después cambie la plantilla o el calendario.</span>
        {statusMessage ? <span className="font-semibold text-metro-text">{statusMessage}</span> : null}
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={Ticket} label="Total tickets del año" value={totalTickets.toLocaleString('es-ES')} />
        <MetricCard icon={Euro} label="Importe total" value={formatCurrency(totalAmount)} />
        <MetricCard icon={Users} label="Personas con tickets" value={String(peopleWithTickets)} secondary={`Media ${formatCurrency(average)}`} />
        <MetricCard icon={Building2} label="Áreas" value={String(areaRows.length)} secondary={`${peopleRows.filter((row) => row.area === 'Sin área').length} sin área`} />
      </div>

      <div className="grid gap-2.5 xl:grid-cols-[1.35fr_1fr]">
        <section className="rounded-xl border border-metro-border bg-metro-panel p-3">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-black text-metro-text">Evolución mensual</h3>
              <p className="text-[11px] text-metro-muted">Tickets computados por mes</p>
            </div>
            <CalendarCheck2 className="h-4 w-4 text-blue-500" />
          </div>
          <div className="flex h-44 items-end gap-2 border-b border-metro-border/80 px-1 pb-1">
            {monthlyTotals.map((value, index) => (
              <div className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1" key={MONTHS[index]}>
                <span className="text-[10px] font-bold text-metro-muted">{value || ''}</span>
                <div className="w-full rounded-t-md bg-blue-500/80" style={{ height: `${Math.max(value ? 8 : 1, (value / maxMonthly) * 112)}px` }} title={`${MONTHS[index]}: ${value} tickets`} />
                <span className="text-[10px] font-semibold text-metro-muted">{MONTHS[index]}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-metro-border bg-metro-panel p-3">
          <h3 className="text-sm font-black text-metro-text">Tickets por área</h3>
          <p className="mb-3 text-[11px] text-metro-muted">Peso de cada área sobre el acumulado</p>
          <div className="space-y-2">
            {areaRows.slice(0, 8).map((row, index) => (
              <div key={row.area}>
                <div className="mb-1 flex items-center justify-between gap-3 text-[11px]">
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

      <section className="overflow-hidden rounded-xl border border-metro-border bg-metro-panel">
        <div className="flex flex-col gap-2 border-b border-metro-border p-2.5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-2">
            <button className={`rounded-lg px-3 py-1.5 text-xs font-bold ${mode === 'people' ? 'bg-blue-500 text-white' : 'bg-metro-surface text-metro-muted'}`} onClick={() => setMode('people')} type="button">Personas</button>
            <button className={`rounded-lg px-3 py-1.5 text-xs font-bold ${mode === 'areas' ? 'bg-blue-500 text-white' : 'bg-metro-surface text-metro-muted'}`} onClick={() => setMode('areas')} type="button">Áreas</button>
          </div>
          <div className="flex flex-1 flex-wrap gap-2 lg:justify-end">
            <label className="relative min-w-[220px] max-w-sm flex-1 lg:flex-none">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-metro-muted" />
              <input className="h-9 w-full rounded-lg border border-metro-border bg-metro-surface pl-8 pr-3 text-xs text-metro-text outline-none focus:border-blue-500" onChange={(event) => setSearch(event.target.value)} placeholder={mode === 'people' ? 'Buscar persona, nº o área…' : 'Buscar área…'} value={search} />
            </label>
            <select className="h-9 min-w-[190px] rounded-lg border border-metro-border bg-metro-surface px-3 text-xs font-semibold text-metro-text" onChange={(event) => setAreaFilter(event.target.value)} value={areaFilter}>
              <option value="">Todas las áreas</option>
              {areas.map((area) => <option key={area} value={area}>{area}</option>)}
            </select>
          </div>
        </div>

        {mode === 'people' ? (
          <div className="overflow-x-auto">
            <table className="min-w-[1180px] w-full border-collapse text-[11px]">
              <thead className="bg-metro-surface/80 text-metro-muted">
                <tr>
                  <th className="px-2 py-2 text-left">Nº empleado</th><th className="px-2 py-2 text-left">Persona</th><th className="px-2 py-2 text-left">Área</th>
                  {MONTHS.map((month) => <th className="px-1.5 py-2 text-right" key={month}>{month}</th>)}
                  <th className="px-2 py-2 text-right">Total</th><th className="px-2 py-2 text-right">Importe</th><th className="px-2 py-2 text-right">Meses</th>
                </tr>
              </thead>
              <tbody>
                {filteredPeople.map((row) => (
                  <tr className="border-t border-metro-border/70 hover:bg-metro-surface/60" key={row.empleado}>
                    <td className="px-2 py-1.5 font-bold text-metro-text">{row.empleado}</td>
                    <td className="px-2 py-1.5 text-metro-text"><span className="font-semibold">{row.nombreApellidos}</span>{row.manual ? <span className="ml-1 rounded bg-violet-500/15 px-1 py-0.5 text-[9px] font-bold text-violet-500">MANUAL</span> : null}</td>
                    <td className="max-w-[190px] truncate px-2 py-1.5 text-metro-muted" title={row.area}>{row.area}</td>
                    {row.monthlyTickets.map((tickets, index) => <td className="px-1.5 py-1.5 text-right tabular-nums text-metro-muted" key={index}>{tickets || '—'}</td>)}
                    <td className="px-2 py-1.5 text-right font-black tabular-nums text-metro-text">{row.totalTickets}</td>
                    <td className="px-2 py-1.5 text-right font-bold tabular-nums text-metro-text">{formatCurrency(row.totalAmount)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-metro-muted">{row.monthsWithTickets}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-metro-border bg-blue-500/5 font-black text-metro-text">
                <tr>
                  <td className="px-2 py-2" colSpan={3}>TOTAL</td>
                  {MONTHS.map((_, index) => <td className="px-1.5 py-2 text-right" key={index}>{filteredPeople.reduce((sum, row) => sum + row.monthlyTickets[index], 0)}</td>)}
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
        <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 px-3 py-2 text-[11px] text-metro-muted">
          <strong className="text-metro-text">Criterio:</strong> se suman los tickets del Cómputo mensual, incluidas las personas manuales del mes correspondiente. Los importes usan el precio vigente en cada mes. Las áreas proceden de Plantilla y, en personas manuales, del área guardada en su ficha cuando exista.
        </div>
        <div className="flex items-center rounded-xl border border-metro-border bg-metro-panel px-3 py-2 text-[11px] text-metro-muted">
          <Users className="mr-2 h-4 w-4 text-blue-500" /> {peopleRows.filter((row) => row.area === 'Sin área').length} persona(s) sin área asignada
        </div>
      </div>
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, secondary }: { icon: LucideIcon; label: string; value: string; secondary?: string }) {
  return (
    <section className="flex items-center gap-3 rounded-xl border border-metro-border bg-metro-panel p-3 shadow-card">
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-500/10"><Icon className="h-5 w-5 text-blue-500" /></div>
      <div className="min-w-0"><p className="text-[11px] font-bold text-metro-muted">{label}</p><p className="truncate text-xl font-black text-metro-text">{value}</p>{secondary ? <p className="text-[10px] text-metro-muted">{secondary}</p> : null}</div>
    </section>
  );
}
