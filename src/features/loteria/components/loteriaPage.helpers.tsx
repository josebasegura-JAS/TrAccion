import { escapeHtml } from '../../../shared/security/escapeHtml';
import type { ReactNode } from 'react';
import { Check, type LucideIcon } from 'lucide-react';
import type { ModuleHelpSection } from '../../../components/ModuleHelp';
import { StatusBadge } from '../../../components/ui/StatusBadge';
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

export async function exportCampaign(campaign: LotteryCampaign) {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(`Lotería ${campaign.year}`);
  sheet.columns = [
    { header: 'Nº empleado', key: 'empleado', width: 14 },
    { header: 'Persona', key: 'nombre', width: 32 },
    { header: 'Tipo', key: 'tipo', width: 14 },
    { header: 'Email', key: 'email', width: 32 },
    { header: 'Contacto / nota', key: 'contacto', width: 34 },
    { header: `Décimos ${campaign.numero1 || 'Nº 1'}`, key: 'numero1', width: 16 },
    { header: `Décimos ${campaign.numero2 || 'Nº 2'}`, key: 'numero2', width: 16 },
    { header: 'Total décimos', key: 'totalDecimos', width: 14 },
    { header: 'Importe', key: 'importe', width: 14 },
    { header: 'Pagado', key: 'pagado', width: 12 },
    { header: 'Fecha pago', key: 'fechaPago', width: 16 },
    { header: 'Forma de pago', key: 'formaPago', width: 18 },
    { header: 'Observaciones pago', key: 'observacionesPago', width: 36 },
  ];

  campaign.requests.forEach((request) => sheet.addRow({
    empleado: request.empleado ?? '',
    nombre: request.nombre,
    tipo: request.externa ? 'Externa' : 'Plantilla',
    email: request.email,
    contacto: request.contactoObservaciones,
    numero1: request.decimosNumero1,
    numero2: request.decimosNumero2,
    totalDecimos: lotteryRequestTotalCount(request),
    importe: lotteryRequestAmount(campaign, request),
    pagado: request.pagado ? 'Sí' : 'No',
    fechaPago: request.fechaPago ? new Date(request.fechaPago) : '',
    formaPago: request.pagado ? (request.formaPago === 'bizum' ? 'Bizum' : 'Efectivo') : '',
    observacionesPago: request.observacionesPago,
  }));

  sheet.getColumn('importe').numFmt = '#,##0.00 [$€-es-ES]';
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = { from: 'A1', to: 'M1' };

  const summary = workbook.addWorksheet('Resumen');
  summary.addRows([
    ['Campaña', `Lotería de Navidad ${campaign.year}`],
    ['Número 1', campaign.numero1 || '—'],
    ['Décimos encargados nº 1', campaign.decimosNumero1],
    ['Solicitados nº 1', lotteryRequestedCountByNumber(campaign, 1)],
    ['Disponibles nº 1', lotteryAvailableCountByNumber(campaign, 1)],
    ['Número 2', campaign.numero2 || '—'],
    ['Décimos encargados nº 2', campaign.decimosNumero2],
    ['Solicitados nº 2', lotteryRequestedCountByNumber(campaign, 2)],
    ['Disponibles nº 2', lotteryAvailableCountByNumber(campaign, 2)],
    ['Precio por décimo', campaign.precioDecimo],
    ['Décimos encargados total', lotteryOrderedCount(campaign)],
    ['Décimos solicitados total', lotteryRequestedCount(campaign)],
    ['Décimos disponibles total', lotteryAvailableCount(campaign)],
    ['Total cobrado', lotteryPaidTotal(campaign)],
    ['Cobros en efectivo / caja', lotteryCashOnHand(campaign)],
    ['Cobros por Bizum', lotteryBizumTotal(campaign)],
    ['Pendiente de cobro', lotteryPendingPaymentAmount(campaign)],
  ]);
  summary.getColumn(1).width = 30;
  summary.getColumn(2).width = 24;
  summary.getRow(1).font = { bold: true };

  const buffer = await workbook.xlsx.writeBuffer();
  downloadBlob(
    new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `Loteria_${campaign.year}.xlsx`,
  );
}

