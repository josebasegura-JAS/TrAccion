import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import ExcelJS from 'exceljs';
import {
  CalendarDays,
  Check,
  CircleDollarSign,
  ClipboardCheck,
  Copy,
  Download,
  Euro,
  FileSpreadsheet,
  Mail,
  Plus,
  Save,
  Search,
  Ticket,
  Trash2,
  UserRound,
  type LucideIcon,
} from 'lucide-react';
import { PageHeader } from '../../../components/ui/PageHeader';
import { ActionButton } from '../../../components/ui/ActionButton';
import { importLotteryPeopleFromXlsx, type ImportedLotteryPerson } from '../domain/importLotteryPeople';
import { buildLotteryImportReview, type LotteryImportReview } from '../domain/matchLotteryPeople';
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

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function getInitialSection(campaign: LotteryCampaign): WorkspaceSection {
  if (!campaign.workflow.loteroAvisado || !campaign.workflow.encargoConfirmado) return 'septiembre';
  if (!campaign.workflow.avisoPersonasEnviado || !campaign.workflow.excelImportado) return 'octubre';
  if (!campaign.workflow.seguimientoIniciado) return 'seguimiento';
  return 'cierre';
}

async function exportCampaign(campaign: LotteryCampaign) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(`Lotería ${campaign.year}`);
  sheet.columns = [
    { header: 'Persona', key: 'nombre', width: 30 },
    { header: 'Email', key: 'email', width: 32 },
    { header: 'Teléfono', key: 'telefono', width: 18 },
    { header: 'Nº empleado', key: 'empleado', width: 14 },
    { header: 'Externa', key: 'externa', width: 12 },
    { header: `Décimos ${campaign.numero1 || 'Nº 1'}`, key: 'numero1', width: 16 },
    { header: `Décimos ${campaign.numero2 || 'Nº 2'}`, key: 'numero2', width: 16 },
    { header: 'Total décimos', key: 'totalDecimos', width: 14 },
    { header: 'Importe', key: 'importe', width: 14 },
    { header: 'Pagado', key: 'pagado', width: 12 },
    { header: 'Fecha pago', key: 'fechaPago', width: 16 },
    { header: 'Forma de pago', key: 'formaPago', width: 18 },
    { header: 'Observaciones', key: 'observaciones', width: 38 },
  ];

  campaign.requests.forEach((request) => sheet.addRow({
    nombre: request.nombre,
    email: request.email,
    telefono: request.telefono,
    empleado: request.empleado ?? '',
    externa: request.externa ? 'Sí' : 'No',
    numero1: request.decimosNumero1,
    numero2: request.decimosNumero2,
    totalDecimos: lotteryRequestTotalCount(request),
    importe: lotteryRequestAmount(campaign, request),
    pagado: request.pagado ? 'Sí' : 'No',
    fechaPago: request.fechaPago ? new Date(request.fechaPago) : '',
    formaPago: request.pagado ? (request.formaPago === 'bizum' ? 'Bizum' : 'Efectivo') : '',
    observaciones: request.observaciones,
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

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="rounded-xl border border-metro-border bg-metro-panel px-3 py-2.5">
      <div className="flex items-center gap-2 text-metro-secondary">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-metro-red/10 text-red-300">
          <Icon size={15} />
        </span>
        <span className="text-[11px] font-bold">{label}</span>
      </div>
      <p className="mt-1 text-xl font-extrabold tracking-tight text-metro-text">{value}</p>
      {detail ? <p className="text-[10px] text-metro-muted">{detail}</p> : null}
    </div>
  );
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
          )}>
            <Icon size={16} />
          </span>
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-wide text-red-300">{month}</p>
            <p className="text-xs font-extrabold text-metro-text">{title}</p>
          </div>
        </div>
        <span className={cx(
          'grid h-5 w-5 place-items-center rounded-full border',
          done ? 'border-emerald-400 bg-emerald-500 text-white' : 'border-metro-border text-transparent',
        )}>
          <Check size={12} />
        </span>
      </div>
      <p className="mt-2 text-[11px] leading-5 text-metro-muted">{detail}</p>
    </button>
  );
}

