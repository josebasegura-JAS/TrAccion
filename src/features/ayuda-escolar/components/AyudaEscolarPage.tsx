import {
  FileCheck2,
  FolderOpen,
  GraduationCap,
  Mail,
  Search,
  UploadCloud,
  UsersRound,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { PageHeader } from '../../../components/ui/PageHeader';
import { useConfiguracionStore } from '../../configuracion/store/useConfiguracionStore';
import { useEmployeeStore } from '../../plantilla/store/useEmployeeStore';
import type { Employee } from '../../plantilla/domain/employee';
import {
  countSchoolHelpFiles,
  findSchoolHelpEmployeeCandidates,
  latestSchoolHelpRecord,
  normalizeSchoolHelpEmail,
  type SchoolHelpRecord,
} from '../domain/ayudaEscolar';
import { useAyudaEscolarStore } from '../store/useAyudaEscolarStore';

type PendingMessage = {
  fileName: string;
  buffer: ArrayBuffer;
  inspection: SchoolHelpInspection;
};

function formatDate(value: string): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('es-ES');
}

function compactEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function AyudaEscolarPage() {
  const employees = useEmployeeStore((state) => state.employees);
  const loadEmployees = useEmployeeStore((state) => state.load);
  const updateEmployee = useEmployeeStore((state) => state.updateWithConcurrencyCheck);
  const rutaAyudaEscolar = useConfiguracionStore((state) => state.rutaAyudaEscolar);
  const records = useAyudaEscolarStore((state) => state.records);
  const loadRecords = useAyudaEscolarStore((state) => state.load);
  const addRecord = useAyudaEscolarStore((state) => state.add);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<PendingMessage | null>(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [status, setStatus] = useState('');
  const [statusIsError, setStatusIsError] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    loadEmployees();
    loadRecords();
  }, [loadEmployees, loadRecords]);

  const activeEmployees = useMemo(
    () =>
      employees
        .filter((employee) => !employee.deletedAt)
        .sort((a, b) => a.nombreApellidos.localeCompare(b.nombreApellidos, 'es')),
    [employees],
  );

  const selectedEmployee = useMemo(
    () => activeEmployees.find((employee) => employee.empleado === selectedEmployeeId) ?? null,
    [activeEmployees, selectedEmployeeId],
  );

  const documentedEmployeeIds = useMemo(
    () => new Set(records.map((record) => record.empleado)),
    [records],
  );

  const tableRows = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return activeEmployees.filter((employee) => {
      if (!normalizedSearch) return true;
      return [employee.empleado, employee.nombreApellidos, employee.email]
        .join(' ')
        .toLowerCase()
        .includes(normalizedSearch);
    });
  }, [activeEmployees, search]);

  const inspectFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.msg')) {
      setStatusIsError(true);
      setStatus('Arrastra un correo de Outlook en formato .msg.');
      return;
    }
    const inspect = window.traccion?.inspectSchoolHelpMessage;
    if (!inspect) {
      setStatusIsError(true);
      setStatus('La lectura de correos de Ayuda escolar no está disponible en esta instalación.');
      return;
    }

    setIsBusy(true);
    setStatus('');
    try {
      const buffer = await file.arrayBuffer();
      const result = await inspect(file.name, buffer);
      if (!result.ok || !result.inspection) {
        setStatusIsError(true);
        setStatus(result.message || 'No se ha podido leer el correo.');
        return;
      }

      const inspection = result.inspection;
      const candidates = findSchoolHelpEmployeeCandidates(
        activeEmployees,
        inspection.senderName,
        inspection.senderEmail,
      );
      setPending({ fileName: file.name, buffer, inspection });
      setSelectedEmployeeId(candidates.length === 1 ? candidates[0].empleado : '');
      setStatusIsError(false);
      setStatus(
        candidates.length === 1
          ? 'Correo leído. Se ha identificado una persona de Plantilla.'
          : candidates.length > 1
            ? 'Correo leído, pero hay varias coincidencias. Selecciona la persona correcta.'
            : 'Correo leído. Selecciona la persona de Plantilla antes de archivar.',
      );
    } catch (error) {
      setStatusIsError(true);
      setStatus(error instanceof Error ? error.message : 'No se ha podido analizar el correo.');
    } finally {
      setIsBusy(false);
    }
  };

  const archivePending = async () => {
    if (!pending || !selectedEmployee) return;
    if (!rutaAyudaEscolar.trim()) {
      setStatusIsError(true);
      setStatus('Configura primero la carpeta en Ajustes → Ayuda escolar.');
      return;
    }
    if (!pending.inspection.attachments.length) {
      setStatusIsError(true);
      setStatus('El correo no contiene adjuntos.');
      return;
    }

    const senderEmail = normalizeSchoolHelpEmail(pending.inspection.senderEmail);
    const duplicateOwner = senderEmail
      ? activeEmployees.find(
          (employee) =>
            employee.empleado !== selectedEmployee.empleado &&
            normalizeSchoolHelpEmail(employee.email) === senderEmail,
        )
      : undefined;

    if (duplicateOwner) {
      setStatusIsError(true);
      setStatus(
        `El correo ${senderEmail} ya está asociado a ${duplicateOwner.nombreApellidos}. Revisa la persona seleccionada.`,
      );
      return;
    }

    const archive = window.traccion?.archiveSchoolHelpMessage;
    if (!archive) {
      setStatusIsError(true);
      setStatus('El archivado de Ayuda escolar no está disponible en esta instalación.');
      return;
    }

    setIsBusy(true);
    setStatus('');
    try {
      const result = await archive({
        fileName: pending.fileName,
        buffer: pending.buffer,
        basePath: rutaAyudaEscolar,
        employeeName: selectedEmployee.nombreApellidos,
      });
      if (!result.ok || !result.files?.length) {
        setStatusIsError(true);
        setStatus(result.message || 'No se ha guardado ningún adjunto.');
        return;
      }

      const archivedAt = new Date().toISOString();
      const record: SchoolHelpRecord = {
        id: `${selectedEmployee.empleado}-${Date.now().toString(36)}`,
        empleado: selectedEmployee.empleado,
        nombre: selectedEmployee.nombreApellidos,
        senderEmail,
        subject: pending.inspection.subject,
        receivedAt: pending.inspection.receivedAt,
        archivedAt,
        files: result.files,
      };

      const stored = await addRecord(record);
      if (!stored.ok) {
        setStatusIsError(true);
        setStatus(
          `Los adjuntos se han guardado, pero no se ha podido registrar el seguimiento: ${stored.message}`,
        );
        return;
      }

      let emailMessage = '';
      const currentEmail = compactEmail(selectedEmployee.email);
      if (senderEmail && !currentEmail) {
        const updated: Employee = { ...selectedEmployee, email: senderEmail };
        const emailResult = await updateEmployee(
          selectedEmployee.empleado,
          updated,
          JSON.stringify(selectedEmployee),
        );
        emailMessage = emailResult.ok
          ? ' El correo se ha incorporado a Plantilla.'
          : ` La documentación está archivada, pero el correo no se ha podido incorporar a Plantilla: ${emailResult.message}`;
      } else if (senderEmail && currentEmail && currentEmail !== senderEmail) {
        emailMessage =
          ` Plantilla ya tiene otro correo (${selectedEmployee.email}); no se ha sobrescrito.`;
      }

      setPending(null);
      setSelectedEmployeeId('');
      setStatusIsError(false);
      setStatus(`${result.files.length} archivo(s) archivado(s) correctamente.${emailMessage}`);
    } catch (error) {
      setStatusIsError(true);
      setStatus(error instanceof Error ? error.message : 'No se ha podido archivar la documentación.');
    } finally {
      setIsBusy(false);
    }
  };

  const documentedCount = documentedEmployeeIds.size;
  const pendingCount = Math.max(0, activeEmployees.length - documentedCount);
  const totalFiles = records.reduce((total, record) => total + record.files.length, 0);

  return (
    <section className="space-y-3" id="ayuda-escolar">
      <PageHeader
        helpSections={[
          {
            title: 'Flujo',
            content:
              'Arrastra un correo .msg de Outlook, comprueba la persona identificada y archiva sus adjuntos. El correo del remitente se aprende en Plantilla cuando la ficha aún no lo tiene.',
          },
        ]}
        helpSubtitle="Recepción, identificación y archivo de documentación de ayuda escolar."
        title="Ayuda escolar"
      />

      <div className="grid grid-cols-3 gap-2.5">
        <div className="rounded-2xl border border-sky-400/15 bg-metro-panel/55 p-3">
          <div className="flex items-center gap-2 text-sky-200"><UsersRound size={17} /><span className="text-xs font-bold">Personas</span></div>
          <p className="mt-2 text-2xl font-extrabold text-metro-text">{activeEmployees.length}</p>
        </div>
        <div className="rounded-2xl border border-emerald-400/15 bg-metro-panel/55 p-3">
          <div className="flex items-center gap-2 text-emerald-200"><FileCheck2 size={17} /><span className="text-xs font-bold">Documentación recibida</span></div>
          <p className="mt-2 text-2xl font-extrabold text-metro-text">{documentedCount}</p>
          <p className="text-[11px] text-metro-muted">{totalFiles} archivos</p>
        </div>
        <div className="rounded-2xl border border-amber-400/15 bg-metro-panel/55 p-3">
          <div className="flex items-center gap-2 text-amber-200"><GraduationCap size={17} /><span className="text-xs font-bold">Pendientes</span></div>
          <p className="mt-2 text-2xl font-extrabold text-metro-text">{pendingCount}</p>
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <section className="rounded-2xl border border-metro-border/80 bg-metro-panel/55 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-extrabold text-metro-text">Entrada desde Outlook</h3>
              <p className="mt-1 text-xs text-metro-muted">Arrastra aquí un correo guardado como .msg.</p>
            </div>
            <button
              className="inline-flex items-center gap-2 rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-xs font-bold text-metro-text hover:border-sky-400/40"
              onClick={() => fileInputRef.current?.click()}
              type="button"
            >
              <Mail size={14} /> Seleccionar .msg
            </button>
          </div>

          <input
            accept=".msg"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) void inspectFile(file);
            }}
            ref={fileInputRef}
            type="file"
          />

          <div
            className="grid min-h-36 place-items-center rounded-xl border border-dashed border-sky-400/30 bg-sky-500/[0.04] p-5 text-center"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const file = event.dataTransfer.files?.[0];
              if (file) void inspectFile(file);
            }}
          >
            <div>
              <UploadCloud className="mx-auto text-sky-300" size={30} />
              <p className="mt-2 text-sm font-bold text-metro-text">
                {isBusy ? 'Procesando…' : 'Suelta aquí el correo de Outlook'}
              </p>
              <p className="mt-1 text-xs text-metro-muted">Se leerán remitente, fecha y adjuntos.</p>
            </div>
          </div>

          <div className="mt-3 flex items-start gap-2 rounded-lg border border-metro-border bg-metro-surface/60 px-3 py-2 text-xs text-metro-muted">
            <FolderOpen className="mt-0.5 shrink-0" size={14} />
            <div className="min-w-0">
              <span className="font-bold text-metro-text">Carpeta:</span>{' '}
              <span className="break-all">{rutaAyudaEscolar || 'Sin configurar — Ajustes → Ayuda escolar'}</span>
            </div>
          </div>

          {status ? (
            <div className={`mt-3 rounded-lg border px-3 py-2 text-xs font-semibold ${
              statusIsError
                ? 'border-red-400/30 bg-red-500/10 text-red-200'
                : 'border-emerald-400/25 bg-emerald-500/10 text-emerald-200'
            }`}>
              {status}
            </div>
          ) : null}
        </section>

        <section className="rounded-2xl border border-metro-border/80 bg-metro-panel/55 p-4">
          <h3 className="text-sm font-extrabold text-metro-text">Correo preparado</h3>
          {!pending ? (
            <div className="mt-3 grid min-h-48 place-items-center rounded-xl border border-metro-border bg-metro-surface/35 text-center text-sm text-metro-muted">
              Arrastra un correo para identificar a la persona y revisar sus adjuntos.
            </div>
          ) : (
            <div className="mt-3 space-y-3">
              <div className="grid gap-2 rounded-xl border border-metro-border bg-metro-surface/55 p-3 text-xs sm:grid-cols-2">
                <div><span className="font-bold text-metro-text">Remitente:</span> {pending.inspection.senderName || '—'}</div>
                <div><span className="font-bold text-metro-text">Email:</span> {pending.inspection.senderEmail || '—'}</div>
                <div><span className="font-bold text-metro-text">Fecha:</span> {formatDate(pending.inspection.receivedAt)}</div>
                <div><span className="font-bold text-metro-text">Adjuntos:</span> {pending.inspection.attachments.length}</div>
                <div className="sm:col-span-2"><span className="font-bold text-metro-text">Asunto:</span> {pending.inspection.subject || '—'}</div>
              </div>

              <label className="block text-xs font-bold text-metro-muted">
                Persona de Plantilla
                <select
                  className="mt-1 w-full rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-sm text-metro-text outline-none focus:border-sky-400"
                  onChange={(event) => setSelectedEmployeeId(event.target.value)}
                  value={selectedEmployeeId}
                >
                  <option value="">Seleccionar persona…</option>
                  {activeEmployees.map((employee) => (
                    <option key={employee.empleado} value={employee.empleado}>
                      {employee.empleado} · {employee.nombreApellidos}
                    </option>
                  ))}
                </select>
              </label>

              {pending.inspection.attachments.length ? (
                <div className="rounded-xl border border-metro-border bg-metro-surface/40 p-3">
                  <p className="mb-2 text-xs font-bold text-metro-text">Adjuntos detectados</p>
                  <div className="space-y-1">
                    {pending.inspection.attachments.map((attachment, index) => (
                      <div className="flex items-center justify-between gap-3 text-xs text-metro-muted" key={`${attachment.name}-${index}`}>
                        <span className="truncate">{attachment.name}</span>
                        <span className="shrink-0">{Math.max(1, Math.round(attachment.size / 1024))} KB</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <button
                className="w-full rounded-lg bg-metro-red px-4 py-2.5 text-sm font-bold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isBusy || !selectedEmployeeId || !pending.inspection.attachments.length}
                onClick={() => void archivePending()}
                type="button"
              >
                {isBusy ? 'Archivando…' : 'Archivar documentación'}
              </button>
            </div>
          )}
        </section>
      </div>

      <section className="rounded-2xl border border-metro-border/80 bg-metro-panel/55 p-3">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-extrabold text-metro-text">Seguimiento</h3>
            <p className="mt-0.5 text-xs text-metro-muted">Estado de documentación por persona de Plantilla.</p>
          </div>
          <div className="relative min-w-[280px]">
            <Search className="absolute left-3 top-2.5 text-metro-muted" size={14} />
            <input
              className="w-full rounded-lg border border-metro-border bg-metro-surface py-2 pl-9 pr-3 text-xs text-metro-text outline-none focus:border-sky-400"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar nº, persona o email…"
              value={search}
            />
          </div>
        </div>

        <div className="overflow-auto rounded-xl border border-metro-border">
          <table className="min-w-full text-left text-xs">
            <thead className="bg-metro-surface text-metro-muted">
              <tr>
                <th className="px-3 py-2 font-bold">Nº empleado</th>
                <th className="px-3 py-2 font-bold">Persona</th>
                <th className="px-3 py-2 font-bold">Email</th>
                <th className="px-3 py-2 font-bold">Documentación enviada</th>
                <th className="px-3 py-2 font-bold">Última documentación</th>
                <th className="px-3 py-2 text-right font-bold">Archivos</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.map((employee) => {
                const latest = latestSchoolHelpRecord(records, employee.empleado);
                const fileCount = countSchoolHelpFiles(records, employee.empleado);
                return (
                  <tr className="border-t border-metro-border/70 hover:bg-white/[0.02]" key={employee.empleado}>
                    <td className="px-3 py-2 font-bold text-metro-text">{employee.empleado}</td>
                    <td className="px-3 py-2 text-metro-text">{employee.nombreApellidos}</td>
                    <td className="px-3 py-2 text-metro-muted">{employee.email || '—'}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${
                        latest
                          ? 'bg-emerald-500/10 text-emerald-200'
                          : 'bg-amber-500/10 text-amber-200'
                      }`}>
                        {latest ? 'Sí' : 'Pendiente'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-metro-muted">{latest ? formatDate(latest.receivedAt || latest.archivedAt) : '—'}</td>
                    <td className="px-3 py-2 text-right font-bold text-metro-text">{fileCount}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
