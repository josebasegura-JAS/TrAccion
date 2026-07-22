import type { MutableRefObject } from 'react';
import { ModalCloseButton } from '../../../components/ui/ModalCloseButton';
import { ActionButton } from '../../../components/ui/ActionButton';
import { FieldLabel, Input } from '../../../components/ui/Field';
import { ModalBody, ModalFooter, ModalHeader, ModalShell, ModalTitle } from '../../../components/ui/ModalShell';
import type { ActasOutlookTemplate } from './actasPage.helpers';

export function ActasOutlookTemplateModal({
  onClose,
  onSave,
  outlookTemplate,
  outlookTemplateBodyRef,
  outlookTemplateStatus,
  outlookTemplateStatusIsError,
  setOutlookTemplate,
}: {
  onClose: () => void;
  onSave: () => void;
  outlookTemplate: ActasOutlookTemplate;
  outlookTemplateBodyRef: MutableRefObject<HTMLDivElement | null>;
  outlookTemplateStatus: string;
  outlookTemplateStatusIsError: boolean;
  setOutlookTemplate: (update: (current: ActasOutlookTemplate) => ActasOutlookTemplate) => void;
}) {
  const titleId = 'actas-outlook-template-modal-title';

  return (
    <ModalShell labelledBy={titleId} maxWidthClassName="max-w-4xl" onClose={onClose}>
      <ModalHeader>
        <ModalTitle
          id={titleId}
          subtitle="Pega el cuerpo desde Outlook. Los campos Para y CC quedarán vacíos."
        >
          Plantilla Outlook Actas
        </ModalTitle>
        <ModalCloseButton onClick={onClose} />
      </ModalHeader>

        {outlookTemplateStatus && (
          <p
            className={`mx-4 mt-3 rounded-lg border px-3 py-2 text-xs font-semibold ${outlookTemplateStatusIsError ? 'border-red-500/40 bg-red-500/10 text-red-200' : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'}`}
          >
            {outlookTemplateStatus}
          </p>
        )}

      <ModalBody className="space-y-4">
          <FieldLabel>
            Asunto plantilla
            <Input
              onChange={(event) =>
                setOutlookTemplate((current) => ({ ...current, subject: event.target.value }))
              }
              placeholder="Akta ZIRRIBORROA BORRADOR Acta [Título Acta]"
              value={outlookTemplate.subject}
            />
          </FieldLabel>

          <div>
            <p className="text-xs font-semibold text-metro-muted">
              Cuerpo plantilla
            </p>
            <div
              className="mt-1 min-h-[320px] rounded-lg border border-metro-border bg-white px-4 py-3 text-sm text-slate-950 outline-none focus:border-metro-red"
              contentEditable
              ref={outlookTemplateBodyRef}
              role="textbox"
              suppressContentEditableWarning
            />
          </div>

          <div className="rounded-xl border border-metro-border bg-metro-panel px-3 py-3 text-xs text-metro-muted">
            <p className="font-semibold text-metro-text">Marcadores disponibles</p>
            <p className="mt-2 break-words">
              [Título Acta] · [Tipo Acta] · [Fecha Acta formato DD/MM/AAAA] · [Fecha Límite formato
              AAAA/MM/DD] · [Fecha Límite formato DD/MM/AAAA]
            </p>
          </div>
      </ModalBody>

      <ModalFooter>
        <ActionButton iconOnly={false} onClick={onClose} variant="secondary">
          Cancelar
        </ActionButton>
        <ActionButton iconOnly={false} onClick={onSave} variant="save">
          Guardar plantilla
        </ActionButton>
      </ModalFooter>
    </ModalShell>
  );
}
