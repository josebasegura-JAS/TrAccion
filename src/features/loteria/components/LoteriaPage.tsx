import { useEffect, useMemo, useRef, useState } from 'react';
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
} from 'lucide-react';
import { PageHeader } from '../../../components/ui/PageHeader';
import { ActionButton } from '../../../components/ui/ActionButton';
import { importLotteryPeopleFromXlsx } from '../domain/importLotteryPeople';
import {
  lotteryAvailableCount,
  lotteryBizumTotal,
  lotteryCashOnHand,
  lotteryPaidTotal,
  lotteryRequestAmount,
  lotteryRequestedCount,
  type LotteryCampaign,
  type LotteryPaymentMethod,
  type LotteryRequest,
} from '../domain/loteria';
import { useLoteriaStore } from '../store/useLoteriaStore';

const inputClass = 'h-8 w-full rounded-lg border border-metro-border bg-metro-surface px-2.5 text-xs text-metro-text outline-none transition focus:border-metro-red';
const labelClass = 'mb-1 block text-[10px] font-bold uppercase tracking-wide text-metro-muted';
const money = (value: number) => value.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
const dateText = (iso: string | null) => iso ? new Date(iso).toLocaleDateString('es-ES') : '—';
const nowIso = () => new Date().toISOString();

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

function StatCard({ icon: Icon, label, value, detail }: { icon: typeof Ticket; label: string; value: string; detail?: string }) {
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

function FlowItem({ month, title, detail, done, onToggle }: { month: string; title: string; detail: string; done: boolean; onToggle: () => void }) {
  return (
    <button
      className={cx(
        'min-w-0 flex-1 rounded-lg border p-2.5 text-left transition',
        done ? 'border-emerald-500/35 bg-emerald-500/[0.07]' : 'border-metro-border bg-metro-surface/80 hover:border-metro-red/60',
      )}
      onClick={onToggle}
      type="button"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-extrabold uppercase tracking-wide text-red-300">{month}</span>
        <span className={cx('grid h-5 w-5 place-items-center rounded-full border', done ? 'border-emerald-400 bg-emerald-500 text-white' : 'border-metro-border text-transparent')}>
          <Check size={12} />
        </span>
      </div>
      <p className="mt-1 text-[11px] font-extrabold text-metro-text">{title}</p>
      <p className="mt-0.5 text-[10px] leading-4 text-metro-muted">{detail}</p>
    </button>
  );
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
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(`Lotería ${campaign.year}`);
  sheet.columns = [
    { header: 'Persona', key: 'nombre', width: 30 },
    { header: 'Email', key: 'email', width: 32 },
    { header: 'Teléfono', key: 'telefono', width: 18 },
    { header: 'Décimos', key: 'decimos', width: 12 },
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
    decimos: request.decimos,
    importe: lotteryRequestAmount(campaign, request),
    pagado: request.pagado ? 'Sí' : 'No',
    fechaPago: request.fechaPago ? new Date(request.fechaPago) : '',
    formaPago: request.pagado ? (request.formaPago === 'bizum' ? 'Bizum' : 'Efectivo') : '',
    observaciones: request.observaciones,
  }));
  sheet.getColumn('importe').numFmt = '#,##0.00 [$€-es-ES]';
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = { from: 'A1', to: 'I1' };

  const summary = workbook.addWorksheet('Resumen');
  summary.addRows([
    ['Campaña', `Lotería de Navidad ${campaign.year}`],
    ['Número 1', campaign.numero1],
    ['Número 2', campaign.numero2],
    ['Precio por décimo', campaign.precioDecimo],
    ['Décimos encargados', campaign.decimosEncargados],
    ['Décimos solicitados', lotteryRequestedCount(campaign)],
    ['Décimos disponibles', lotteryAvailableCount(campaign)],
    ['Total cobrado', lotteryPaidTotal(campaign)],
    ['Cobros en efectivo / caja', lotteryCashOnHand(campaign)],
    ['Cobros por Bizum', lotteryBizumTotal(campaign)],
  ]);
  summary.getColumn(1).width = 28;
  summary.getColumn(2).width = 28;
  const buffer = await workbook.xlsx.writeBuffer();
  downloadBlob(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `Loteria_${campaign.year}.xlsx`);
}

