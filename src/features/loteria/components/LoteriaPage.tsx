import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
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
  UserRound,
  UserRoundPlus,
} from 'lucide-react';
import { PageHeader } from '../../../components/ui/PageHeader';
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
  lotteryRequestedCount,
  lotteryRequestedCountByNumber,
  type LotteryCampaign,
  type LotteryRequest,
} from '../domain/loteria';
import { useLoteriaStore } from '../store/useLoteriaStore';
import { useUnsavedChanges } from '../../../hooks/useUnsavedChanges';
import { buildRecoverableDraftKey, useRecoverableDraft } from '../../../hooks/useRecoverableDraft';
import {
  inputClass,
  labelClass,
  textareaClass,
  money,
  nowIso,
  LOTERIA_HELP_SECTIONS,
  type WorkspaceSection,
  renderTemplate,
  plainTextToHtml,
  isValidEmail,
  normalizeSearch,
  employeeScore,
  createRequestId,
  buildLotteryAdministrationWorkbook,
  exportCampaign,
  stockTone,
} from './loteriaPage.utils';
import { MetricCard, StepCard, SectionShell, SaveState, SummaryPill } from './loteriaPage.helpers';
import { LoteriaParticipantsTable, LoteriaTrackingTable } from './LoteriaRequestsTables';

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
  const recoveryKey = buildRecoverableDraftKey('loteria', String(draft.year));
  const { clearDraft: clearRecoveryDraft, dialogNode: recoveryDialogNode } = useRecoverableDraft({
    currentValue: draft,
    initialValue: campaign,
    onRecover: setDraft,
    storageKey: recoveryKey,
  });
  const { dialogNode: unsavedDialogNode } = useUnsavedChanges({
    currentValue: draft,
    initialValue: campaign,
    onDiscard: () => setDraft(campaign),
  });
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

  const recommendedStep = useMemo(() => {
    if (!septemberDone) {
      return {
        section: 'septiembre' as WorkspaceSection,
        eyebrow: 'Siguiente acción recomendada',
        title: 'Preparar y confirmar el encargo',
        detail: 'Completa números, cantidades y datos del lotero. Cuando el encargo esté confirmado, el flujo avanzará a participantes.',
        action: 'Abrir encargo de septiembre',
      };
    }
    if (!octoberDone) {
      return {
        section: 'octubre' as WorkspaceSection,
        eyebrow: 'Siguiente acción recomendada',
        title: 'Preparar participantes y enviar el aviso',
        detail: `${draft.requests.length} participantes actualmente en campaña. Revisa cantidades y deja constancia del aviso por CCO.`,
        action: 'Abrir participantes de octubre',
      };
    }
    if (!seguimientoDone || pendingAmount > 0 || availableNumero1 < 0 || availableNumero2 < 0) {
      const detail = availableNumero1 < 0 || availableNumero2 < 0
        ? 'Hay más décimos solicitados que encargados en alguno de los números. Corrige las cantidades antes de cerrar.'
        : pendingAmount > 0
          ? `Quedan ${money(pendingAmount)} pendientes de cobro. Registra los pagos antes del cierre.`
          : 'Inicia el seguimiento y registra los cobros por Bizum o efectivo.';
      return {
        section: 'seguimiento' as WorkspaceSection,
        eyebrow: 'Siguiente acción recomendada',
        title: 'Revisar décimos y cobros',
        detail,
        action: 'Abrir seguimiento',
      };
    }
    if (!cierreDone) {
      return {
        section: 'cierre' as WorkspaceSection,
        eyebrow: 'Siguiente acción recomendada',
        title: 'Cuadrar y cerrar la campaña',
        detail: 'No quedan cobros pendientes y las existencias cuadran. Revisa el resumen final antes de cerrar.',
        action: 'Abrir cierre',
      };
    }
    return {
      section: 'cierre' as WorkspaceSection,
      eyebrow: 'Campaña completada',
      title: `Lotería ${draft.year} cerrada`,
      detail: 'La campaña está cerrada. Puedes revisar el cuadre final o exportar el Excel cuando lo necesites.',
      action: 'Ver cierre y resumen',
    };
  }, [availableNumero1, availableNumero2, cierreDone, draft.requests.length, draft.year, octoberDone, pendingAmount, septemberDone, seguimientoDone]);

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
    if (result.ok) clearRecoveryDraft();
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

    try {
      const administrationWorkbook = await buildLotteryAdministrationWorkbook(draft, employees);
      const result = await api({
        subject: draft.loteroEmailSubject,
        html: plainTextToHtml(loteroMailPreview),
        to: [draft.lotero.email.trim()],
        cc: [],
        bcc: [],
        attachments: [{
          fileName: administrationWorkbook.fileName,
          buffer: administrationWorkbook.buffer,
        }],
      });
      setMessage(
        result.ok
          ? `${result.message} Excel adjunto generado del 1 al ${administrationWorkbook.maxEmployeeNumber}.`
          : result.message,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se ha podido generar el Excel de Administración.');
    }
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
            <span className="inline-flex h-10 items-center rounded-xl border border-metro-red/40 bg-metro-red/10 px-3 text-xs font-extrabold text-red-200">Lotería {draft.year}</span>
            <ActionButton icon={Save} iconOnly={false} onClick={() => void persist()} variant="save">Guardar todo</ActionButton>
            <ActionButton icon={Download} iconOnly={false} onClick={() => void exportCampaign(draft)} variant="excel">Exportar Excel</ActionButton>
          </>
        }
      />

      {activeSection === null ? (
        <div className="space-y-3">
          <section className="rounded-2xl border border-metro-border bg-metro-panel p-3 md:p-4">
            <div className="mb-3">
              <h3 className="text-sm font-extrabold text-metro-text">Campaña {draft.year}</h3>
              <p className="mt-1 text-xs text-metro-muted">Sigue el recorrido de izquierda a derecha. Puedes entrar en cualquier fase, pero la app te indica cuál conviene completar ahora.</p>
            </div>
            <div className="grid gap-2 lg:grid-cols-4">
              <StepCard active={recommendedStep.section === 'septiembre'} done={septemberDone} icon={CalendarDays} month="1 · Septiembre" title="Encargo" detail={septemberDone ? 'Encargo preparado y confirmado.' : 'Números, cantidades y lotero.'} onClick={() => setActiveSection('septiembre')} />
              <StepCard active={recommendedStep.section === 'octubre'} done={octoberDone} icon={UserRoundPlus} month="2 · Octubre" title="Participantes" detail={octoberDone ? 'Participantes preparados y avisados.' : 'Altas, cantidades y aviso CCO.'} onClick={() => setActiveSection('octubre')} />
              <StepCard active={recommendedStep.section === 'seguimiento'} done={seguimientoDone && pendingAmount === 0 && availableNumero1 >= 0 && availableNumero2 >= 0} icon={Euro} month="3 · Seguimiento" title="Cobros" detail={pendingAmount > 0 ? `${money(pendingAmount)} pendientes de cobro.` : 'Décimos y pagos revisados.'} onClick={() => setActiveSection('seguimiento')} />
              <StepCard active={recommendedStep.section === 'cierre'} done={cierreDone} icon={ClipboardCheck} month="4 · Cierre" title="Cuadre" detail={cierreDone ? 'Campaña cerrada.' : 'Sobrantes, caja y cierre final.'} onClick={() => setActiveSection('cierre')} />
            </div>
          </section>

          <section className="rounded-2xl border border-metro-red/45 bg-metro-red/[0.07] p-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="max-w-3xl">
                <p className="text-xs font-extrabold uppercase tracking-wide text-red-300">{recommendedStep.eyebrow}</p>
                <h3 className="mt-1 text-lg font-extrabold text-metro-text">{recommendedStep.title}</h3>
                <p className="mt-1 text-sm leading-6 text-metro-secondary">{recommendedStep.detail}</p>
              </div>
              <ActionButton icon={ArrowRight} iconOnly={false} onClick={() => setActiveSection(recommendedStep.section)} variant="primary">{recommendedStep.action}</ActionButton>
            </div>
          </section>

          <section className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard icon={UserRound} label="Participantes" value={String(draft.requests.length)} detail={`${requestedTotal} décimos solicitados`} />
            <MetricCard icon={Ticket} label="Disponibles" value={String(availableTotal)} detail={`${orderedTotal} encargados`} />
            <MetricCard icon={CircleDollarSign} label="Pendiente de cobro" value={money(pendingAmount)} detail={pendingAmount > 0 ? 'Requiere seguimiento' : 'Cobros al día'} />
            <MetricCard icon={Euro} label="Cobrado" value={money(paid)} detail={`${money(cash)} efectivo · ${money(bizum)} Bizum`} />
            {recoveryDialogNode}
      {unsavedDialogNode}
    </section>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-metro-border bg-metro-panel px-3 py-2">
          <ActionButton icon={ArrowLeft} iconOnly={false} onClick={() => setActiveSection(null)} size="sm" variant="secondary">Volver al flujograma</ActionButton>
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
                  <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-metro-muted">Vista previa</p>
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
                          <p className="text-[11px] text-metro-muted">Empleado {employee.empleado}</p>
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
              <LoteriaParticipantsTable
                campaign={draft}
                requests={draft.requests}
                onUpdate={updateRequest}
                onRemove={removePerson}
              />
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

            <LoteriaTrackingTable
              campaign={draft}
              requests={filteredRequests}
              onUpdate={updateRequest}
              onTogglePaid={togglePaid}
            />
            <div className="flex justify-end"><ActionButton icon={Save} iconOnly={false} onClick={() => void persist(draft, 'Décimos y pagos guardados.')} size="sm" variant="save">Guardar pagos</ActionButton></div>
          </div>
        </SectionShell>
      ) : null}

      <div className="fixed bottom-5 right-5 z-40 rounded-2xl border border-metro-red/35 bg-metro-topbar/95 p-1.5 shadow-[0_18px_50px_rgba(2,6,23,0.55)] backdrop-blur">
        <ActionButton
          className="min-w-[9.5rem] shadow-lg shadow-red-950/30"
          icon={Save}
          iconOnly={false}
          onClick={() => void persist(draft, 'Cambios de Lotería guardados.')}
          variant="save"
        >
          Guardar cambios
        </ActionButton>
      </div>

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
