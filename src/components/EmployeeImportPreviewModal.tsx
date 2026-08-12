import { AlertTriangle, CheckCircle2, FileSpreadsheet } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  EMPLOYEE_FIELDS,
  type Employee,
  type EmployeeField,
} from '../features/plantilla/domain/employee';
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
  onImport: (mapping: Array<EmployeeField | null>) => Promise<void>;
  preview: EmployeeImportPreview;
}

export function EmployeeImportPreviewModal({
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
    Array.from(fieldCounts.entries())
      .filter(([, count]) => count > 1)
      .map(([field]) => field),
  );

  const importData = useMemo(
    () => previewToEmployeeImport(preview, mapping),
    [mapping, preview],
  );
  const existingIds = useMemo(
    () => new Set(employees.map((employee) => employee.empleado.trim())),
    [employees],
  );
  const createdCount = importData.drafts.filter(
    (draft) => !existingIds.has(draft.empleado.trim()),
  ).length;
  const updatedCount = importData.drafts.length - createdCount;
  const nonEmptyHeaders = preview.headers
    .map((header, index) => ({ header: header.trim(), index }))
    .filter(({ header }) => header.length > 0);
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
    if (!canImport) {
      return;
    }

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
        <ModalTitle
          id="plantilla-import-preview-title"
          subtitle="Revisa cómo se enlaza cada columna del Excel con Plantilla antes de guardar."
        >
          Preparar importación
        </ModalTitle>
        <ModalCloseButton onClick={onClose} />
      </ModalHeader>

      <ModalBody className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-metro-border bg-metro-panel px-3 py-2 text-xs text-metro-muted">
          <FileSpreadsheet size={16} className="text-emerald-300" />
          <span className="max-w-[360px] truncate font-semibold text-metro-text" title={fileName}>{fileName}</span>
          <span>{preview.sourceRowCount} filas con datos</span>
          <span>·</span>
          <span>{mappedCount} columnas a importar</span>
          <span>·</span>
          <span>{recognizedCount} reconocidas automáticamente</span>
          {unrecognizedCount > 0 ? (
            <>
              <span>·</span>
              <span className="font-semibold text-amber-200">{unrecognizedCount} no reconocidas</span>
            </>
          ) : null}
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          <div className="rounded-lg border border-metro-border bg-metro-panel px-3 py-2">
            <div className="text-[11px] uppercase tracking-wide text-metro-muted">Personas válidas</div>
            <div className="mt-0.5 text-lg font-bold text-metro-text">{importData.drafts.length}</div>
          </div>
          <div className="rounded-lg border border-metro-border bg-metro-panel px-3 py-2">
            <div className="text-[11px] uppercase tracking-wide text-metro-muted">Ya existentes</div>
            <div className="mt-0.5 text-lg font-bold text-metro-text">{updatedCount}</div>
          </div>
          <div className="rounded-lg border border-metro-border bg-metro-panel px-3 py-2">
            <div className="text-[11px] uppercase tracking-wide text-metro-muted">Nuevas</div>
            <div className="mt-0.5 text-lg font-bold text-metro-text">{createdCount}</div>
          </div>
        </div>

        {unrecognizedCount > 0 ? (
          <div className="flex items-start gap-2 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-100">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <span>
              Las columnas no reconocidas no se descartan automáticamente: puedes asignarlas en la tabla a cualquier campo existente de Plantilla o dejarlas en «Ignorar».
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-lg border border-emerald-400/25 bg-emerald-400/10 px-3 py-2 text-xs text-emerald-100">
            <CheckCircle2 size={16} /> Todas las columnas con nombre se han reconocido automáticamente.
          </div>
        )}

        <div className="overflow-hidden rounded-lg border border-metro-border">
          <div className="grid grid-cols-[minmax(180px,1fr)_minmax(220px,1fr)_110px] gap-2 border-b border-metro-border bg-metro-panel px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-metro-muted">
            <span>Columna Excel</span>
            <span>Destino en Plantilla</span>
            <span>Detección</span>
          </div>
          <div className="max-h-[42vh] overflow-y-auto">
            {nonEmptyHeaders.map(({ header, index }) => {
              const wasRecognized = preview.defaultMapping[index] !== null;
              const selectedField = mapping[index];
              const isDuplicate = selectedField ? duplicateFields.has(selectedField) : false;
              return (
                <div
                  className="grid grid-cols-[minmax(180px,1fr)_minmax(220px,1fr)_110px] items-center gap-2 border-b border-metro-border/60 px-3 py-1.5 last:border-b-0"
                  key={`${header}-${index}`}
                >
                  <div className="min-w-0 truncate text-sm font-semibold text-metro-text" title={header}>
                    {header}
                  </div>
                  <select
                    aria-label={`Destino para ${header}`}
                    className={`w-full rounded-md border bg-metro-surface px-2 py-1.5 text-sm text-metro-text outline-none focus:border-metro-red ${
                      isDuplicate ? 'border-red-400' : 'border-metro-border'
                    }`}
                    onChange={(event) => updateMapping(index, event.target.value)}
                    value={selectedField ?? ''}
                  >
                    <option value="">Ignorar</option>
                    {EMPLOYEE_FIELDS.map((field) => (
                      <option key={field} value={field}>{FIELD_LABELS[field]}</option>
                    ))}
                  </select>
                  <span
                    className={`rounded-md px-2 py-1 text-center text-[11px] font-semibold ${
                      wasRecognized
                        ? 'bg-emerald-400/10 text-emerald-200'
                        : 'bg-amber-400/10 text-amber-200'
                    }`}
                  >
                    {wasRecognized ? 'Automática' : 'Revisar'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {!hasEmployee ? (
          <div className="rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-xs font-semibold text-red-200">
            Debes asignar una columna al campo «Empleado» para poder identificar a cada persona.
          </div>
        ) : null}
        {duplicateFields.size > 0 ? (
          <div className="rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-xs font-semibold text-red-200">
            Un mismo campo de Plantilla no puede recibir dos columnas del Excel. Revisa: {Array.from(duplicateFields).map((field) => FIELD_LABELS[field]).join(', ')}.
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
          Solo se actualizarán los campos asignados; los demás datos existentes se conservarán.
        </span>
        <div className="flex items-center gap-2">
          <ActionButton iconOnly={false} onClick={onClose} size="sm" variant="secondary">
            Cancelar
          </ActionButton>
          <ActionButton
            disabled={!canImport}
            iconOnly={false}
            onClick={() => void handleImport()}
            size="sm"
            variant="import"
          >
            {isImporting ? 'Importando…' : 'Importar'}
          </ActionButton>
        </div>
      </ModalFooter>
    </ModalShell>
  );
}
