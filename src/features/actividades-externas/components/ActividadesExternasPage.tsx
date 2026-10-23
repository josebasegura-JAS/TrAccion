import { Fragment, useEffect, useMemo, useState } from 'react';
import { Clock3, ClipboardCheck, CheckCircle2, Eye, RefreshCw, FileSpreadsheet, Mail, Pencil, Plus, Printer, Search, Trash2 } from 'lucide-react';
import { useAppDialog } from '../../../hooks/useAppDialog';
import type { ModuleHelpSection } from '../../../components/ModuleHelp';
import { PageHeader } from '../../../components/ui/PageHeader';
import { useEmployeeStore } from '../../plantilla/store/useEmployeeStore';
import { buildActividadMail, type ActividadExterna, type ActividadExternaEstado } from '../domain/actividadExterna';
import { useActividadesExternasStore } from '../store/useActividadesExternasStore';
import { syncActividadesExternasExcelBackup } from '../services/actividadesExternasExcelBackup';

const ACTIVIDADES_EXTERNAS_HELP_SECTIONS: ModuleHelpSection[] = [
  {
    title: 'Alta y búsqueda',
    ordered: true,
    items: [
      'Las solicitudes pendientes aparecen arriba, las autorizadas debajo y las rechazadas o denegadas en el histórico. Selecciona una fila para consultar el detalle.',
      'Pulsa «Nueva solicitud» y busca a la persona por número de empleado, nombre o apellidos. Selecciona una sugerencia de Plantilla.',
      'Describe la actividad, indica la fecha de solicitud y marca si es remunerada. Al guardar queda pendiente de resolución.',
    ],
  },
  {
    title: 'Resolución',
    items: [
      'RRLL puede rechazar la solicitud o elevarla con propuesta favorable al Comité de Dirección.',
      'El Comité decide aprobar o denegar las solicitudes elevadas. El rechazo o denegación requiere motivo.',
      'Las observaciones se conservan en el registro y se incluyen en el borrador de correo correspondiente.',
      'No es posible aprobar directamente una solicitud sin propuesta favorable previa de RRLL.',
    ],
  },
  {
    title: 'Edición y eliminación',
    items: [
      'Editar permite corregir actividad, fecha, remuneración y observaciones RRLL, conservando la resolución del Comité.',
      'Eliminar pide confirmación y borra la solicitud de la base compartida. Comprueba los datos antes de confirmar.',
      'Si otro usuario ha modificado la solicitud, TrAcción evita sobrescribirla y solicita recargar.',
    ],
  },
  {
    title: 'Outlook y envío',
    items: [
      '«Preparar correo en Outlook» abre un borrador dirigido al correo almacenado en la solicitud. Revisa el destinatario y el texto antes de enviarlo.',
      'Abrir un borrador no confirma el envío: usa «Confirmar envío manualmente» solo después de enviarlo realmente.',
    ],
  },
  {
    title: 'Excel espejo y Ajustes',
    items: [
      'En Ajustes configura la carpeta compartida del Excel de Actividades Externas. La aplicación genera «Actividades_Externas.xlsx» con todas las solicitudes.',
      'El Excel se actualiza al crear, editar, eliminar, resolver o modificar la comunicación. «Actualizar Excel» permite regenerarlo manualmente.',
      'Si falla la actualización del Excel, se muestra un aviso; el guardado ya confirmado en SQLite no se deshace. Comprueba la ruta y regenera el Excel.',
    ],
  },
];

