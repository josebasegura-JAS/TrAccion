import type { Dispatch, SetStateAction } from 'react';
import { MailPlus, Plus } from 'lucide-react';
import { ActionButton } from '../../../components/ui/ActionButton';
import { RichTextEditor } from '../../../components/ui/RichTextEditor';
import { HUELGA_MAIL_MARKERS } from './huelgasMailTemplates';
import { isZonaCompleta, type HuelgaZona } from './huelgasZones';
import type { HuelgaArea } from './huelgasAreas';

type ZoneField = 'nombre' | 'responsableNombre' | 'responsableEmail' | 'correoActivo' | 'correoAsunto' | 'correoCuerpoHtml' | 'correoPlazos' | 'correoInstruccionesHabituales' | 'active';
type AreaField = 'nombre' | 'zonaId' | 'active';

type Props = {
  zonesOpen: boolean;
  zoneDraft: HuelgaZona[];
  areaDraft: HuelgaArea[];
  newZoneName: string;
  setNewZoneName: Dispatch<SetStateAction<string>>;
  newAreaName: string;
  setNewAreaName: Dispatch<SetStateAction<string>>;
  newAreaZoneId: string;
  setNewAreaZoneId: Dispatch<SetStateAction<string>>;
  savingZones: boolean;
  mailTemplateZone: HuelgaZona | null;
  setMailTemplateZoneId: Dispatch<SetStateAction<string | null>>;
  onCloseZones: () => void;
  onAddZone: () => void;
  onUpdateZone: (id: string, field: ZoneField, value: string | boolean) => void;
  onAddArea: () => void;
  onUpdateArea: (id: string, field: AreaField, value: string | boolean) => void;
  onSaveZones: () => void;
};

