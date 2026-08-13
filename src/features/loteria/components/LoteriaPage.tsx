import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ArrowLeft,
  CalendarDays,
  Check,
  CircleDollarSign,
  ClipboardCheck,
  Copy,
  Download,
  Euro,
  Mail,
  Plus,
  Save,
  Search,
  Ticket,
  Trash2,
  UserRound,
  UserRoundPlus,
  type LucideIcon,
} from 'lucide-react';
import { PageHeader } from '../../../components/ui/PageHeader';
import type { ModuleHelpSection } from '../../../components/ModuleHelp';
import { ActionButton } from '../../../components/ui/ActionButton';
import type { Employee } from '../../plantilla/domain/employee';
import { useEmployeeStore } from '../../plantilla/store/useEmployeeStore';
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
  type LotteryPaymentMethod,
  type LotteryRequest,
} from '../domain/loteria';
import { useLoteriaStore } from '../store/useLoteriaStore';

const inputClass = 'h-8 w-full rounded-lg border border-metro-border bg-metro-surface px-2.5 text-xs text-metro-text outline-none transition focus:border-metro-red';
const labelClass = 'mb-1 block text-[10px] font-bold uppercase tracking-wide text-metro-muted';
const textareaClass = 'min-h-36 w-full resize-y rounded-lg border border-metro-border bg-metro-surface p-2.5 text-xs leading-5 text-metro-text outline-none transition focus:border-metro-red';
const money = (value: number) => value.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
const dateText = (iso: string | null) => iso ? new Date(iso).toLocaleDateString('es-ES') : '—';
const nowIso = () => new Date().toISOString();

