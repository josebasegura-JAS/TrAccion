import { FileSpreadsheet, MailPlus } from 'lucide-react';
import { ActionButton } from '../../../components/ui/ActionButton';
import { ModalCloseButton } from '../../../components/ui/ModalCloseButton';
import { ModalFooter, ModalHeader, ModalShell, ModalTitle } from '../../../components/ui/ModalShell';
import type { HuelgaCollectionGroup } from './huelgasCollectionExport';
import type { HuelgaZona } from './huelgasZones';
import { formatDate, type Huelga } from './huelgasPageModel';

type MailPreview = { subject: string; html: string };

type Props = {
  mailTarget: Huelga | null;
  mailGroups: HuelgaCollectionGroup[];
  zonas: HuelgaZona[];
  mailPreviewZoneId: string | null;
  setMailPreviewZoneId: (value: string | null) => void;
  mailPreviewGroup: HuelgaCollectionGroup | null;
  currentMailPreview: MailPreview | null;
  mailSpecificNotes: Record<string, string>;
  setMailSpecificNotes: (updater: (current: Record<string, string>) => Record<string, string>) => void;
  generatingCollectionForId: string | null;
  onClose: () => void;
  onSaveSpecificNotes: () => void;
  onGenerateSingle: (group: HuelgaCollectionGroup) => void;
  onGenerateAll: () => void;
};

export function HuelgasCollectionMailsModal({
  mailTarget,
  mailGroups,
  zonas,
  mailPreviewZoneId,
  setMailPreviewZoneId,
  mailPreviewGroup,
  currentMailPreview,
  mailSpecificNotes,
  setMailSpecificNotes,
  generatingCollectionForId,
  onClose: closeCollectionMails,
  onSaveSpecificNotes: saveMailSpecificNotes,
  onGenerateSingle: generateSingleCollectionMail,
  onGenerateAll: generateAllCollectionMails,
}: Props) {
  if (!mailTarget) return null;

  const currentZona = mailPreviewGroup ? zonas.find((item) => item.id === mailPreviewGroup.zonaId) : null;

  return (
    <ModalShell labelledBy="huelga-mails-title" onClose={closeCollectionMails} size="xl">
      <ModalHeader>
        <ModalTitle id="huelga-mails-title" subtitle="Puedes preparar un único circuito o todos. Cada borrador se crea en Outlook con la plantilla Excel real de su área adjunta.">
          Comunicaciones · {formatDate(mailTarget.fecha)}
        </ModalTitle>
        <ModalCloseButton onClick={closeCollectionMails} />
      </ModalHeader>

      <div className="grid min-h-0 flex-1 overflow-hidden lg:grid-cols-[320px_1fr]">
        <aside className="overflow-y-auto border-r border-metro-border p-4">
          <div className="space-y-2">
            {mailGroups.map((group) => {
              const zona = zonas.find((item) => item.id === group.zonaId);
              const selected = group.zonaId === mailPreviewZoneId;
              const prepared = Boolean(mailTarget.correosPreparadosPorZona?.[group.zonaId]);
              return (
                <button key={group.zonaId} className={`w-full rounded-xl border p-3 text-left transition ${selected ? 'border-metro-red bg-metro-red/10' : 'border-metro-border bg-metro-panel/45 hover:bg-metro-raised/40'}`} type="button" onClick={() => setMailPreviewZoneId(group.zonaId)}>
                  <div className="flex items-center justify-between gap-2">
                    <strong className="text-sm text-metro-text">{group.zonaNombre}</strong>
                    <span className={`text-[11px] font-semibold ${prepared ? 'text-emerald-300' : 'text-metro-muted'}`}>{prepared ? 'Preparado' : 'Pendiente'}</span>
                  </div>
                  <p className="mt-1 truncate text-xs text-metro-muted">{zona?.responsableNombre || 'Sin responsable'}</p>
                  <div className="mt-2 flex items-center gap-1.5 text-[11px] text-metro-muted"><FileSpreadsheet size={13} className="text-emerald-300" /> {zona?.plantillaExcelNombrePatron || 'Sin plantilla'}</div>
                </button>
              );
            })}
          </div>
        </aside>

        <div className="overflow-y-auto p-5">
          {mailPreviewGroup && currentMailPreview && currentZona ? (
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-xl border border-metro-border bg-metro-panel/50 p-3">
                  <p className="text-[11px] uppercase tracking-wide text-metro-muted">Para</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm font-semibold text-metro-text">{currentZona.responsableEmail || '—'}</p>
                </div>
                <div className="rounded-xl border border-metro-border bg-metro-panel/50 p-3">
                  <p className="text-[11px] uppercase tracking-wide text-metro-muted">Excel adjunto</p>
                  <p className="mt-1 text-sm font-semibold text-metro-text">{currentZona.plantillaExcelNombrePatron.replace('{{FECHA_HUELGA_ARCHIVO}}', mailTarget.fecha.split('-').reverse().join('-'))}</p>
                </div>
              </div>

              <label className="block space-y-1.5 text-sm font-medium text-metro-text">
                Instrucciones específicas de esta huelga
                <textarea className="min-h-24 w-full resize-y rounded-xl border border-metro-border bg-metro-panel px-3 py-2.5 text-sm text-metro-text outline-none focus:border-metro-red" placeholder="Excepciones o indicaciones válidas solo para esta huelga y este circuito..." value={mailSpecificNotes[mailPreviewGroup.zonaId] ?? ''} onChange={(event) => setMailSpecificNotes((current) => ({ ...current, [mailPreviewGroup.zonaId]: event.target.value }))} />
              </label>

              <div className="rounded-xl border border-metro-border bg-white p-5 text-gray-900 shadow-inner">
                <div className="mb-4 border-b border-gray-200 pb-3 text-sm"><p><strong>Asunto:</strong> {currentMailPreview.subject}</p></div>
                <div className="prose prose-sm max-w-none font-sans" dangerouslySetInnerHTML={{ __html: currentMailPreview.html }} />
              </div>

              <div className="flex flex-wrap justify-end gap-2">
                <ActionButton variant="secondary" iconOnly={false} onClick={() => void saveMailSpecificNotes()}>Guardar instrucciones</ActionButton>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-metro-border p-8 text-center text-sm text-metro-muted">Selecciona un circuito para revisar su comunicación.</div>
          )}
        </div>
      </div>

      <ModalFooter className="justify-between">
        <p className="self-center text-xs text-metro-muted">TrAcción prepara los borradores; el envío final se realiza desde Outlook tras tu revisión.</p>
        <div className="flex gap-2">
          <ActionButton variant="secondary" iconOnly={false} onClick={closeCollectionMails}>Cerrar</ActionButton>
          {mailPreviewGroup ? (
            <ActionButton variant="secondary" iconOnly={false} icon={MailPlus} loading={generatingCollectionForId === mailTarget.id} onClick={() => void generateSingleCollectionMail(mailPreviewGroup)}>Preparar solo este</ActionButton>
          ) : null}
          <ActionButton variant="primary" iconOnly={false} icon={MailPlus} loading={generatingCollectionForId === mailTarget.id} onClick={() => void generateAllCollectionMails()}>Preparar todos</ActionButton>
        </div>
      </ModalFooter>
    </ModalShell>
  );
}