const today = () => {
  const date = new Date();
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
const label = (status: ActividadExternaEstado) => ({ pendiente: 'Pendiente de RRLL', propuesta: 'Pendiente de Comité de Dirección', rechazada_rrll: 'Rechazada por RRLL', autorizada: 'Autorizada por Comité', denegada: 'Denegada por Comité' } as const)[status];

export function ActividadesExternasPage() {
  const employees = useEmployeeStore((state) => state.employees);
  const loadEmployees = useEmployeeStore((state) => state.load);
  const { records, load, create, update, remove, resolve, setComunicacion } = useActividadesExternasStore();
  const [employeeId, setEmployeeId] = useState('');
  const [employeeQuery, setEmployeeQuery] = useState('');
  const [showEmployeeSuggestions, setShowEmployeeSuggestions] = useState(false);
  const [activity, setActivity] = useState('');
  const [date, setDate] = useState(today());
  const [paid, setPaid] = useState(false);
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('todos');
  const [yearFilter, setYearFilter] = useState('todos');
  const [showHistory, setShowHistory] = useState(false);
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [resolution, setResolution] = useState<{ record: ActividadExterna; estado: 'propuesta' | 'rechazada_rrll' | 'autorizada' | 'denegada' } | null>(null);
  const [reason, setReason] = useState('');
  const [editing, setEditing] = useState<ActividadExterna | null>(null);
  const [editActivity, setEditActivity] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editPaid, setEditPaid] = useState(false);
  const [editRrllNotes, setEditRrllNotes] = useState('');
  const { confirm, dialogNode } = useAppDialog();
  const startEdit = (record: ActividadExterna) => {
    setEditing(record); setEditActivity(record.actividad); setEditDate(record.fechaSolicitud); setEditPaid(record.remunerada); setEditRrllNotes(record.observacionesRrll ?? '');
  };
  const requestDelete = async (record: ActividadExterna) => {
    const accepted = await confirm(`Se eliminará definitivamente la solicitud de ${record.nombre}. Esta acción no se puede deshacer.`, {
      title: 'Eliminar actividad externa', confirmLabel: 'Eliminar', cancelLabel: 'Cancelar', danger: true,
    });
    if (accepted) await act(() => remove(record.id), () => setEditing(null));
  };

  useEffect(() => { loadEmployees(); load(); }, [loadEmployees, load]);
  const employee = employees.find((item) => item.empleado === employeeId && !item.deletedAt);
  const employeeSuggestions = useMemo(() => {
    const query = employeeQuery.trim().toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (!query) return [];
    return employees.filter((item) => !item.deletedAt && [item.empleado, item.nombreApellidos].some((value) => value.toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(query))).slice(0, 10);
  }, [employees, employeeQuery]);
  const visible = useMemo(() => records.filter((item) =>
    (statusFilter === 'todos' || item.estado === statusFilter)
    && (yearFilter === 'todos' || item.fechaSolicitud.startsWith(yearFilter))
    && [item.nombre, item.empleado, item.actividad].join(' ').toLocaleLowerCase('es').includes(filter.toLocaleLowerCase('es'))
  ).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [records, filter, statusFilter, yearFilter]);
  const years = useMemo(() => Array.from(new Set(records.map((item) => item.fechaSolicitud.slice(0, 4)))).filter((year) => /^\d{4}$/.test(year)).sort().reverse(), [records]);
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
    <PageHeader title="Actividades Externas" helpSections={ACTIVIDADES_EXTERNAS_HELP_SECTIONS} helpSubtitle="Solicitudes de compatibilidad, resolución y comunicaciones." />
    <div className="rounded-2xl border border-metro-border bg-metro-panel p-2">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex min-w-[240px] flex-1 items-center gap-2 rounded-lg border border-metro-border bg-metro-surface px-3"><Search size={15} className="text-metro-muted"/><input aria-label="Buscar solicitudes" value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Buscar por número, nombre o actividad" className="w-full bg-transparent py-2 text-sm text-metro-text outline-none"/></label>
        <select aria-label="Filtrar estado" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-xs text-metro-text"><option value="todos">Todos los estados</option><option value="pendiente">Pendiente RRLL</option><option value="propuesta">Pendiente Comité</option><option value="autorizada">Autorizadas</option><option value="rechazada_rrll">Rechazadas RRLL</option><option value="denegada">Denegadas Comité</option></select>
        <select aria-label="Filtrar año" value={yearFilter} onChange={(event) => setYearFilter(event.target.value)} className="rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-xs text-metro-text"><option value="todos">Todos los años</option>{years.map((year) => <option key={year} value={year}>{year}</option>)}</select>
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
      <div className="mb-1 flex items-center justify-end gap-2 pt-1">
        <button type="button" disabled={busy} onClick={() => void act(async () => { const warning = await syncActividadesExternasExcelBackup(useActividadesExternasStore.getState().records); return { ok: !warning, message: warning || 'Excel espejo actualizado.' }; })} className="inline-flex items-center gap-1 rounded-lg border border-metro-border px-3 py-1.5 text-xs font-semibold text-metro-text disabled:opacity-50"><FileSpreadsheet size={14}/> Actualizar Excel</button>
      </div>
      {message && <p role="status" className="mb-3 rounded-lg border border-metro-border bg-metro-surface p-2 text-xs text-metro-text">{message}</p>}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {([
          { heading: 'Pendientes de RRLL', description: 'Solicitudes pendientes de revisión inicial por Relaciones Laborales.', states: ['pendiente'], icon: 'rrll' },
          { heading: 'Pendientes de Comité de Dirección', description: 'Propuestas favorables pendientes de resolución por el Comité.', states: ['propuesta'], icon: 'comite' },
          { heading: 'Autorizadas', description: 'Actividades externas aprobadas por el Comité de Dirección.', states: ['autorizada'], icon: 'ok' },
          { heading: 'Histórico de rechazadas y denegadas', description: 'Solicitudes rechazadas por RRLL o denegadas por el Comité.', states: ['rechazada_rrll', 'denegada'], icon: 'history' },
        ] as const).map((group) => {
          const groupRecords = visible.filter((record) => (group.states as readonly string[]).includes(record.estado));
          if (group.icon === 'history' && !showHistory) return <div key={group.heading} className="lg:col-span-2"><button type="button" onClick={() => setShowHistory(true)} className="rounded-lg border border-metro-border px-3 py-2 text-xs text-metro-text">Mostrar histórico de rechazadas y denegadas ({groupRecords.length})</button></div>;
          return <section key={group.heading} className={`rounded-2xl border border-metro-border bg-metro-panel p-3 ${group.icon === 'rrll' || group.icon === 'comite' ? '' : 'lg:col-span-2'}`}>
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="flex items-start gap-3"><span className="rounded-xl border border-metro-border p-2 text-metro-muted">{group.icon === 'rrll' ? <Clock3 size={17}/> : group.icon === 'comite' ? <ClipboardCheck size={17}/> : <CheckCircle2 size={17}/>}</span><div><h3 className="text-sm font-bold text-metro-text">{group.heading} <span className="ml-1 rounded-full border border-metro-border px-2 py-0.5 text-xs">{groupRecords.length}</span></h3>
              <p className="mt-1 text-xs text-metro-muted">{group.description}</p></div></div><button type="button" disabled={busy} title="Recargar tabla" onClick={() => load()} className="rounded-md border border-metro-border p-2 text-metro-muted"><RefreshCw size={14}/></button>
            </div>
            <div className="overflow-x-auto rounded-lg border border-metro-border">
              <table className={`w-full ${group.icon === 'rrll' || group.icon === 'comite' ? 'min-w-[540px]' : 'min-w-[1000px]'} text-left text-xs text-metro-text`}>
                <thead className="bg-metro-panel text-metro-muted"><tr><th className="px-3 py-2">Nº</th><th className="px-3 py-2">Nombre</th><th className="px-3 py-2">Actividad</th>{group.icon !== 'rrll' && group.icon !== 'comite' && <th className="px-3 py-2">Solicitud</th>}{group.icon !== 'rrll' && group.icon !== 'comite' && <><th className="px-3 py-2">Estado</th><th className="px-3 py-2">Última actualización</th></>}<th className="px-3 py-2 text-right">ACCIONES</th></tr></thead>
                <tbody>
                  {groupRecords.length === 0 && <tr><td colSpan={group.icon === 'rrll' || group.icon === 'comite' ? 4 : 7} className="px-3 py-8 text-center text-metro-muted">Sin registros</td></tr>}
                  {groupRecords.map((record) => <Fragment key={record.id}>
                    <tr className="cursor-pointer border-t border-metro-border hover:bg-metro-panel" onClick={() => setSelectedRecordId((id) => id === record.id ? null : record.id)}>
                      <td className="px-3 py-2">{record.empleado}</td>
                      <td className="px-3 py-2 font-semibold">{record.nombre}</td>
                      <td className="max-w-[360px] truncate px-3 py-2" title={record.actividad}>{record.actividad}</td>
                      {group.icon !== 'rrll' && group.icon !== 'comite' && <td className="px-3 py-2">{record.fechaSolicitud}</td>}
                      {group.icon !== 'rrll' && group.icon !== 'comite' && <><td className="px-3 py-2"><span className={`rounded-full border px-2 py-1 ${record.estado === 'autorizada' ? 'border-emerald-700 bg-emerald-950/40 text-emerald-300' : 'border-red-700 text-red-300'}`}>{record.estado === 'autorizada' ? 'Autorizada' : label(record.estado)}</span></td><td className="px-3 py-2">{(record.fechaResolucion || record.updatedAt).slice(0,10)}</td></>}
                      <td className="px-3 py-2 text-right"><div className="flex justify-end gap-2">
                      <button type="button" className="rounded-lg border border-metro-border px-3 py-1.5 font-semibold" onClick={(event) => { event.stopPropagation(); setSelectedRecordId((id) => id === record.id ? null : record.id); }}>{group.icon === 'rrll' ? 'Revisar' : group.icon === 'comite' ? 'Resolver' : <span className="inline-flex items-center gap-1"><Eye size={13}/> Ver detalle</span>}</button>
                      <button type="button" disabled={busy} onClick={(event) => { event.stopPropagation(); startEdit(record); }} className="rounded-lg border border-metro-border px-2 py-1.5"><Pencil size={13}/></button>
                      <button type="button" disabled={busy} onClick={(event) => { event.stopPropagation(); void requestDelete(record); }} className="rounded-lg border border-red-700/60 px-2 py-1.5 text-red-400"><Trash2 size={13}/></button>
                      </div></td>
                    </tr>
                    {selectedRecordId === record.id && <tr><td colSpan={group.icon === 'rrll' || group.icon === 'comite' ? 4 : 7} className="border-t border-metro-border bg-metro-panel p-3">
{[record].map((record) => <article key={record.id} className="rounded-lg border border-metro-border bg-metro-surface p-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div><div className="font-semibold text-metro-text">{record.nombre} <span className="text-xs font-normal text-metro-muted">({record.empleado})</span></div><div className="mt-1 whitespace-pre-wrap text-sm text-metro-text">{record.actividad}</div><div className="mt-1 text-xs text-metro-muted">Solicitud: {record.fechaSolicitud} · {record.remunerada ? 'Remunerada' : 'No remunerada'}</div></div>
            <span className="rounded-md border border-metro-border px-2 py-1 text-xs font-semibold text-metro-text">{label(record.estado)}</span>
          </div>
          <div className="mt-2 flex flex-wrap justify-end gap-2">
            <button type="button" disabled={busy} onClick={() => startEdit(record)} className="inline-flex items-center gap-1 rounded-lg border border-metro-border px-2.5 py-1.5 text-xs font-semibold text-metro-text disabled:opacity-50"><Pencil size={13}/> Editar</button>
            <button type="button" disabled={busy} onClick={() => void requestDelete(record)} className="inline-flex items-center gap-1 rounded-lg border border-red-700/60 px-2.5 py-1.5 text-xs font-semibold text-red-400 disabled:opacity-50"><Trash2 size={13}/> Eliminar</button>
          </div>
          {record.observacionesRrll?.trim() && <p className="mt-2 whitespace-pre-wrap text-xs text-metro-muted"><strong>RRLL:</strong> {record.observacionesRrll}</p>}
           {record.estado === 'pendiente' ? <div className="mt-3 flex gap-2">
            <button disabled={busy} onClick={() => { setResolution({ record, estado: 'propuesta' }); setReason(''); }} className="rounded-lg border border-emerald-600 px-3 py-1.5 text-xs font-semibold text-emerald-400 disabled:opacity-50">Elevar al Comité</button>
            <button disabled={busy} onClick={() => { setResolution({ record, estado: 'rechazada_rrll' }); setReason(''); }} className="rounded-lg border border-red-600 px-3 py-1.5 text-xs font-semibold text-red-400 disabled:opacity-50">Rechazar RRLL</button>
          </div> : record.estado === 'propuesta' ? <div className="mt-3 flex gap-2"><button disabled={busy} onClick={() => { setResolution({ record, estado: 'autorizada' }); setReason(''); }} className="rounded-lg border border-emerald-600 px-3 py-1.5 text-xs font-semibold text-emerald-400 disabled:opacity-50">Comité: aprobar</button><button disabled={busy} onClick={() => { setResolution({ record, estado: 'denegada' }); setReason(''); }} className="rounded-lg border border-red-600 px-3 py-1.5 text-xs font-semibold text-red-400 disabled:opacity-50">Comité: denegar</button></div> : <div className="mt-3 flex flex-wrap items-center gap-2">
            {(record.observacionesResolucion || record.motivoDenegacion) && <p className="w-full whitespace-pre-wrap text-xs text-metro-muted">{record.estado === 'denegada' ? 'Motivo' : 'Observaciones'}: {record.observacionesResolucion || record.motivoDenegacion}</p>}
            <span className="text-xs text-metro-muted">Comunicación: {record.comunicacion === 'confirmada' ? 'Envío confirmado' : record.comunicacion === 'borrador' ? 'Borrador preparado' : 'Pendiente'}</span>
            <button disabled={busy} onClick={() => void openDraft(record)} className="inline-flex items-center gap-1 rounded-lg border border-metro-border px-3 py-1.5 text-xs font-semibold text-metro-text disabled:opacity-50"><Mail size={14}/> Preparar correo en Outlook</button>
            {record.comunicacion !== 'confirmada' && <button disabled={busy} onClick={() => void act(() => setComunicacion(record.id, 'confirmada'))} className="rounded-lg border border-metro-border px-3 py-1.5 text-xs text-metro-text disabled:opacity-50">Confirmar envío manualmente</button>}
          </div>}
        </article>)}
                    </td></tr>}
                  </Fragment>)}
                </tbody>
              </table>
            </div>
            <div className="mt-2 flex items-center justify-between rounded-lg border border-metro-border px-3 py-2">
              <span className="text-xs text-metro-muted">{groupRecords.length} registros visibles</span>
              <div className="flex gap-2">
                {group.icon === 'history' && <button type="button" onClick={() => setShowHistory(false)} className="rounded-md border border-metro-border px-2 py-1 text-xs">Ocultar histórico</button>}
                <button type="button" onClick={() => setSelectedRecordId(groupRecords[0]?.id ?? null)} className="rounded-md border border-metro-border px-2 py-1 text-xs">Vista</button><button type="button" disabled={busy} onClick={() => void act(async () => { const warning = await syncActividadesExternasExcelBackup(useActividadesExternasStore.getState().records); return { ok: !warning, message: warning || 'Excel espejo actualizado.' }; })} className="inline-flex items-center gap-1 rounded-md border border-metro-border px-2 py-1 text-xs"><FileSpreadsheet size={13}/> Exportar Excel</button><button type="button" onClick={() => window.print()} className="inline-flex items-center gap-1 rounded-md border border-metro-border px-2 py-1 text-xs text-metro-text"><Printer size={13}/> Imprimir</button>
              </div>
            </div>
          </section>;
        })}
      </div>
    </div>
    {editing && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="presentation">
      <form role="dialog" aria-modal="true" aria-label="Editar actividad externa" className="w-full max-w-lg space-y-3 rounded-xl border border-metro-border bg-metro-panel p-5 text-metro-text" onSubmit={(event) => {
        event.preventDefault();
        void act(() => update(editing.id, {
          empleado: editing.empleado, nombre: editing.nombre, email: editing.email,
          actividad: editActivity, fechaSolicitud: editDate, remunerada: editPaid,
        }, editRrllNotes), () => setEditing(null));
      }}>
        <h3 className="font-bold">Editar actividad externa</h3>
        <p className="text-xs text-metro-muted">{editing.nombre} · Nº {editing.empleado} · {label(editing.estado)}</p>
        <label className="block text-xs font-semibold">Actividad externa
          <textarea required value={editActivity} onChange={(event) => setEditActivity(event.target.value)} rows={4} className="mt-1 w-full rounded-lg border border-metro-border bg-metro-surface p-2 text-sm text-metro-text"/>
        </label>
        <label className="block text-xs font-semibold">Fecha de solicitud
          <input required type="date" value={editDate} onChange={(event) => setEditDate(event.target.value)} className="mt-1 block rounded-lg border border-metro-border bg-metro-surface p-2 text-sm text-metro-text"/>
        </label>
        <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={editPaid} onChange={(event) => setEditPaid(event.target.checked)}/> Actividad remunerada</label>
        <label className="block text-xs font-semibold">Observaciones de RRLL
          <textarea value={editRrllNotes} onChange={(event) => setEditRrllNotes(event.target.value)} rows={3} className="mt-1 w-full rounded-lg border border-metro-border bg-metro-surface p-2 text-sm text-metro-text"/>
        </label>
        <p className="text-xs text-metro-muted">Se conservan la resolución del Comité, sus observaciones y el estado de comunicación. Si ya se comunicó, revisa si procede enviar una actualización.</p>
        <div className="flex justify-end gap-2">
          <button type="button" disabled={busy} onClick={() => setEditing(null)} className="rounded-lg border border-metro-border px-3 py-2 text-xs">Cancelar</button>
          <button type="submit" disabled={busy || !editActivity.trim() || !editDate} className="rounded-lg bg-red-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">Guardar cambios</button>
        </div>
      </form>
    </div>}
    {dialogNode}
    {resolution && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="presentation">
      <div role="dialog" aria-modal="true" aria-label="Resolver solicitud" className="w-full max-w-lg space-y-3 rounded-xl border border-metro-border bg-metro-panel p-5 text-metro-text">
        <h3 className="font-bold">{resolution.estado === 'propuesta' ? 'Elevar al Comité' : resolution.estado === 'rechazada_rrll' ? 'Rechazar en RRLL' : resolution.estado === 'autorizada' ? 'Aprobar en Comité' : 'Denegar en Comité'} solicitud de {resolution.record.nombre}</h3>
        <p className="text-xs text-metro-muted">{resolution.estado === 'propuesta' ? 'Puedes añadir observaciones de RRLL.' : resolution.estado === 'autorizada' ? 'Puedes indicar observaciones de aprobación.' : 'Indica el motivo del rechazo o denegación.'} Las observaciones se incorporarán al borrador de Outlook.</p>
        <label htmlFor="actividad-resolution-notes" className="block text-xs font-semibold">Observaciones {(resolution.estado === 'denegada' || resolution.estado === 'rechazada_rrll') ? '(obligatorias)' : '(opcionales)'}</label>
        <textarea id="actividad-resolution-notes" autoFocus value={reason} onChange={(event) => setReason(event.target.value)} rows={4} className="w-full rounded-lg border border-metro-border bg-metro-surface p-2 text-sm"/>
        <div className="flex justify-end gap-2"><button type="button" onClick={() => setResolution(null)} className="rounded-lg border border-metro-border px-3 py-2 text-xs">Cancelar</button>
          <button type="button" disabled={busy || ((resolution.estado === 'denegada' || resolution.estado === 'rechazada_rrll') && !reason.trim())} onClick={() => void act(() => resolve(resolution.record.id, resolution.estado, reason), () => setResolution(null))} className="rounded-lg bg-red-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">{resolution.estado === 'propuesta' ? 'Elevar al Comité' : resolution.estado === 'rechazada_rrll' ? 'Confirmar rechazo RRLL' : resolution.estado === 'autorizada' ? 'Confirmar aprobación Comité' : 'Confirmar denegación Comité'}</button>
        </div>
      </div>
    </div>}
  </section>;
}
