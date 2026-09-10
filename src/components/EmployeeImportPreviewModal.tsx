import { AlertTriangle, CheckCircle2, FileSpreadsheet, UserMinus, UserPlus } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import {
  EMPLOYEE_FIELDS,
  type Employee,
  type EmployeeDraft,
  type EmployeeField,
} from '../features/plantilla/domain/employee';
import type { EmployeeImportConflictResolution } from '../features/plantilla/store/useEmployeeStore';
import {
  previewToEmployeeImport,
  type EmployeeImportPreview,
} from '../features/plantilla/domain/importExcel';
import { ActionButton } from './ui/ActionButton';
import { ModalBody, ModalFooter, ModalHeader, ModalShell, ModalTitle } from './ui/ModalShell';
import { ModalCloseButton } from './ui/ModalCloseButton';

const FIELD_LABELS: Record<EmployeeField, string> = {
  empleado: 'Empleado',
  nombreApellidos: 'Nombre y apellidos',
  puestoNomina: 'Puesto nómina',
  puestoOrganizativo: 'Puesto organizativo',
  puestoEus: 'Puesto EUS',
  residencia: 'Residencia',
  unidad: 'Unidad',
  nivelRetributivo: 'Nivel retributivo',
  direccionOrganizativa: 'Dirección organizativa',
  antiguedadPuesto: 'Antigüedad puesto',
  sexo: 'Sexo',
  calle: 'Calle',
  numero: 'Número',
  piso: 'Piso',
  codigoPostal: 'Código postal',
  poblacion: 'Población',
  provincia: 'Provincia',
  nif: 'NIF',
};

interface EmployeeImportPreviewModalProps {
  employees: Employee[];
  fileName: string;
  onClose: () => void;
  onImport: (mapping: Array<EmployeeField | null>, conflictResolution?: EmployeeImportConflictResolution) => Promise<void>;
  preview: EmployeeImportPreview;
}

interface EmployeeFieldChange {
  field: EmployeeField;
  previous: string;
  next: string;
}

interface EmployeeChangePreview {
  employee: EmployeeDraft;
  changes: EmployeeFieldChange[];
}

export function EmployeeImportPreviewModal(props: EmployeeImportPreviewModalProps) {
  if (props.preview.sourceProfile === 'zerkos') {
    return <ZerkosImportPreviewModal {...props} />;
  }

  return <GenericImportPreviewModal {...props} />;
}

