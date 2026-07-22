import type { SessionImportPreview } from './sessionImport';
import { ImportMetric } from './SessionManagementPageCards';
import type { SessionModuleConfig } from './session';
import { CompactTable, CompactTableBody, CompactTableHead } from '../table/CompactTable';
import { ActionButton } from '../../components/ui/ActionButton';
import { ModalBody, ModalFooter, ModalHeader, ModalShell, ModalTitle } from '../../components/ui/ModalShell';

export function SessionImportPreviewModal({
  config,
  ignoredLineCount,
  onCancel,
  onConfirm,
  relevantImportSessions,
  relevantImportTaskCount,
}: {
  config: SessionModuleConfig;
  ignoredLineCount: number;
  onCancel: () => void;
  onConfirm: () => void;
  relevantImportSessions: SessionImportPreview['sessions'];
  relevantImportTaskCount: number;
}) {
  const titleId = 'session-import-preview-modal-title';

  return (
    <ModalShell labelledBy={titleId} maxWidthClassName="max-w-4xl" onClose={onCancel}>
      <ModalHeader>
        <ModalTitle
          id={titleId}
          subtitle="Se importarán solo las sesiones compatibles. Los duplicados por código y fecha se omiten."
        >
          Previsualización de importación · {config.title}
        </ModalTitle>
      </ModalHeader>
      <ModalBody className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-3">
          <ImportMetric label="Sesiones detectadas" value={relevantImportSessions.length} />
          <ImportMetric label="Puntos detectados" value={relevantImportTaskCount} />
          <ImportMetric label="Líneas ignoradas" value={ignoredLineCount} />
        </div>
        <div className="max-h-[380px] overflow-auto rounded-xl border border-metro-border">
          <CompactTable>
            <CompactTableHead>
              <tr>
                <th className="w-[130px] px-3 py-2">Fecha</th>
                <th className="w-[160px] px-3 py-2">Código</th>
                <th className="px-3 py-2">Título</th>
                <th className="w-[90px] px-3 py-2 text-right">Puntos</th>
              </tr>
            </CompactTableHead>
            <CompactTableBody>
              {relevantImportSessions.map((session) => (
                <tr key={session.externalKey}>
                  <td className="px-3 py-2 text-metro-muted">{session.draft.date || '—'}</td>
                  <td className="px-3 py-2 font-semibold text-metro-text">{session.draft.code}</td>
                  <td className="truncate px-3 py-2 text-metro-muted" title={session.draft.title}>
                    {session.draft.title}
                  </td>
                  <td className="px-3 py-2 text-right font-bold text-metro-text">
                    {session.taskExternalKeys.length}
                  </td>
                </tr>
              ))}
            </CompactTableBody>
          </CompactTable>
        </div>
      </ModalBody>
      <ModalFooter>
        <ActionButton iconOnly={false} onClick={onCancel} variant="secondary">
          Cancelar
        </ActionButton>
        <ActionButton
          disabled={relevantImportSessions.length === 0}
          iconOnly={false}
          onClick={onConfirm}
          variant="save"
        >
          Confirmar importación
        </ActionButton>
      </ModalFooter>
    </ModalShell>
  );
}
