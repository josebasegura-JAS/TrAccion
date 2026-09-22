import { escapeHtml } from '../../../shared/security/escapeHtml';
import type { ModuleHelpSection } from '../../../components/ModuleHelp';
import type { Employee } from '../../plantilla/domain/employee';
import {
  lotteryAvailableCount,
  lotteryAvailableCountByNumber,
  lotteryBizumTotal,
  lotteryCashOnHand,
  lotteryOrderedCount,
  lotteryPaidTotal,
  lotteryPendingPaymentAmount,
  lotteryRequestAmount,
  lotteryRequestedCount,
  lotteryRequestedCountByNumber,
  lotteryRequestTotalCount,
  type LotteryCampaign,
} from '../domain/loteria';

export const inputClass = 'h-8 w-full rounded-lg border border-metro-border bg-metro-surface px-2.5 text-xs text-metro-text outline-none transition focus:border-metro-red';
export const labelClass = 'mb-1 block text-[11px] font-bold uppercase tracking-wide text-metro-muted';
export const textareaClass = 'min-h-36 w-full resize-y rounded-lg border border-metro-border bg-metro-surface p-2.5 text-xs leading-5 text-metro-text outline-none transition focus:border-metro-red';
export const money = (value: number) => value.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
export const dateText = (iso: string | null) => iso ? new Date(iso).toLocaleDateString('es-ES') : '—';
export const nowIso = () => new Date().toISOString();

export const LOTERIA_HELP_SECTIONS: ModuleHelpSection[] = [
  {
    title: 'Para qué sirve',
    body: 'Gestiona la campaña anual de Lotería de Navidad: encargo al lotero, participantes, cantidades solicitadas, cobros, control de existencias y cierre.',
  },
  {
    title: 'Cómo trabajar con el flujo guiado',
    ordered: true,
    items: [
      'La portada muestra el avance de la campaña y destaca una única “Siguiente acción recomendada”. Empieza siempre por ese bloque si no conoces el proceso.',
      'Septiembre · Encargo: confirma los dos números, los décimos encargados, el precio y los datos del lotero; prepara o genera el correo del encargo.',
      'Octubre · Participantes: da de alta personas de Plantilla o externas, indica cuántos décimos solicita cada una y prepara el aviso por CCO.',
      'Seguimiento · Cobros: revisa las cantidades solicitadas y registra los pagos por Bizum o efectivo con fecha y observaciones.',
      'Cierre · Cuadre: comprueba sobrantes, pendientes de cobro, caja y Bizum. La app no permite cerrar si existen cobros pendientes o se han solicitado más décimos de los encargados.',
      'Si necesitas entrar directamente en otra fase, puedes hacerlo desde la barra de progreso. Guardar y exportar a Excel siguen disponibles en la cabecera.',
    ],
  },
  {
    title: 'Campaña y existencias',
    items: [
      'La campaña que se carga corresponde automáticamente al año actual. Los datos de años anteriores quedan archivados y al cambiar de año se inicia una campaña nueva.',
      'Al generar el Outlook del encargo al lotero, TrAccion adjunta automáticamente un Excel de Administración con todos los números consecutivos desde el 1 hasta el mayor nº de empleado activo de Plantilla, distribuido en tres bloques y con los dos números de lotería como cabeceras.',
      'Se controlan por separado los décimos encargados y disponibles de cada uno de los dos números.',
      'Cuando la disponibilidad baja de 30 décimos, el indicador se muestra en tono de aviso para llamar la atención.',
      'El importe de cada persona se calcula con el número total de décimos solicitados multiplicado por el precio por décimo de la campaña.',
    ],
  },
  {
    title: 'Participantes y pagos',
    items: [
      'En el alta pueden seleccionarse personas de Plantilla o crearse participantes externos/jubilados con sus datos de contacto u observaciones.',
      'En Seguimiento no se añaden participantes nuevos: se trabaja sobre los ya dados de alta, aunque sí pueden ajustarse sus cantidades.',
      'Al marcar un pago se registra su forma —Bizum o efectivo— y puede anotarse información adicional.',
      'La exportación Excel incluye el detalle de participantes, cantidades, importes y pagos, además de una hoja de resumen de la campaña.',
    ],
  },
];