export function LoteriaPage() {
  const campaign = useLoteriaStore((state) => state.campaign);
  const load = useLoteriaStore((state) => state.load);
  const saveCampaign = useLoteriaStore((state) => state.saveCampaign);
  const importPeople = useLoteriaStore((state) => state.importPeople);
  const [draft, setDraft] = useState(campaign);
  const [search, setSearch] = useState('');
  const [paymentFilter, setPaymentFilter] = useState<'todos' | 'pagados' | 'pendientes'>('todos');
  const [message, setMessage] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setDraft(campaign); }, [campaign]);

  const requested = lotteryRequestedCount(draft);
  const available = lotteryAvailableCount(draft);
  const paid = lotteryPaidTotal(draft);
  const cash = lotteryCashOnHand(draft);
  const bizum = lotteryBizumTotal(draft);

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

  const updateRequest = (id: string, patch: Partial<LotteryRequest>, persistNow = false) => {
    const next = {
      ...draft,
      requests: draft.requests.map((request) => request.id === id ? { ...request, ...patch, updatedAt: nowIso() } : request),
    };
    setDraft(next);
    if (persistNow) void persist(next);
  };

  const togglePaid = (request: LotteryRequest) => {
    updateRequest(request.id, {
      pagado: !request.pagado,
      fechaPago: request.pagado ? null : nowIso(),
      formaPago: request.formaPago || 'efectivo',
    }, true);
  };

  const toggleWorkflow = (key: keyof LotteryCampaign['workflow']) => {
    const next = { ...draft, workflow: { ...draft.workflow, [key]: !draft.workflow[key] } };
    setDraft(next);
    void persist(next, 'Estado del flujograma actualizado.');
  };

  const addPerson = () => {
    const timestamp = nowIso();
    const next = {
      ...draft,
      requests: [...draft.requests, {
        id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `loteria-${Date.now()}`,
        nombre: '', email: '', telefono: '', decimos: 0, pagado: false, fechaPago: null,
        formaPago: 'efectivo' as const, observaciones: '', createdAt: timestamp, updatedAt: timestamp,
      }],
    };
    setDraft(next);
  };

  const removePerson = (id: string) => {
    const next = { ...draft, requests: draft.requests.filter((request) => request.id !== id) };
    setDraft(next);
    void persist(next, 'Persona eliminada.');
  };

  const handleImport = async (file: File | undefined) => {
    if (!file) return;
    try {
      const saved = await saveCampaign(draft);
      if (!saved.ok) {
        setMessage(saved.message);
        return;
      }
      const people = await importLotteryPeopleFromXlsx(file);
      const result = await importPeople(people);
      setMessage(result.message);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se ha podido importar el Excel.');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const renderedTemplate = draft.emailBody
    .replaceAll('{{numero1}}', draft.numero1 || '—')
    .replaceAll('{{numero2}}', draft.numero2 || '—')
    .replaceAll('{{precio}}', draft.precioDecimo.toLocaleString('es-ES', { minimumFractionDigits: 2 }));

  return (
    <div className="space-y-3">
      <PageHeader
        title="Lotería"
        status={message ? <span className="text-xs text-metro-secondary">{message}</span> : null}
        actions={
          <>
            <ActionButton icon={Save} iconOnly={false} onClick={() => void persist()} variant="save">Guardar</ActionButton>
            <ActionButton icon={FileSpreadsheet} iconOnly={false} onClick={() => fileRef.current?.click()} variant="import">Importar Excel</ActionButton>
            <ActionButton icon={Download} iconOnly={false} onClick={() => void exportCampaign(draft)} variant="excel">Exportar</ActionButton>
            <input ref={fileRef} className="hidden" type="file" accept=".xlsx" onChange={(event) => void handleImport(event.target.files?.[0])} />
          </>
        }
      />

      <section className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Ticket} label="Números jugados" value={`${draft.numero1 || '—'} · ${draft.numero2 || '—'}`} />
        <StatCard icon={ClipboardCheck} label="Décimos encargados" value={String(draft.decimosEncargados)} detail={`${requested} solicitados`} />
        <StatCard icon={Ticket} label="Décimos disponibles" value={String(available)} detail={`de ${draft.decimosEncargados}`} />
        <StatCard icon={CircleDollarSign} label="Dinero en caja" value={money(cash)} detail="Solo cobros en efectivo" />
      </section>

      <section className="grid gap-3 xl:grid-cols-[1.05fr_1.25fr_1fr]">
        <div className="rounded-xl border border-metro-border bg-metro-panel p-3">
          <h3 className="mb-2 text-xs font-extrabold text-metro-text">Configuración de campaña</h3>
          <div className="grid grid-cols-2 gap-2">
            <label><span className={labelClass}>Número 1</span><input className={inputClass} value={draft.numero1} onChange={(e) => setDraft({ ...draft, numero1: e.target.value })} /></label>
            <label><span className={labelClass}>Número 2</span><input className={inputClass} value={draft.numero2} onChange={(e) => setDraft({ ...draft, numero2: e.target.value })} /></label>
            <label><span className={labelClass}>Precio por décimo</span><input className={inputClass} min="0" step="0.01" type="number" value={draft.precioDecimo} onChange={(e) => setDraft({ ...draft, precioDecimo: Number(e.target.value) })} /></label>
            <label><span className={labelClass}>Décimos encargados</span><input className={inputClass} min="0" step="1" type="number" value={draft.decimosEncargados} onChange={(e) => setDraft({ ...draft, decimosEncargados: Math.max(0, Number(e.target.value)) })} /></label>
            <label className="col-span-2"><span className={labelClass}>Campaña / año</span><input className={inputClass} type="number" value={draft.year} onChange={(e) => setDraft({ ...draft, year: Number(e.target.value) })} /></label>
          </div>
          <h4 className="mb-2 mt-3 text-[11px] font-extrabold text-metro-secondary">Datos del lotero</h4>
          <div className="grid gap-2 sm:grid-cols-2">
            <label><span className={labelClass}>Nombre</span><input className={inputClass} value={draft.lotero.nombre} onChange={(e) => setDraft({ ...draft, lotero: { ...draft.lotero, nombre: e.target.value } })} /></label>
            <label><span className={labelClass}>Teléfono</span><input className={inputClass} value={draft.lotero.telefono} onChange={(e) => setDraft({ ...draft, lotero: { ...draft.lotero, telefono: e.target.value } })} /></label>
            <label className="sm:col-span-2"><span className={labelClass}>Email</span><input className={inputClass} type="email" value={draft.lotero.email} onChange={(e) => setDraft({ ...draft, lotero: { ...draft.lotero, email: e.target.value } })} /></label>
          </div>
        </div>

        <div className="rounded-xl border border-metro-border bg-metro-panel p-3">
          <div className="mb-2 flex items-center gap-2"><CalendarDays size={16} className="text-red-300" /><h3 className="text-xs font-extrabold text-metro-text">Flujograma</h3></div>
          <div className="grid grid-cols-2 gap-2">
            <FlowItem month="Septiembre" title="Avisar al lotero" detail="Contactar y confirmar disponibilidad." done={draft.workflow.loteroAvisado} onToggle={() => toggleWorkflow('loteroAvisado')} />
            <FlowItem month="Septiembre" title="Confirmar encargo" detail="Cerrar números, cantidad y precio." done={draft.workflow.encargoConfirmado} onToggle={() => toggleWorkflow('encargoConfirmado')} />
            <FlowItem month="Octubre" title="Enviar comunicación" detail="Usar la plantilla con personas habituales." done={draft.workflow.avisoPersonasEnviado} onToggle={() => toggleWorkflow('avisoPersonasEnviado')} />
            <FlowItem month="Octubre" title="Importar solicitantes" detail="Cargar el Excel base de participantes." done={draft.workflow.excelImportado} onToggle={() => toggleWorkflow('excelImportado')} />
            <FlowItem month="Seguimiento" title="Solicitudes y pagos" detail="Control diario de décimos, cobros y caja." done={draft.workflow.seguimientoIniciado} onToggle={() => toggleWorkflow('seguimientoIniciado')} />
            <FlowItem month="Cierre" title="Cerrar campaña" detail="Comprobar pendientes, stock y caja final." done={draft.workflow.campanaCerrada} onToggle={() => toggleWorkflow('campanaCerrada')} />
          </div>
        </div>

        <div className="rounded-xl border border-metro-border bg-metro-panel p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2"><Mail size={16} className="text-red-300" /><h3 className="text-xs font-extrabold text-metro-text">Plantilla de mail</h3></div>
            <button className="inline-flex items-center gap-1 text-[10px] font-bold text-metro-secondary hover:text-metro-text" onClick={() => { void navigator.clipboard.writeText(`${draft.emailSubject}\n\n${renderedTemplate}`); setMessage('Plantilla copiada al portapapeles.'); }} type="button"><Copy size={12} /> Copiar</button>
          </div>
          <label><span className={labelClass}>Asunto</span><input className={inputClass} value={draft.emailSubject} onChange={(e) => setDraft({ ...draft, emailSubject: e.target.value })} /></label>
          <label className="mt-2 block"><span className={labelClass}>Mensaje</span><textarea className="min-h-44 w-full resize-y rounded-lg border border-metro-border bg-metro-surface p-2.5 text-xs leading-5 text-metro-text outline-none focus:border-metro-red" value={draft.emailBody} onChange={(e) => setDraft({ ...draft, emailBody: e.target.value })} /></label>
        </div>
      </section>

      <section className="rounded-xl border border-metro-border bg-metro-panel p-3">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <div className="mr-auto flex items-center gap-2"><UserRound size={16} className="text-red-300" /><h3 className="text-xs font-extrabold text-metro-text">Solicitudes</h3></div>
          <div className="relative min-w-56 flex-1 max-w-md"><Search className="absolute left-2.5 top-2 text-metro-muted" size={14} /><input className={`${inputClass} pl-8`} placeholder="Buscar persona, email o teléfono" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
          <select className={`${inputClass} w-auto min-w-32`} value={paymentFilter} onChange={(e) => setPaymentFilter(e.target.value as typeof paymentFilter)}><option value="todos">Todos</option><option value="pagados">Pagados</option><option value="pendientes">Pendientes</option></select>
          <button className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-metro-border bg-metro-surface px-2.5 text-xs font-bold text-metro-text hover:border-metro-red" onClick={addPerson} type="button"><Plus size={14} /> Añadir persona</button>
          <span className={cx('rounded-lg border px-2.5 py-1.5 text-xs font-extrabold', available < 0 ? 'border-red-500/50 bg-red-500/10 text-red-300' : 'border-emerald-500/35 bg-emerald-500/[0.07] text-emerald-300')}>Disponibles: {available} / {draft.decimosEncargados}</span>
        </div>

        <div className="overflow-x-auto rounded-lg border border-metro-border bg-metro-surface">
          <table className="w-full min-w-[1180px] border-collapse text-left text-[11px]">
            <thead className="bg-metro-raised text-[10px] uppercase tracking-wide text-metro-muted"><tr>
              <th className="px-2 py-2">Persona</th><th className="px-2 py-2">Email</th><th className="px-2 py-2">Teléfono</th><th className="px-2 py-2 text-center">Décimos</th><th className="px-2 py-2 text-right">Importe</th><th className="px-2 py-2 text-center">Pagado</th><th className="px-2 py-2">Fecha pago</th><th className="px-2 py-2">Forma pago</th><th className="px-2 py-2">Observaciones</th><th className="w-9 px-2 py-2" /></tr></thead>
            <tbody>
              {filteredRequests.map((request) => (
                <tr className="border-t border-metro-border" key={request.id}>
                  <td className="p-1.5"><input className={inputClass} value={request.nombre} onChange={(e) => updateRequest(request.id, { nombre: e.target.value })} onBlur={() => void persist()} /></td>
                  <td className="p-1.5"><input className={inputClass} value={request.email} onChange={(e) => updateRequest(request.id, { email: e.target.value })} onBlur={() => void persist()} /></td>
                  <td className="p-1.5"><input className={inputClass} value={request.telefono} onChange={(e) => updateRequest(request.id, { telefono: e.target.value })} onBlur={() => void persist()} /></td>
                  <td className="p-1.5"><input className={`${inputClass} text-center`} min="0" step="1" type="number" value={request.decimos} onChange={(e) => updateRequest(request.id, { decimos: Math.max(0, Number(e.target.value)) })} onBlur={() => void persist()} /></td>
                  <td className="px-2 py-1.5 text-right font-bold text-metro-text">{money(lotteryRequestAmount(draft, request))}</td>
                  <td className="px-2 py-1.5 text-center"><button aria-label={request.pagado ? 'Marcar como pendiente' : 'Marcar como pagado'} className={cx('relative h-5 w-9 rounded-full transition', request.pagado ? 'bg-emerald-500' : 'bg-metro-raised')} onClick={() => togglePaid(request)} type="button"><span className={cx('absolute top-0.5 h-4 w-4 rounded-full bg-white transition', request.pagado ? 'left-[18px]' : 'left-0.5')} /></button></td>
                  <td className="px-2 py-1.5 text-metro-secondary">{dateText(request.fechaPago)}</td>
                  <td className="p-1.5"><select className={inputClass} disabled={!request.pagado} value={request.formaPago} onChange={(e) => updateRequest(request.id, { formaPago: e.target.value as LotteryPaymentMethod }, true)}><option value="efectivo">Efectivo</option><option value="bizum">Bizum</option></select></td>
                  <td className="p-1.5"><input className={inputClass} value={request.observaciones} onChange={(e) => updateRequest(request.id, { observaciones: e.target.value })} onBlur={() => void persist()} /></td>
                  <td className="px-1 py-1.5"><button className="grid h-7 w-7 place-items-center rounded-md text-metro-muted hover:bg-red-500/10 hover:text-red-300" onClick={() => removePerson(request.id)} type="button"><Trash2 size={13} /></button></td>
                </tr>
              ))}
              {filteredRequests.length === 0 ? <tr><td className="px-3 py-8 text-center text-xs text-metro-muted" colSpan={10}>No hay personas que coincidan con los filtros.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-2 md:grid-cols-4">
        <StatCard icon={Euro} label="Total cobrado" value={money(paid)} detail={`${draft.requests.filter((request) => request.pagado).length} pagos`} />
        <StatCard icon={CircleDollarSign} label="Cobros en efectivo" value={money(cash)} detail="Dinero físico en caja" />
        <StatCard icon={Euro} label="Cobros por Bizum" value={money(bizum)} detail="No suma a caja" />
        <StatCard icon={Ticket} label="Pendiente de asignar" value={String(available)} detail={`${requested} décimos ya solicitados`} />
      </section>
    </div>
  );
}
