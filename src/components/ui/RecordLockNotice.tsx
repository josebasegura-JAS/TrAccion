import { Notice } from './Notice';

interface RecordLockNoticeProps {
  lockedBy: TraccionRecordLockOwnerInfo;
  className?: string;
}

/**
 * Aviso de "modo consulta" mostrado en los editores cuando otro usuario tiene
 * el registro bloqueado. Antes se repetía como un `div` suelto en cada
 * editor (EmployeeEditor, CriterioRrllEditor, ActaEditorModal); ahora vive en
 * un único sitio para que estilo y copy no se desincronicen entre módulos.
 */
export function RecordLockNotice({ className, lockedBy }: RecordLockNoticeProps) {
  return (
    <Notice className={className} tone="warning">
      📖 Modo consulta — editando: {lockedBy.ownerName}@{lockedBy.machineName}
    </Notice>
  );
}
