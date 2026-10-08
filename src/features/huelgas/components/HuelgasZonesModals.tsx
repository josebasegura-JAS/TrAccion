import type { Dispatch, SetStateAction } from 'react';
import { FileSpreadsheet, MailPlus } from 'lucide-react';
import { ActionButton } from '../../../components/ui/ActionButton';
import { ModalCloseButton } from '../../../components/ui/ModalCloseButton';
import { ModalBody, ModalFooter, ModalHeader, ModalShell, ModalTitle } from '../../../components/ui/ModalShell';
import { RichTextEditor } from '../../../components/ui/RichTextEditor';
import { HUELGA_MAIL_MARKERS } from './huelgasMailTemplates';
import { isZonaCompleta, type HuelgaZona } from './huelgasZones';

type ZoneField = 'nombre' | 'responsableNombre' | 'responsableEmail' | 'correoCc' | 'correoActivo' | 'correoAsunto' | 'correoCuerpoHtml' | 'correoPlazos' | 'correoInstruccionesHabituales' | 'plantillaExcelNombrePatron' | 'active';

type Props = {
  zonesOpen: boolean;
  zoneDraft: HuelgaZona[];
  savingZones: boolean;
  mailTemplateZone: HuelgaZona | null;
  setMailTemplateZoneId: Dispatch<SetStateAction<string | null>>;
  onCloseZones: () => void;
  onUpdateZone: (id: string, field: ZoneField, value: string | boolean) => void;
  onSaveZones: () => void;
};