function SectionShell({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
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

function SummaryPill({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'good' | 'alert' }) {
  return (
    <div className={cx(
      'rounded-lg border px-2.5 py-2',
      tone === 'good'
        ? 'border-emerald-500/35 bg-emerald-500/[0.07]'
        : tone === 'alert'
          ? 'border-amber-500/35 bg-amber-500/[0.07]'
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
  const importPeople = useLoteriaStore((state) => state.importPeople);
  const employees = useEmployeeStore((state) => state.employees);
  const loadEmployees = useEmployeeStore((state) => state.load);

  const [draft, setDraft] = useState(campaign);
  const [activeSection, setActiveSection] = useState<WorkspaceSection>(getInitialSection(campaign));
  const [search, setSearch] = useState('');
  const [paymentFilter, setPaymentFilter] = useState<'todos' | 'pagados' | 'pendientes'>('todos');
  const [message, setMessage] = useState('');
  const [importReview, setImportReview] = useState<LotteryImportReview[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadEmployees(); }, [loadEmployees]);
  useEffect(() => {
    setDraft(campaign);
    setActiveSection((current) => current || getInitialSection(campaign));
  }, [campaign]);

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
  const octoberDone = draft.workflow.avisoPersonasEnviado && draft.workflow.excelImportado;
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

  const filteredRequests = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return draft.requests.filter((request) => {
      const matchesSearch = !needle || `${request.nombre} ${request.email} ${request.telefono}`.toLowerCase().includes(needle);
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

  const updateRequest = (id: string, patch: Partial<LotteryRequest>) => {
    updateDraft((current) => ({
      ...current,
      requests: current.requests.map((request) => request.id === id ? { ...request, ...patch, updatedAt: nowIso() } : request),
    }));
  };

  const addPerson = () => {
    const timestamp = nowIso();
    updateDraft((current) => ({
      ...current,
      requests: [
        ...current.requests,
        {
          id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `loteria-${Date.now()}`,
          nombre: '',
          email: '',
          telefono: '',
          empleado: null,
          externa: true,
          decimosNumero1: 0,
          decimosNumero2: 0,
          pagado: false,
          fechaPago: null,
          formaPago: 'efectivo',
          observaciones: '',
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      ],
    }));
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
      formaPago: request.pagado ? request.formaPago : (request.formaPago || 'efectivo'),
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

  const handleImport = async (file: File | undefined) => {
    if (!file) return;
    try {
      const people = await importLotteryPeopleFromXlsx(file);
      const review = buildLotteryImportReview(people, employees);
      setImportReview(review);
      setMessage(`Leídas ${review.length} personas. Revisa las coincidencias antes de incorporarlas.`);
      setActiveSection('octubre');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se ha podido importar el Excel.');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const updateImportReview = (id: string, patch: Partial<LotteryImportReview>) => {
    setImportReview((current) => current.map((row) => row.id === id ? { ...row, ...patch } : row));
  };

  const confirmImportReview = async () => {
    const resolved: ImportedLotteryPerson[] = importReview.map((row) => {
      if (row.externa || !row.selectedEmpleado) {
        return { ...row.imported, empleado: null, externa: true };
      }
      const employee = employees.find((candidate) => candidate.empleado === row.selectedEmpleado);
      return {
        ...row.imported,
        nombre: employee?.nombreApellidos || row.imported.nombre,
        empleado: row.selectedEmpleado,
        externa: false,
      };
    });
    const saved = await saveCampaign(draft);
    if (!saved.ok) {
      setMessage(saved.message);
      return;
    }
    const result = await importPeople(resolved);
    setImportReview([]);
    setMessage(result.message);
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
    const bcc = Array.from(new Set(draft.requests.map((request) => request.email.trim().toLowerCase()).filter(Boolean)));
    if (bcc.length === 0) {
      setMessage('No hay destinatarios con email para generar el correo.');
      return;
    }
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
        status={<SaveState dirty={dirty} message={message} />}
        actions={
          <>
            <ActionButton icon={Save} iconOnly={false} onClick={() => void persist()} variant="save">Guardar todo</ActionButton>
            <ActionButton icon={FileSpreadsheet} iconOnly={false} onClick={() => setActiveSection('octubre')} variant="import">Importar Excel</ActionButton>
            <ActionButton icon={Download} iconOnly={false} onClick={() => void exportCampaign(draft)} variant="excel">Exportar Excel</ActionButton>
          </>
        }
      />

      <section className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={Ticket} label="Número 1" value={draft.numero1 || 'Sin definir'} detail={`${requestedNumero1} solicitados · ${availableNumero1} disponibles`} />
        <MetricCard icon={Ticket} label="Número 2" value={draft.numero2 || 'Sin definir'} detail={`${requestedNumero2} solicitados · ${availableNumero2} disponibles`} />
        <MetricCard icon={ClipboardCheck} label="Décimos totales" value={`${requestedTotal} / ${orderedTotal}`} detail={`${availableTotal} disponibles en total`} />
        <MetricCard icon={CircleDollarSign} label="Caja / cobros" value={money(cash)} detail={`${money(paid)} cobrados · ${money(bizum)} por Bizum`} />
      </section>

      <section className="rounded-2xl border border-metro-border bg-metro-panel p-3 md:p-4">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h3 className="text-sm font-extrabold text-metro-text">Flujograma de trabajo</h3>
            <p className="mt-1 text-xs text-metro-muted">Cada fase abre su propio espacio de trabajo para evitar una pantalla saturada.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <SummaryPill label="Pendiente de cobro" value={money(pendingAmount)} tone={pendingAmount > 0 ? 'alert' : 'good'} />
            <SummaryPill label="Disponible total" value={String(availableTotal)} tone={availableTotal < 0 ? 'alert' : 'good'} />
          </div>
        </div>
        <div className="grid gap-2 lg:grid-cols-4">
          <StepCard active={activeSection === 'septiembre'} done={septemberDone} icon={CalendarDays} month="Septiembre" title="Avisar al lotero" detail="Configura números, décimos por número, datos del lotero y plantilla del encargo." onClick={() => setActiveSection('septiembre')} />
          <StepCard active={activeSection === 'octubre'} done={octoberDone} icon={Mail} month="Octubre" title="Avisar a participantes" detail="Prepara el correo a personas habituales e importa el Excel de solicitantes." onClick={() => setActiveSection('octubre')} />
          <StepCard active={activeSection === 'seguimiento'} done={seguimientoDone} icon={UserRound} month="Seguimiento" title="Solicitudes y pagos" detail="Registra peticiones, controla stock por número y marca pagos con fecha y forma de cobro." onClick={() => setActiveSection('seguimiento')} />
          <StepCard active={activeSection === 'cierre'} done={cierreDone} icon={ClipboardCheck} month="Cierre" title="Resumen y exportación" detail="Comprueba pendientes, revisa caja y exporta el resultado final de la campaña." onClick={() => setActiveSection('cierre')} />
        </div>
      </section>

      {activeSection === 'septiembre' ? (
        <SectionShell
          title="Septiembre · Encargo al lotero"
          subtitle="En esta fase se definen los números, la cantidad solicitada de cada uno y el correo de encargo al lotero."
          actions={
            <>
              <ActionButton icon={Save} iconOnly={false} onClick={() => void persist(draft, 'Datos de septiembre guardados.')} size="sm" variant="save">Guardar septiembre</ActionButton>
            </>
          }
        >
          <div className="grid gap-3 xl:grid-cols-[1.1fr_0.9fr]">
            <div className="space-y-3">
              <div className="rounded-xl border border-metro-border bg-metro-surface p-3">
                <h4 className="mb-3 text-xs font-extrabold text-metro-text">Configuración del encargo</h4>
                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                  <label>
                    <span className={labelClass}>Número 1</span>
                    <input className={inputClass} value={draft.numero1} onChange={(e) => updateDraft((current) => ({ ...current, numero1: e.target.value }))} />
                  </label>
                  <label>
                    <span className={labelClass}>Décimos nº 1</span>
                    <input className={inputClass} min="0" step="1" type="number" value={draft.decimosNumero1} onChange={(e) => updateDraft((current) => ({ ...current, decimosNumero1: Math.max(0, Number(e.target.value)) }))} />
                  </label>
                  <label>
                    <span className={labelClass}>Número 2</span>
                    <input className={inputClass} value={draft.numero2} onChange={(e) => updateDraft((current) => ({ ...current, numero2: e.target.value }))} />
                  </label>
                  <label>
                    <span className={labelClass}>Décimos nº 2</span>
                    <input className={inputClass} min="0" step="1" type="number" value={draft.decimosNumero2} onChange={(e) => updateDraft((current) => ({ ...current, decimosNumero2: Math.max(0, Number(e.target.value)) }))} />
                  </label>
                  <label>
                    <span className={labelClass}>Precio por décimo</span>
                    <input className={inputClass} min="0" step="0.01" type="number" value={draft.precioDecimo} onChange={(e) => updateDraft((current) => ({ ...current, precioDecimo: Math.max(0, Number(e.target.value)) }))} />
                  </label>
                  <label>
                    <span className={labelClass}>Año / campaña</span>
                    <input className={inputClass} min="2024" step="1" type="number" value={draft.year} onChange={(e) => updateDraft((current) => ({ ...current, year: Number(e.target.value) || current.year }))} />
                  </label>
                  <div className="md:col-span-2 xl:col-span-2 grid gap-2 md:grid-cols-3">
                    <SummaryPill label="Encargados total" value={String(orderedTotal)} />
                    <SummaryPill label="Solicitados total" value={String(requestedTotal)} />
                    <SummaryPill label="Disponibles" value={String(availableTotal)} tone={availableTotal < 0 ? 'alert' : 'good'} />
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-metro-border bg-metro-surface p-3">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h4 className="text-xs font-extrabold text-metro-text">Datos del lotero</h4>
                  <div className="flex items-center gap-2 text-[11px] text-metro-muted">
                    <label className="inline-flex items-center gap-2">
                      <input checked={draft.workflow.loteroAvisado} onChange={(e) => setWorkflowFlag('loteroAvisado', e.target.checked)} type="checkbox" />
                      Lotero avisado
                    </label>
                    <label className="inline-flex items-center gap-2">
                      <input checked={draft.workflow.encargoConfirmado} onChange={(e) => setWorkflowFlag('encargoConfirmado', e.target.checked)} type="checkbox" />
                      Encargo confirmado
                    </label>
                  </div>
                </div>
                <div className="grid gap-2 md:grid-cols-3">
                  <label>
                    <span className={labelClass}>Nombre</span>
                    <input className={inputClass} value={draft.lotero.nombre} onChange={(e) => updateDraft((current) => ({ ...current, lotero: { ...current.lotero, nombre: e.target.value } }))} />
                  </label>
                  <label>
                    <span className={labelClass}>Email</span>
                    <input className={inputClass} type="email" value={draft.lotero.email} onChange={(e) => updateDraft((current) => ({ ...current, lotero: { ...current.lotero, email: e.target.value } }))} />
                  </label>
                  <label>
                    <span className={labelClass}>Teléfono</span>
                    <input className={inputClass} value={draft.lotero.telefono} onChange={(e) => updateDraft((current) => ({ ...current, lotero: { ...current.lotero, telefono: e.target.value } }))} />
                  </label>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-metro-border bg-metro-surface p-3">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-xs font-extrabold text-metro-text">Plantilla de email al lotero</h4>
                <div className="flex gap-2">
                  <ActionButton icon={Copy} iconOnly={false} onClick={() => void copyToClipboard(`${draft.loteroEmailSubject}\n\n${loteroMailPreview}`, 'Correo al lotero copiado al portapapeles.')} size="sm" variant="duplicate">Copiar</ActionButton>
                  <ActionButton icon={Mail} iconOnly={false} onClick={() => void generateLoteroOutlookDraft()} size="sm" variant="outlook">Generar Outlook</ActionButton>
                  <ActionButton icon={Save} iconOnly={false} onClick={() => void persist(draft, 'Plantilla del lotero guardada.')} size="sm" variant="save">Guardar</ActionButton>
                </div>
              </div>
              <div className="space-y-2">
                <label>
                  <span className={labelClass}>Asunto</span>
                  <input className={inputClass} value={draft.loteroEmailSubject} onChange={(e) => updateDraft((current) => ({ ...current, loteroEmailSubject: e.target.value }))} />
                </label>
                <label>
                  <span className={labelClass}>Mensaje</span>
                  <textarea className={textareaClass} value={draft.loteroEmailBody} onChange={(e) => updateDraft((current) => ({ ...current, loteroEmailBody: e.target.value }))} />
                </label>
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
          title="Octubre · Comunicación e importación"
          subtitle="Importa la relación habitual, revisa el cruce con Plantilla, completa los emails y genera el borrador con todos los destinatarios en CCO."
          actions={<ActionButton icon={Save} iconOnly={false} onClick={() => void persist(draft, 'Datos de octubre guardados.')} size="sm" variant="save">Guardar octubre</ActionButton>}
        >
          <div className="space-y-3">
            <div className="grid gap-3 xl:grid-cols-[1.05fr_0.95fr]">
              <div className="rounded-xl border border-metro-border bg-metro-surface p-3">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-xs font-extrabold text-metro-text">Plantilla de email a participantes</h4>
                  <label className="inline-flex items-center gap-2 text-[11px] text-metro-muted">
                    <input checked={draft.workflow.avisoPersonasEnviado} onChange={(e) => setWorkflowFlag('avisoPersonasEnviado', e.target.checked)} type="checkbox" />
                    Aviso enviado
                  </label>
                </div>
                <div className="space-y-2">
                  <label>
                    <span className={labelClass}>Asunto</span>
                    <input className={inputClass} value={draft.participantesEmailSubject} onChange={(e) => updateDraft((current) => ({ ...current, participantesEmailSubject: e.target.value }))} />
                  </label>
                  <label>
                    <span className={labelClass}>Mensaje</span>
                    <textarea className={textareaClass} value={draft.participantesEmailBody} onChange={(e) => updateDraft((current) => ({ ...current, participantesEmailBody: e.target.value }))} />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <ActionButton icon={Copy} iconOnly={false} onClick={() => void copyToClipboard(`${draft.participantesEmailSubject}\n\n${participantesMailPreview}`, 'Correo a participantes copiado al portapapeles.')} size="sm" variant="duplicate">Copiar</ActionButton>
                    <ActionButton icon={Save} iconOnly={false} onClick={() => void persist(draft, 'Plantilla de participantes guardada.')} size="sm" variant="save">Guardar plantilla</ActionButton>
                    <ActionButton icon={Mail} iconOnly={false} onClick={() => void generateParticipantsOutlookDraft()} size="sm" variant="outlook">Generar correo Outlook</ActionButton>
                  </div>
                  <p className="text-[10px] leading-4 text-metro-muted">El borrador se crea sin destinatarios visibles en Para/CC: todas las personas de la lista se añaden en CCO.</p>
                  <div className="rounded-xl border border-dashed border-metro-border bg-metro-panel p-3">
                    <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-metro-muted">Vista previa</p>
                    <p className="text-[11px] font-bold text-metro-text">{draft.participantesEmailSubject}</p>
                    <pre className="mt-2 whitespace-pre-wrap text-[11px] leading-5 text-metro-secondary">{participantesMailPreview}</pre>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-metro-border bg-metro-surface p-3">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h4 className="text-xs font-extrabold text-metro-text">Importar relación habitual</h4>
                    <p className="mt-1 text-[11px] text-metro-muted">Preparado específicamente para “Contabilidad Lotería”: busca la columna Nombre aunque la cabecera no esté en la primera fila.</p>
                  </div>
                  <label className="inline-flex items-center gap-2 text-[11px] text-metro-muted">
                    <input checked={draft.workflow.excelImportado} onChange={(e) => setWorkflowFlag('excelImportado', e.target.checked)} type="checkbox" />
                    Excel incorporado
                  </label>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <input accept=".xlsx,.xls" className="hidden" onChange={(e) => void handleImport(e.target.files?.[0])} ref={fileRef} type="file" />
                  <ActionButton icon={FileSpreadsheet} iconOnly={false} onClick={() => fileRef.current?.click()} size="sm" variant="import">Seleccionar Excel</ActionButton>
                  <SummaryPill label="Plantilla activa" value={String(employees.filter((employee) => !employee.deletedAt).length)} />
                  <SummaryPill label="Personas ya cargadas" value={String(draft.requests.length)} />
                </div>
                <div className="mt-3 rounded-lg border border-metro-border bg-metro-panel p-3 text-[11px] leading-5 text-metro-secondary">
                  <strong className="text-metro-text">Criterio de cruce:</strong> coincidencia exacta cuando es posible; si el nombre no coincide, se prioriza el apellido para proponer candidatos. Una persona que no pertenezca a Plantilla puede mantenerse expresamente como externa.
                </div>
              </div>
            </div>

            {importReview.length > 0 ? (
              <div className="rounded-xl border border-amber-500/35 bg-amber-500/[0.04] p-3">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h4 className="text-xs font-extrabold text-metro-text">Revisar coincidencias antes de importar</h4>
                    <p className="mt-1 text-[11px] text-metro-muted">Comprueba especialmente las filas amarillas. Puedes elegir otra persona de Plantilla o marcarla como externa.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-metro-muted">{importReview.length} personas leídas</span>
                    <ActionButton icon={Save} iconOnly={false} onClick={() => void confirmImportReview()} size="sm" variant="save">Incorporar lista revisada</ActionButton>
                  </div>
                </div>
                <div className="overflow-x-auto rounded-lg border border-metro-border bg-metro-surface">
                  <table className="w-full min-w-[940px] border-collapse text-left text-[11px]">
                    <thead className="bg-metro-raised text-[10px] uppercase tracking-wide text-metro-muted">
                      <tr>
                        <th className="px-2 py-2">Nombre en Excel</th>
                        <th className="px-2 py-2">Resultado</th>
                        <th className="px-2 py-2">Persona de Plantilla sugerida</th>
                        <th className="px-2 py-2 text-center">Externa</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importReview.map((row) => (
                        <tr className="border-t border-metro-border" key={row.id}>
                          <td className="px-2 py-2 font-semibold text-metro-text">{row.imported.nombre}</td>
                          <td className="px-2 py-2">
                            <span className={cx(
                              'inline-flex rounded-full border px-2 py-1 text-[10px] font-bold',
                              row.matchKind === 'exact'
                                ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-200'
                                : row.matchKind === 'suggested'
                                  ? 'border-amber-500/40 bg-amber-500/10 text-amber-200'
                                  : 'border-red-500/35 bg-red-500/10 text-red-200',
                            )}>
                              {row.matchKind === 'exact' ? 'Coincidencia' : row.matchKind === 'suggested' ? 'Revisar sugerencia' : 'No encontrada'}
                            </span>
                          </td>
                          <td className="p-1.5">
                            <select
                              className={inputClass}
                              disabled={row.externa}
                              value={row.selectedEmpleado ?? ''}
                              onChange={(e) => updateImportReview(row.id, { selectedEmpleado: e.target.value || null, externa: false })}
                            >
                              <option value="">Seleccionar persona...</option>
                              {row.candidates.map((candidate) => (
                                <option key={candidate.empleado} value={candidate.empleado}>
                                  {candidate.nombreApellidos} · {candidate.empleado} · {candidate.score}%
                                </option>
                              ))}
                              {row.selectedEmpleado && !row.candidates.some((candidate) => candidate.empleado === row.selectedEmpleado) ? (
                                <option value={row.selectedEmpleado}>{employees.find((employee) => employee.empleado === row.selectedEmpleado)?.nombreApellidos || row.selectedEmpleado}</option>
                              ) : null}
                            </select>
                          </td>
                          <td className="px-2 py-2 text-center">
                            <label className="inline-flex items-center gap-2 text-[11px] text-metro-secondary">
                              <input
                                checked={row.externa}
                                onChange={(e) => updateImportReview(row.id, { externa: e.target.checked, selectedEmpleado: e.target.checked ? null : row.selectedEmpleado })}
                                type="checkbox"
                              />
                              Mantener tal cual
                            </label>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            <div className="rounded-xl border border-metro-border bg-metro-surface p-3">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="text-xs font-extrabold text-metro-text">Lista de comunicación</h4>
                  <p className="mt-1 text-[11px] text-metro-muted">El email se guarda en Lotería. No modifica la ficha de Plantilla.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <SummaryPill label="Emails completos" value={`${draft.requests.filter((request) => isValidEmail(request.email)).length} / ${draft.requests.length}`} tone={draft.requests.every((request) => isValidEmail(request.email)) && draft.requests.length > 0 ? 'good' : 'alert'} />
                  <ActionButton icon={Save} iconOnly={false} onClick={() => void persist(draft, 'Emails de la lista guardados.')} size="sm" variant="save">Guardar emails</ActionButton>
                  <ActionButton icon={Mail} iconOnly={false} onClick={() => void generateParticipantsOutlookDraft()} size="sm" variant="outlook">Generar correo CCO</ActionButton>
                </div>
              </div>
              <div className="overflow-x-auto rounded-lg border border-metro-border bg-metro-panel">
                <table className="w-full min-w-[980px] border-collapse text-left text-[11px]">
                  <thead className="bg-metro-raised text-[10px] uppercase tracking-wide text-metro-muted">
                    <tr>
                      <th className="px-2 py-2">Persona</th>
                      <th className="px-2 py-2">Vinculación</th>
                      <th className="px-2 py-2">Email para lotería</th>
                      <th className="px-2 py-2">Teléfono</th>
                      <th className="w-9 px-2 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {draft.requests.map((request) => (
                      <tr className="border-t border-metro-border" key={request.id}>
                        <td className="p-1.5"><input className={inputClass} value={request.nombre} onChange={(e) => updateRequest(request.id, { nombre: e.target.value })} /></td>
                        <td className="px-2 py-1.5">
                          {request.externa ? (
                            <span className="inline-flex rounded-full border border-amber-500/35 bg-amber-500/10 px-2 py-1 text-[10px] font-bold text-amber-200">Externa</span>
                          ) : (
                            <span className="inline-flex rounded-full border border-emerald-500/35 bg-emerald-500/10 px-2 py-1 text-[10px] font-bold text-emerald-200">Plantilla {request.empleado ? `· ${request.empleado}` : ''}</span>
                          )}
                        </td>
                        <td className="p-1.5">
                          <input className={cx(inputClass, request.email && !isValidEmail(request.email) && 'border-amber-500/60')} placeholder="nombre@dominio.es" type="email" value={request.email} onChange={(e) => updateRequest(request.id, { email: e.target.value })} />
                        </td>
                        <td className="p-1.5"><input className={inputClass} value={request.telefono} onChange={(e) => updateRequest(request.id, { telefono: e.target.value })} /></td>
                        <td className="px-1 py-1.5"><button className="grid h-7 w-7 place-items-center rounded-md text-metro-muted hover:bg-red-500/10 hover:text-red-300" onClick={() => removePerson(request.id)} type="button"><Trash2 size={13} /></button></td>
                      </tr>
                    ))}
                    {draft.requests.length === 0 ? (
                      <tr><td className="px-3 py-7 text-center text-xs text-metro-muted" colSpan={5}>Importa el Excel para crear la lista habitual o añade personas manualmente desde Seguimiento.</td></tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </SectionShell>
      ) : null}

      {activeSection === 'seguimiento' ? (
        <SectionShell
          title="Seguimiento · Solicitudes y pagos"
          subtitle="Controla la petición de cada persona, el stock por número y el dinero cobrado."
          actions={
            <>
              <ActionButton icon={Plus} iconOnly={false} onClick={addPerson} size="sm" variant="add">Añadir persona</ActionButton>
              <ActionButton icon={Save} iconOnly={false} onClick={() => void persist(draft, 'Solicitudes y pagos guardados.')} size="sm" variant="save">Guardar solicitudes</ActionButton>
            </>
          }
        >
          <div className="space-y-3">
            <div className="grid gap-2 lg:grid-cols-6">
              <SummaryPill label={`Disponible ${draft.numero1 || 'Nº 1'}`} value={String(availableNumero1)} tone={availableNumero1 < 0 ? 'alert' : 'good'} />
              <SummaryPill label={`Disponible ${draft.numero2 || 'Nº 2'}`} value={String(availableNumero2)} tone={availableNumero2 < 0 ? 'alert' : 'good'} />
              <SummaryPill label="Disponible total" value={String(availableTotal)} tone={availableTotal < 0 ? 'alert' : 'good'} />
              <SummaryPill label="Total cobrado" value={money(paid)} />
              <SummaryPill label="Caja" value={money(cash)} />
              <SummaryPill label="Bizum" value={money(bizum)} />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-56 flex-1 max-w-md">
                <Search className="absolute left-2.5 top-2 text-metro-muted" size={14} />
                <input className={`${inputClass} pl-8`} placeholder="Buscar persona, email o teléfono" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <select className={`${inputClass} w-auto min-w-32`} value={paymentFilter} onChange={(e) => setPaymentFilter(e.target.value as typeof paymentFilter)}>
                <option value="todos">Todos</option>
                <option value="pagados">Pagados</option>
                <option value="pendientes">Pendientes</option>
              </select>
              <label className="ml-auto inline-flex items-center gap-2 rounded-lg border border-metro-border bg-metro-surface px-2.5 py-2 text-xs text-metro-secondary">
                <input checked={draft.workflow.seguimientoIniciado} onChange={(e) => setWorkflowFlag('seguimientoIniciado', e.target.checked)} type="checkbox" />
                Seguimiento iniciado
              </label>
            </div>

            <div className="overflow-x-auto rounded-xl border border-metro-border bg-metro-surface">
              <table className="w-full min-w-[1450px] border-collapse text-left text-[11px]">
                <thead className="bg-metro-raised text-[10px] uppercase tracking-wide text-metro-muted">
                  <tr>
                    <th className="px-2 py-2">Persona</th>
                    <th className="px-2 py-2">Email</th>
                    <th className="px-2 py-2">Teléfono</th>
                    <th className="px-2 py-2 text-center">{draft.numero1 || 'Nº 1'}</th>
                    <th className="px-2 py-2 text-center">{draft.numero2 || 'Nº 2'}</th>
                    <th className="px-2 py-2 text-center">Total</th>
                    <th className="px-2 py-2 text-right">Importe</th>
                    <th className="px-2 py-2 text-center">Pagado</th>
                    <th className="px-2 py-2">Fecha pago</th>
                    <th className="px-2 py-2">Forma pago</th>
                    <th className="px-2 py-2">Observaciones</th>
                    <th className="w-9 px-2 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {filteredRequests.map((request) => (
                    <tr className="border-t border-metro-border" key={request.id}>
                      <td className="p-1.5"><input className={inputClass} value={request.nombre} onChange={(e) => updateRequest(request.id, { nombre: e.target.value })} /></td>
                      <td className="p-1.5"><input className={inputClass} value={request.email} onChange={(e) => updateRequest(request.id, { email: e.target.value })} /></td>
                      <td className="p-1.5"><input className={inputClass} value={request.telefono} onChange={(e) => updateRequest(request.id, { telefono: e.target.value })} /></td>
                      <td className="p-1.5"><input className={`${inputClass} text-center`} min="0" step="1" type="number" value={request.decimosNumero1} onChange={(e) => updateRequest(request.id, { decimosNumero1: Math.max(0, Number(e.target.value)) })} /></td>
                      <td className="p-1.5"><input className={`${inputClass} text-center`} min="0" step="1" type="number" value={request.decimosNumero2} onChange={(e) => updateRequest(request.id, { decimosNumero2: Math.max(0, Number(e.target.value)) })} /></td>
                      <td className="px-2 py-1.5 text-center font-bold text-metro-text">{lotteryRequestTotalCount(request)}</td>
                      <td className="px-2 py-1.5 text-right font-bold text-metro-text">{money(lotteryRequestAmount(draft, request))}</td>
                      <td className="px-2 py-1.5 text-center">
                        <button aria-label={request.pagado ? 'Marcar como pendiente' : 'Marcar como pagado'} className={cx('relative h-5 w-9 rounded-full transition', request.pagado ? 'bg-emerald-500' : 'bg-metro-raised')} onClick={() => togglePaid(request)} type="button">
                          <span className={cx('absolute top-0.5 h-4 w-4 rounded-full bg-white transition', request.pagado ? 'left-[18px]' : 'left-0.5')} />
                        </button>
                      </td>
                      <td className="px-2 py-1.5 text-metro-secondary">{dateText(request.fechaPago)}</td>
                      <td className="p-1.5">
                        <select className={inputClass} disabled={!request.pagado} value={request.formaPago} onChange={(e) => updateRequest(request.id, { formaPago: e.target.value as LotteryPaymentMethod })}>
                          <option value="efectivo">Efectivo</option>
                          <option value="bizum">Bizum</option>
                        </select>
                      </td>
                      <td className="p-1.5"><input className={inputClass} value={request.observaciones} onChange={(e) => updateRequest(request.id, { observaciones: e.target.value })} /></td>
                      <td className="px-1 py-1.5"><button className="grid h-7 w-7 place-items-center rounded-md text-metro-muted hover:bg-red-500/10 hover:text-red-300" onClick={() => removePerson(request.id)} type="button"><Trash2 size={13} /></button></td>
                    </tr>
                  ))}
                  {filteredRequests.length === 0 ? (
                    <tr>
                      <td className="px-3 py-8 text-center text-xs text-metro-muted" colSpan={12}>No hay personas que coincidan con los filtros.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end">
              <ActionButton icon={Save} iconOnly={false} onClick={() => void persist(draft, 'Solicitudes y pagos guardados.')} variant="save">Guardar solicitudes</ActionButton>
            </div>
          </div>
        </SectionShell>
      ) : null}

      {activeSection === 'cierre' ? (
        <SectionShell
          title="Cierre · Resumen final"
          subtitle="Consulta el estado final de la campaña, revisa cobros pendientes y exporta la información a Excel."
          actions={
            <>
              <ActionButton icon={Download} iconOnly={false} onClick={() => void exportCampaign(draft)} size="sm" variant="excel">Exportar Excel</ActionButton>
              <ActionButton icon={Save} iconOnly={false} onClick={() => void persist(draft, 'Cierre guardado.')} size="sm" variant="save">Guardar cierre</ActionButton>
            </>
          }
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
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h4 className="text-xs font-extrabold text-metro-text">Resumen por número</h4>
                  <label className="inline-flex items-center gap-2 text-[11px] text-metro-muted">
                    <input checked={draft.workflow.campanaCerrada} onChange={(e) => setWorkflowFlag('campanaCerrada', e.target.checked)} type="checkbox" />
                    Campaña cerrada
                  </label>
                </div>
                <div className="space-y-2">
                  <div className="rounded-lg border border-metro-border bg-metro-panel p-3">
                    <p className="text-xs font-extrabold text-metro-text">{draft.numero1 || 'Número 1'}</p>
                    <div className="mt-2 grid gap-2 sm:grid-cols-3">
                      <SummaryPill label="Encargados" value={String(draft.decimosNumero1)} />
                      <SummaryPill label="Solicitados" value={String(requestedNumero1)} />
                      <SummaryPill label="Disponibles" value={String(availableNumero1)} tone={availableNumero1 < 0 ? 'alert' : 'good'} />
                    </div>
                  </div>
                  <div className="rounded-lg border border-metro-border bg-metro-panel p-3">
                    <p className="text-xs font-extrabold text-metro-text">{draft.numero2 || 'Número 2'}</p>
                    <div className="mt-2 grid gap-2 sm:grid-cols-3">
                      <SummaryPill label="Encargados" value={String(draft.decimosNumero2)} />
                      <SummaryPill label="Solicitados" value={String(requestedNumero2)} />
                      <SummaryPill label="Disponibles" value={String(availableNumero2)} tone={availableNumero2 < 0 ? 'alert' : 'good'} />
                    </div>
                  </div>
                  <div className="rounded-lg border border-metro-border bg-metro-panel p-3">
                    <div className="grid gap-2 sm:grid-cols-3">
                      <SummaryPill label="Total encargados" value={String(orderedTotal)} />
                      <SummaryPill label="Total solicitados" value={String(requestedTotal)} />
                      <SummaryPill label="Total disponibles" value={String(availableTotal)} tone={availableTotal < 0 ? 'alert' : 'good'} />
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-metro-border bg-metro-surface p-3">
                <h4 className="mb-3 text-xs font-extrabold text-metro-text">Pendientes y acciones finales</h4>
                <div className="grid gap-2 md:grid-cols-2">
                  <SummaryPill label="Personas pendientes de pago" value={String(draft.requests.filter((request) => !request.pagado).length)} tone={pendingAmount > 0 ? 'alert' : 'good'} />
                  <SummaryPill label="Importe pendiente" value={money(pendingAmount)} tone={pendingAmount > 0 ? 'alert' : 'good'} />
                  <SummaryPill label="Cobros efectivo" value={money(cash)} />
                  <SummaryPill label="Cobros Bizum" value={money(bizum)} />
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <ActionButton icon={Download} iconOnly={false} onClick={() => void exportCampaign(draft)} variant="excel">Exportar Excel</ActionButton>
                  <ActionButton icon={Save} iconOnly={false} onClick={() => void persist(draft, 'Resumen final guardado.')} variant="save">Guardar resumen</ActionButton>
                </div>
              </div>
            </div>
          </div>
        </SectionShell>
      ) : null}
    </div>
  );
}
