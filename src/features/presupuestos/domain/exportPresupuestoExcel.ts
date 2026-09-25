import type ExcelJS from 'exceljs';
import { openWorkbookInExcel, sanitizeFilenamePart } from '../../../shared/export/tableExport';
import { countTicketCalendarDays, type TicketCalendar, type TicketPerson } from '../../ticket-restaurante/domain/ticketRestaurante';
import {
  buildAutomaticTicketPlan,
  calculateBudgetManualItemYear,
  calculateBudgetManualSubitemTotal,
  calculateBudgetScenarioYear,
  roundBudgetCurrency,
  type BudgetManualItem,
  type BudgetScenario,
  type BudgetTicketGroup,
} from './presupuestos';

const COLORS = {
  red: 'FFE30613',
  redDark: 'FFB20B16',
  redSoft: 'FFFBE9EB',
  text: 'FF111827',
  muted: 'FF64748B',
  border: 'FFD7DCE2',
  header: 'FFF1F3F5',
  group: 'FFF7F8FA',
  positive: 'FF166534',
  negative: 'FFB91C1C',
} as const;

const MONEY_FORMAT = '#,##0.00 [$€-es-ES]';
const DATE_FORMATTER = new Intl.DateTimeFormat('es-ES', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

type BudgetExportMode = 'simulation' | 'final';

type BudgetExportInput = {
  scenario: BudgetScenario;
  manualItems: readonly BudgetManualItem[];
  ticketGroups: readonly BudgetTicketGroup[];
  calendars: readonly TicketCalendar[];
  people: readonly TicketPerson[];
  mode: BudgetExportMode;
  finalAmounts?: Record<string, number>;
  generatedAt?: Date;
};

type BudgetExportLine = {
  budgetLine: string;
  concept: string;
  notes: string;
  simulationAmount: number;
  finalAmount?: number;
};

function visibleScenarioItems(
  scenarioId: string,
  manualItems: readonly BudgetManualItem[],
): BudgetManualItem[] {
  return manualItems
    .filter((item) => !item.deletedAt && item.scenarioId === scenarioId)
    .slice()
    .sort((a, b) => a.displayOrder - b.displayOrder);
}

function buildExportLines({
  scenario,
  manualItems,
  ticketGroups,
  calendars,
  people,
  mode,
  finalAmounts,
}: BudgetExportInput): BudgetExportLine[] {
  const calculated = calculateBudgetScenarioYear(
    scenario,
    manualItems,
    ticketGroups,
    scenario.year,
    calendars,
    people,
  );
  const scenarioManualItems = visibleScenarioItems(scenario.id, manualItems);
  const ticketFinal = Math.max(
    0,
    Number(finalAmounts?.ticket ?? scenario.finalBudgetAmounts?.ticket ?? calculated.ticketTotal) || 0,
  );
  const ticketRate = Math.round((scenario.ticketAbsenceRateA ?? 0.03) * 10000) / 100;

  const lines: BudgetExportLine[] = [
    {
      budgetLine: `Cálculo anual · absentismo ${ticketRate}%`,
      concept: 'Ticket Restaurante',
      notes: `Precio ticket ${scenario.ticketAmount.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}`,
      simulationAmount: calculated.ticketTotal,
      finalAmount: mode === 'final' ? ticketFinal : undefined,
    },
  ];

  scenarioManualItems.forEach((item) => {
    const simulationAmount = calculateBudgetManualItemYear(item);
    const finalAmount = Math.max(
      0,
      Number(
        finalAmounts?.[`manual:${item.id}`]
          ?? scenario.finalBudgetAmounts?.[`manual:${item.id}`]
          ?? simulationAmount,
      ) || 0,
    );
    lines.push({
      budgetLine: item.concept.trim() || 'Sin partida',
      concept: item.category.trim() || 'Partidas manuales',
      notes: item.notes.trim(),
      simulationAmount,
      finalAmount: mode === 'final' ? finalAmount : undefined,
    });
  });

  return lines;
}

function setThinBorder(cell: ExcelJS.Cell): void {
  const side: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: COLORS.border } };
  cell.border = { top: side, bottom: side, left: side, right: side };
}