export function HuelgasZonesModals({
  zonesOpen,
  zoneDraft,
  savingZones,
  mailTemplateZone,
  setMailTemplateZoneId,
  onCloseZones: closeZones,
  onUpdateZone: updateZone,
  onSaveZones: saveZones,
}: Props) {
  return (
    <>
      {zonesOpen && (
        <ModalShell labelledBy="huelga-zones-title" onClose={closeZones} size="xl" stacked>
          <ModalHeader>
            <ModalTitle
              id="huelga-zones-title"
              subtitle="Estos siete circuitos son la base permanente de la recogida. Configura destinatarios y revisa la plantilla de cada uno."
            >
              Configuración de recogida de huelgas
            </ModalTitle>
            <ModalCloseButton onClick={closeZones} />
          </ModalHeader>
          <ModalBody className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-metro-border bg-metro-panel/55 p-3"><p className="text-xs text-metro-muted">Circuitos</p><strong className="mt-1 block text-xl text-metro-text">{zoneDraft.length}</strong></div>
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3"><p className="text-xs text-emerald-200/80">Completos</p><strong className="mt-1 block text-xl text-emerald-200">{zoneDraft.filter(isZonaCompleta).length}</strong></div>
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3"><p className="text-xs text-amber-200/80">Pendientes</p><strong className="mt-1 block text-xl text-amber-200">{zoneDraft.filter((zona) => zona.active && !isZonaCompleta(zona)).length}</strong></div>
            </div>

            <div className="overflow-hidden rounded-xl border border-metro-border">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] text-left text-xs">
                  <thead className="bg-metro-raised/75 text-[11px] uppercase tracking-wide text-metro-muted"><tr><th className="px-3 py-2.5 font-semibold">Circuito</th><th className="px-3 py-2.5 font-semibold">Responsables</th><th className="px-3 py-2.5 font-semibold">Destinatarios</th><th className="px-3 py-2.5 font-semibold">Excel</th><th className="px-3 py-2.5 font-semibold">Correo</th><th className="w-24 px-3 py-2.5 font-semibold">Estado</th></tr></thead>
                  <tbody className="divide-y divide-metro-border">
                    {zoneDraft.map((zona) => (
                      <tr key={zona.id} className="align-top hover:bg-metro-raised/35">
                        <td className="px-3 py-2"><strong className="text-metro-text">{zona.nombre}</strong></td>
                        <td className="px-3 py-2"><input className="h-9 w-full rounded-lg border border-metro-border bg-metro-app px-2.5 text-xs text-metro-text outline-none focus:border-metro-red" value={zona.responsableNombre} onChange={(event) => updateZone(zona.id, 'responsableNombre', event.target.value)} /></td>
                        <td className="px-3 py-2"><textarea className="min-h-16 w-full resize-y rounded-lg border border-metro-border bg-metro-app px-2.5 py-2 text-xs text-metro-text outline-none focus:border-metro-red" placeholder="correo1@...; correo2@..." value={zona.responsableEmail} onChange={(event) => updateZone(zona.id, 'responsableEmail', event.target.value)} /></td>
                        <td className="px-3 py-2"><div className="flex items-start gap-2"><FileSpreadsheet className="mt-0.5 shrink-0 text-emerald-300" size={15} /><span className="max-w-[220px] text-[11px] leading-4 text-metro-muted">{zona.plantillaExcelNombrePatron}</span></div></td>
                        <td className="px-3 py-2"><button type="button" onClick={() => setMailTemplateZoneId(zona.id)} className="inline-flex items-center gap-1 rounded-lg border border-sky-500/35 bg-sky-500/10 px-2.5 py-1.5 text-[11px] font-semibold text-sky-200"><MailPlus size={13} /> Editar</button></td>
                        <td className="px-3 py-2"><span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${isZonaCompleta(zona) ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-200' : 'border-amber-500/35 bg-amber-500/10 text-amber-200'}`}>{isZonaCompleta(zona) ? 'Listo' : 'Revisar'}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <p className="text-xs leading-5 text-metro-muted">Las siete plantillas Excel incorporadas proceden de los modelos reales de la huelga del 17/03/2026. El nombre del fichero se adapta automáticamente a la fecha de cada convocatoria.</p>
          </ModalBody>
          <ModalFooter>
            <ActionButton variant="secondary" iconOnly={false} onClick={closeZones}>Cancelar</ActionButton>
            <ActionButton variant="save" iconOnly={false} loading={savingZones} onClick={() => void saveZones()}>Guardar configuración</ActionButton>
          </ModalFooter>
        </ModalShell>
      )}

      {mailTemplateZone && (
        <ModalShell labelledBy="huelga-mail-template-title" onClose={() => setMailTemplateZoneId(null)} size="lg" stacked>
          <ModalHeader>
            <ModalTitle id="huelga-mail-template-title" subtitle="Configura el texto habitual y los destinatarios de este circuito. Las variables se sustituyen con los datos de cada huelga.">
              Comunicación · {mailTemplateZone.nombre}
            </ModalTitle>
            <ModalCloseButton onClick={() => setMailTemplateZoneId(null)} />
          </ModalHeader>
          <ModalBody className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block space-y-1.5 text-sm font-medium text-metro-text">Para
                <textarea className="min-h-20 w-full resize-y rounded-xl border border-metro-border bg-metro-panel px-3 py-2.5 text-sm text-metro-text outline-none focus:border-metro-red" value={mailTemplateZone.responsableEmail} onChange={(event) => updateZone(mailTemplateZone.id, 'responsableEmail', event.target.value)} />
              </label>
              <label className="block space-y-1.5 text-sm font-medium text-metro-text">CC
                <textarea className="min-h-20 w-full resize-y rounded-xl border border-metro-border bg-metro-panel px-3 py-2.5 text-sm text-metro-text outline-none focus:border-metro-red" value={mailTemplateZone.correoCc} onChange={(event) => updateZone(mailTemplateZone.id, 'correoCc', event.target.value)} />
              </label>
            </div>

            <label className="block space-y-1.5 text-sm font-medium text-metro-text">Asunto
              <input className="h-10 w-full rounded-xl border border-metro-border bg-metro-panel px-3 text-sm text-metro-text outline-none focus:border-metro-red" value={mailTemplateZone.correoAsunto} onChange={(event) => updateZone(mailTemplateZone.id, 'correoAsunto', event.target.value)} />
            </label>

            <div className="grid gap-4 lg:grid-cols-2">
              <label className="block space-y-1.5 text-sm font-medium text-metro-text">Plazos habituales
                <textarea className="min-h-24 w-full resize-y rounded-xl border border-metro-border bg-metro-panel px-3 py-2.5 text-sm text-metro-text outline-none focus:border-metro-red" value={mailTemplateZone.correoPlazos} onChange={(event) => updateZone(mailTemplateZone.id, 'correoPlazos', event.target.value)} />
              </label>
              <label className="block space-y-1.5 text-sm font-medium text-metro-text">Ámbito e instrucciones habituales
                <textarea className="min-h-24 w-full resize-y rounded-xl border border-metro-border bg-metro-panel px-3 py-2.5 text-sm text-metro-text outline-none focus:border-metro-red" value={mailTemplateZone.correoInstruccionesHabituales} onChange={(event) => updateZone(mailTemplateZone.id, 'correoInstruccionesHabituales', event.target.value)} />
              </label>
            </div>

            <label className="block space-y-1.5 text-sm font-medium text-metro-text">Nombre del Excel adjunto
              <input className="h-10 w-full rounded-xl border border-metro-border bg-metro-panel px-3 text-sm text-metro-text outline-none focus:border-metro-red" value={mailTemplateZone.plantillaExcelNombrePatron} onChange={(event) => updateZone(mailTemplateZone.id, 'plantillaExcelNombrePatron', event.target.value)} />
              <span className="block text-xs font-normal text-metro-muted">Usa {'{{FECHA_HUELGA_ARCHIVO}}'} para insertar la fecha como DD-MM-AAAA.</span>
            </label>

            <div className="space-y-2">
              <div><h3 className="text-sm font-semibold text-metro-text">Cuerpo del correo</h3><p className="mt-1 text-xs text-metro-muted">La plantilla común reproduce las instrucciones generales y permite particularidades por circuito.</p></div>
              <RichTextEditor value={mailTemplateZone.correoCuerpoHtml} onChange={(html) => updateZone(mailTemplateZone.id, 'correoCuerpoHtml', html)} placeholder="Plantilla de correo..." minHeightClassName="min-h-[300px]" />
            </div>

            <div className="rounded-xl border border-metro-border bg-metro-panel/45 p-4">
              <h3 className="text-sm font-semibold text-metro-text">Variables disponibles</h3>
              <div className="mt-3 flex flex-wrap gap-2">
                {HUELGA_MAIL_MARKERS.map((markerValue) => (
                  <button key={markerValue} className="rounded-lg border border-metro-border bg-metro-app px-2.5 py-1.5 font-mono text-[11px] text-metro-text hover:border-metro-red" type="button" onClick={() => void navigator.clipboard?.writeText(markerValue)} title="Copiar marcador">{markerValue}</button>
                ))}
              </div>
            </div>
          </ModalBody>
          <ModalFooter>
            <ActionButton variant="secondary" iconOnly={false} onClick={() => setMailTemplateZoneId(null)}>Volver</ActionButton>
            <ActionButton variant="save" iconOnly={false} onClick={() => setMailTemplateZoneId(null)}>Aplicar</ActionButton>
          </ModalFooter>
        </ModalShell>
      )}
    </>
  );
}
