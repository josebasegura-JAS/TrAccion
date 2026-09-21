import { Building2, FileBadge2, IdCard, MapPin, Phone, UserRound } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  EMPTY_EMPLOYEE_DRAFT,
  type Employee,
  type EmployeeDraft,
  type EmployeeField,
} from '../features/plantilla/domain/employee';
import { useEmployeeStore } from '../features/plantilla/store/useEmployeeStore';
import { InlineSaveFeedback } from './InlineSaveFeedback';
import { ModalDatabaseStatus } from './ModalDatabaseStatus';
import { useSharedRecordLock } from '../services/useSharedRecordLock';
import { ActionButton } from './ui/ActionButton';
import { Input } from './ui/Field';
import { ModalCloseButton } from './ui/ModalCloseButton';
import { ModalHeader, ModalShell, ModalTitle } from './ui/ModalShell';
import { RecordLockNotice } from './ui/RecordLockNotice';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import { buildRecoverableDraftKey, useRecoverableDraft } from '../hooks/useRecoverableDraft';
import { useEditorShortcuts } from '../hooks/useEditorShortcuts';

const employeeFormFields: Array<{ field: EmployeeField; label: string; required?: boolean }> = [
  { field: 'empleado', label: 'Empleado', required: true },
  { field: 'nombreApellidos', label: 'Nombre y apellidos', required: true },
  { field: 'puestoNomina', label: 'Puesto nómina' },
  { field: 'puestoOrganizativo', label: 'Puesto organizativo' },
  { field: 'puestoEus', label: 'Puesto EUS' },
  { field: 'residencia', label: 'Residencia' },
  { field: 'unidad', label: 'Unidad' },
  { field: 'nivelRetributivo', label: 'Nivel retributivo' },
  { field: 'direccionOrganizativa', label: 'Dirección organizativa' },
  { field: 'antiguedadPuesto', label: 'Antigüedad en el puesto' },
  { field: 'sexo', label: 'Sexo' },
  { field: 'calle', label: 'Calle' },
  { field: 'numero', label: 'Número' },
  { field: 'piso', label: 'Piso' },
  { field: 'codigoPostal', label: 'Código postal' },
  { field: 'poblacion', label: 'Población' },
  { field: 'provincia', label: 'Provincia' },
  { field: 'nif', label: 'NIF' },
  { field: 'telefono1', label: 'Teléfono 1' },
  { field: 'telefono2', label: 'Teléfono 2' },
];

const fieldMeta = Object.fromEntries(employeeFormFields.map((entry) => [entry.field, entry])) as Record<
  EmployeeField,
  { field: EmployeeField; label: string; required?: boolean }
>;

const identificationFields: EmployeeField[] = ['empleado', 'nombreApellidos'];
const organizationFields: EmployeeField[] = [
  'puestoNomina',
  'puestoOrganizativo',
  'puestoEus',
  'residencia',
  'unidad',
  'nivelRetributivo',
  'direccionOrganizativa',
  'antiguedadPuesto',
];
const personalFields: EmployeeField[] = [
  'sexo',
  'calle',
  'numero',
  'piso',
  'codigoPostal',
  'poblacion',
  'provincia',
  'nif',
  'telefono1',
  'telefono2',
];

function toDraft(employee: Employee | null): EmployeeDraft {
  if (!employee) {
    return { ...EMPTY_EMPLOYEE_DRAFT };
  }

  return {
    empleado: employee.empleado,
    nombreApellidos: employee.nombreApellidos,
    puestoNomina: employee.puestoNomina,
    puestoOrganizativo: employee.puestoOrganizativo,
    puestoEus: employee.puestoEus,
    residencia: employee.residencia,
    unidad: employee.unidad ?? '',
    nivelRetributivo: employee.nivelRetributivo,
    direccionOrganizativa: employee.direccionOrganizativa,
    antiguedadPuesto: employee.antiguedadPuesto,
    sexo: employee.sexo,
    calle: employee.calle,
    numero: employee.numero,
    piso: employee.piso,
    codigoPostal: employee.codigoPostal,
    poblacion: employee.poblacion,
    provincia: employee.provincia,
    nif: employee.nif,
    telefono1: employee.telefono1,
    telefono2: employee.telefono2,
  };
}

