import type ExcelJS from 'exceljs';
import { openWorkbookInExcel, sanitizeFilenamePart } from '../../../shared/export/tableExport';
import type { TicketCalendar, TicketPerson } from '../../ticket-restaurante/domain/ticketRestaurante';
import {
  buildAutomaticTicketPlan,
  calculateBudgetManualItemYear,
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
      budgetLine: 'Ticket Restaurante',
      concept: `Cálculo anual · absentismo ${ticketRate}%`,
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
      budgetLine: item.category.trim() || 'Partidas manuales',
      concept: item.concept.trim() || 'Sin concepto',
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
  worksheet.getColumn('A').width = 28;
  worksheet.getColumn('B').width = 48;
  worksheet.getColumn('C').width = mode === 'final' ? 18 : 22;
  if (mode === 'final') {
    worksheet.getColumn('D').width = 18;
    worksheet.getColumn('E').width = 18;
  }

  const lastColumn = mode === 'final' ? 'E' : 'C';
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
    applyKpiBlock(worksheet, 'A5:A6', 'TOTAL DEFINITIVO', finalTotal);
    applyKpiBlock(worksheet, 'C5:C6', 'SIMULACIÓN BASE', calculated.total);
    applyKpiBlock(worksheet, 'E5:E6', 'DIFERENCIA', difference);
  } else {
    applyKpiBlock(worksheet, 'A5:A6', 'TOTAL SIMULACIÓN', calculated.total);
    applyKpiBlock(worksheet, 'B5:B6', 'TICKET RESTAURANTE', calculated.ticketTotal);
    applyKpiBlock(worksheet, 'C5:C6', 'OTRAS PARTIDAS', calculated.manualTotal);
  }
  worksheet.getRow(5).height = 24;
  worksheet.getRow(6).height = 24;

  const headerRowNumber = 8;
  const headerRow = worksheet.getRow(headerRowNumber);
  const headers = mode === 'final'
    ? ['Partida', 'Concepto', 'Simulación', 'Definitivo', 'Diferencia']
    : ['Partida', 'Concepto', 'Importe anual'];
  headers.forEach((header, index) => {
    const cell = headerRow.getCell(index + 1);
    cell.value = header;
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.header } };
    cell.font = { name: 'Aptos', size: 10, bold: true, color: { argb: COLORS.text } };
    cell.alignment = { horizontal: index >= 2 ? 'right' : 'left', vertical: 'middle' };
    setThinBorder(cell);
  });
  headerRow.height = 24;

  let rowNumber = headerRowNumber + 1;
  let previousGroup = '';
  lines.forEach((line) => {
    const row = worksheet.getRow(rowNumber);
    const isNewGroup = line.budgetLine !== previousGroup;
    row.getCell(1).value = line.budgetLine;
    row.getCell(2).value = line.concept;
    applyMoneyCell(row.getCell(3), line.simulationAmount);
    if (mode === 'final') {
      const finalAmount = line.finalAmount ?? line.simulationAmount;
      applyMoneyCell(row.getCell(4), finalAmount, true);
      const rowDifference = roundBudgetCurrency(finalAmount - line.simulationAmount);
      applyMoneyCell(row.getCell(5), rowDifference, rowDifference !== 0);
      if (rowDifference > 0) row.getCell(5).font = { ...row.getCell(5).font, color: { argb: COLORS.negative } };
      if (rowDifference < 0) row.getCell(5).font = { ...row.getCell(5).font, color: { argb: COLORS.positive } };
    }

    for (let column = 1; column <= headers.length; column += 1) {
      const cell = row.getCell(column);
      setThinBorder(cell);
      if (column < 3) {
        cell.font = {
          name: 'Aptos',
          size: 10,
          color: { argb: COLORS.text },
          bold: column === 1 && isNewGroup,
        };
        cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
      }
      if (isNewGroup) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.group } };
      }
    }
    if (!isNewGroup) row.getCell(1).value = '';
    row.height = 22;
    previousGroup = line.budgetLine;
    rowNumber += 1;
  });

  const totalRow = worksheet.getRow(rowNumber);
  worksheet.mergeCells(`A${rowNumber}:B${rowNumber}`);
  const totalLabel = totalRow.getCell(1);
  totalLabel.value = 'TOTAL GENERAL';
  totalLabel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.redSoft } };
  totalLabel.font = { name: 'Aptos', size: 11, bold: true, color: { argb: COLORS.redDark } };
  totalLabel.alignment = { horizontal: 'left', vertical: 'middle' };
  setThinBorder(totalLabel);

  applyMoneyCell(totalRow.getCell(3), calculated.total, true);
  totalRow.getCell(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.redSoft } };
  totalRow.getCell(3).font = { ...totalRow.getCell(3).font, color: { argb: COLORS.redDark } };
  setThinBorder(totalRow.getCell(3));
  if (mode === 'final') {
    applyMoneyCell(totalRow.getCell(4), finalTotal, true);
    totalRow.getCell(4).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.redSoft } };
    totalRow.getCell(4).font = { ...totalRow.getCell(4).font, color: { argb: COLORS.redDark } };
    setThinBorder(totalRow.getCell(4));
    applyMoneyCell(totalRow.getCell(5), difference, true);
    totalRow.getCell(5).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.redSoft } };
    totalRow.getCell(5).font = {
      ...totalRow.getCell(5).font,
      color: { argb: difference > 0 ? COLORS.negative : difference < 0 ? COLORS.positive : COLORS.redDark },
    };
    setThinBorder(totalRow.getCell(5));
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

  if (scenario.ticketPlanningMode === 'automatic') {
    const plan = buildAutomaticTicketPlan(scenario, scenario.year, calendars, people);
    workbook.addWorksheet('Detalle Ticket');
    const detail = workbook.getWorksheet('Detalle Ticket');
    if (detail) {
      detail.views = [{ state: 'frozen', ySplit: 4 }];
      detail.columns = [
        { width: 30 },
        { width: 14 },
        { width: 14 },
        { width: 14 },
        { width: 16 },
        { width: 16 },
      ];
      detail.mergeCells('A1:F1');
      detail.getCell('A1').value = `Detalle Ticket Restaurante · ${scenario.name}`;
      detail.getCell('A1').font = { name: 'Aptos Display', size: 18, bold: true, color: { argb: COLORS.text } };
      detail.mergeCells('A2:F2');
      detail.getCell('A2').value = `Absentismo principal: ${Math.round(plan.rateA * 10000) / 100}% · Precio ticket: ${scenario.ticketAmount.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}`;
      detail.getCell('A2').font = { name: 'Aptos', size: 10, color: { argb: COLORS.muted } };
      const detailHeaders = ['Calendario', 'Personas base', 'Adicionales', 'Total personas', 'Tickets anuales', 'Importe anual'];
      detailHeaders.forEach((header, index) => {
        const cell = detail.getRow(4).getCell(index + 1);
        cell.value = header;
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.header } };
        cell.font = { name: 'Aptos', size: 10, bold: true, color: { argb: COLORS.text } };
        setThinBorder(cell);
      });
      plan.rows.forEach((planRow, index) => {
        const row = detail.getRow(5 + index);
        row.values = [
          planRow.calendarName,
          planRow.basePeople,
          planRow.additionalPeople,
          planRow.totalPeople,
          planRow.annualTicketsA,
          planRow.annualAmountA,
        ];
        for (let column = 1; column <= 6; column += 1) setThinBorder(row.getCell(column));
        row.getCell(6).numFmt = MONEY_FORMAT;
      });
      detail.pageSetup = {
        orientation: 'landscape',
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        margins: { left: 0.25, right: 0.25, top: 0.35, bottom: 0.35, header: 0.15, footer: 0.15 },
      };
    }
  }

  worksheet.autoFilter = {
    from: { row: headerRowNumber, column: 1 },
    to: { row: Math.max(rowNumber - 1, headerRowNumber), column: headers.length },
  };
  worksheet.pageSetup.printArea = `A1:${lastColumn}${rowNumber + 1}`;
  worksheet.headerFooter.oddFooter = '&LTrAccion · Relaciones Laborales&C&P / &N&RGenerado &D';

  const kind = mode === 'final' ? 'presupuesto' : 'simulacion';
  const fileName = `${kind}_rrll_${scenario.year}_${safeFileLabel(scenario.name)}.xlsx`;
  const buffer = await workbook.xlsx.writeBuffer();
  await openWorkbookInExcel(buffer, fileName);
}