export function MetricCard({ icon: Icon, label, value, detail }: { icon: LucideIcon; label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-xl border border-metro-border bg-metro-panel px-3 py-2.5">
      <div className="flex items-center gap-2 text-metro-secondary">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-metro-red/10 text-red-300"><Icon size={15} /></span>
        <span className="text-[11px] font-bold">{label}</span>
      </div>
      <p className="mt-1 text-xl font-extrabold tracking-tight text-metro-text">{value}</p>
      {detail ? <p className="text-[11px] text-metro-muted">{detail}</p> : null}
    </div>
  );
}

export function stockTone(value: number): 'good' | 'warning' | 'alert' {
  if (value < 0) return 'alert';
  if (value < 30) return 'warning';
  return 'good';
}

export function StepCard({
  active,
  done,
  icon: Icon,
  month,
  title,
  detail,
  onClick,
}: {
  active: boolean;
  done: boolean;
  icon: LucideIcon;
  month: string;
  title: string;
  detail: string;
  onClick: () => void;
}) {
  return (
    <button
      className={cx(
        'rounded-xl border p-3 text-left transition',
        active
          ? 'border-metro-red bg-metro-red/10 shadow-[0_0_0_1px_rgba(218,41,28,0.2)]'
          : done
            ? 'border-emerald-500/35 bg-emerald-500/[0.07] hover:border-emerald-400/60'
            : 'border-metro-border bg-metro-panel hover:border-metro-red/60',
      )}
      onClick={onClick}
      type="button"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={cx(
            'grid h-8 w-8 place-items-center rounded-lg border',
            active ? 'border-metro-red/50 bg-metro-red/10 text-red-300' : 'border-metro-border bg-metro-surface text-metro-secondary',
          )}><Icon size={16} /></span>
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-wide text-red-300">{month}</p>
            <p className="text-xs font-extrabold text-metro-text">{title}</p>
          </div>
        </div>
        <span className={cx(
          'grid h-5 w-5 place-items-center rounded-full border',
          done ? 'border-emerald-400 bg-emerald-500 text-white' : 'border-metro-border text-transparent',
        )}><Check size={12} /></span>
      </div>
      <p className="mt-2 text-xs leading-5 text-metro-muted">{detail}</p>
    </button>
  );
}

export function SectionShell({ title, subtitle, actions, children }: { title: string; subtitle: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-metro-border bg-metro-panel p-3 md:p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3 border-b border-metro-border pb-3">
        <div>
          <h3 className="text-sm font-extrabold text-metro-text">{title}</h3>
          <p className="mt-1 text-xs text-metro-muted">{subtitle}</p>
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function SaveState({ dirty, message }: { dirty: boolean; message: string }) {
  return (
    <StatusBadge tone={dirty ? 'warning' : 'success'}>
      {dirty ? 'Cambios sin guardar' : (message || 'Todo guardado')}
    </StatusBadge>
  );
}

export function SummaryPill({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'good' | 'warning' | 'alert' }) {
  return (
    <div className={cx(
      'rounded-lg border px-2.5 py-2',
      tone === 'good'
        ? 'border-emerald-500/35 bg-emerald-500/[0.07]'
        : tone === 'warning'
          ? 'border-amber-500/45 bg-amber-500/10'
          : tone === 'alert'
            ? 'border-red-500/45 bg-red-500/10'
            : 'border-metro-border bg-metro-surface',
    )}>
      <p className="text-[11px] font-bold uppercase tracking-wide text-metro-muted">{label}</p>
      <p className="mt-0.5 text-sm font-extrabold text-metro-text">{value}</p>
    </div>
  );
}

