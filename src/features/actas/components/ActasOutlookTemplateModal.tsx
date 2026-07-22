import type { MutableRefObject } from 'react';
import { ModalCloseButton } from '../../../components/ui/ModalCloseButton';
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
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
      <div className="flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-metro-border bg-metro-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-metro-border px-4 py-3">
          <div>
            <h3 className="text-lg font-bold text-metro-text">Plantilla Outlook Actas</h3>
            <p className="text-xs text-metro-muted">
              Pega el cuerpo desde Outlook. No se configuran destinatarios: Para y CC quedarán
              vacíos.
            </p>
          </div>
          <ModalCloseButton onClick={onClose} />
        </div>

        {outlookTemplateStatus && (
          <p
            className={`mx-4 mt-3 rounded-lg border px-3 py-2 text-xs font-semibold ${outlookTemplateStatusIsError ? 'border-red-500/40 bg-red-500/10 text-red-200' : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'}`}
          >
            {outlookTemplateStatus}
          </p>
        )}

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          <label className="block text-xs font-semibold uppercase tracking-wide text-metro-muted">
            Asunto plantilla
            <input
              className="mt-1 w-full rounded-lg border border-metro-border bg-metro-panel px-3 py-2 text-sm font-normal normal-case tracking-normal text-metro-text outline-none focus:border-metro-red"
              onChange={(event) =>
                setOutlookTemplate((current) => ({ ...current, subject: event.target.value }))
              }
              placeholder="Akta ZIRRIBORROA BORRADOR Acta [Título Acta]"
              value={outlookTemplate.subject}
            />
          </label>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-metro-muted">
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
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-metro-border px-4 py-3">
          <button
            className="rounded-xl border border-metro-border px-3 py-2 text-sm font-semibold text-metro-muted hover:border-metro-red hover:text-metro-text"
            onClick={onClose}
            type="button"
          >
            Cancelar
          </button>
          <button
            className="rounded-xl bg-metro-red px-3 py-2 text-sm font-semibold text-white hover:bg-metro-dark"
            onClick={onSave}
            type="button"
          >
            Guardar plantilla
          </button>
        </div>
      </div>
    </div>
  );
}