function EmployeeSection({
  children,
  description,
  icon,
  title,
}: {
  children: React.ReactNode;
  description: string;
  icon: React.ReactNode;
  title: string;
}) {
  return (
    <section className="rounded-2xl border border-metro-border/80 bg-[linear-gradient(180deg,rgba(22,42,66,0.92),rgba(18,35,56,0.88))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
      <div className="mb-4 flex items-start gap-3">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-sky-400/20 bg-sky-500/10 text-sky-200">
          {icon}
        </div>
        <div>
          <h3 className="text-lg font-bold text-metro-text">{title}</h3>
          <p className="text-sm text-metro-muted">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

export function EmployeeEditor({
  employee,
  mode,
  onDone,
}: {
  employee: Employee | null;
  mode: 'create' | 'edit';
  onDone: () => void;
}) {
  const createEmployee = useEmployeeStore((state) => state.createWithConcurrencyCheck);
  const updateEmployee = useEmployeeStore((state) => state.updateWithConcurrencyCheck);
  const removeEmployee = useEmployeeStore((state) => state.removeWithConcurrencyCheck);
  const [draft, setDraft] = useState<EmployeeDraft>(() => toDraft(employee));
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    setDraft(toDraft(employee));
  }, [employee, mode]);

  const isCreate = mode === 'create';
  const recordLock = useSharedRecordLock({
    module: 'plantilla',
    recordId: employee?.empleado ?? null,
    enabled: mode === 'edit' && Boolean(employee?.empleado),
  });
  const isReadOnly = recordLock.isReadOnly;
  const canSubmit = Boolean(draft.empleado.trim() && draft.nombreApellidos.trim()) && !isReadOnly;
  const initialDraft = useMemo(() => toDraft(employee), [employee]);
  const recoveryKey = buildRecoverableDraftKey('plantilla', employee?.empleado ?? '__new__');
  const { clearDraft: clearRecoveryDraft, dialogNode: recoveryDialogNode } = useRecoverableDraft({
    currentValue: draft,
    initialValue: initialDraft,
    enabled: !isReadOnly,
    onRecover: setDraft,
    storageKey: recoveryKey,
  });
  const { requestClose, dialogNode } = useUnsavedChanges({
    currentValue: draft,
    initialValue: initialDraft,
    enabled: !isReadOnly,
    onDiscard: () => {
      clearRecoveryDraft();
      onDone();
    },
  });
  const formRef = useRef<HTMLFormElement>(null);
  useEditorShortcuts({
    canSave: canSubmit,
    onClose: () => void requestClose(),
    onSave: () => formRef.current?.requestSubmit(),
  });

  const renderField = (field: EmployeeField) => {
    const { label, required } = fieldMeta[field];
    const isEmployeeKey = field === 'empleado';
    const isReadOnlyKey = isEmployeeKey && !isCreate;
    const value = draft[field];

    return (
      <label className="text-xs font-semibold text-metro-muted" key={field}>
        <span className="mb-1 block text-[11px] uppercase tracking-[0.12em] text-metro-muted">
          {label}
          {required ? <span className="ml-1 text-metro-red">*</span> : null}
        </span>
        <Input
          className={isReadOnlyKey ? 'text-metro-muted' : undefined}
          onChange={(event) => setDraft((current) => ({ ...current, [field]: event.target.value }))}
          readOnly={isReadOnlyKey || isReadOnly}
          disabled={isReadOnly}
          required={required}
          value={value}
        />
        {isReadOnlyKey && (
          <span className="mt-1 block text-[11px] font-medium text-metro-muted">Clave única; no editable.</span>
        )}
      </label>
    );
  };

  return (
    <ModalShell
      labelledBy="employee-editor-title"
      maxWidthClassName="max-w-[1120px]"
      onClose={() => void requestClose()}
      panelClassName="bg-[linear-gradient(180deg,rgba(15,30,49,0.98),rgba(11,24,41,0.98))]"
    >
      <ModalHeader>
        <div className="flex min-w-0 items-center gap-4">
          <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl border border-sky-400/20 bg-sky-500/10 text-sky-200">
            <UserRound size={24} />
          </div>
          <div className="min-w-0">
            <ModalTitle
              id="employee-editor-title"
              subtitle={isCreate ? 'Alta manual compacta.' : `Editando empleado ${employee?.empleado ?? '—'}`}
            >
              {isCreate ? 'Nueva persona' : employee?.nombreApellidos || 'Editar persona'}
            </ModalTitle>
            {!isCreate && employee && (employee.telefono1 || employee.telefono2) && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {employee.telefono1 && (
                  <span className="inline-flex items-center gap-1.5 rounded-lg border border-sky-400/20 bg-sky-500/10 px-2.5 py-1 text-xs font-bold text-sky-100">
                    <Phone size={13} />
                    <span className="text-sky-300/80">Tel. 1</span>
                    {employee.telefono1}
                  </span>
                )}
                {employee.telefono2 && (
                  <span className="inline-flex items-center gap-1.5 rounded-lg border border-sky-400/20 bg-sky-500/10 px-2.5 py-1 text-xs font-bold text-sky-100">
                    <Phone size={13} />
                    <span className="text-sky-300/80">Tel. 2</span>
                    {employee.telefono2}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <ModalDatabaseStatus />
          <ModalCloseButton label="Cerrar editor" onClick={() => void requestClose()} />
        </div>
      </ModalHeader>

      <div className="flex min-h-0 flex-1 flex-col px-4 pb-4 pt-3">
        {recordLock.status === 'locked' && recordLock.lockedBy && (
          <RecordLockNotice className="mb-3" lockedBy={recordLock.lockedBy} />
        )}

        <form
          ref={formRef}
          className="flex min-h-0 flex-1 flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!canSubmit) {
              return;
            }

            void (async () => {
              setSaveError('');
              const result = isCreate
                ? await createEmployee(draft)
                : employee
                  ? await updateEmployee(employee.empleado, draft, JSON.stringify(employee))
                  : { ok: false, message: 'No se ha encontrado la persona seleccionada.' };

              if (!result.ok) {
                setSaveError(result.message);
                return;
              }

              clearRecoveryDraft();
              onDone();
            })();
          }}
        >
          <div className="min-h-0 space-y-4 overflow-y-auto pr-1">
            <EmployeeSection
              description="Datos principales del empleado en la organización."
              icon={<IdCard size={20} />}
              title="Identificación"
            >
              <div className="grid gap-4 md:grid-cols-2">{identificationFields.map(renderField)}</div>
            </EmployeeSection>

            <EmployeeSection
              description="Información de puesto, unidad y relación organizativa."
              icon={<Building2 size={20} />}
              title="Puesto y organización"
            >
              <div className="grid gap-4 md:grid-cols-2">{organizationFields.map(renderField)}</div>
            </EmployeeSection>

            <EmployeeSection
              description="Información de contacto y datos personales."
              icon={<MapPin size={20} />}
              title="Datos personales y dirección"
            >
              <div className="grid gap-4 md:grid-cols-2">{personalFields.map(renderField)}</div>
            </EmployeeSection>

            {!isCreate && employee && (
              <EmployeeSection
                description="Información calculada automáticamente desde otros datos."
                icon={<FileBadge2 size={20} />}
                title="Campos derivados"
              >
                <div className="rounded-xl border border-metro-border/80 bg-metro-surface/35 px-4 py-3 text-sm text-metro-muted">
                  <dl className="space-y-2">
                    <div className="grid gap-2 sm:grid-cols-[160px_1fr] sm:items-start">
                      <dt className="font-bold text-metro-text">Correo electrónico</dt>
                      <dd className="truncate" title={employee.email || '—'}>
                        {employee.email || '—'}
                      </dd>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-[160px_1fr] sm:items-start">
                      <dt className="font-bold text-metro-text">DNI</dt>
                      <dd className="truncate" title={employee.dni || '—'}>
                        <span className="inline-flex rounded-md bg-red-400/10 px-2 py-0.5 font-semibold text-red-200">
                          {employee.dni || '—'}
                        </span>
                      </dd>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-[160px_1fr] sm:items-start">
                      <dt className="font-bold text-metro-text">Residencia EUS</dt>
                      <dd className="truncate" title={employee.residenciaEus || '—'}>
                        {employee.residenciaEus || '—'}
                      </dd>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-[160px_1fr] sm:items-start">
                      <dt className="font-bold text-metro-text">Dirección teletrabajo</dt>
                      <dd className="truncate" title={employee.direccionTeletrabajo || '—'}>
                        {employee.direccionTeletrabajo || '—'}
                      </dd>
                    </div>
                  </dl>
                </div>
              </EmployeeSection>
            )}
          </div>

          <div className="border-t border-metro-border/80 pt-4">
            {saveError && (
              <p className="mb-3 w-full rounded-lg border border-metro-red/40 bg-metro-red/10 px-3 py-2 text-xs font-semibold text-metro-red">
                {saveError}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <ActionButton disabled={!canSubmit} iconOnly={false} type="submit" variant="save">
                Guardar <kbd className="ml-1 text-[10px] opacity-70">Ctrl S</kbd>
              </ActionButton>
              <InlineSaveFeedback />
              <div className="flex-1" />
              <button
                className="rounded-xl border border-metro-border bg-metro-surface px-4 py-2 text-sm font-semibold text-metro-muted hover:text-metro-text"
                onClick={() => void requestClose()}
                type="button"
              >
                Cancelar <kbd className="ml-1 text-[10px] opacity-70">Esc</kbd>
              </button>
              {!isCreate && employee && (
                <ActionButton
                  disabled={isReadOnly}
                  iconOnly={false}
                  onClick={() => {
                    void (async () => {
                      setSaveError('');
                      const result = await removeEmployee(employee.empleado, JSON.stringify(employee));
                      if (!result.ok) {
                        setSaveError(result.message);
                        return;
                      }
                      clearRecoveryDraft();
                      onDone();
                    })();
                  }}
                  variant="delete"
                >
                  Eliminar
                </ActionButton>
              )}
            </div>
          </div>
        </form>
      </div>
      {recoveryDialogNode}
      {dialogNode}
    </ModalShell>
  );
}