function applyMoneyCell(cell: ExcelJS.Cell, amount: number, bold = false): void {
  cell.value = roundBudgetCurrency(amount);
  cell.numFmt = MONEY_FORMAT;
  cell.font = { name: 'Aptos', size: 10, color: { argb: COLORS.text }, bold };
  cell.alignment = { horizontal: 'right', vertical: 'middle' };
}

function applyKpiBlock(
  worksheet: ExcelJS.Worksheet,
  range: string,
  label: string,
  amount: number,
): void {
  worksheet.mergeCells(range);
  const topLeft = worksheet.getCell(range.split(':')[0] ?? range);
  topLeft.value = `${label}\n${roundBudgetCurrency(amount).toLocaleString('es-ES', {
    style: 'currency',
    currency: 'EUR',
  })}`;
  topLeft.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.header } };
  topLeft.font = { name: 'Aptos', color: { argb: COLORS.text }, size: 11, bold: true };
  topLeft.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
  const merged = worksheet.getCell(range.split(':')[0] ?? range);
  merged.border = {
    left: { style: 'medium', color: { argb: COLORS.red } },
    top: { style: 'thin', color: { argb: COLORS.border } },
    right: { style: 'thin', color: { argb: COLORS.border } },
    bottom: { style: 'thin', color: { argb: COLORS.border } },
  };
}

function safeFileLabel(value: string): string {
  return sanitizeFilenamePart(value).replace(/-/g, '_') || 'escenario';
}

