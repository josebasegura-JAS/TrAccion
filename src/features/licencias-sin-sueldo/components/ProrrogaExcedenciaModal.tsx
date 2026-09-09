import { useMemo, useState } from 'react';
import { ActionButton } from '../../../components/ui/ActionButton';
import { FieldLabel, Input } from '../../../components/ui/Field';
import { ModalBody, ModalFooter, ModalHeader, ModalShell, ModalTitle } from '../../../components/ui/ModalShell';
import { ModalCloseButton } from '../../../components/ui/ModalCloseButton';
import { Notice } from '../../../components/ui/Notice';
import {
  addOneDayIso,
  validateProrrogaExcedencia,
  type LicenciaSinSueldoRecord,
} from '../domain/licenciaSinSueldo';

export function ProrrogaExcedenciaModal({
  record,
  onClose,
  onSave,
}: {
  record: LicenciaSinSueldoRecord;
  onClose: () => void;
  onSave: (fechaInicio: string, fechaFin: string) => Promise<{ ok: boolean; message: string }>;
}) {
  const [fechaInicio, setFechaInicio] = useState(addOneDayIso(record.fechaFin));
  const [fechaFin, setFechaFin] = useState('');
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);
  const validation = useMemo(
    () => validateProrrogaExcedencia(record, fechaInicio, fechaFin),
    [fechaFin, fechaInicio, record],
  );

  const save = async () => {
    if (!validation.ok) {
      setStatus(validation.errors.join(' '));
      return;
    }
    setSaving(true);
    const result = await onSave(fechaInicio, fechaFin);
    setSaving(false);
    if (!result.ok) setStatus(result.message);
  };

  return (
    <ModalShell labelledBy="prorroga-excedencia-title" maxWidthClassName="max-w-xl" onClose={onClose}>
      <ModalHeader>
        <ModalTitle id="prorroga-excedencia-title" subtitle={record.nombreCompleto}>
          Ampliar excedencia
        </ModalTitle>
        <ModalCloseButton onClick={onClose} />
      </ModalHeader>
      <ModalBody className="space-y-4">
        <Notice tone="muted">
          Periodo actual: {record.fechaInicio} — {record.fechaFin}. Solo puede registrarse una prórroga.
        </Notice>
        {status && <Notice tone="error">{status}</Notice>}
        <div className="grid gap-4 sm:grid-cols-2">
          <FieldLabel>
            Inicio prórroga
            <Input dateTone="start" type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} />
          </FieldLabel>
          <FieldLabel>
            Fin prórroga
            <Input dateTone="end" type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} />
          </FieldLabel>
        </div>
      </ModalBody>
      <ModalFooter>
        <ActionButton iconOnly={false} variant="secondary" onClick={onClose}>Cancelar</ActionButton>
        <ActionButton iconOnly={false} variant="save" loading={saving} onClick={() => void save()}>
          Guardar prórroga
        </ActionButton>
      </ModalFooter>
    </ModalShell>
  );
}
