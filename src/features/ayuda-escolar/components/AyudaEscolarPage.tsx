import { FileCheck2, FolderOpen, Inbox, Paperclip, Search, UsersRound, type LucideIcon } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useConfiguracionStore } from '../../configuracion/store/useConfiguracionStore';
import { useEmployeeStore } from '../../plantilla/store/useEmployeeStore';
import {
  findEmployeeCandidates,
  normalizeEmail,
  type OutlookMessageInspection,
  type SchoolHelpArchiveResult,
} from '../domain/ayudaEscolar';
import { useAyudaEscolarStore } from '../store/useAyudaEscolarStore';

const buttonClass =
  'inline-flex items-center justify-center gap-2 rounded-lg bg-metro-red px-3 py-2 text-sm font-semibold text-white transition hover:bg-metro-dark disabled:cursor-not-allowed disabled:opacity-50';

export function AyudaEscolarPage() {
  const employees = useEmployeeStore((state) => state.employees);
  const loadEmployees = useEmployeeStore((state) => state.load);
  const updateEmployeeEmail = useEmployeeStore((state) => state.updateEmail);
  const records = useAyudaEscolarStore((state) => state.records);
  const loadRecords = useAyudaEscolarStore((state) => state.load);
  const addRecord = useAyudaEscolarStore((state) => state.add);
  const basePath = useConfiguracionStore((state) => state.rutaAyudaEscolar);
  const loadConfig = useConfiguracionStore((state) => state.load);
  const [messageFile, setMessageFile] = useState<File | null>(null);
  const [inspection, setInspection] = useState<OutlookMessageInspection | null>(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [sentOnBehalfOfAnother, setSentOnBehalfOfAnother] = useState(false);
  const [status, setStatus] = useState('');
  const [isError, setIsError] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [isDropActive, setIsDropActive] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    loadEmployees();
    loadRecords();
    loadConfig();
  }, [loadConfig, loadEmployees, loadRecords]);

  const visibleEmployees = useMemo(() => employees.filter((employee) => !employee.deletedAt), [employees]);
  const alphabeticEmployees = useMemo(
    () => [...visibleEmployees].sort((first, second) =>
      first.nombreApellidos.localeCompare(second.nombreApellidos, 'es', {
        sensitivity: 'base',
        numeric: true,
      }),
    ),
    [visibleEmployees],
  );
  const candidates = useMemo(
    () => (inspection && !sentOnBehalfOfAnother ? findEmployeeCandidates(inspection.senderName, visibleEmployees, inspection.senderEmail) : []),
    [inspection, sentOnBehalfOfAnother, visibleEmployees],
  );

  useEffect(() => {
    if (candidates.length === 1) setSelectedEmployeeId(candidates[0].empleado);
    else if (candidates.length !== 1) setSelectedEmployeeId('');
  }, [candidates]);

  const selectedEmployee = useMemo(
    () => visibleEmployees.find((employee) => employee.empleado === selectedEmployeeId) ?? null,
    [selectedEmployeeId, visibleEmployees],
  );
  const incomingEmail = normalizeEmail(inspection?.senderEmail ?? '');
  const selectedEmail = normalizeEmail(selectedEmployee?.email ?? '');
  const emailOwner = useMemo(
    () => incomingEmail ? visibleEmployees.find((employee) => normalizeEmail(employee.email ?? '') === incomingEmail) ?? null : null,
    [incomingEmail, visibleEmployees],
  );
  const emailConflict = Boolean(!sentOnBehalfOfAnother && incomingEmail && selectedEmployee && selectedEmail && selectedEmail !== incomingEmail);
  const duplicateEmailConflict = Boolean(!sentOnBehalfOfAnother && emailOwner && selectedEmployee && emailOwner.empleado !== selectedEmployee.empleado);
  const willLearnEmail = Boolean(!sentOnBehalfOfAnother && incomingEmail && selectedEmployee && !selectedEmail && !duplicateEmailConflict);

  const employeeRows = useMemo(() => {
    const latestByEmployee = new Map<string, (typeof records)[number]>();
    records.forEach((record) => {
      if (!latestByEmployee.has(record.employeeId)) latestByEmployee.set(record.employeeId, record);
    });
    const normalizedQuery = query.trim().toLowerCase();
    return visibleEmployees
      .filter((employee) => latestByEmployee.has(employee.empleado))
      .filter((employee) =>
        !normalizedQuery ||
        employee.empleado.toLowerCase().includes(normalizedQuery) ||
        employee.nombreApellidos.toLowerCase().includes(normalizedQuery) ||
        (employee.email ?? '').toLowerCase().includes(normalizedQuery),
      )
      .map((employee) => ({ employee, latest: latestByEmployee.get(employee.empleado), count: records.filter((record) => record.employeeId === employee.empleado).reduce((sum, record) => sum + record.files.length, 0) }));
  }, [query, records, visibleEmployees]);

  const inspectFile = async (file: File) => {
    setMessageFile(file);
    setInspection(null);
    setSelectedEmployeeId('');
    setSentOnBehalfOfAnother(false);
    if (!/\.msg$/i.test(file.name)) {
      setStatus('El archivo debe ser un correo de Outlook en formato .msg.');
      setIsError(true);
      return;
    }
    if (!window.traccion?.inspectSchoolHelpMessage) {
      setStatus('La lectura de correos solo está disponible en la aplicación de escritorio.');
      setIsError(true);
      return;
    }
    setIsBusy(true);
    setStatus('Leyendo correo y adjuntos…');
    setIsError(false);
    try {
      const result = await window.traccion.inspectSchoolHelpMessage(file.name, await file.arrayBuffer());
      if (!result.ok || !result.inspection) throw new Error(result.message);
      setInspection(result.inspection);
      setStatus(result.inspection.attachments.length ? 'Correo leído. Revisa la persona identificada antes de archivar.' : 'El correo no contiene adjuntos.');
      setIsError(result.inspection.attachments.length === 0);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'No se ha podido leer el correo.');
      setIsError(true);
    } finally {
      setIsBusy(false);
    }
  };

  const archive = async () => {
    if (!messageFile || !inspection || !selectedEmployeeId || !basePath) return;
    const employee = selectedEmployee;
    if (!employee || !window.traccion?.archiveSchoolHelpMessage) return;
    if (duplicateEmailConflict) {
      setStatus(`El correo ${inspection.senderEmail} ya está asociado en Plantilla a ${emailOwner?.nombreApellidos}. Revisa la persona antes de continuar.`);
      setIsError(true);
      return;
    }
    setIsBusy(true);
    setStatus('Guardando documentación…');
    setIsError(false);
    try {
      const result: SchoolHelpArchiveResult = await window.traccion.archiveSchoolHelpMessage({
        fileName: messageFile.name,
        buffer: await messageFile.arrayBuffer(),
        basePath,
        employeeName: employee.nombreApellidos,
      });
      if (!result.ok || !result.files) throw new Error(result.message);
      addRecord({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        employeeId: employee.empleado,
        employeeName: employee.nombreApellidos,
        senderName: inspection.senderName,
        senderEmail: inspection.senderEmail,
        sentOnBehalfOfAnother,
        subject: inspection.subject,
        receivedAt: inspection.receivedAt,
        archivedAt: new Date().toISOString(),
        files: result.files,
      });
      let learnedSuffix = '';
      if (willLearnEmail) {
        const emailResult = await updateEmployeeEmail(employee.empleado, incomingEmail);
        learnedSuffix = emailResult.ok ? ` Correo ${incomingEmail} incorporado a Plantilla.` : ` ${emailResult.message}`;
      }
      const conflictSuffix = emailConflict ? ` El correo de Plantilla (${employee.email}) se mantiene sin cambios.` : '';
      setStatus(`${result.files.length} archivo${result.files.length === 1 ? '' : 's'} guardado${result.files.length === 1 ? '' : 's'} correctamente.${learnedSuffix}${conflictSuffix}`);
      setMessageFile(null);
      setInspection(null);
      setSelectedEmployeeId('');
      setSentOnBehalfOfAnother(false);
      setIsError(false);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'No se ha podido archivar la documentación.');
      setIsError(true);
    } finally {
      setIsBusy(false);
    }
  };

  const documentedPeople = new Set(records.map((record) => record.employeeId)).size;
  const pendingPeople = Math.max(0, visibleEmployees.length - documentedPeople);

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-metro-border bg-metro-surface p-4 shadow-card">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-metro-red">Personas</p>
            <h2 className="text-2xl font-bold text-metro-text">Ayuda escolar</h2>
            <p className="mt-1 text-sm text-metro-muted">Recibe correos de Outlook, identifica a la persona de Plantilla y archiva automáticamente sus adjuntos.</p>
          </div>
          <div className="text-right text-xs text-metro-muted">Carpeta: <span className="font-semibold text-metro-text">{basePath || 'Sin configurar'}</span></div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {([
          { label: 'Personas', value: visibleEmployees.length, Icon: UsersRound },
          { label: 'Documentación recibida', value: documentedPeople, Icon: FileCheck2 },
          { label: 'Pendientes', value: pendingPeople, Icon: Inbox },
        ] satisfies Array<{ label: string; value: number; Icon: LucideIcon }>).map(({ label, value, Icon }) => (
          <div className="rounded-2xl border border-metro-border bg-metro-surface p-4 shadow-card" key={label}>
            <div className="flex items-center justify-between"><span className="text-xs font-semibold uppercase tracking-wide text-metro-muted">{label}</span><Icon className="text-metro-red" size={18} /></div>
            <p className="mt-2 text-2xl font-bold text-metro-text">{value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-metro-border bg-metro-surface p-4 shadow-card">
        <div
          className={`flex min-h-[135px] flex-col items-center justify-center rounded-2xl border-2 border-dashed p-4 text-center transition ${isDropActive ? 'border-metro-red bg-metro-red/10' : 'border-metro-border bg-metro-panel'}`}
          onDragEnter={(event) => { event.preventDefault(); setIsDropActive(true); }}
          onDragLeave={(event) => { event.preventDefault(); setIsDropActive(false); }}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault(); setIsDropActive(false);
            const file = Array.from(event.dataTransfer.files || []).find((item) => /\.msg$/i.test(item.name));
            if (file) void inspectFile(file);
            else { setStatus('Arrastra un correo .msg de Outlook. Si Outlook no entrega el archivo directamente, guárdalo primero como .msg.'); setIsError(true); }
          }}
        >
          <Paperclip className="mb-2 text-metro-red" size={26} />
          <p className="font-semibold text-metro-text">Arrastra aquí un correo de Outlook 2019</p>
          <p className="mt-1 text-xs text-metro-muted">Se leerán remitente y adjuntos. No se guardará nada hasta confirmar la persona.</p>
          <button className="mt-3 inline-flex items-center gap-2 rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-sm font-semibold text-metro-text hover:border-metro-red" onClick={() => inputRef.current?.click()} type="button"><FolderOpen size={15}/> Seleccionar .msg</button>
          <input ref={inputRef} className="hidden" accept=".msg" type="file" onChange={(event) => { const file = event.target.files?.[0]; if (file) void inspectFile(file); event.currentTarget.value = ''; }} />
        </div>

        {inspection && (
          <div className="mt-4 grid gap-4 rounded-xl border border-metro-border bg-metro-panel p-4 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
            <div><p className="text-xs font-semibold uppercase text-metro-muted">Remitente detectado</p><p className="mt-1 font-semibold text-metro-text">{inspection.senderName || 'Sin nombre detectado'}</p><p className="text-xs text-metro-muted">{inspection.senderEmail}</p></div>
            <div>
              <label className="text-xs font-semibold text-metro-muted">Persona de Plantilla
                <select className="mt-1 w-full rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-sm text-metro-text outline-none focus:border-metro-red" value={selectedEmployeeId} onChange={(event) => setSelectedEmployeeId(event.target.value)}>
                  <option value="">Seleccionar persona…</option>
                  {alphabeticEmployees.map((employee) => <option key={employee.empleado} value={employee.empleado}>{employee.empleado} · {employee.nombreApellidos}</option>)}
                </select>
              </label>
              <label className="mt-2 flex cursor-pointer items-start gap-2 rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-xs text-metro-text">
                <input
                  className="mt-0.5 h-4 w-4 accent-metro-red"
                  checked={sentOnBehalfOfAnother}
                  onChange={(event) => {
                    const checked = event.target.checked;
                    setSentOnBehalfOfAnother(checked);
                    if (checked) setSelectedEmployeeId('');
                  }}
                  type="checkbox"
                />
                <span>
                  <span className="font-semibold">Envía en nombre de otra persona</span>
                  <span className="mt-0.5 block text-[11px] text-metro-muted">El email del remitente no se incorporará ni modificará en Plantilla. Los archivos se guardarán con el nombre de la persona seleccionada.</span>
                </span>
              </label>
              {candidates.length > 1 && !selectedEmployeeId && <span className="mt-1 block text-[11px] text-amber-600">Hay varias coincidencias posibles. Selecciona manualmente.</span>}
              {sentOnBehalfOfAnother && !selectedEmployeeId && <span className="mt-1 block text-[11px] text-amber-600">Selecciona la persona a la que corresponde realmente la documentación.</span>}
              {willLearnEmail && <span className="mt-1 block text-[11px] text-emerald-600">Al archivar se añadirá {incomingEmail} a la ficha de Plantilla.</span>}
              {emailConflict && <span className="mt-1 block text-[11px] text-amber-600">La ficha ya contiene {selectedEmployee?.email}. No se sobrescribirá automáticamente.</span>}
              {duplicateEmailConflict && <span className="mt-1 block text-[11px] text-red-600">Este correo ya pertenece a {emailOwner?.nombreApellidos}. Revisa la selección.</span>}
            </div>
            <button className={buttonClass} disabled={isBusy || !basePath || !selectedEmployeeId || inspection.attachments.length === 0 || duplicateEmailConflict} onClick={() => void archive()} type="button"><FileCheck2 size={16}/> Archivar documentación</button>
            <div className="lg:col-span-3 text-xs text-metro-muted">Asunto: <span className="font-medium text-metro-text">{inspection.subject || 'Sin asunto'}</span> · Adjuntos: <span className="font-medium text-metro-text">{inspection.attachments.length}</span>{!basePath && <span className="ml-2 font-semibold text-metro-red">Configura primero la carpeta en Ajustes.</span>}</div>
          </div>
        )}
        {status && <p className={`mt-3 text-xs font-semibold ${isError ? 'text-red-600' : 'text-emerald-600'}`}>{status}</p>}
      </div>

      <div className="rounded-2xl border border-metro-border bg-metro-surface p-4 shadow-card">
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div><h3 className="font-bold text-metro-text">Seguimiento de documentación</h3><p className="text-xs text-metro-muted">El estado se calcula a partir de la documentación archivada.</p></div>
          <div className="relative w-full sm:w-72"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-metro-muted" size={15}/><input className="w-full rounded-lg border border-metro-border bg-metro-panel py-2 pl-9 pr-3 text-sm text-metro-text outline-none focus:border-metro-red" placeholder="Buscar persona o nº empleado" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
        </div>
        <div className="overflow-x-auto rounded-xl border border-metro-border">
          <table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-metro-panel text-xs uppercase tracking-wide text-metro-muted"><tr><th className="px-3 py-2">Nº empleado</th><th className="px-3 py-2">Persona</th><th className="px-3 py-2">Documentación enviada</th><th className="px-3 py-2">Última documentación</th><th className="px-3 py-2 text-right">Archivos</th></tr></thead>
            <tbody>{employeeRows.map(({ employee, latest, count }) => <tr className="border-t border-metro-border" key={employee.empleado}><td className="px-3 py-2 font-semibold text-metro-text">{employee.empleado}</td><td className="px-3 py-2 text-metro-text">{employee.nombreApellidos}</td><td className="px-3 py-2"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${latest ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>{latest ? 'Sí' : 'No'}</span></td><td className="px-3 py-2 text-metro-muted">{latest ? new Date(latest.archivedAt).toLocaleDateString('es-ES') : '—'}</td><td className="px-3 py-2 text-right font-semibold text-metro-text">{count}</td></tr>)}</tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
