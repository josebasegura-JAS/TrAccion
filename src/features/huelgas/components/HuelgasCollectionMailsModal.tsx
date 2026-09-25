import { MailPlus } from 'lucide-react';
import { ActionButton } from '../../../components/ui/ActionButton';
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
  return (
    <>
      {mailTarget && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/65 p-4" role="presentation">
          <section className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-metro-border bg-metro-app shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="huelga-mails-title">
            <div className="flex items-start justify-between gap-4 border-b border-metro-border px-5 py-4">
              <div>
                <h2 id="huelga-mails-title" className="text-lg font-semibold text-metro-text">Correos por Zona · {formatDate(mailTarget.fecha)}</h2>
                <p className="mt-1 text-sm text-metro-muted">Revisa el texto real que recibirá cada responsable. SSCC y las zonas con correo desactivado quedan fuera.</p>
              </div>
              <button className="rounded-lg px-2 py-1 text-xl text-metro-muted hover:bg-metro-raised hover:text-metro-text" onClick={closeCollectionMails} type="button" aria-label="Cerrar">×</button>
            </div>

            <div className="grid min-h-0 flex-1 overflow-hidden lg:grid-cols-[320px_1fr]">
              <aside className="overflow-y-auto border-r border-metro-border p-4">
                <div className="space-y-2">
                  {mailGroups.map((group) => {
                    const zona = zonas.find((item) => item.id === group.zonaId);
                    const selected = group.zonaId === mailPreviewZoneId;
                    return (
                      <button
                        key={group.zonaId}
                        className={`w-full rounded-xl border p-3 text-left transition ${selected ? 'border-metro-red bg-metro-red/10' : 'border-metro-border bg-metro-panel/45 hover:bg-metro-raised/40'}`}
                        type="button"
                        onClick={() => setMailPreviewZoneId(group.zonaId)}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <strong className="text-sm text-metro-text">{group.zonaNombre}</strong>
                          <span className="text-[11px] text-metro-muted">{group.personal.length} pers.</span>
                        </div>
                        <p className="mt-1 truncate text-xs text-metro-muted">{zona?.responsableNombre || 'Sin responsable'}</p>
                        <p className="truncate text-[11px] text-metro-muted">{zona?.responsableEmail || 'Sin email'}</p>
                      </button>
                    );
                  })}
                </div>
              </aside>

              <div className="overflow-y-auto p-5">
                {mailPreviewGroup && currentMailPreview ? (
                  <div className="space-y-4">
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="rounded-xl border border-metro-border bg-metro-panel/50 p-3">
                        <p className="text-[11px] uppercase tracking-wide text-metro-muted">Para</p>
                        <p className="mt-1 text-sm font-semibold text-metro-text">{zonas.find((item) => item.id === mailPreviewGroup.zonaId)?.responsableEmail || '—'}</p>
                      </div>
                      <div className="rounded-xl border border-metro-border bg-metro-panel/50 p-3">
                        <p className="text-[11px] uppercase tracking-wide text-metro-muted">Personas con turno</p>
                        <p className="mt-1 text-sm font-semibold text-metro-text">{mailPreviewGroup.personal.length}</p>
                      </div>
                    </div>

                    <label className="block space-y-1.5 text-sm font-medium text-metro-text">
                      Instrucciones específicas de esta huelga
                      <textarea
                        className="min-h-24 w-full resize-y rounded-xl border border-metro-border bg-metro-panel px-3 py-2.5 text-sm text-metro-text outline-none focus:border-metro-red"
                        placeholder="Excepciones o indicaciones válidas solo para esta huelga y esta Zona..."
                        value={mailSpecificNotes[mailPreviewGroup.zonaId] ?? ''}
                        onChange={(event) => setMailSpecificNotes((current) => ({ ...current, [mailPreviewGroup.zonaId]: event.target.value }))}
                      />
                    </label>

                    <div className="rounded-xl border border-metro-border bg-white p-5 text-gray-900 shadow-inner">
                      <div className="mb-4 border-b border-gray-200 pb-3 text-sm">
                        <p><strong>Asunto:</strong> {currentMailPreview.subject}</p>
                      </div>
                      <div className="prose prose-sm max-w-none font-sans" dangerouslySetInnerHTML={{ __html: currentMailPreview.html }} />
                    </div>

                    <div className="flex flex-wrap justify-end gap-2">
                      <ActionButton variant="secondary" iconOnly={false} onClick={() => void saveMailSpecificNotes()}>Guardar instrucciones</ActionButton>
                      <ActionButton variant="primary" iconOnly={false} icon={MailPlus} loading={generatingCollectionForId === mailTarget.id} onClick={() => void generateSingleCollectionMail(mailPreviewGroup)}>Generar este correo</ActionButton>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-metro-border p-8 text-center text-sm text-metro-muted">Selecciona una Zona para revisar su correo.</div>
                )}
              </div>
            </div>

            <div className="flex flex-wrap justify-between gap-2 border-t border-metro-border bg-metro-app px-5 py-4">
              <p className="self-center text-xs text-metro-muted">En esta fase los borradores se crean sin Excel adjunto.</p>
              <div className="flex gap-2">
                <ActionButton variant="secondary" iconOnly={false} onClick={closeCollectionMails}>Cerrar</ActionButton>
                <ActionButton variant="primary" iconOnly={false} icon={MailPlus} loading={generatingCollectionForId === mailTarget.id} onClick={() => void generateAllCollectionMails()}>Generar todos</ActionButton>
              </div>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
