import { useEffect, useMemo, useState } from 'react';
import { BriefcaseBusiness, Mail, Plus, Search } from 'lucide-react';
import { PageHeader } from '../../../components/ui/PageHeader';
import { useEmployeeStore } from '../../plantilla/store/useEmployeeStore';
import { buildActividadMail, type ActividadExterna, type ActividadExternaEstado } from '../domain/actividadExterna';
import { useActividadesExternasStore } from '../store/useActividadesExternasStore';

const today = () => {
  const date = new Date();
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
const label = (status: ActividadExternaEstado) => status === 'pendiente' ? 'Pendiente' : status === 'autorizada' ? 'Autorizada' : 'Denegada';

export function ActividadesExternasPage() {
  const employees = useEmployeeStore((state) => state.employees);
  const loadEmployees = useEmployeeStore((state) => state.load);
  const { records, load, create, resolve, setComunicacion } = useActividadesExternasStore();
  const [employeeId, setEmployeeId] = useState('');
  const [employeeQuery, setEmployeeQuery] = useState('');
  const [showEmployeeSuggestions, setShowEmployeeSuggestions] = useState(false);
  const [activity, setActivity] = useState('');
  const [date, setDate] = useState(today());
  const [paid, setPaid] = useState(false);
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('todos');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [resolution, setResolution] = useState<{ record: ActividadExterna; estado: 'autorizada' | 'denegada' } | null>(null);
  const [reason, setReason] = useState('');

  useEffect(() => { loadEmployees(); load(); }, [loadEmployees, load]);
  const employee = employees.find((item) => item.empleado === employeeId && !item.deletedAt);
  const employeeSuggestions = useMemo(() => {
    const query = employeeQuery.trim().toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (!query) return [];
    return employees.filter((item) => !item.deletedAt && [item.empleado, item.nombreApellidos].some((value) => value.toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(query))).slice(0, 10);
  }, [employees, employeeQuery]);
  const visible = useMemo(() => records.filter((item) =>
    (statusFilter === 'todos' || item.estado === statusFilter)
    && [item.nombre, item.empleado, item.actividad].join(' ').toLocaleLowerCase('es').includes(filter.toLocaleLowerCase('es'))
  ).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [records, filter, statusFilter]);
  const count = (status: ActividadExternaEstado) => records.filter((item) => item.estado === status).length;
  const act = async (operation: () => Promise<{ok: boolean; message: string}>, after?: () => void) => {
    setBusy(true);
    try {
      const result = await operation();
      setMessage(result.message);
      if (result.ok) after?.();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se ha podido completar la operación.');
    } finally { setBusy(false); }
  };
  const openDraft = async (record: ActividadExterna) => {
    if (!record.email.trim()) { setMessage('La persona no tiene correo en Plantilla. Actualiza su ficha antes de preparar el borrador.'); return; }
    if (!window.traccion?.createOutlookDraft) { setMessage('La integración con Outlook de escritorio no está disponible.'); return; }
    setBusy(true);
    try {
      const mail = buildActividadMail(record);
      const result = await window.traccion.createOutlookDraft({ ...mail, to: [record.email], cc: [] });
      if (!result.ok) { setMessage(result.message); return; }
      const saved = await setComunicacion(record.id, 'borrador');
      setMessage(saved.ok ? 'Borrador abierto en Outlook. El envío NO está confirmado.' : `Borrador abierto, pero no se pudo registrar el estado: ${saved.message}`);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No se ha podido abrir Outlook.'); }
    finally { setBusy(false); }
  };
  return <section className="space-y-3">
    <PageHeader title="Actividades Externas" helpSubtitle="Solicitudes de compatibilidad, resolución y comunicaciones." />
    <div className="grid grid-cols-3 gap-2">
      {(['pendiente', 'autorizada', 'denegada'] as const).map((status) => <div key={status} className="rounded-xl border border-metro-border bg-metro-panel p-3">
        <div className="text-xs text-metro-muted">{label(status)}</div><div className="text-2xl font-bold text-metro-text">{count(status)}</div>
      </div>)}
    </div>
    <div className="rounded-xl border border-metro-border bg-metro-panel p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold text-metro-text"><BriefcaseBusiness size={17}/> Solicitudes de compatibilidad</h2>
        <button type="button" onClick={() => setCreating((value) => !value)} className="inline-flex items-center gap-1 rounded-lg bg-red-700 px-3 py-2 text-xs font-semibold text-white"><Plus size={14}/> Nueva solicitud</button>
      </div>
      {creating && <form className="mb-3 space-y-3 rounded-xl border border-metro-border bg-metro-surface p-3" onSubmit={(event) => {
        event.preventDefault();
        if (!employee) { setMessage('Selecciona una persona activa de Plantilla.'); return; }
        void act(() => create({ empleado: employee.empleado, nombre: employee.nombreApellidos, email: employee.email, actividad: activity, fechaSolicitud: date, remunerada: paid }), () => {
          setCreating(false); setEmployeeId(''); setEmployeeQuery(''); setActivity(''); setDate(today()); setPaid(false);
        });
      }}>
        <div className="relative">
          <label className="block text-xs font-semibold text-metro-text" htmlFor="actividad-employee-search">Buscar persona por número o nombre y apellidos</label>
          <input id="actividad-employee-search" required value={employeeQuery} autoComplete="off"
            onChange={(event) => { setEmployeeQuery(event.target.value); setEmployeeId(''); setShowEmployeeSuggestions(true); }}
            onFocus={() => setShowEmployeeSuggestions(true)}
            onBlur={() => window.setTimeout(() => setShowEmployeeSuggestions(false), 150)}
            placeholder="Número de empleado o nombre..."
            className="mt-1 w-full rounded-lg border border-metro-border bg-metro-panel p-2 text-sm text-metro-text" />
          {showEmployeeSuggestions && employeeSuggestions.length > 0 && <div className="absolute z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-metro-border bg-metro-surface shadow-xl">
            {employeeSuggestions.map((item) => <button key={item.empleado} type="button" onMouseDown={(event) => event.preventDefault()}
              onClick={() => { setEmployeeId(item.empleado); setEmployeeQuery(`${item.empleado} · ${item.nombreApellidos}`); setShowEmployeeSuggestions(false); }}
              className="block w-full px-3 py-2 text-left text-sm text-metro-text hover:bg-metro-red/10"><strong>{item.empleado}</strong> · {item.nombreApellidos}</button>)}
          </div>}
          {employee && <p className="mt-1 text-xs font-semibold text-metro-text">Seleccionado: {employee.nombreApellidos} ({employee.empleado})</p>}
        </div>
        {employee && <p className="text-xs text-metro-muted">Correo de Plantilla: {employee.email || 'No disponible'}</p>}
        <label className="block text-xs font-semibold text-metro-text">Actividad externa
          <textarea required value={activity} onChange={(event) => setActivity(event.target.value)} rows={3} className="mt-1 w-full rounded-lg border border-metro-border bg-metro-panel p-2 text-sm text-metro-text" placeholder="Descripción de la actividad solicitada"/>
        </label>
        <div className="flex flex-wrap items-end gap-4">
          <label className="text-xs font-semibold text-metro-text">Fecha de solicitud<input required type="date" value={date} onChange={(event) => setDate(event.target.value)} className="mt-1 block rounded-lg border border-metro-border bg-metro-panel p-2 text-sm"/></label>
          <label className="flex items-center gap-2 text-xs text-metro-text"><input type="checkbox" checked={paid} onChange={(event) => setPaid(event.target.checked)}/> Actividad remunerada</label>
          <button disabled={busy} type="submit" className="rounded-lg bg-red-700 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">Guardar pendiente</button>
        </div>
      </form>}
      <div className="mb-3 flex flex-wrap gap-2">
        <label className="flex flex-1 items-center gap-2 rounded-lg border border-metro-border px-2"><Search size={15} className="text-metro-muted"/><input aria-label="Buscar solicitudes" value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Buscar empleado o actividad" className="min-w-0 flex-1 bg-transparent p-2 text-sm text-metro-text outline-none"/></label>
        <select aria-label="Filtrar estado" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="rounded-lg border border-metro-border bg-metro-panel p-2 text-sm text-metro-text"><option value="todos">Todos los estados</option><option value="pendiente">Pendientes</option><option value="autorizada">Autorizadas</option><option value="denegada">Denegadas</option></select>
      </div>
      {message && <p role="status" className="mb-3 rounded-lg border border-metro-border bg-metro-surface p-2 text-xs text-metro-text">{message}</p>}
      <div className="space-y-2">
        {visible.length === 0 && <p className="p-4 text-sm text-metro-muted">No hay solicitudes para estos filtros.</p>}
        {visible.map((record) => <article key={record.id} className="rounded-lg border border-metro-border bg-metro-surface p-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div><div className="font-semibold text-metro-text">{record.nombre} <span className="text-xs font-normal text-metro-muted">({record.empleado})</span></div><div className="mt-1 whitespace-pre-wrap text-sm text-metro-text">{record.actividad}</div><div className="mt-1 text-xs text-metro-muted">Solicitud: {record.fechaSolicitud} · {record.remunerada ? 'Remunerada' : 'No remunerada'}</div></div>
            <span className="rounded-md border border-metro-border px-2 py-1 text-xs font-semibold text-metro-text">{label(record.estado)}</span>
          </div>
          {record.estado === 'pendiente' ? <div className="mt-3 flex gap-2">
            <button disabled={busy} onClick={() => { setResolution({ record, estado: 'autorizada' }); setReason(''); }} className="rounded-lg border border-emerald-600 px-3 py-1.5 text-xs font-semibold text-emerald-400 disabled:opacity-50">Autorizar</button>
            <button disabled={busy} onClick={() => { setResolution({ record, estado: 'denegada' }); setReason(''); }} className="rounded-lg border border-red-600 px-3 py-1.5 text-xs font-semibold text-red-400 disabled:opacity-50">Denegar</button>
          </div> : <div className="mt-3 flex flex-wrap items-center gap-2">
            {(record.observacionesResolucion || record.motivoDenegacion) && <p className="w-full whitespace-pre-wrap text-xs text-metro-muted">{record.estado === 'denegada' ? 'Motivo' : 'Observaciones'}: {record.observacionesResolucion || record.motivoDenegacion}</p>}
            <span className="text-xs text-metro-muted">Comunicación: {record.comunicacion === 'confirmada' ? 'Envío confirmado' : record.comunicacion === 'borrador' ? 'Borrador preparado' : 'Pendiente'}</span>
            <button disabled={busy} onClick={() => void openDraft(record)} className="inline-flex items-center gap-1 rounded-lg border border-metro-border px-3 py-1.5 text-xs font-semibold text-metro-text disabled:opacity-50"><Mail size={14}/> Preparar correo en Outlook</button>
            {record.comunicacion !== 'confirmada' && <button disabled={busy} onClick={() => void act(() => setComunicacion(record.id, 'confirmada'))} className="rounded-lg border border-metro-border px-3 py-1.5 text-xs text-metro-text disabled:opacity-50">Confirmar envío manualmente</button>}
          </div>}
        </article>)}
      </div>
    </div>
    {resolution && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="presentation">
      <div role="dialog" aria-modal="true" aria-label="Resolver solicitud" className="w-full max-w-lg space-y-3 rounded-xl border border-metro-border bg-metro-panel p-5 text-metro-text">
        <h3 className="font-bold">{resolution.estado === 'autorizada' ? 'Autorizar' : 'Denegar'} solicitud de {resolution.record.nombre}</h3>
        <p className="text-xs text-metro-muted">{resolution.estado === 'autorizada' ? 'Puedes indicar observaciones para la autorización.' : 'Indica el motivo de la denegación.'} Las observaciones se incorporarán al borrador de Outlook.</p>
        <label htmlFor="actividad-resolution-notes" className="block text-xs font-semibold">Observaciones {resolution.estado === 'denegada' ? '(obligatorias)' : '(opcionales)'}</label>
        <textarea id="actividad-resolution-notes" autoFocus value={reason} onChange={(event) => setReason(event.target.value)} rows={4} className="w-full rounded-lg border border-metro-border bg-metro-surface p-2 text-sm"/>
        <div className="flex justify-end gap-2"><button type="button" onClick={() => setResolution(null)} className="rounded-lg border border-metro-border px-3 py-2 text-xs">Cancelar</button>
          <button type="button" disabled={busy || (resolution.estado === 'denegada' && !reason.trim())} onClick={() => void act(() => resolve(resolution.record.id, resolution.estado, reason), () => setResolution(null))} className="rounded-lg bg-red-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">{resolution.estado === 'autorizada' ? 'Confirmar autorización' : 'Confirmar denegación'}</button>
        </div>
      </div>
    </div>}
  </section>;
}