export type WorkspaceSection = 'septiembre' | 'octubre' | 'seguimiento' | 'cierre';

export function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

export function renderTemplate(template: string, replacements: Record<string, string>): string {
  return Object.entries(replacements).reduce(
    (text, [key, value]) => text.split(`{{${key}}}`).join(value),
    template,
  );
}


export function plainTextToHtml(value: string): string {
  const content = escapeHtml(value).replace(/\r?\n/g, '<br>');
  return `<div style="font-family:Verdana,Arial,sans-serif;font-size:10pt;">${content}</div>`;
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function normalizeSearch(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9ñ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function employeeScore(employee: Employee, query: string): number {
  const normalizedQuery = normalizeSearch(query);
  if (!normalizedQuery) return 0;
  const employeeNumber = normalizeSearch(employee.empleado);
  const name = normalizeSearch(employee.nombreApellidos);
  const tokens = normalizedQuery.split(' ').filter(Boolean);

  if (employeeNumber === normalizedQuery) return 1000;
  if (employeeNumber.startsWith(normalizedQuery)) return 900;
  if (name === normalizedQuery) return 850;
  if (name.startsWith(normalizedQuery)) return 800;
  if (name.includes(normalizedQuery)) return 760;
  if (tokens.every((token) => name.includes(token))) return 700 + tokens.length * 10;
  const matchedTokens = tokens.filter((token) => name.includes(token)).length;
  return matchedTokens > 0 ? 400 + matchedTokens * 40 : 0;
}

export function createRequestId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `loteria-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function getMaxActiveEmployeeNumber(employees: Employee[]): number {
  return employees.reduce((maximum, employee) => {
    if (employee.deletedAt) return maximum;
    const raw = employee.empleado.trim();
    if (!/^\d+$/.test(raw)) return maximum;
    const parsed = Number.parseInt(raw, 10);
    return Number.isSafeInteger(parsed) && parsed > maximum ? parsed : maximum;
  }, 0);
}

export function workbookBufferToArrayBuffer(value: unknown): ArrayBuffer {
  if (value instanceof ArrayBuffer) return value;
  if (ArrayBuffer.isView(value)) {
    const view = value as ArrayBufferView;
    return view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength) as ArrayBuffer;
  }
  throw new Error('No se ha podido preparar el Excel para adjuntarlo a Outlook.');
}

export async function buildLotteryAdministrationWorkbook(
  campaign: LotteryCampaign,
  employees: Employee[],
): Promise<{ fileName: string; buffer: ArrayBuffer; maxEmployeeNumber: number }> {
  const maxEmployeeNumber = getMaxActiveEmployeeNumber(employees);
  if (maxEmployeeNumber < 1) {
    throw new Error('No hay números de empleado válidos en Plantilla para generar el Excel de Administración.');
  }

  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'TrAccion';
  workbook.created = new Date();
  const sheet = workbook.addWorksheet('empleados loteria', {
    pageSetup: {
      orientation: 'portrait',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.25, right: 0.25, top: 0.3, bottom: 0.3, header: 0.15, footer: 0.15 },
    },
  });

  const number1 = campaign.numero1.trim() || 'Nº 1';
  const number2 = campaign.numero2.trim() || 'Nº 2';
  const blockSize = Math.ceil(maxEmployeeNumber / 3);
  const blockStarts = [1, blockSize + 1, blockSize * 2 + 1];
  const blockColumnStarts = [1, 4, 7];

  for (let blockIndex = 0; blockIndex < 3; blockIndex += 1) {
    const startColumn = blockColumnStarts[blockIndex];
    const headerValues = ['Núm.', number1, number2];
    headerValues.forEach((value, index) => {
      const cell = sheet.getCell(1, startColumn + index);
      cell.value = value;
      cell.font = { bold: true, name: 'Arial', size: 10 };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE7E6E6' } };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF808080' } },
        left: { style: 'thin', color: { argb: 'FF808080' } },
        bottom: { style: 'thin', color: { argb: 'FF808080' } },
        right: { style: 'thin', color: { argb: 'FF808080' } },
      };
    });

    const blockStart = blockStarts[blockIndex];
    for (let offset = 0; offset < blockSize; offset += 1) {
      const employeeNumber = blockStart + offset;
      if (employeeNumber > maxEmployeeNumber) break;
      const rowNumber = offset + 2;
      sheet.getCell(rowNumber, startColumn).value = employeeNumber;
      for (let columnOffset = 0; columnOffset < 3; columnOffset += 1) {
        const cell = sheet.getCell(rowNumber, startColumn + columnOffset);
        cell.font = { name: 'Arial', size: 9 };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = {
          top: { style: 'hair', color: { argb: 'FFB7B7B7' } },
          left: { style: 'hair', color: { argb: 'FFB7B7B7' } },
          bottom: { style: 'hair', color: { argb: 'FFB7B7B7' } },
          right: { style: 'hair', color: { argb: 'FFB7B7B7' } },
        };
      }
    }
  }

  [1, 4, 7].forEach((column) => { sheet.getColumn(column).width = 8; });
  [2, 3, 5, 6, 8, 9].forEach((column) => { sheet.getColumn(column).width = 11; });
  sheet.getRow(1).height = 18;
  for (let row = 2; row <= blockSize + 1; row += 1) sheet.getRow(row).height = 15;
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.pageSetup.printArea = `A1:I${blockSize + 1}`;

  const rawBuffer = await workbook.xlsx.writeBuffer();
  return {
    fileName: `Listado empleados loteria - Administración Lotería ${campaign.year}.xlsx`,
    buffer: workbookBufferToArrayBuffer(rawBuffer),
    maxEmployeeNumber,
  };
}


function campaignFileDate(date = new Date()): string {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${day}-${month}-${date.getFullYear()}`;
}

export async function buildCampaignWorkbook(campaign: LotteryCampaign): Promise<{ fileName: string; buffer: ArrayBuffer }> {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'TrAccion';
  workbook.subject = `Lotería de Navidad ${campaign.year}`;
  workbook.created = new Date();
  workbook.modified = new Date();

  const colors = {
    navy: '17365D',
    red: 'D7193F',
    white: 'FFFFFF',
    paleBlue: 'DDEBF7',
    green: 'E2F0D9',
    greenText: '375623',
    amber: 'FFF2CC',
    amberText: '7F6000',
    redSoft: 'FCE4D6',
    redText: '9C0006',
    border: 'D9E1F2',
    muted: '64748B',
    text: '1F2937',
  };
  const generatedAt = new Date().toLocaleString('es-ES');
  const toExcelDate = (value: string | null): Date | null => {
    if (!value) return null;
    const dateOnly = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (dateOnly) {
      return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };
  const side = { style: 'thin' as const, color: { argb: `FF${colors.border}` } };
  const border = { top: side, left: side, bottom: side, right: side };

  const summary = workbook.addWorksheet('Resumen', { views: [{ state: 'frozen', ySplit: 4 }] });
  summary.mergeCells('A1:F1');
  summary.getCell('A1').value = 'TRACCION · RELACIONES LABORALES';
  summary.getCell('A1').font = { bold: true, size: 10, color: { argb: `FF${colors.red}` } };
  summary.mergeCells('A2:F2');
  summary.getCell('A2').value = `Lotería de Navidad ${campaign.year}`;
  summary.getCell('A2').font = { bold: true, size: 18, color: { argb: `FF${colors.navy}` } };
  summary.getRow(2).height = 28;
  summary.mergeCells('A3:F3');
  summary.getCell('A3').value = `Actualizado ${generatedAt}`;
  summary.getCell('A3').font = { size: 9, color: { argb: `FF${colors.muted}` } };
  for (let column = 1; column <= 6; column += 1) summary.getColumn(column).width = 20;

  const addKpi = (column: number, label: string, value: string | number, fill: string) => {
    const valueCell = summary.getCell(5, column);
    const labelCell = summary.getCell(6, column);
    valueCell.value = value;
    valueCell.font = { bold: true, size: 16, color: { argb: `FF${colors.navy}` } };
    valueCell.alignment = { horizontal: 'center', vertical: 'middle' };
    labelCell.value = label;
    labelCell.font = { bold: true, size: 9, color: { argb: `FF${colors.muted}` } };
    labelCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    valueCell.fill = labelCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${fill}` } };
    valueCell.border = labelCell.border = border;
  };

  addKpi(1, 'Décimos encargados', lotteryOrderedCount(campaign), colors.paleBlue);
  addKpi(2, 'Décimos solicitados', lotteryRequestedCount(campaign), colors.paleBlue);
  addKpi(3, 'Décimos disponibles', lotteryAvailableCount(campaign), lotteryAvailableCount(campaign) < 0 ? colors.redSoft : colors.green);
  addKpi(4, 'Total cobrado', lotteryPaidTotal(campaign), colors.green);
  summary.getCell('D5').numFmt = '#,##0.00 [$€-es-ES]';
  addKpi(5, 'Pendiente de cobro', lotteryPendingPaymentAmount(campaign), lotteryPendingPaymentAmount(campaign) > 0 ? colors.amber : colors.green);
  summary.getCell('E5').numFmt = '#,##0.00 [$€-es-ES]';
  addKpi(6, 'Participantes', campaign.requests.length, colors.paleBlue);

  summary.getCell('A9').value = 'Control por número';
  summary.getCell('A9').font = { bold: true, size: 12, color: { argb: `FF${colors.navy}` } };
  const numberRows = [
    ['Número', 'Encargados', 'Solicitados', 'Disponibles', 'Precio/décimo', 'Situación'],
    [campaign.numero1 || 'Nº 1', campaign.decimosNumero1, lotteryRequestedCountByNumber(campaign, 1), lotteryAvailableCountByNumber(campaign, 1), campaign.precioDecimo, lotteryAvailableCountByNumber(campaign, 1) < 0 ? 'Exceso solicitado' : 'Correcto'],
    [campaign.numero2 || 'Nº 2', campaign.decimosNumero2, lotteryRequestedCountByNumber(campaign, 2), lotteryAvailableCountByNumber(campaign, 2), campaign.precioDecimo, lotteryAvailableCountByNumber(campaign, 2) < 0 ? 'Exceso solicitado' : 'Correcto'],
  ];
  numberRows.forEach((values, rowIndex) => {
    values.forEach((value, columnIndex) => {
      const cell = summary.getCell(10 + rowIndex, 1 + columnIndex);
      cell.value = value;
      cell.border = border;
      cell.alignment = { vertical: 'middle', horizontal: columnIndex === 0 ? 'left' : 'center' };
      if (rowIndex === 0) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${colors.navy}` } };
        cell.font = { bold: true, color: { argb: `FF${colors.white}` } };
      }
    });
  });
  summary.getCell('E11').numFmt = '#,##0.00 [$€-es-ES]';
  summary.getCell('E12').numFmt = '#,##0.00 [$€-es-ES]';

  summary.getCell('A15').value = 'Cobros';
  summary.getCell('A15').font = { bold: true, size: 12, color: { argb: `FF${colors.navy}` } };
  const paymentRows = [
    ['Concepto', 'Importe'],
    ['Efectivo / caja', lotteryCashOnHand(campaign)],
    ['Bizum', lotteryBizumTotal(campaign)],
    ['Pendiente', lotteryPendingPaymentAmount(campaign)],
  ];
  paymentRows.forEach((values, rowIndex) => {
    values.forEach((value, columnIndex) => {
      const cell = summary.getCell(16 + rowIndex, 1 + columnIndex);
      cell.value = value;
      cell.border = border;
      if (rowIndex === 0) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${colors.navy}` } };
        cell.font = { bold: true, color: { argb: `FF${colors.white}` } };
      } else if (columnIndex === 1) {
        cell.numFmt = '#,##0.00 [$€-es-ES]';
      }
    });
  });
  summary.pageSetup = {
    orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 1,
    margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
  };

  const sheet = workbook.addWorksheet(`Lotería ${campaign.year}`, { views: [{ state: 'frozen', ySplit: 5 }] });
  sheet.mergeCells('A1:M1');
  sheet.getCell('A1').value = 'TRACCION · RELACIONES LABORALES';
  sheet.getCell('A1').font = { bold: true, size: 10, color: { argb: `FF${colors.red}` } };
  sheet.mergeCells('A2:M2');
  sheet.getCell('A2').value = `Detalle campaña Lotería de Navidad ${campaign.year}`;
  sheet.getCell('A2').font = { bold: true, size: 18, color: { argb: `FF${colors.navy}` } };
  sheet.getRow(2).height = 28;
  sheet.mergeCells('A3:M3');
  sheet.getCell('A3').value = `Actualizado ${generatedAt} · ${campaign.requests.length} participantes`;
  sheet.getCell('A3').font = { size: 9, color: { argb: `FF${colors.muted}` } };

  const columns = [
    { header: 'Nº empleado', width: 14 }, { header: 'Persona', width: 32 }, { header: 'Tipo', width: 14 },
    { header: 'Email', width: 32 }, { header: 'Contacto / nota', width: 34 },
    { header: `Décimos ${campaign.numero1 || 'Nº 1'}`, width: 16 }, { header: `Décimos ${campaign.numero2 || 'Nº 2'}`, width: 16 },
    { header: 'Total décimos', width: 14 }, { header: 'Importe', width: 14 }, { header: 'Pagado', width: 12 },
    { header: 'Fecha pago', width: 16 }, { header: 'Forma de pago', width: 18 }, { header: 'Observaciones pago', width: 36 },
  ];
  columns.forEach((column, index) => {
    sheet.getColumn(index + 1).width = column.width;
    sheet.getCell(5, index + 1).value = column.header;
  });
  sheet.getRow(5).height = 24;
  sheet.getRow(5).eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${colors.navy}` } };
    cell.font = { bold: true, color: { argb: `FF${colors.white}` }, size: 10 };
    cell.alignment = { vertical: 'middle', wrapText: true };
    cell.border = border;
  });
  sheet.autoFilter = { from: 'A5', to: 'M5' };

  campaign.requests.forEach((request, index) => {
    const rowNumber = 6 + index;
    const date = toExcelDate(request.fechaPago);
    const values: Array<string | number | Date | null> = [
      request.empleado ?? '', request.nombre, request.externa ? 'Externa' : 'Plantilla', request.email,
      request.contactoObservaciones, request.decimosNumero1, request.decimosNumero2,
      lotteryRequestTotalCount(request), lotteryRequestAmount(campaign, request), request.pagado ? 'Sí' : 'No',
      date,
      request.pagado ? (request.formaPago === 'bizum' ? 'Bizum' : 'Efectivo') : '', request.observacionesPago,
    ];
    values.forEach((value, columnIndex) => {
      const cell = sheet.getCell(rowNumber, columnIndex + 1);
      cell.value = value;
      cell.border = border;
      cell.font = { size: 9, color: { argb: `FF${colors.text}` } };
      cell.alignment = { vertical: 'top', wrapText: true };
    });
    sheet.getCell(rowNumber, 9).numFmt = '#,##0.00 [$€-es-ES]';
    sheet.getCell(rowNumber, 11).numFmt = 'dd/mm/yyyy';
    const paidCell = sheet.getCell(rowNumber, 10);
    paidCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${request.pagado ? colors.green : colors.amber}` } };
    paidCell.font = { bold: true, size: 9, color: { argb: `FF${request.pagado ? colors.greenText : colors.amberText}` } };
  });

  sheet.pageSetup = {
    orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
    margins: { left: 0.25, right: 0.25, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
  };

  const buffer = workbookBufferToArrayBuffer(await workbook.xlsx.writeBuffer());
  return { fileName: `Loteria_${campaign.year}_${campaignFileDate()}.xlsx`, buffer };
}

export async function exportCampaign(campaign: LotteryCampaign) {
  const { fileName, buffer } = await buildCampaignWorkbook(campaign);
  downloadBlob(
    new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    fileName,
  );
}


export function stockTone(value: number): 'good' | 'warning' | 'alert' {
  if (value < 0) return 'alert';
  if (value < 30) return 'warning';
  return 'good';
}