export async function exportPresupuestoScenarioToExcel(input: BudgetExportInput): Promise<void> {
  const { scenario, manualItems, ticketGroups, calendars, people, mode } = input;
  const generatedAt = input.generatedAt ?? new Date();
  const { default: ExcelJSRuntime } = await import('exceljs');
  const workbook = new ExcelJSRuntime.Workbook();
  workbook.creator = 'TrAccion';
  workbook.created = generatedAt;
  workbook.modified = generatedAt;

  const worksheet = workbook.addWorksheet(`Presupuesto ${scenario.year}`, {
    views: [{ state: 'frozen', ySplit: 8 }],
    pageSetup: {
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      paperSize: 9,
      margins: { left: 0.25, right: 0.25, top: 0.35, bottom: 0.35, header: 0.15, footer: 0.15 },
    },
  });

  worksheet.properties.defaultRowHeight = 18;
  worksheet.getColumn('A').width = 48;
  worksheet.getColumn('B').width = 28;
  worksheet.getColumn('C').width = 42;
  worksheet.getColumn('D').width = 18;
  if (mode === 'final') {
    worksheet.getColumn('E').width = 18;
    worksheet.getColumn('F').width = 18;
  }

  const lastColumn = mode === 'final' ? 'F' : 'D';
  worksheet.mergeCells(`A1:${lastColumn}1`);
  const titleCell = worksheet.getCell('A1');
  titleCell.value = `Presupuesto RRLL ${scenario.year}`;
  titleCell.font = { name: 'Aptos Display', size: 22, bold: true, color: { argb: COLORS.text } };
  titleCell.alignment = { vertical: 'middle' };
  worksheet.getRow(1).height = 32;

  worksheet.mergeCells(`A2:${lastColumn}2`);
  const subtitleCell = worksheet.getCell('A2');
  subtitleCell.value = `${mode === 'final' ? 'Presupuesto elegido' : 'Simulación'} · ${scenario.name}`;
  subtitleCell.font = { name: 'Aptos', size: 12, color: { argb: COLORS.muted } };
  subtitleCell.alignment = { vertical: 'middle' };
  worksheet.getRow(2).height = 22;

  worksheet.mergeCells(`A3:${lastColumn}3`);
  const metadataCell = worksheet.getCell('A3');
  metadataCell.value = `Fecha de exportación: ${DATE_FORMATTER.format(generatedAt)}   ·   Ejercicio: ${scenario.year}`;
  metadataCell.font = { name: 'Aptos', size: 9, color: { argb: COLORS.muted } };
  metadataCell.border = { bottom: { style: 'medium', color: { argb: COLORS.red } } };
  worksheet.getRow(3).height = 20;

  const calculated = calculateBudgetScenarioYear(
    scenario,
    manualItems,
    ticketGroups,
    scenario.year,
    calendars,
    people,
  );
  const lines = buildExportLines(input);
  const finalTotal = roundBudgetCurrency(
    lines.reduce((sum, line) => sum + (line.finalAmount ?? line.simulationAmount), 0),
  );
  const difference = roundBudgetCurrency(finalTotal - calculated.total);

  if (mode === 'final') {
    applyKpiBlock(worksheet, 'A5:B6', 'TOTAL DEFINITIVO', finalTotal);
    applyKpiBlock(worksheet, 'C5:D6', 'SIMULACIÓN BASE', calculated.total);
    applyKpiBlock(worksheet, 'E5:F6', 'DIFERENCIA', difference);
  } else {
    applyKpiBlock(worksheet, 'A5:A6', 'TOTAL SIMULACIÓN', calculated.total);
    applyKpiBlock(worksheet, 'B5:C6', 'TICKET RESTAURANTE', calculated.ticketTotal);
    applyKpiBlock(worksheet, 'D5:D6', 'OTRAS PARTIDAS', calculated.manualTotal);
  }
  worksheet.getRow(5).height = 24;
  worksheet.getRow(6).height = 24;

  const headerRowNumber = 8;
  const headerRow = worksheet.getRow(headerRowNumber);
  const headers = mode === 'final'
    ? ['Partida', 'Concepto', 'Observaciones', 'Simulación', 'Definitivo', 'Diferencia']
    : ['Partida', 'Concepto', 'Observaciones', 'Importe anual'];
  headers.forEach((header, index) => {
    const cell = headerRow.getCell(index + 1);
    cell.value = header;
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.header } };
    cell.font = { name: 'Aptos', size: 10, bold: true, color: { argb: COLORS.text } };
    cell.alignment = { horizontal: index >= (mode === 'final' ? 3 : 3) ? 'right' : 'left', vertical: 'middle' };
    setThinBorder(cell);
  });
  headerRow.height = 24;

  let rowNumber = headerRowNumber + 1;
  lines.forEach((line, lineIndex) => {
    const row = worksheet.getRow(rowNumber);
    const isTicketLine = lineIndex === 0;
    row.getCell(1).value = line.budgetLine;
    row.getCell(2).value = line.concept;
    row.getCell(3).value = line.notes;
    row.getCell(3).font = { name: 'Aptos', size: 9, color: { argb: COLORS.muted } };
    row.getCell(3).alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
    applyMoneyCell(row.getCell(4), line.simulationAmount);
    if (mode === 'final') {
      const finalAmount = line.finalAmount ?? line.simulationAmount;
      applyMoneyCell(row.getCell(5), finalAmount, true);
      const rowDifference = roundBudgetCurrency(finalAmount - line.simulationAmount);
      applyMoneyCell(row.getCell(6), rowDifference, rowDifference !== 0);
      if (rowDifference > 0) row.getCell(6).font = { ...row.getCell(6).font, color: { argb: COLORS.negative } };
      if (rowDifference < 0) row.getCell(6).font = { ...row.getCell(6).font, color: { argb: COLORS.positive } };
    }

    for (let column = 1; column <= headers.length; column += 1) {
      const cell = row.getCell(column);
      setThinBorder(cell);
      if (column < 4) {
        cell.font = {
          name: 'Aptos',
          size: 10,
          color: { argb: COLORS.text },
          bold: column === 1,
        };
        cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
      }
      if (isTicketLine) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.group } };
      }
    }
    row.height = 22;
    rowNumber += 1;
  });

  const totalRow = worksheet.getRow(rowNumber);
  worksheet.mergeCells(`A${rowNumber}:C${rowNumber}`);
  const totalLabel = totalRow.getCell(1);
  totalLabel.value = 'TOTAL GENERAL';
  totalLabel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.redSoft } };
  totalLabel.font = { name: 'Aptos', size: 11, bold: true, color: { argb: COLORS.redDark } };
  totalLabel.alignment = { horizontal: 'left', vertical: 'middle' };
  setThinBorder(totalLabel);

  applyMoneyCell(totalRow.getCell(4), calculated.total, true);
  totalRow.getCell(4).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.redSoft } };
  totalRow.getCell(4).font = { ...totalRow.getCell(4).font, color: { argb: COLORS.redDark } };
  setThinBorder(totalRow.getCell(4));
  if (mode === 'final') {
    applyMoneyCell(totalRow.getCell(5), finalTotal, true);
    totalRow.getCell(5).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.redSoft } };
    totalRow.getCell(5).font = { ...totalRow.getCell(5).font, color: { argb: COLORS.redDark } };
    setThinBorder(totalRow.getCell(5));
    applyMoneyCell(totalRow.getCell(6), difference, true);
    totalRow.getCell(6).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.redSoft } };
    totalRow.getCell(6).font = {
      ...totalRow.getCell(6).font,
      color: { argb: difference > 0 ? COLORS.negative : difference < 0 ? COLORS.positive : COLORS.redDark },
    };
    setThinBorder(totalRow.getCell(6));
  }
  totalRow.height = 26;

  if (scenario.notes.trim()) {
    rowNumber += 2;
    worksheet.mergeCells(`A${rowNumber}:${lastColumn}${rowNumber}`);
    const notesTitle = worksheet.getCell(`A${rowNumber}`);
    notesTitle.value = 'Notas del escenario';
    notesTitle.font = { name: 'Aptos', size: 10, bold: true, color: { argb: COLORS.text } };
    rowNumber += 1;
    worksheet.mergeCells(`A${rowNumber}:${lastColumn}${rowNumber + 1}`);
    const notesCell = worksheet.getCell(`A${rowNumber}`);
    notesCell.value = scenario.notes;
    notesCell.font = { name: 'Aptos', size: 9, color: { argb: COLORS.muted } };
    notesCell.alignment = { vertical: 'top', wrapText: true };
    notesCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.group } };
  }

  const scenarioManualItems = visibleScenarioItems(scenario.id, manualItems);
  if (scenarioManualItems.length > 0) {
    const detailManual = workbook.addWorksheet('Detalle partidas', { views: [{ state: 'frozen', ySplit: 4 }] });
    detailManual.columns = [
      { width: 28 },
      { width: 22 },
      { width: 18 },
      { width: 32 },
      { width: 16 },
      { width: 14 },
      { width: 18 },
      { width: 44 },
    ];
    detailManual.mergeCells('A1:H1');
    detailManual.getCell('A1').value = `Detalle de partidas · ${scenario.name}`;
    detailManual.getCell('A1').font = { name: 'Aptos Display', size: 18, bold: true, color: { argb: COLORS.text } };
    detailManual.mergeCells('A2:H2');
    detailManual.getCell('A2').value = 'Los importes por desglose se calculan como precio unitario × unidades previstas.';
    detailManual.getCell('A2').font = { name: 'Aptos', size: 10, color: { argb: COLORS.muted } };
    const manualHeaders = ['Partida', 'Categoría', 'Tipo cálculo', 'Subpartida', 'Precio unitario', 'Unidades', 'Total', 'Observaciones'];
    manualHeaders.forEach((header, index) => {
      const cell = detailManual.getRow(4).getCell(index + 1);
      cell.value = header;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.header } };
      cell.font = { name: 'Aptos', size: 10, bold: true, color: { argb: COLORS.text } };
      setThinBorder(cell);
    });
    let manualRowNumber = 5;
    scenarioManualItems.forEach((item) => {
      const subitems = item.calculationMode === 'breakdown' ? (item.subitems ?? []) : [];
      if (subitems.length === 0) {
        const row = detailManual.getRow(manualRowNumber);
        row.values = [item.concept, item.category, 'Importe directo', '', '', '', calculateBudgetManualItemYear(item), item.notes];
        applyMoneyCell(row.getCell(7), calculateBudgetManualItemYear(item), true);
        for (let column = 1; column <= 8; column += 1) setThinBorder(row.getCell(column));
        row.getCell(8).alignment = { wrapText: true, vertical: 'top' };
        manualRowNumber += 1;
        return;
      }
      subitems.forEach((subitem, subindex) => {
        const row = detailManual.getRow(manualRowNumber);
        row.values = [
          subindex === 0 ? item.concept : '',
          subindex === 0 ? item.category : '',
          subindex === 0 ? 'Desglose' : '',
          subitem.concept,
          subitem.unitPrice,
          subitem.units,
          calculateBudgetManualSubitemTotal(subitem),
          subitem.notes || (subindex === 0 ? item.notes : ''),
        ];
        applyMoneyCell(row.getCell(5), subitem.unitPrice);
        row.getCell(6).numFmt = '#,##0.00';
        applyMoneyCell(row.getCell(7), calculateBudgetManualSubitemTotal(subitem), subindex === subitems.length - 1);
        for (let column = 1; column <= 8; column += 1) setThinBorder(row.getCell(column));
        row.getCell(8).alignment = { wrapText: true, vertical: 'top' };
        manualRowNumber += 1;
      });
      const totalRow = detailManual.getRow(manualRowNumber);
      detailManual.mergeCells(`A${manualRowNumber}:F${manualRowNumber}`);
      totalRow.getCell(1).value = `Total ${item.concept}`;
      totalRow.getCell(1).font = { name: 'Aptos', size: 10, bold: true, color: { argb: COLORS.text } };
      totalRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.group } };
      applyMoneyCell(totalRow.getCell(7), calculateBudgetManualItemYear(item), true);
      totalRow.getCell(7).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.group } };
      for (let column = 1; column <= 8; column += 1) setThinBorder(totalRow.getCell(column));
      manualRowNumber += 1;
    });
    detailManual.pageSetup = {
      orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
      margins: { left: 0.25, right: 0.25, top: 0.35, bottom: 0.35, header: 0.15, footer: 0.15 },
    };
  }

  if (scenario.ticketPlanningMode === 'automatic') {
    const plan = buildAutomaticTicketPlan(scenario, scenario.year, calendars, people);
    const activeCalendars = calendars.filter((calendar) => !calendar.deletedAt && calendar.activo);
    const activePeople = people.filter((person) => !person.deletedAt && person.activo);
    const extras = scenario.ticketExtraPeopleByCalendar ?? {};
    const monthNames = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
    ];
    const detail = workbook.addWorksheet('Detalle Ticket', { views: [{ state: 'frozen', ySplit: 5 }] });
    detail.columns = [
      { width: 28 }, // Calendario
      { width: 14 }, // Mes
      { width: 14 }, // Personas base
      { width: 16 }, // Ajuste
      { width: 14 }, // Total personas
      { width: 13 }, // Días ticket
      { width: 13 }, // Absentismo
      { width: 18 }, // Personas computables
      { width: 18 }, // Tickets calculados
      { width: 14 }, // Precio ticket
      { width: 18 }, // Importe mes
    ];

    detail.mergeCells('A1:K1');
    detail.getCell('A1').value = `Detalle Ticket Restaurante · ${scenario.name}`;
    detail.getCell('A1').font = { name: 'Aptos Display', size: 18, bold: true, color: { argb: COLORS.text } };
    detail.mergeCells('A2:K2');
    detail.getCell('A2').value = `Cálculo real por calendario y mes · Absentismo: ${Math.round(plan.rateA * 10000) / 100}% · Precio ticket: ${scenario.ticketAmount.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}`;
    detail.getCell('A2').font = { name: 'Aptos', size: 10, color: { argb: COLORS.muted } };
    detail.mergeCells('A3:K3');
    detail.getCell('A3').value = 'Fórmula: total personas × (1 − absentismo) × días de ticket del calendario × precio del ticket.';
    detail.getCell('A3').font = { name: 'Aptos', size: 9, italic: true, color: { argb: COLORS.muted } };

    const detailHeaders = [
      'Calendario', 'Mes', 'Personas base', 'Ajuste simulación', 'Total personas',
      'Días ticket', 'Absentismo', 'Personas computables', 'Tickets calculados',
      'Precio ticket', 'Importe mes',
    ];
    detailHeaders.forEach((header, index) => {
      const cell = detail.getRow(5).getCell(index + 1);
      cell.value = header;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.header } };
      cell.font = { name: 'Aptos', size: 10, bold: true, color: { argb: COLORS.text } };
      cell.alignment = { horizontal: index >= 2 ? 'right' : 'left', vertical: 'middle', wrapText: true };
      setThinBorder(cell);
    });
    detail.getRow(5).height = 30;

    let detailRowNumber = 6;
    const monthRows = new Map<number, number[]>();
    let annualTotalRowNumber: number | null = null;
    let previousCalendar = '';

    activeCalendars.forEach((calendar) => {
      const basePeople = activePeople.filter((person) => person.calendarId === calendar.id).length;
      const additionalPeople = Math.trunc(Number(extras[calendar.id] ?? 0) || 0);
      const totalPeople = Math.max(0, basePeople + additionalPeople);
      if (totalPeople <= 0) return;

      for (let month = 1; month <= 12; month += 1) {
        const ticketDays = countTicketCalendarDays(calendar, scenario.year, month);
        const row = detail.getRow(detailRowNumber);
        const isNewCalendar = calendar.nombre !== previousCalendar;
        row.getCell(1).value = calendar.nombre;
        row.getCell(2).value = monthNames[month - 1];
        row.getCell(3).value = basePeople;
        row.getCell(4).value = additionalPeople;
        row.getCell(5).value = totalPeople;
        row.getCell(6).value = ticketDays;
        row.getCell(7).value = plan.rateA;
        row.getCell(8).value = { formula: `E${detailRowNumber}*(1-G${detailRowNumber})` };
        row.getCell(9).value = { formula: `F${detailRowNumber}*H${detailRowNumber}` };
        row.getCell(10).value = scenario.ticketAmount;
        row.getCell(11).value = { formula: `I${detailRowNumber}*J${detailRowNumber}` };

        row.getCell(7).numFmt = '0.00%';
        row.getCell(8).numFmt = '#,##0.00';
        row.getCell(9).numFmt = '#,##0.00';
        row.getCell(10).numFmt = MONEY_FORMAT;
        row.getCell(11).numFmt = MONEY_FORMAT;
        for (let column = 1; column <= 11; column += 1) {
          const cell = row.getCell(column);
          setThinBorder(cell);
          if (isNewCalendar) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.group } };
          cell.font = { name: 'Aptos', size: 9.5, color: { argb: COLORS.text }, bold: column === 1 && isNewCalendar };
          cell.alignment = { horizontal: column >= 3 ? 'right' : 'left', vertical: 'middle' };
        }
        monthRows.set(month, [...(monthRows.get(month) ?? []), detailRowNumber]);
        previousCalendar = calendar.nombre;
        detailRowNumber += 1;
      }
    });

    const detailLastDataRow = detailRowNumber - 1;
    if (detailLastDataRow >= 6) {
      annualTotalRowNumber = detailRowNumber;
      const totalRow = detail.getRow(detailRowNumber);
      detail.mergeCells(`A${detailRowNumber}:J${detailRowNumber}`);
      totalRow.getCell(1).value = 'TOTAL ANUAL TICKET RESTAURANTE';
      totalRow.getCell(1).font = { name: 'Aptos', size: 11, bold: true, color: { argb: COLORS.redDark } };
      totalRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.redSoft } };
      totalRow.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };
      totalRow.getCell(11).value = calculated.ticketTotal;
      totalRow.getCell(11).numFmt = MONEY_FORMAT;
      totalRow.getCell(11).font = { name: 'Aptos', size: 11, bold: true, color: { argb: COLORS.redDark } };
      totalRow.getCell(11).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.redSoft } };
      for (let column = 1; column <= 11; column += 1) setThinBorder(totalRow.getCell(column));
      detailRowNumber += 3;

      detail.mergeCells(`A${detailRowNumber}:K${detailRowNumber}`);
      detail.getCell(`A${detailRowNumber}`).value = 'Resumen mensual';
      detail.getCell(`A${detailRowNumber}`).font = { name: 'Aptos Display', size: 14, bold: true, color: { argb: COLORS.text } };
      detailRowNumber += 1;

      const summaryHeaders = ['Mes', 'Importe total'];
      summaryHeaders.forEach((header, index) => {
        const cell = detail.getRow(detailRowNumber).getCell(index + 1);
        cell.value = header;
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.header } };
        cell.font = { name: 'Aptos', size: 10, bold: true, color: { argb: COLORS.text } };
        setThinBorder(cell);
      });
      detailRowNumber += 1;
      const summaryStartRow = detailRowNumber;
      for (let month = 1; month <= 12; month += 1) {
        const rows = monthRows.get(month) ?? [];
        const row = detail.getRow(detailRowNumber);
        row.getCell(1).value = monthNames[month - 1];
        row.getCell(2).value = rows.length > 0
          ? { formula: `ROUND(${rows.map((rowNumber) => `K${rowNumber}`).join('+')},2)` }
          : 0;
        row.getCell(2).numFmt = MONEY_FORMAT;
        setThinBorder(row.getCell(1));
        setThinBorder(row.getCell(2));
        detailRowNumber += 1;
      }
      const summaryTotal = detail.getRow(detailRowNumber);
      summaryTotal.getCell(1).value = 'TOTAL';
      summaryTotal.getCell(2).value = { formula: `SUM(B${summaryStartRow}:B${detailRowNumber - 1})` };
      summaryTotal.getCell(2).numFmt = MONEY_FORMAT;
      summaryTotal.getCell(1).font = { name: 'Aptos', size: 10, bold: true, color: { argb: COLORS.redDark } };
      summaryTotal.getCell(2).font = { name: 'Aptos', size: 10, bold: true, color: { argb: COLORS.redDark } };
      summaryTotal.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.redSoft } };
      summaryTotal.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.redSoft } };
      setThinBorder(summaryTotal.getCell(1));
      setThinBorder(summaryTotal.getCell(2));
      if (annualTotalRowNumber !== null) {
        detail.getRow(annualTotalRowNumber).getCell(11).value = { formula: `B${detailRowNumber}` };
      }
    }

    detail.autoFilter = {
      from: { row: 5, column: 1 },
      to: { row: Math.max(detailLastDataRow, 5), column: 11 },
    };
    detail.pageSetup = {
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.25, right: 0.25, top: 0.35, bottom: 0.35, header: 0.15, footer: 0.15 },
    };
    detail.headerFooter.oddFooter = '&LTrAcción · Relaciones Laborales&C&P / &N&RGenerado &D';
  }

  worksheet.autoFilter = {
    from: { row: headerRowNumber, column: 1 },
    to: { row: Math.max(rowNumber - 1, headerRowNumber), column: headers.length },
  };
  worksheet.pageSetup.printArea = `A1:${lastColumn}${rowNumber + 1}`;
  worksheet.headerFooter.oddFooter = '&LTrAcción · Relaciones Laborales&C&P / &N&RGenerado &D';

  const kind = mode === 'final' ? 'presupuesto' : 'simulacion';
  const fileName = `${kind}_rrll_${scenario.year}_${safeFileLabel(scenario.name)}.xlsx`;
  const buffer = await workbook.xlsx.writeBuffer();
  await openWorkbookInExcel(buffer, fileName);
}