const LOTERIA_HELP_SECTIONS: ModuleHelpSection[] = [
  {
    title: 'Para qué sirve',
    body: 'Gestiona la campaña anual de Lotería de Navidad: encargo al lotero, participantes, cantidades solicitadas, cobros, control de existencias y cierre.',
  },
  {
    title: 'Flujo de la campaña',
    ordered: true,
    items: [
      'Septiembre: confirmar los dos números, los décimos encargados, el precio y los datos del lotero; preparar o generar el correo del encargo.',
      'Octubre: dar de alta participantes de Plantilla o personas externas, indicar cuántos décimos solicita cada una de cada número y preparar el aviso por CCO.',
      'Seguimiento: revisar las cantidades solicitadas, modificarlas si cambian y registrar los pagos por Bizum o efectivo con su fecha y observaciones.',
      'Cierre: comprobar décimos sobrantes, pendientes de cobro, total cobrado, caja en efectivo y Bizum; la app impide marcar la campaña como cerrada si quedan cobros pendientes o si se han solicitado más décimos de los encargados.',
      'Guardar todo y exportar a Excel cuando necesites conservar o compartir el detalle y el resumen de la campaña.',
    ],
  },
  {
    title: 'Campaña y existencias',
    items: [
      'La campaña que se carga corresponde automáticamente al año actual. Los datos de años anteriores quedan archivados y al cambiar de año se inicia una campaña nueva.',
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

type WorkspaceSection = 'septiembre' | 'octubre' | 'seguimiento' | 'cierre';

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

function renderTemplate(template: string, replacements: Record<string, string>): string {
  return Object.entries(replacements).reduce(
    (text, [key, value]) => text.split(`{{${key}}}`).join(value),
    template,
  );
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function plainTextToHtml(value: string): string {
  return escapeHtml(value).replace(/\r?\n/g, '<br>');
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function normalizeSearch(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9ñ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function employeeScore(employee: Employee, query: string): number {
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

function createRequestId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `loteria-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

async function exportCampaign(campaign: LotteryCampaign) {
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

function MetricCard({ icon: Icon, label, value, detail }: { icon: LucideIcon; label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-xl border border-metro-border bg-metro-panel px-3 py-2.5">
      <div className="flex items-center gap-2 text-metro-secondary">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-metro-red/10 text-red-300"><Icon size={15} /></span>
        <span className="text-[11px] font-bold">{label}</span>
      </div>
      <p className="mt-1 text-xl font-extrabold tracking-tight text-metro-text">{value}</p>
      {detail ? <p className="text-[10px] text-metro-muted">{detail}</p> : null}
    </div>
  );
}

function HeaderMetric({ label, value, warning = false }: { label: string; value: string; warning?: boolean }) {
  return (
    <div className={cx(
      'flex h-9 min-w-[92px] items-center justify-between gap-2 rounded-lg border px-2.5',
      warning ? 'border-amber-500/45 bg-amber-500/10' : 'border-metro-border bg-metro-surface',
    )}>
      <span className="text-[9px] font-bold uppercase tracking-wide text-metro-muted">{label}</span>
      <span className={cx('text-xs font-extrabold', warning ? 'text-amber-200' : 'text-metro-text')}>{value}</span>
    </div>
  );
}

function stockTone(value: number): 'good' | 'warning' | 'alert' {
  if (value < 0) return 'alert';
  if (value < 30) return 'warning';
  return 'good';
}

function StepCard({
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
            <p className="text-[10px] font-extrabold uppercase tracking-wide text-red-300">{month}</p>
            <p className="text-xs font-extrabold text-metro-text">{title}</p>
          </div>
        </div>
        <span className={cx(
          'grid h-5 w-5 place-items-center rounded-full border',
          done ? 'border-emerald-400 bg-emerald-500 text-white' : 'border-metro-border text-transparent',
        )}><Check size={12} /></span>
      </div>
      <p className="mt-2 text-[11px] leading-5 text-metro-muted">{detail}</p>
    </button>
  );
}

function SectionShell({ title, subtitle, actions, children }: { title: string; subtitle: string; actions?: ReactNode; children: ReactNode }) {
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

function SaveState({ dirty, message }: { dirty: boolean; message: string }) {
  return (
    <div className={cx(
      'inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold',
      dirty ? 'border-amber-500/40 bg-amber-500/10 text-amber-200' : 'border-emerald-500/35 bg-emerald-500/[0.08] text-emerald-200',
    )}>
      {dirty ? 'Cambios sin guardar' : (message || 'Todo guardado')}
    </div>
  );
}

function SummaryPill({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'good' | 'warning' | 'alert' }) {
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
      <p className="text-[10px] font-bold uppercase tracking-wide text-metro-muted">{label}</p>
      <p className="mt-0.5 text-sm font-extrabold text-metro-text">{value}</p>
    </div>
  );
}

export function LoteriaPage() {
  const campaign = useLoteriaStore((state) => state.campaign);
  const load = useLoteriaStore((state) => state.load);
  const saveCampaign = useLoteriaStore((state) => state.saveCampaign);
  const employees = useEmployeeStore((state) => state.employees);
  const loadEmployees = useEmployeeStore((state) => state.load);

  const [draft, setDraft] = useState(campaign);
  const [activeSection, setActiveSection] = useState<WorkspaceSection | null>(null);
  const [search, setSearch] = useState('');
  const [paymentFilter, setPaymentFilter] = useState<'todos' | 'pagados' | 'pendientes'>('todos');
  const [participantSearch, setParticipantSearch] = useState('');
  const [showExternalForm, setShowExternalForm] = useState(false);
  const [externalName, setExternalName] = useState('');
  const [externalEmail, setExternalEmail] = useState('');
  const [externalContact, setExternalContact] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    load();
    loadEmployees();
  }, [load, loadEmployees]);
  useEffect(() => { setDraft(campaign); }, [campaign]);

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(campaign), [campaign, draft]);
  const orderedTotal = lotteryOrderedCount(draft);
  const requestedTotal = lotteryRequestedCount(draft);
  const availableTotal = lotteryAvailableCount(draft);
  const availableNumero1 = lotteryAvailableCountByNumber(draft, 1);
  const availableNumero2 = lotteryAvailableCountByNumber(draft, 2);
  const requestedNumero1 = lotteryRequestedCountByNumber(draft, 1);
  const requestedNumero2 = lotteryRequestedCountByNumber(draft, 2);
  const paid = lotteryPaidTotal(draft);
  const cash = lotteryCashOnHand(draft);
  const bizum = lotteryBizumTotal(draft);
  const pendingAmount = lotteryPendingPaymentAmount(draft);

  const septemberDone = draft.workflow.loteroAvisado && draft.workflow.encargoConfirmado;
  const octoberDone = draft.workflow.participantesPreparados && draft.workflow.avisoPersonasEnviado;
  const seguimientoDone = draft.workflow.seguimientoIniciado;
  const cierreDone = draft.workflow.campanaCerrada;

  const loteroMailPreview = useMemo(() => renderTemplate(draft.loteroEmailBody, {
    lotero: draft.lotero.nombre || 'nombre del lotero',
    year: String(draft.year),
    numero1: draft.numero1 || 'número 1',
    numero2: draft.numero2 || 'número 2',
    decimos_numero1: String(draft.decimosNumero1),
    decimos_numero2: String(draft.decimosNumero2),
    precio: draft.precioDecimo.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  }), [draft]);

  const participantesMailPreview = useMemo(() => renderTemplate(draft.participantesEmailBody, {
    year: String(draft.year),
    numero1: draft.numero1 || 'número 1',
    numero2: draft.numero2 || 'número 2',
    precio: draft.precioDecimo.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  }), [draft]);

  const employeeSuggestions = useMemo(() => {
    if (normalizeSearch(participantSearch).length < 2) return [];
    return employees
      .filter((employee) => !employee.deletedAt && employee.nombreApellidos.trim())
      .map((employee) => ({ employee, score: employeeScore(employee, participantSearch) }))
      .filter((entry) => entry.score > 0)
      .sort((left, right) => right.score - left.score || left.employee.nombreApellidos.localeCompare(right.employee.nombreApellidos, 'es'))
      .slice(0, 8);
  }, [employees, participantSearch]);

  const filteredRequests = useMemo(() => {
    const needle = normalizeSearch(search);
    return draft.requests.filter((request) => {
      const haystack = normalizeSearch(`${request.nombre} ${request.empleado ?? ''} ${request.email} ${request.contactoObservaciones}`);
      const matchesSearch = !needle || haystack.includes(needle);
      const matchesPayment = paymentFilter === 'todos' || (paymentFilter === 'pagados' ? request.pagado : !request.pagado);
      return matchesSearch && matchesPayment;
    });
  }, [draft.requests, paymentFilter, search]);

  const persist = async (next = draft, success = 'Cambios guardados.') => {
    const result = await saveCampaign(next);
    setMessage(result.ok ? success : result.message);
  };

  const updateDraft = (updater: (current: LotteryCampaign) => LotteryCampaign) => {
    setDraft((current) => updater(current));
  };

  const setWorkflowFlag = (key: keyof LotteryCampaign['workflow'], value: boolean) => {
    updateDraft((current) => ({ ...current, workflow: { ...current.workflow, [key]: value } }));
  };

  const setCampaignClosed = (value: boolean) => {
    if (value) {
      const available1 = lotteryAvailableCountByNumber(draft, 1);
      const available2 = lotteryAvailableCountByNumber(draft, 2);
      if (available1 < 0 || available2 < 0) {
        setMessage('No se puede cerrar la campaña: hay más décimos solicitados que encargados en alguno de los números.');
        return;
      }
      if (lotteryPendingPaymentAmount(draft) > 0) {
        setMessage('No se puede cerrar la campaña mientras existan importes pendientes de cobro.');
        return;
      }
    }

    setWorkflowFlag('campanaCerrada', value);
    setMessage(value ? 'Campaña preparada para cerrar. Guarda el cierre para confirmarlo.' : 'Campaña reabierta en el borrador.');
  };

  const updateRequest = (id: string, patch: Partial<LotteryRequest>) => {
    updateDraft((current) => ({
      ...current,
      requests: current.requests.map((request) => request.id === id ? { ...request, ...patch, updatedAt: nowIso() } : request),
    }));
  };

  const addEmployeeParticipant = (employee: Employee) => {
    if (draft.requests.some((request) => request.empleado === employee.empleado)) {
      setMessage(`${employee.nombreApellidos} ya está en la lista de Lotería.`);
      return;
    }
    const now = nowIso();
    updateDraft((current) => ({
      ...current,
      requests: [...current.requests, {
        id: createRequestId(),
        nombre: employee.nombreApellidos,
        email: '',
        empleado: employee.empleado,
        externa: false,
        contactoObservaciones: '',
        decimosNumero1: 0,
        decimosNumero2: 0,
        pagado: false,
        fechaPago: null,
        formaPago: 'efectivo',
        observacionesPago: '',
        createdAt: now,
        updatedAt: now,
      }],
    }));
    setParticipantSearch('');
    setMessage(`${employee.nombreApellidos} añadido a la campaña.`);
  };

  const addExternalParticipant = () => {
    const name = externalName.trim();
    if (!name) {
      setMessage('Indica el nombre de la persona externa.');
      return;
    }
    const now = nowIso();
    updateDraft((current) => ({
      ...current,
      requests: [...current.requests, {
        id: createRequestId(),
        nombre: name,
        email: externalEmail.trim(),
        empleado: null,
        externa: true,
        contactoObservaciones: externalContact.trim(),
        decimosNumero1: 0,
        decimosNumero2: 0,
        pagado: false,
        fechaPago: null,
        formaPago: 'efectivo',
        observacionesPago: '',
        createdAt: now,
        updatedAt: now,
      }],
    }));
    setExternalName('');
    setExternalEmail('');
    setExternalContact('');
    setShowExternalForm(false);
    setMessage(`${name} añadido como persona externa.`);
  };

  const removePerson = (id: string) => {
    updateDraft((current) => ({
      ...current,
      requests: current.requests.filter((request) => request.id !== id),
    }));
  };

  const togglePaid = (request: LotteryRequest) => {
    updateRequest(request.id, {
      pagado: !request.pagado,
      fechaPago: request.pagado ? null : nowIso(),
      formaPago: request.formaPago || 'efectivo',
    });
  };

  const copyToClipboard = async (text: string, successMessage: string) => {
    if (!navigator.clipboard?.writeText) {
      setMessage('Tu navegador no permite copiar automáticamente al portapapeles.');
      return;
    }
    await navigator.clipboard.writeText(text);
    setMessage(successMessage);
  };

  const generateLoteroOutlookDraft = async () => {
    if (!isValidEmail(draft.lotero.email)) {
      setMessage('Introduce un email válido del lotero antes de generar el correo.');
      return;
    }
    const api = window.traccion?.createOutlookDraft;
    if (!api) {
      setMessage('La generación de borradores de Outlook solo está disponible en la aplicación de escritorio.');
      return;
    }
    const result = await api({
      subject: draft.loteroEmailSubject,
      html: plainTextToHtml(loteroMailPreview),
      to: [draft.lotero.email.trim()],
      cc: [],
      bcc: [],
      attachments: [],
    });
    setMessage(result.message);
  };

  const generateParticipantsOutlookDraft = async () => {
    if (draft.requests.length === 0) {
      setMessage('Da de alta al menos una persona antes de generar el correo.');
      return;
    }
    const missingEmails = draft.requests.filter((request) => !isValidEmail(request.email));
    if (missingEmails.length > 0) {
      setMessage(`Faltan o no son válidos ${missingEmails.length} emails. Complétalos antes de generar el correo.`);
      return;
    }
    const api = window.traccion?.createOutlookDraft;
    if (!api) {
      setMessage('La generación de borradores de Outlook solo está disponible en la aplicación de escritorio.');
      return;
    }
    const bcc = Array.from(new Set(draft.requests.map((request) => request.email.trim().toLowerCase())));
    const result = await api({
      subject: draft.participantesEmailSubject,
      html: plainTextToHtml(participantesMailPreview),
      to: [],
      cc: [],
      bcc,
      attachments: [],
    });
    setMessage(result.message);
  };

  return (
    <div className="space-y-3">
      <PageHeader
        title="Lotería"
        helpSections={LOTERIA_HELP_SECTIONS}
        helpSubtitle="Guía rápida del encargo, participantes, seguimiento de pagos, existencias y cierre anual."
        status={<SaveState dirty={dirty} message={message} />}
        actions={
          <>
            <span className="inline-flex h-9 items-center rounded-lg border border-metro-red/40 bg-metro-red/10 px-3 text-xs font-extrabold text-red-200">Lotería {draft.year}</span>
            <HeaderMetric label={draft.numero1 || 'Nº 1'} value={`${availableNumero1} disp.`} warning={availableNumero1 < 30} />
            <HeaderMetric label={draft.numero2 || 'Nº 2'} value={`${availableNumero2} disp.`} warning={availableNumero2 < 30} />
            <HeaderMetric label="Décimos" value={`${requestedTotal}/${orderedTotal}`} warning={availableTotal < 30} />
            <HeaderMetric label="Caja" value={money(cash)} />
            <ActionButton icon={Save} iconOnly={false} onClick={() => void persist()} variant="save">Guardar todo</ActionButton>
            <ActionButton icon={Download} iconOnly={false} onClick={() => void exportCampaign(draft)} variant="excel">Exportar Excel</ActionButton>
          </>
        }
      />

      {activeSection === null ? (
        <section className="rounded-2xl border border-metro-border bg-metro-panel p-3 md:p-4">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
            <div>
              <h3 className="text-sm font-extrabold text-metro-text">Flujograma de trabajo · {draft.year}</h3>
              <p className="mt-1 text-xs text-metro-muted">Pulsa una fase para abrir su espacio de trabajo. Al entrar, el flujograma se repliega para dejar más sitio.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <SummaryPill label="Participantes" value={String(draft.requests.length)} />
              <SummaryPill label="Pendiente de cobro" value={money(pendingAmount)} tone={pendingAmount > 0 ? 'warning' : 'good'} />
            </div>
          </div>
          <div className="grid gap-2 lg:grid-cols-4">
            <StepCard active={false} done={septemberDone} icon={CalendarDays} month="Septiembre" title="Encargo al lotero" detail="Números, cantidades, datos del lotero y correo de septiembre." onClick={() => setActiveSection('septiembre')} />
            <StepCard active={false} done={octoberDone} icon={UserRoundPlus} month="Octubre" title="Alta y aviso a participantes" detail="Da de alta personas, asigna sus décimos y genera el aviso CCO." onClick={() => setActiveSection('octubre')} />
            <StepCard active={false} done={seguimientoDone} icon={Euro} month="Seguimiento" title="Décimos y pagos" detail="Ajusta cantidades si cambian y registra cómo ha pagado cada persona." onClick={() => setActiveSection('seguimiento')} />
            <StepCard active={false} done={cierreDone} icon={ClipboardCheck} month="Cierre" title="Cuadre y exportación" detail="Comprueba sobrantes, cobros pendientes, caja y resultado final." onClick={() => setActiveSection('cierre')} />
          </div>
        </section>
      ) : (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-metro-border bg-metro-panel px-3 py-2">
          <button className="inline-flex h-8 items-center gap-2 rounded-lg border border-metro-border bg-metro-surface px-2.5 text-xs font-bold text-metro-text transition hover:border-metro-red" onClick={() => setActiveSection(null)} type="button"><ArrowLeft size={14} /> Volver al flujograma</button>
          <span className="text-[11px] font-semibold text-metro-muted">Campaña {draft.year} · {activeSection === 'septiembre' ? 'Septiembre' : activeSection === 'octubre' ? 'Octubre' : activeSection === 'seguimiento' ? 'Seguimiento' : 'Cierre'}</span>
        </div>
      )}

      {activeSection === 'septiembre' ? (
        <SectionShell
          title="Septiembre · Encargo al lotero"
          subtitle="Define los números, la cantidad encargada de cada uno y prepara el correo de septiembre."
          actions={<ActionButton icon={Save} iconOnly={false} onClick={() => void persist(draft, 'Datos de septiembre guardados.')} size="sm" variant="save">Guardar septiembre</ActionButton>}
        >
          <div className="grid gap-3 xl:grid-cols-[1.05fr_0.95fr]">
            <div className="space-y-3">
              <div className="rounded-xl border border-metro-border bg-metro-surface p-3">
                <h4 className="mb-3 text-xs font-extrabold text-metro-text">Configuración del encargo</h4>
                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                  <label><span className={labelClass}>Número 1</span><input className={inputClass} value={draft.numero1} onChange={(e) => updateDraft((current) => ({ ...current, numero1: e.target.value }))} /></label>
                  <label><span className={labelClass}>Décimos nº 1</span><input className={inputClass} min="0" step="1" type="number" value={draft.decimosNumero1} onChange={(e) => updateDraft((current) => ({ ...current, decimosNumero1: Math.max(0, Number(e.target.value)) }))} /></label>
                  <label><span className={labelClass}>Número 2</span><input className={inputClass} value={draft.numero2} onChange={(e) => updateDraft((current) => ({ ...current, numero2: e.target.value }))} /></label>
                  <label><span className={labelClass}>Décimos nº 2</span><input className={inputClass} min="0" step="1" type="number" value={draft.decimosNumero2} onChange={(e) => updateDraft((current) => ({ ...current, decimosNumero2: Math.max(0, Number(e.target.value)) }))} /></label>
                  <label><span className={labelClass}>Precio por décimo</span><input className={inputClass} min="0" step="0.01" type="number" value={draft.precioDecimo} onChange={(e) => updateDraft((current) => ({ ...current, precioDecimo: Math.max(0, Number(e.target.value)) }))} /></label>
                  <SummaryPill label="Campaña automática" value={String(draft.year)} />
                  <SummaryPill label="Encargados total" value={String(orderedTotal)} />
                  <SummaryPill label="Disponibles" value={String(availableTotal)} tone={stockTone(availableTotal)} />
                </div>
              </div>

              <div className="rounded-xl border border-metro-border bg-metro-surface p-3">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h4 className="text-xs font-extrabold text-metro-text">Datos del lotero</h4>
                  <div className="flex flex-wrap gap-3 text-[11px] text-metro-muted">
                    <label className="inline-flex items-center gap-2"><input checked={draft.workflow.loteroAvisado} onChange={(e) => setWorkflowFlag('loteroAvisado', e.target.checked)} type="checkbox" />Lotero avisado</label>
                    <label className="inline-flex items-center gap-2"><input checked={draft.workflow.encargoConfirmado} onChange={(e) => setWorkflowFlag('encargoConfirmado', e.target.checked)} type="checkbox" />Encargo confirmado</label>
                  </div>
                </div>
                <div className="grid gap-2 md:grid-cols-3">
                  <label><span className={labelClass}>Nombre</span><input className={inputClass} value={draft.lotero.nombre} onChange={(e) => updateDraft((current) => ({ ...current, lotero: { ...current.lotero, nombre: e.target.value } }))} /></label>
                  <label><span className={labelClass}>Email</span><input className={inputClass} type="email" value={draft.lotero.email} onChange={(e) => updateDraft((current) => ({ ...current, lotero: { ...current.lotero, email: e.target.value } }))} /></label>
                  <label><span className={labelClass}>Teléfono</span><input className={inputClass} value={draft.lotero.telefono} onChange={(e) => updateDraft((current) => ({ ...current, lotero: { ...current.lotero, telefono: e.target.value } }))} /></label>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-metro-border bg-metro-surface p-3">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-xs font-extrabold text-metro-text">Plantilla de email al lotero</h4>
                <div className="flex gap-2">
                  <ActionButton icon={Copy} iconOnly={false} onClick={() => void copyToClipboard(`${draft.loteroEmailSubject}\n\n${loteroMailPreview}`, 'Correo al lotero copiado.')} size="sm" variant="duplicate">Copiar</ActionButton>
                  <ActionButton icon={Mail} iconOnly={false} onClick={() => void generateLoteroOutlookDraft()} size="sm" variant="outlook">Generar Outlook</ActionButton>
                </div>
              </div>
              <div className="space-y-2">
                <label><span className={labelClass}>Asunto</span><input className={inputClass} value={draft.loteroEmailSubject} onChange={(e) => updateDraft((current) => ({ ...current, loteroEmailSubject: e.target.value }))} /></label>
                <label><span className={labelClass}>Mensaje</span><textarea className={textareaClass} value={draft.loteroEmailBody} onChange={(e) => updateDraft((current) => ({ ...current, loteroEmailBody: e.target.value }))} /></label>
                <div className="rounded-xl border border-dashed border-metro-border bg-metro-panel p-3">
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-metro-muted">Vista previa</p>
                  <p className="text-[11px] font-bold text-metro-text">{draft.loteroEmailSubject}</p>
                  <pre className="mt-2 whitespace-pre-wrap text-[11px] leading-5 text-metro-secondary">{loteroMailPreview}</pre>
                </div>
              </div>
            </div>
          </div>
        </SectionShell>
      ) : null}

      {activeSection === 'octubre' ? (
        <SectionShell
          title="Octubre · Alta y aviso a participantes"
          subtitle="Busca personas de Plantilla por nº de empleado, nombre o apellidos. Si no existen, dales de alta solo para esta campaña."
          actions={<ActionButton icon={Save} iconOnly={false} onClick={() => void persist(draft, 'Participantes y aviso guardados.')} size="sm" variant="save">Guardar octubre</ActionButton>}
        >
          <div className="space-y-3">
            <div className="grid gap-3 xl:grid-cols-[0.9fr_1.1fr]">
              <div className="rounded-xl border border-metro-border bg-metro-surface p-3">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div>
                    <h4 className="text-xs font-extrabold text-metro-text">Alta de participantes</h4>
                    <p className="mt-1 text-[11px] text-metro-muted">La búsqueda consulta directamente la Plantilla actual.</p>
                  </div>
                  <ActionButton icon={UserRoundPlus} iconOnly={false} onClick={() => setShowExternalForm((value) => !value)} size="sm" variant="secondary">Persona externa</ActionButton>
                </div>

                <div className="relative">
                  <Search className="absolute left-2.5 top-2 text-metro-muted" size={14} />
                  <input className={`${inputClass} pl-8`} placeholder="Nº empleado, nombre o apellidos" value={participantSearch} onChange={(e) => setParticipantSearch(e.target.value)} />
                </div>

                {employeeSuggestions.length > 0 ? (
                  <div className="mt-2 max-h-64 overflow-y-auto rounded-lg border border-metro-border bg-metro-panel p-1">
                    {employeeSuggestions.map(({ employee }) => (
                      <button className="flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left hover:bg-metro-raised" key={employee.empleado} onClick={() => addEmployeeParticipant(employee)} type="button">
                        <div className="min-w-0">
                          <p className="truncate text-xs font-bold text-metro-text">{employee.nombreApellidos}</p>
                          <p className="text-[10px] text-metro-muted">Empleado {employee.empleado}</p>
                        </div>
                        <Plus className="shrink-0 text-red-300" size={15} />
                      </button>
                    ))}
                  </div>
                ) : participantSearch.trim().length >= 2 ? (
                  <div className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/[0.06] px-3 py-2 text-xs text-amber-100">
                    No encuentro coincidencias claras. Puedes probar solo con el apellido o usar “Persona externa”.
                  </div>
                ) : null}

                {showExternalForm ? (
                  <div className="mt-3 rounded-xl border border-metro-red/40 bg-metro-panel p-3">
                    <div className="mb-2 flex items-center gap-2"><UserRoundPlus size={15} className="text-red-300" /><h5 className="text-xs font-extrabold text-metro-text">Alta solo en Lotería</h5></div>
                    <div className="grid gap-2 md:grid-cols-2">
                      <label className="md:col-span-2"><span className={labelClass}>Nombre y apellidos</span><input className={inputClass} value={externalName} onChange={(e) => setExternalName(e.target.value)} /></label>
                      <label><span className={labelClass}>Email</span><input className={inputClass} placeholder="Opcional hasta el envío" type="email" value={externalEmail} onChange={(e) => setExternalEmail(e.target.value)} /></label>
                      <label><span className={labelClass}>Contacto / nota</span><input className={inputClass} placeholder="Teléfono, jubilado, compromiso…" value={externalContact} onChange={(e) => setExternalContact(e.target.value)} /></label>
                    </div>
                    <div className="mt-2 flex justify-end"><ActionButton icon={Plus} iconOnly={false} onClick={addExternalParticipant} size="sm" variant="add">Añadir externa</ActionButton></div>
                  </div>
                ) : null}
              </div>

              <div className="rounded-xl border border-metro-border bg-metro-surface p-3">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h4 className="text-xs font-extrabold text-metro-text">Aviso a participantes</h4>
                    <p className="mt-1 text-[11px] text-metro-muted">Outlook coloca todas las direcciones en CCO para que no sean visibles entre sí.</p>
                  </div>
                  <ActionButton icon={Mail} iconOnly={false} onClick={() => void generateParticipantsOutlookDraft()} size="sm" variant="outlook">Generar correo CCO</ActionButton>
                </div>
                <div className="space-y-2">
                  <label><span className={labelClass}>Asunto</span><input className={inputClass} value={draft.participantesEmailSubject} onChange={(e) => updateDraft((current) => ({ ...current, participantesEmailSubject: e.target.value }))} /></label>
                  <label><span className={labelClass}>Mensaje</span><textarea className={textareaClass} value={draft.participantesEmailBody} onChange={(e) => updateDraft((current) => ({ ...current, participantesEmailBody: e.target.value }))} /></label>
                  <div className="grid gap-2 sm:grid-cols-3">
                    <SummaryPill label="Participantes" value={String(draft.requests.length)} />
                    <SummaryPill label="Emails válidos" value={String(draft.requests.filter((request) => isValidEmail(request.email)).length)} tone={draft.requests.length > 0 && draft.requests.every((request) => isValidEmail(request.email)) ? 'good' : 'alert'} />
                    <SummaryPill label="Sin email" value={String(draft.requests.filter((request) => !isValidEmail(request.email)).length)} tone={draft.requests.every((request) => isValidEmail(request.email)) ? 'good' : 'alert'} />
                  </div>
                  <div className="flex flex-wrap gap-3 pt-1 text-[11px] text-metro-muted">
                    <label className="inline-flex items-center gap-2"><input checked={draft.workflow.participantesPreparados} onChange={(e) => setWorkflowFlag('participantesPreparados', e.target.checked)} type="checkbox" />Lista preparada</label>
                    <label className="inline-flex items-center gap-2"><input checked={draft.workflow.avisoPersonasEnviado} onChange={(e) => setWorkflowFlag('avisoPersonasEnviado', e.target.checked)} type="checkbox" />Aviso enviado</label>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-metro-border bg-metro-surface p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2"><UserRound size={15} className="text-red-300" /><h4 className="text-xs font-extrabold text-metro-text">Personas de la campaña</h4></div>
                <ActionButton icon={Save} iconOnly={false} onClick={() => void persist(draft, 'Lista de participantes guardada.')} size="sm" variant="save">Guardar lista</ActionButton>
              </div>
              <div className="mb-2 grid gap-2 sm:grid-cols-3">
                <SummaryPill label={`Disponible ${draft.numero1 || 'Nº 1'}`} value={String(availableNumero1)} tone={stockTone(availableNumero1)} />
                <SummaryPill label={`Disponible ${draft.numero2 || 'Nº 2'}`} value={String(availableNumero2)} tone={stockTone(availableNumero2)} />
                <SummaryPill label="Disponible total" value={String(availableTotal)} tone={stockTone(availableTotal)} />
              </div>
              <div className="overflow-x-auto rounded-lg border border-metro-border bg-metro-panel">
                <table className="w-full min-w-[1240px] border-collapse text-left text-[11px]">
                  <thead className="bg-metro-raised text-[10px] uppercase tracking-wide text-metro-muted">
                    <tr><th className="px-2 py-2">Nº empleado</th><th className="px-2 py-2">Nombre y apellidos</th><th className="px-2 py-2">Tipo</th><th className="px-2 py-2 text-center">{draft.numero1 || 'Nº 1'}</th><th className="px-2 py-2 text-center">{draft.numero2 || 'Nº 2'}</th><th className="px-2 py-2 text-center">Total</th><th className="px-2 py-2">Email</th><th className="px-2 py-2">Contacto / nota</th><th className="w-9 px-2 py-2" /></tr>
                  </thead>
                  <tbody>
                    {draft.requests.map((request) => (
                      <tr className="border-t border-metro-border" key={request.id}>
                        <td className="px-2 py-1.5 font-semibold text-metro-secondary">{request.empleado ?? '—'}</td>
                        <td className="p-1.5"><input className={inputClass} disabled={!request.externa} value={request.nombre} onChange={(e) => updateRequest(request.id, { nombre: e.target.value })} /></td>
                        <td className="px-2 py-1.5">{request.externa ? <span className="rounded-full border border-amber-500/35 bg-amber-500/10 px-2 py-1 text-[10px] font-bold text-amber-200">Externa</span> : <span className="rounded-full border border-emerald-500/35 bg-emerald-500/10 px-2 py-1 text-[10px] font-bold text-emerald-200">Plantilla</span>}</td>
                        <td className="p-1.5"><input className={`${inputClass} text-center`} min="0" step="1" type="number" value={request.decimosNumero1} onChange={(e) => updateRequest(request.id, { decimosNumero1: Math.max(0, Number(e.target.value)) })} /></td>
                        <td className="p-1.5"><input className={`${inputClass} text-center`} min="0" step="1" type="number" value={request.decimosNumero2} onChange={(e) => updateRequest(request.id, { decimosNumero2: Math.max(0, Number(e.target.value)) })} /></td>
                        <td className="px-2 py-1.5 text-center font-bold text-metro-text">{lotteryRequestTotalCount(request)}</td>
                        <td className="p-1.5"><input className={cx(inputClass, request.email && !isValidEmail(request.email) && 'border-amber-500/60')} placeholder="nombre@dominio.es" type="email" value={request.email} onChange={(e) => updateRequest(request.id, { email: e.target.value })} /></td>
                        <td className="p-1.5"><input className={inputClass} placeholder="Teléfono, nota breve…" value={request.contactoObservaciones} onChange={(e) => updateRequest(request.id, { contactoObservaciones: e.target.value })} /></td>
                        <td className="px-1 py-1.5"><button className="grid h-7 w-7 place-items-center rounded-md text-metro-muted hover:bg-red-500/10 hover:text-red-300" onClick={() => removePerson(request.id)} type="button"><Trash2 size={13} /></button></td>
                      </tr>
                    ))}
                    {draft.requests.length === 0 ? <tr><td className="px-3 py-8 text-center text-xs text-metro-muted" colSpan={9}>Todavía no hay participantes. Usa el buscador de Plantilla o el alta de persona externa.</td></tr> : null}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </SectionShell>
      ) : null}

      {activeSection === 'seguimiento' ? (
        <SectionShell
          title="Seguimiento · Décimos y pagos"
          subtitle="Aquí aparece únicamente la lista dada de alta en octubre. Asigna décimos y registra el cobro de cada persona."
          actions={
            <>
              <ActionButton icon={UserRoundPlus} iconOnly={false} onClick={() => setActiveSection('octubre')} size="sm" variant="secondary">Gestionar participantes</ActionButton>
              <ActionButton icon={Save} iconOnly={false} onClick={() => void persist(draft, 'Décimos y pagos guardados.')} size="sm" variant="save">Guardar pagos</ActionButton>
            </>
          }
        >
          <div className="space-y-3">
            <div className="grid gap-2 lg:grid-cols-6">
              <SummaryPill label={`Disponible ${draft.numero1 || 'Nº 1'}`} value={String(availableNumero1)} tone={stockTone(availableNumero1)} />
              <SummaryPill label={`Disponible ${draft.numero2 || 'Nº 2'}`} value={String(availableNumero2)} tone={stockTone(availableNumero2)} />
              <SummaryPill label="Disponible total" value={String(availableTotal)} tone={stockTone(availableTotal)} />
              <SummaryPill label="Total cobrado" value={money(paid)} />
              <SummaryPill label="Caja" value={money(cash)} />
              <SummaryPill label="Bizum" value={money(bizum)} />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-56 flex-1 max-w-md"><Search className="absolute left-2.5 top-2 text-metro-muted" size={14} /><input className={`${inputClass} pl-8`} placeholder="Buscar persona o nº empleado" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
              <select className={`${inputClass} w-auto min-w-32`} value={paymentFilter} onChange={(e) => setPaymentFilter(e.target.value as typeof paymentFilter)}><option value="todos">Todos</option><option value="pagados">Pagados</option><option value="pendientes">Pendientes</option></select>
              <label className="ml-auto inline-flex items-center gap-2 rounded-lg border border-metro-border bg-metro-surface px-2.5 py-2 text-xs text-metro-secondary"><input checked={draft.workflow.seguimientoIniciado} onChange={(e) => setWorkflowFlag('seguimientoIniciado', e.target.checked)} type="checkbox" />Seguimiento iniciado</label>
            </div>

            <div className="overflow-x-auto rounded-xl border border-metro-border bg-metro-surface">
              <table className="w-full min-w-[1280px] border-collapse text-left text-[11px]">
                <thead className="bg-metro-raised text-[10px] uppercase tracking-wide text-metro-muted">
                  <tr><th className="px-2 py-2">Nº empleado</th><th className="px-2 py-2">Persona</th><th className="px-2 py-2 text-center">{draft.numero1 || 'Nº 1'}</th><th className="px-2 py-2 text-center">{draft.numero2 || 'Nº 2'}</th><th className="px-2 py-2 text-center">Total</th><th className="px-2 py-2 text-right">Importe</th><th className="px-2 py-2 text-center">Pagado</th><th className="px-2 py-2">Fecha pago</th><th className="px-2 py-2">Forma pago</th><th className="px-2 py-2">Observaciones pago</th></tr>
                </thead>
                <tbody>
                  {filteredRequests.map((request) => (
                    <tr className="border-t border-metro-border" key={request.id}>
                      <td className="px-2 py-1.5 text-metro-secondary">{request.empleado ?? 'Externa'}</td>
                      <td className="px-2 py-1.5 font-semibold text-metro-text">{request.nombre}</td>
                      <td className="p-1.5"><input className={`${inputClass} text-center`} min="0" step="1" type="number" value={request.decimosNumero1} onChange={(e) => updateRequest(request.id, { decimosNumero1: Math.max(0, Number(e.target.value)) })} /></td>
                      <td className="p-1.5"><input className={`${inputClass} text-center`} min="0" step="1" type="number" value={request.decimosNumero2} onChange={(e) => updateRequest(request.id, { decimosNumero2: Math.max(0, Number(e.target.value)) })} /></td>
                      <td className="px-2 py-1.5 text-center font-bold text-metro-text">{lotteryRequestTotalCount(request)}</td>
                      <td className="px-2 py-1.5 text-right font-bold text-metro-text">{money(lotteryRequestAmount(draft, request))}</td>
                      <td className="px-2 py-1.5 text-center"><button aria-label={request.pagado ? 'Marcar como pendiente' : 'Marcar como pagado'} className={cx('relative h-5 w-9 rounded-full transition', request.pagado ? 'bg-emerald-500' : 'bg-metro-raised')} onClick={() => togglePaid(request)} type="button"><span className={cx('absolute top-0.5 h-4 w-4 rounded-full bg-white transition', request.pagado ? 'left-[18px]' : 'left-0.5')} /></button></td>
                      <td className="px-2 py-1.5 text-metro-secondary">{dateText(request.fechaPago)}</td>
                      <td className="p-1.5"><select className={inputClass} disabled={!request.pagado} value={request.formaPago} onChange={(e) => updateRequest(request.id, { formaPago: e.target.value as LotteryPaymentMethod })}><option value="efectivo">Efectivo</option><option value="bizum">Bizum</option></select></td>
                      <td className="p-1.5"><input className={inputClass} placeholder="Incidencia o nota del cobro" value={request.observacionesPago} onChange={(e) => updateRequest(request.id, { observacionesPago: e.target.value })} /></td>
                    </tr>
                  ))}
                  {filteredRequests.length === 0 ? <tr><td className="px-3 py-8 text-center text-xs text-metro-muted" colSpan={10}>No hay participantes que coincidan con los filtros. Las altas se realizan en Octubre.</td></tr> : null}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end"><ActionButton icon={Save} iconOnly={false} onClick={() => void persist(draft, 'Décimos y pagos guardados.')} variant="save">Guardar pagos</ActionButton></div>
          </div>
        </SectionShell>
      ) : null}

      {activeSection === 'cierre' ? (
        <SectionShell
          title="Cierre · Cuadre final"
          subtitle="Revisa sobrantes, pendientes de pago, caja y exporta el resultado de la campaña."
          actions={<><ActionButton icon={Download} iconOnly={false} onClick={() => void exportCampaign(draft)} size="sm" variant="excel">Exportar Excel</ActionButton><ActionButton icon={Save} iconOnly={false} onClick={() => void persist(draft, 'Cierre guardado.')} size="sm" variant="save">Guardar cierre</ActionButton></>}
        >
          <div className="space-y-3">
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard icon={Euro} label="Total cobrado" value={money(paid)} detail={`${draft.requests.filter((request) => request.pagado).length} pagos registrados`} />
              <MetricCard icon={CircleDollarSign} label="Dinero en caja" value={money(cash)} detail="Cobros en efectivo" />
              <MetricCard icon={Euro} label="Cobros por Bizum" value={money(bizum)} detail="No suma a caja física" />
              <MetricCard icon={Ticket} label="Pendiente de cobro" value={money(pendingAmount)} detail={`${draft.requests.filter((request) => !request.pagado).length} personas pendientes`} />
            </div>
            <div className="grid gap-3 xl:grid-cols-[0.85fr_1.15fr]">
              <div className="rounded-xl border border-metro-border bg-metro-surface p-3">
                <div className="mb-3 flex items-center justify-between gap-2"><h4 className="text-xs font-extrabold text-metro-text">Resumen por número</h4><label className="inline-flex items-center gap-2 text-[11px] text-metro-muted"><input checked={draft.workflow.campanaCerrada} onChange={(e) => setCampaignClosed(e.target.checked)} type="checkbox" />Campaña cerrada</label></div>
                <div className="space-y-2">
                  <div className="rounded-lg border border-metro-border bg-metro-panel p-3"><p className="text-xs font-extrabold text-metro-text">{draft.numero1 || 'Número 1'}</p><div className="mt-2 grid gap-2 sm:grid-cols-3"><SummaryPill label="Encargados" value={String(draft.decimosNumero1)} /><SummaryPill label="Solicitados" value={String(requestedNumero1)} /><SummaryPill label="Disponibles" value={String(availableNumero1)} tone={stockTone(availableNumero1)} /></div></div>
                  <div className="rounded-lg border border-metro-border bg-metro-panel p-3"><p className="text-xs font-extrabold text-metro-text">{draft.numero2 || 'Número 2'}</p><div className="mt-2 grid gap-2 sm:grid-cols-3"><SummaryPill label="Encargados" value={String(draft.decimosNumero2)} /><SummaryPill label="Solicitados" value={String(requestedNumero2)} /><SummaryPill label="Disponibles" value={String(availableNumero2)} tone={stockTone(availableNumero2)} /></div></div>
                </div>
              </div>
              <div className="rounded-xl border border-metro-border bg-metro-surface p-3">
                <h4 className="mb-3 text-xs font-extrabold text-metro-text">Estado final</h4>
                <div className="grid gap-2 md:grid-cols-2"><SummaryPill label="Participantes" value={String(draft.requests.length)} /><SummaryPill label="Pendientes de pago" value={String(draft.requests.filter((request) => !request.pagado).length)} tone={pendingAmount > 0 ? 'alert' : 'good'} /><SummaryPill label="Importe pendiente" value={money(pendingAmount)} tone={pendingAmount > 0 ? 'alert' : 'good'} /><SummaryPill label="Disponible total" value={String(availableTotal)} tone={stockTone(availableTotal)} /></div>
              </div>
            </div>
          </div>
        </SectionShell>
      ) : null}
    </div>
  );
}