function ZerkosImportPreviewModal({
  employees,
  fileName,
  onClose,
  onImport,
  preview,
}: EmployeeImportPreviewModalProps) {
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState('');
  const [conflictResolution, setConflictResolution] = useState<EmployeeImportConflictResolution>({});
  const importData = useMemo(
    () => previewToEmployeeImport(preview, preview.defaultMapping),
    [preview],
  );

  const summary = useMemo(() => {
    const existingById = new Map(employees.map((employee) => [employee.empleado.trim(), employee]));
    const importedIds = new Set(importData.drafts.map((draft) => draft.empleado.trim()));
    const importedFields = importData.importedFields.filter((field) => field !== 'empleado');
    const created: EmployeeDraft[] = [];
    const reactivated: EmployeeChangePreview[] = [];
    const modified: EmployeeChangePreview[] = [];
    let unchanged = 0;

    importData.drafts.forEach((draft) => {
      const previous = existingById.get(draft.empleado.trim());
      if (!previous) {
        created.push(draft);
        return;
      }
      const changes = importedFields
        .map((field): EmployeeFieldChange | null => {
          const previousValue = previous[field].trim();
          const nextValue = draft[field].trim();
          return previousValue === nextValue
            ? null
            : { field, previous: previousValue, next: nextValue };
        })
        .filter((change): change is EmployeeFieldChange => change !== null);

      if (previous.deletedAt) {
        reactivated.push({ employee: draft, changes });
        return;
      }

      const activeChanges = changes;

      if (activeChanges.length > 0) {
        modified.push({ employee: draft, changes: activeChanges });
      } else {
        unchanged += 1;
      }
    });

    const deactivated = employees.filter(
      (employee) => !employee.deletedAt && !importedIds.has(employee.empleado.trim()),
    );

    return { created, reactivated, modified, deactivated, unchanged };
  }, [employees, importData]);

  const allConflicts = useMemo(
    () => [...summary.modified, ...summary.reactivated].flatMap(({ employee, changes }) =>
      changes.map((change) => ({ employeeId: employee.empleado, field: change.field })),
    ),
    [summary.modified, summary.reactivated],
  );

  const conflictKey = (employeeId: string, field: EmployeeField) => `${employeeId}::${field}`;
  const resolutionFor = (employeeId: string, field: EmployeeField) =>
    conflictResolution[conflictKey(employeeId, field)] ?? 'keep';
  const setResolution = (employeeId: string, field: EmployeeField, resolution: 'keep' | 'source') => {
    setConflictResolution((current) => ({ ...current, [conflictKey(employeeId, field)]: resolution }));
  };
  const setAllResolutions = (resolution: 'keep' | 'source') => {
    setConflictResolution(Object.fromEntries(allConflicts.map(({ employeeId, field }) => [conflictKey(employeeId, field), resolution])));
  };

  const hasCriticalIssues = preview.criticalIssues.length > 0;
  const canImport = importData.drafts.length > 0 && !hasCriticalIssues && !isImporting;

  const handleImport = async () => {
    if (!canImport) return;
    setIsImporting(true);
    setError('');
    try {
      await onImport(preview.defaultMapping, conflictResolution);
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : 'No se ha podido importar la plantilla.');
      setIsImporting(false);
    }
  };

  return (
    <ModalShell labelledBy="plantilla-import-preview-title" maxWidthClassName="max-w-5xl" onClose={onClose}>
      <ModalHeader>
        <ModalTitle
          id="plantilla-import-preview-title"
          subtitle="Zerkos se ha reconocido automáticamente. Revisa los cambios antes de sincronizar Plantilla."
        >
          Sincronizar Plantilla desde Zerkos
        </ModalTitle>
        <ModalCloseButton onClick={onClose} />
      </ModalHeader>

      <ModalBody className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-metro-border bg-metro-panel px-3 py-2 text-xs text-metro-muted">
          <FileSpreadsheet size={16} className="text-emerald-300" />
          <span className="max-w-[360px] truncate font-semibold text-metro-text" title={fileName}>{fileName}</span>
          <span>{preview.sourceRowCount} personas en el fichero</span>
          <span>·</span>
          <span>{importData.importedFields.length} campos gestionados automáticamente</span>
          <span>·</span>
          <span>El resto de columnas de Zerkos se ignoran</span>
        </div>

        <div className="grid gap-2 sm:grid-cols-5">
          <SummaryCard label="Sin cambios" value={summary.unchanged} />
          <SummaryCard label="Modificadas" value={summary.modified.length} />
          <SummaryCard label="Nuevas" value={summary.created.length} />
          <SummaryCard label="Reactivadas" value={summary.reactivated.length} />
          <SummaryCard label="Bajas" value={summary.deactivated.length} warning={summary.deactivated.length > 0} />
        </div>

        {hasCriticalIssues ? (
          <div className="rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-xs text-red-100">
            <div className="mb-1 flex items-center gap-2 font-bold"><AlertTriangle size={16} /> Incidencias que impiden importar</div>
            <ul className="list-disc space-y-1 pl-5">
              {preview.criticalIssues.map((issue) => <li key={issue}>{issue}</li>)}
            </ul>
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-lg border border-emerald-400/25 bg-emerald-400/10 px-3 py-2 text-xs text-emerald-100">
            <CheckCircle2 size={16} /> Fichero válido. No se han detectado números de empleado duplicados ni filas sin identificador.
          </div>
        )}

        {allConflicts.length > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-metro-border bg-metro-panel px-3 py-2">
            <span className="text-xs text-metro-muted">Las diferencias conservan por defecto el dato actual de TrAccion.</span>
            <div className="flex flex-wrap gap-2">
              <ActionButton iconOnly={false} onClick={() => setAllResolutions('keep')} size="sm" variant="secondary">Mantener todos los actuales</ActionButton>
              <ActionButton iconOnly={false} onClick={() => setAllResolutions('source')} size="sm" variant="secondary">Usar todos los de Zerkos</ActionButton>
            </div>
          </div>
        ) : null}

        <div className="grid gap-2 lg:grid-cols-2">
          <PreviewDetails
            title="Cambios detectados"
            count={summary.modified.length}
            emptyText="No hay personas con cambios en los campos gestionados por Zerkos."
          >
            {summary.modified.map(({ employee, changes }) => (
              <div className="border-b border-metro-border/60 py-2 last:border-b-0" key={employee.empleado}>
                <div className="text-xs font-bold text-metro-text">{employee.empleado} · {employee.nombreApellidos}</div>
                <div className="mt-1 space-y-0.5 text-[11px] text-metro-muted">
                  {changes.map((change) => (
                    <ConflictRow
                      change={change}
                      employeeId={employee.empleado}
                      key={change.field}
                      onChange={setResolution}
                      resolution={resolutionFor(employee.empleado, change.field)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </PreviewDetails>

          <PreviewDetails
            title="Nuevas personas"
            count={summary.created.length}
            emptyText="No hay nuevas altas."
            icon={<UserPlus size={14} />}
          >
            {summary.created.map((employee) => (
              <PersonRow employee={employee} key={employee.empleado} />
            ))}
          </PreviewDetails>

          <PreviewDetails
            title="Personas que se reactivarán"
            count={summary.reactivated.length}
            emptyText="No hay personas previamente dadas de baja que reaparezcan en Zerkos."
          >
            {summary.reactivated.map(({ employee, changes }) => (
              <div className="border-b border-metro-border/60 py-2 last:border-b-0" key={employee.empleado}>
                <div className="text-xs font-bold text-metro-text">{employee.empleado} · {employee.nombreApellidos}</div>
                {changes.length > 0 ? (
                  <div className="mt-1 space-y-1">
                    {changes.map((change) => (
                      <ConflictRow
                        change={change}
                        employeeId={employee.empleado}
                        key={change.field}
                        onChange={setResolution}
                        resolution={resolutionFor(employee.empleado, change.field)}
                      />
                    ))}
                  </div>
                ) : <div className="mt-1 text-[11px] text-metro-muted">Sin diferencias de datos; solo se reactivará.</div>}
              </div>
            ))}
          </PreviewDetails>

          <PreviewDetails
            title="Bajas detectadas"
            count={summary.deactivated.length}
            emptyText="Todas las personas activas de TrAccion siguen apareciendo en Zerkos."
            icon={<UserMinus size={14} />}
            warning={summary.deactivated.length > 0}
          >
            {summary.deactivated.map((employee) => (
              <div className="border-b border-metro-border/60 py-1.5 text-xs last:border-b-0" key={employee.empleado}>
                <span className="font-bold text-metro-text">{employee.empleado}</span>
                <span className="text-metro-muted"> · {employee.nombreApellidos}</span>
              </div>
            ))}
          </PreviewDetails>
        </div>

        {summary.deactivated.length > 0 ? (
          <div className="flex items-start gap-2 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-100">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <span>
              Al confirmar, estas {summary.deactivated.length} persona(s) se darán de baja lógicamente en Plantilla porque ya no aparecen en Zerkos. Sus históricos no se eliminan.
            </span>
          </div>
        ) : null}

        {error ? (
          <div className="rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-xs font-semibold text-red-200">
            {error}
          </div>
        ) : null}
      </ModalBody>

      <ModalFooter className="justify-between">
        <span className="text-xs text-metro-muted">
          Puesto EUS, antigüedad en puesto y otros datos propios de TrAccion se conservan.
        </span>
        <div className="flex items-center gap-2">
          <ActionButton iconOnly={false} onClick={onClose} size="sm" variant="secondary">Cancelar</ActionButton>
          <ActionButton disabled={!canImport} iconOnly={false} onClick={() => void handleImport()} size="sm" variant="import">
            {isImporting ? 'Sincronizando…' : 'Importar y actualizar plantilla'}
          </ActionButton>
        </div>
      </ModalFooter>
    </ModalShell>
  );
}

function ConflictRow({
  change,
  employeeId,
  onChange,
  resolution,
}: {
  change: EmployeeFieldChange;
  employeeId: string;
  onChange: (employeeId: string, field: EmployeeField, resolution: 'keep' | 'source') => void;
  resolution: 'keep' | 'source';
}) {
  return (
    <div className="rounded-md border border-metro-border/70 bg-metro-surface px-2 py-1.5 text-[11px]">
      <div className="font-semibold text-metro-text">{FIELD_LABELS[change.field]}</div>
      <div className="mt-1 grid gap-1 sm:grid-cols-2">
        <button
          className={`rounded border px-2 py-1 text-left ${resolution === 'keep' ? 'border-emerald-400/50 bg-emerald-400/10 text-emerald-100' : 'border-metro-border text-metro-muted'}`}
          onClick={() => onChange(employeeId, change.field, 'keep')}
          type="button"
        >
          <span className="block text-[10px] uppercase tracking-wide">Mantener actual</span>
          <span className="block truncate font-semibold" title={displayValue(change.previous)}>{displayValue(change.previous)}</span>
        </button>
        <button
          className={`rounded border px-2 py-1 text-left ${resolution === 'source' ? 'border-blue-400/50 bg-blue-400/10 text-blue-100' : 'border-metro-border text-metro-muted'}`}
          onClick={() => onChange(employeeId, change.field, 'source')}
          type="button"
        >
          <span className="block text-[10px] uppercase tracking-wide">Usar Zerkos</span>
          <span className="block truncate font-semibold" title={displayValue(change.next)}>{displayValue(change.next)}</span>
        </button>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, warning = false }: { label: string; value: number; warning?: boolean }) {
  return (
    <div className={`rounded-lg border px-3 py-2 ${warning ? 'border-amber-400/30 bg-amber-400/10' : 'border-metro-border bg-metro-panel'}`}>
      <div className="text-[11px] uppercase tracking-wide text-metro-muted">{label}</div>
      <div className="mt-0.5 text-lg font-bold text-metro-text">{value}</div>
    </div>
  );
}

function PreviewDetails({
  children,
  count,
  emptyText,
  icon,
  title,
  warning = false,
}: {
  children: ReactNode;
  count: number;
  emptyText: string;
  icon?: ReactNode;
  title: string;
  warning?: boolean;
}) {
  return (
    <details className={`rounded-lg border ${warning ? 'border-amber-400/30' : 'border-metro-border'} bg-metro-panel`} open={count > 0 && count <= 8}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-xs font-bold text-metro-text">
        <span className="flex items-center gap-1.5">{icon}{title}</span>
        <span className="rounded-full bg-metro-surface px-2 py-0.5 text-[11px] text-metro-muted">{count}</span>
      </summary>
      <div className="max-h-48 overflow-y-auto border-t border-metro-border px-3">
        {count === 0 ? <div className="py-2 text-xs text-metro-muted">{emptyText}</div> : children}
      </div>
    </details>
  );
}

function PersonRow({ employee }: { employee: EmployeeDraft }) {
  return (
    <div className="border-b border-metro-border/60 py-1.5 text-xs last:border-b-0">
      <span className="font-bold text-metro-text">{employee.empleado}</span>
      <span className="text-metro-muted"> · {employee.nombreApellidos}</span>
    </div>
  );
}

function displayValue(value: string): string {
  return value || '—';
}

function GenericImportPreviewModal({
  employees,
  fileName,
  onClose,
  onImport,
  preview,
}: EmployeeImportPreviewModalProps) {
  const [mapping, setMapping] = useState<Array<EmployeeField | null>>([...preview.defaultMapping]);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState('');

  const mappedFields = mapping.filter((field): field is EmployeeField => field !== null);
  const fieldCounts = new Map<EmployeeField, number>();
  mappedFields.forEach((field) => fieldCounts.set(field, (fieldCounts.get(field) ?? 0) + 1));
  const duplicateFields = new Set(
    Array.from(fieldCounts.entries()).filter(([, count]) => count > 1).map(([field]) => field),
  );

  const importData = useMemo(() => previewToEmployeeImport(preview, mapping), [mapping, preview]);
  const existingIds = useMemo(() => new Set(employees.map((employee) => employee.empleado.trim())), [employees]);
  const createdCount = importData.drafts.filter((draft) => !existingIds.has(draft.empleado.trim())).length;
  const updatedCount = importData.drafts.length - createdCount;
  const nonEmptyHeaders = preview.headers.map((header, index) => ({ header: header.trim(), index })).filter(({ header }) => header.length > 0);
  const recognizedCount = nonEmptyHeaders.filter(({ index }) => preview.defaultMapping[index] !== null).length;
  const unrecognizedCount = nonEmptyHeaders.length - recognizedCount;
  const mappedCount = nonEmptyHeaders.filter(({ index }) => mapping[index] !== null).length;
  const hasEmployee = mappedFields.includes('empleado');
  const canImport = hasEmployee && duplicateFields.size === 0 && importData.drafts.length > 0 && !isImporting;

  const updateMapping = (columnIndex: number, value: string) => {
    setError('');
    setMapping((current) => {
      const next = [...current];
      next[columnIndex] = value ? (value as EmployeeField) : null;
      return next;
    });
  };

  const handleImport = async () => {
    if (!canImport) return;
    setIsImporting(true);
    setError('');
    try {
      await onImport(mapping);
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : 'No se ha podido importar la plantilla.');
      setIsImporting(false);
    }
  };

  return (
    <ModalShell labelledBy="plantilla-import-preview-title" maxWidthClassName="max-w-5xl" onClose={onClose}>
      <ModalHeader>
        <ModalTitle id="plantilla-import-preview-title" subtitle="Revisa cómo se enlaza cada columna del Excel con Plantilla antes de guardar.">
          Preparar importación
        </ModalTitle>
        <ModalCloseButton onClick={onClose} />
      </ModalHeader>

      <ModalBody className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-metro-border bg-metro-panel px-3 py-2 text-xs text-metro-muted">
          <FileSpreadsheet size={16} className="text-emerald-300" />
          <span className="max-w-[360px] truncate font-semibold text-metro-text" title={fileName}>{fileName}</span>
          <span>{preview.sourceRowCount} filas con datos</span><span>·</span><span>{mappedCount} columnas a importar</span><span>·</span><span>{recognizedCount} reconocidas automáticamente</span>
          {unrecognizedCount > 0 ? <><span>·</span><span className="font-semibold text-amber-200">{unrecognizedCount} no reconocidas</span></> : null}
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          <SummaryCard label="Personas válidas" value={importData.drafts.length} />
          <SummaryCard label="Ya existentes" value={updatedCount} />
          <SummaryCard label="Nuevas" value={createdCount} />
        </div>

        {unrecognizedCount > 0 ? (
          <div className="flex items-start gap-2 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-100">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <span>Las columnas no reconocidas pueden asignarse manualmente a un campo de Plantilla o dejarse en «Ignorar».</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-lg border border-emerald-400/25 bg-emerald-400/10 px-3 py-2 text-xs text-emerald-100">
            <CheckCircle2 size={16} /> Todas las columnas con nombre se han reconocido automáticamente.
          </div>
        )}

        <div className="overflow-hidden rounded-lg border border-metro-border">
          <div className="grid grid-cols-[minmax(180px,1fr)_minmax(220px,1fr)_110px] gap-2 border-b border-metro-border bg-metro-panel px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-metro-muted">
            <span>Columna Excel</span><span>Destino en Plantilla</span><span>Detección</span>
          </div>
          <div className="max-h-[42vh] overflow-y-auto">
            {nonEmptyHeaders.map(({ header, index }) => {
              const wasRecognized = preview.defaultMapping[index] !== null;
              const selectedField = mapping[index];
              const isDuplicate = selectedField ? duplicateFields.has(selectedField) : false;
              return (
                <div className="grid grid-cols-[minmax(180px,1fr)_minmax(220px,1fr)_110px] items-center gap-2 border-b border-metro-border/60 px-3 py-1.5 last:border-b-0" key={`${header}-${index}`}>
                  <div className="min-w-0 truncate text-sm font-semibold text-metro-text" title={header}>{header}</div>
                  <select
                    aria-label={`Destino para ${header}`}
                    className={`w-full rounded-md border bg-metro-surface px-2 py-1.5 text-sm text-metro-text outline-none focus:border-metro-red ${isDuplicate ? 'border-red-400' : 'border-metro-border'}`}
                    onChange={(event) => updateMapping(index, event.target.value)}
                    value={selectedField ?? ''}
                  >
                    <option value="">Ignorar</option>
                    {EMPLOYEE_FIELDS.map((field) => <option key={field} value={field}>{FIELD_LABELS[field]}</option>)}
                  </select>
                  <span className={`rounded-md px-2 py-1 text-center text-[11px] font-semibold ${wasRecognized ? 'bg-emerald-400/10 text-emerald-200' : 'bg-amber-400/10 text-amber-200'}`}>
                    {wasRecognized ? 'Automática' : 'Revisar'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {!hasEmployee ? <div className="rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-xs font-semibold text-red-200">Debes asignar una columna al campo «Empleado» para poder identificar a cada persona.</div> : null}
        {duplicateFields.size > 0 ? <div className="rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-xs font-semibold text-red-200">Un mismo campo de Plantilla no puede recibir dos columnas del Excel. Revisa: {Array.from(duplicateFields).map((field) => FIELD_LABELS[field]).join(', ')}.</div> : null}
        {error ? <div className="rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-xs font-semibold text-red-200">{error}</div> : null}
      </ModalBody>

      <ModalFooter className="justify-between">
        <span className="text-xs text-metro-muted">Solo se actualizarán los campos asignados; los demás datos existentes se conservarán.</span>
        <div className="flex items-center gap-2">
          <ActionButton iconOnly={false} onClick={onClose} size="sm" variant="secondary">Cancelar</ActionButton>
          <ActionButton disabled={!canImport} iconOnly={false} onClick={() => void handleImport()} size="sm" variant="import">{isImporting ? 'Importando…' : 'Importar'}</ActionButton>
        </div>
      </ModalFooter>
    </ModalShell>
  );
}