export function HuelgasZonesModals({
  zonesOpen,
  zoneDraft,
  areaDraft,
  newZoneName,
  setNewZoneName,
  newAreaName,
  setNewAreaName,
  newAreaZoneId,
  setNewAreaZoneId,
  savingZones,
  mailTemplateZone,
  setMailTemplateZoneId,
  onCloseZones: closeZones,
  onAddZone: addZone,
  onUpdateZone: updateZone,
  onAddArea: addArea,
  onUpdateArea: updateArea,
  onSaveZones: saveZones,
}: Props) {
  return (
    <>
      {zonesOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" role="presentation">
          <section className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-metro-border bg-metro-app shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="huelga-zones-title">
            <div className="flex items-start justify-between gap-4 border-b border-metro-border px-5 py-4">
              <div>
                <h2 id="huelga-zones-title" className="text-lg font-semibold text-metro-text">Zonas y áreas de trabajo</h2>
                <p className="mt-1 text-sm text-metro-muted">Gestiona las zonas, sus responsables y las áreas que pertenecen a cada una. Las asignaciones de huelga elegirán únicamente entre estas áreas.</p>
              </div>
              <button className="rounded-lg px-2 py-1 text-xl text-metro-muted hover:bg-metro-raised hover:text-metro-text" onClick={closeZones} type="button" aria-label="Cerrar">×</button>
            </div>
            <div className="space-y-4 overflow-y-auto p-5">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-metro-border bg-metro-panel/55 p-3"><p className="text-xs text-metro-muted">Zonas</p><strong className="mt-1 block text-xl text-metro-text">{zoneDraft.length}</strong></div>
                <div className="rounded-xl border border-metro-border bg-metro-panel/55 p-3"><p className="text-xs text-metro-muted">Áreas</p><strong className="mt-1 block text-xl text-metro-text">{areaDraft.length}</strong></div>
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3"><p className="text-xs text-emerald-200/80">Activas completas</p><strong className="mt-1 block text-xl text-emerald-200">{zoneDraft.filter(isZonaCompleta).length}</strong></div>
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3"><p className="text-xs text-amber-200/80">Activas pendientes</p><strong className="mt-1 block text-xl text-amber-200">{zoneDraft.filter((zona) => zona.active && !isZonaCompleta(zona)).length}</strong></div>
              </div>

              <div className="flex gap-2 rounded-xl border border-metro-border bg-metro-panel/55 p-3">
                <input className="h-10 flex-1 rounded-xl border border-metro-border bg-metro-app px-3 text-sm text-metro-text outline-none focus:border-metro-red" placeholder="Nueva zona" value={newZoneName} onChange={(event) => setNewZoneName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addZone(); } }} />
                <ActionButton variant="add" iconOnly={false} icon={Plus} onClick={addZone}>Añadir zona</ActionButton>
              </div>

              <div className="overflow-hidden rounded-xl border border-metro-border">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-left text-xs">
                    <thead className="bg-metro-raised/75 text-[11px] uppercase tracking-wide text-metro-muted"><tr><th className="px-3 py-2.5 font-semibold">Zona</th><th className="px-3 py-2.5 font-semibold">Responsable</th><th className="px-3 py-2.5 font-semibold">Email</th><th className="px-3 py-2.5 font-semibold">Correo</th><th className="w-28 px-3 py-2.5 font-semibold">Estado</th></tr></thead>
                    <tbody className="divide-y divide-metro-border">
                      {zoneDraft.map((zona) => (
                        <tr key={zona.id} className="align-top hover:bg-metro-raised/35">
                          <td className="px-3 py-2"><input className="h-9 w-full rounded-lg border border-metro-border bg-metro-app px-2.5 text-xs text-metro-text outline-none focus:border-metro-red" value={zona.nombre} onChange={(event) => updateZone(zona.id, 'nombre', event.target.value)} /></td>
                          <td className="px-3 py-2"><input className="h-9 w-full rounded-lg border border-metro-border bg-metro-app px-2.5 text-xs text-metro-text outline-none focus:border-metro-red" placeholder="Nombre y apellidos" value={zona.responsableNombre} onChange={(event) => updateZone(zona.id, 'responsableNombre', event.target.value)} /></td>
                          <td className="px-3 py-2"><input className="h-9 w-full rounded-lg border border-metro-border bg-metro-app px-2.5 text-xs text-metro-text outline-none focus:border-metro-red" placeholder="correo@empresa.es" type="email" value={zona.responsableEmail} onChange={(event) => updateZone(zona.id, 'responsableEmail', event.target.value)} /></td>
                          <td className="px-3 py-2">
                            <button type="button" onClick={() => setMailTemplateZoneId(zona.id)} className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold ${zona.correoActivo ? 'border-sky-500/35 bg-sky-500/10 text-sky-200' : 'border-metro-border bg-metro-panel text-metro-muted'}`}>
                              <MailPlus size={13} /> {zona.correoActivo ? 'Editar plantilla' : 'Sin envío'}
                            </button>
                          </td>
                          <td className="px-3 py-2">
                            <button type="button" onClick={() => updateZone(zona.id, 'active', !zona.active)} className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${zona.active ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-200' : 'border-metro-border bg-metro-panel text-metro-muted'}`}>{zona.active ? 'Activa' : 'Inactiva'}</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="space-y-3 rounded-xl border border-metro-border bg-metro-panel/45 p-4">
                <div>
                  <h3 className="text-sm font-semibold text-metro-text">Áreas por zona</h3>
                  <p className="mt-1 text-xs text-metro-muted">Cada área pertenece a una zona. Puedes darla de alta, moverla de zona o dejarla inactiva para futuras asignaciones.</p>
                </div>
                <div className="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
                  <select className="h-10 rounded-xl border border-metro-border bg-metro-app px-3 text-sm text-metro-text outline-none focus:border-metro-red" value={newAreaZoneId} onChange={(event) => setNewAreaZoneId(event.target.value)}>
                    <option value="">Seleccionar zona…</option>
                    {zoneDraft.filter((zona) => zona.active).map((zona) => <option key={zona.id} value={zona.id}>{zona.nombre}</option>)}
                  </select>
                  <input className="h-10 rounded-xl border border-metro-border bg-metro-app px-3 text-sm text-metro-text outline-none focus:border-metro-red" placeholder="Nueva área" value={newAreaName} onChange={(event) => setNewAreaName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addArea(); } }} />
                  <ActionButton variant="add" iconOnly={false} icon={Plus} onClick={addArea}>Añadir área</ActionButton>
                </div>
                <div className="overflow-hidden rounded-xl border border-metro-border">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[680px] text-left text-xs">
                      <thead className="bg-metro-raised/75 text-[11px] uppercase tracking-wide text-metro-muted"><tr><th className="px-3 py-2.5 font-semibold">Área</th><th className="px-3 py-2.5 font-semibold">Zona</th><th className="w-28 px-3 py-2.5 font-semibold">Estado</th></tr></thead>
                      <tbody className="divide-y divide-metro-border">
                        {areaDraft
                          .slice()
                          .sort((a, b) => {
                            const zoneA = zoneDraft.find((zona) => zona.id === a.zonaId)?.nombre ?? '';
                            const zoneB = zoneDraft.find((zona) => zona.id === b.zonaId)?.nombre ?? '';
                            const zoneOrder = zoneA.localeCompare(zoneB, 'es', { sensitivity: 'base' });
                            return zoneOrder || a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' });
                          })
                          .map((area) => (
                            <tr key={area.id} className="align-top hover:bg-metro-raised/35">
                              <td className="px-3 py-2"><input className="h-9 w-full rounded-lg border border-metro-border bg-metro-app px-2.5 text-xs text-metro-text outline-none focus:border-metro-red" value={area.nombre} onChange={(event) => updateArea(area.id, 'nombre', event.target.value)} /></td>
                              <td className="px-3 py-2"><select className="h-9 w-full rounded-lg border border-metro-border bg-metro-app px-2.5 text-xs text-metro-text outline-none focus:border-metro-red" value={area.zonaId} onChange={(event) => updateArea(area.id, 'zonaId', event.target.value)}>{zoneDraft.map((zona) => <option key={zona.id} value={zona.id}>{zona.nombre}{zona.active ? '' : ' (inactiva)'}</option>)}</select></td>
                              <td className="px-3 py-2"><button type="button" onClick={() => updateArea(area.id, 'active', !area.active)} className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${area.active ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-200' : 'border-metro-border bg-metro-panel text-metro-muted'}`}>{area.active ? 'Activa' : 'Inactiva'}</button></td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <p className="text-xs leading-5 text-metro-muted">Dar de baja una zona o área la deja inactiva para nuevas asignaciones, pero no elimina su histórico ni las huelgas que ya la tenían asignada.</p>
            </div>
            <div className="flex justify-end gap-2 border-t border-metro-border bg-metro-app px-5 py-4">
              <ActionButton variant="secondary" iconOnly={false} onClick={closeZones}>Cancelar</ActionButton>
              <ActionButton variant="save" iconOnly={false} loading={savingZones} onClick={() => void saveZones()}>Guardar zonas y áreas</ActionButton>
            </div>
          </section>
        </div>
      )}

      {mailTemplateZone && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4" role="presentation">
          <section className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-metro-border bg-metro-app shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="huelga-mail-template-title">
            <div className="flex items-start justify-between gap-4 border-b border-metro-border px-5 py-4">
              <div>
                <h2 id="huelga-mail-template-title" className="text-lg font-semibold text-metro-text">Plantilla de correo · {mailTemplateZone.nombre}</h2>
                <p className="mt-1 text-sm text-metro-muted">Configura el texto habitual de esta Zona. Las variables se sustituirán con los datos de cada huelga.</p>
              </div>
              <button className="rounded-lg px-2 py-1 text-xl text-metro-muted hover:bg-metro-raised hover:text-metro-text" onClick={() => setMailTemplateZoneId(null)} type="button" aria-label="Cerrar">×</button>
            </div>
            <div className="space-y-4 overflow-y-auto p-5">
              <label className="flex items-center gap-3 rounded-xl border border-metro-border bg-metro-panel/55 p-3 text-sm text-metro-text">
                <input
                  type="checkbox"
                  checked={mailTemplateZone.correoActivo}
                  onChange={(event) => updateZone(mailTemplateZone.id, 'correoActivo', event.target.checked)}
                />
                Generar correo para esta Zona
                {!mailTemplateZone.correoActivo && <span className="text-xs text-metro-muted">No aparecerá en la preparación de correos.</span>}
              </label>

              <label className="block space-y-1.5 text-sm font-medium text-metro-text">
                Asunto
                <input
                  className="h-10 w-full rounded-xl border border-metro-border bg-metro-panel px-3 text-sm text-metro-text outline-none focus:border-metro-red"
                  value={mailTemplateZone.correoAsunto}
                  onChange={(event) => updateZone(mailTemplateZone.id, 'correoAsunto', event.target.value)}
                />
              </label>

              <div className="grid gap-4 lg:grid-cols-2">
                <label className="block space-y-1.5 text-sm font-medium text-metro-text">
                  Plazos habituales
                  <textarea
                    className="min-h-24 w-full resize-y rounded-xl border border-metro-border bg-metro-panel px-3 py-2.5 text-sm text-metro-text outline-none focus:border-metro-red"
                    placeholder="Ej. Antes de las 9:45 h los datos de mañana y antes de las 15:00 h los de tarde."
                    value={mailTemplateZone.correoPlazos}
                    onChange={(event) => updateZone(mailTemplateZone.id, 'correoPlazos', event.target.value)}
                  />
                </label>
                <label className="block space-y-1.5 text-sm font-medium text-metro-text">
                  Instrucciones habituales de la Zona
                  <textarea
                    className="min-h-24 w-full resize-y rounded-xl border border-metro-border bg-metro-panel px-3 py-2.5 text-sm text-metro-text outline-none focus:border-metro-red"
                    placeholder="Reglas que se repiten en todas las huelgas de esta Zona."
                    value={mailTemplateZone.correoInstruccionesHabituales}
                    onChange={(event) => updateZone(mailTemplateZone.id, 'correoInstruccionesHabituales', event.target.value)}
                  />
                </label>
              </div>

              <div className="space-y-2">
                <div>
                  <h3 className="text-sm font-semibold text-metro-text">Cuerpo del correo</h3>
                  <p className="mt-1 text-xs text-metro-muted">Puedes pegar texto desde Outlook o Word y aplicar negrita, cursiva y listas.</p>
                </div>
                <RichTextEditor
                  value={mailTemplateZone.correoCuerpoHtml}
                  onChange={(html) => updateZone(mailTemplateZone.id, 'correoCuerpoHtml', html)}
                  placeholder="Plantilla de correo..."
                  minHeightClassName="min-h-[300px]"
                />
              </div>

              <div className="rounded-xl border border-metro-border bg-metro-panel/45 p-4">
                <h3 className="text-sm font-semibold text-metro-text">Variables disponibles</h3>
                <p className="mt-1 text-xs text-metro-muted">Escribe o copia cualquiera de estos marcadores dentro del asunto o del cuerpo.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {HUELGA_MAIL_MARKERS.map((markerValue) => (
                    <button
                      key={markerValue}
                      className="rounded-lg border border-metro-border bg-metro-app px-2.5 py-1.5 font-mono text-[11px] text-metro-text hover:border-metro-red"
                      type="button"
                      onClick={() => void navigator.clipboard?.writeText(markerValue)}
                      title="Copiar marcador"
                    >
                      {markerValue}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-metro-border bg-metro-app px-5 py-4">
              <ActionButton variant="secondary" iconOnly={false} onClick={() => setMailTemplateZoneId(null)}>Volver</ActionButton>
              <ActionButton variant="save" iconOnly={false} onClick={() => setMailTemplateZoneId(null)}>Aplicar a borrador</ActionButton>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
