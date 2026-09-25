import type { Dispatch, SetStateAction } from 'react';
import { MapPinned, Search, Settings2 } from 'lucide-react';
import { ActionButton } from '../../../components/ui/ActionButton';
import type { Employee } from '../../plantilla/domain/employee';
import type { HuelgaPersonalTurno } from './huelgasPersonalImport';
import { asignacionKey, isAsignacionCompleta, type HuelgaPuestoAsignacion } from './huelgasAssignments';
import type { HuelgaZona } from './huelgasZones';
import type { HuelgaArea } from './huelgasAreas';
import { formatDate, sameNormalizedText, type AssignmentFilters, type AssignmentSortDirection, type AssignmentSortKey, type Huelga } from './huelgasPageModel';

type Props = {
  assignmentTarget: Huelga | null;
  assignmentDraft: HuelgaPuestoAsignacion[];
  assignmentConfiguredCount: number;
  assignmentSearch: string;
  setAssignmentSearch: Dispatch<SetStateAction<string>>;
  assignmentFilters: AssignmentFilters;
  assignmentSort: { key: AssignmentSortKey; direction: AssignmentSortDirection };
  filteredAssignmentDraft: HuelgaPuestoAsignacion[];
  assignmentPersonCounts: Map<string, number>;
  zonas: HuelgaZona[];
  areas: HuelgaArea[];
  savingAssignments: boolean;
  personDetailAssignment: HuelgaPuestoAsignacion | null;
  personDetailRows: HuelgaPersonalTurno[];
  employees: Employee[];
  personResidenceDrafts: Record<string, string>;
  setPersonResidenceDrafts: Dispatch<SetStateAction<Record<string, string>>>;
  savingPersonId: string | null;
  onOpenZones: () => void;
  onCloseAssignments: () => void;
  onToggleAssignmentSort: (key: AssignmentSortKey) => void;
  onUpdateAssignmentFilter: (key: keyof AssignmentFilters, value: string) => void;
  onUpdateAssignmentResidence: (residencia: string, puesto: string, value: string) => void;
  onUpdateAssignment: (residencia: string, puesto: string, field: 'areaId' | 'zonaId', value: string) => void;
  onOpenPersonDetail: (assignment: HuelgaPuestoAsignacion) => void;
  onClosePersonDetail: () => void;
  onSavePersonResidence: (persona: HuelgaPersonalTurno) => void;
  onSaveAssignments: () => void;
};

export function HuelgasAssignmentModals({
  assignmentTarget,
  assignmentDraft,
  assignmentConfiguredCount,
  assignmentSearch,
  setAssignmentSearch,
  assignmentFilters,
  assignmentSort,
  filteredAssignmentDraft,
  assignmentPersonCounts,
  zonas,
  areas,
  savingAssignments,
  personDetailAssignment,
  personDetailRows,
  employees,
  personResidenceDrafts,
  setPersonResidenceDrafts,
  savingPersonId,
  onOpenZones: openZones,
  onCloseAssignments: closeAssignments,
  onToggleAssignmentSort: toggleAssignmentSort,
  onUpdateAssignmentFilter: updateAssignmentFilter,
  onUpdateAssignmentResidence: updateAssignmentResidence,
  onUpdateAssignment: updateAssignment,
  onOpenPersonDetail: openPersonDetail,
  onClosePersonDetail: closePersonDetail,
  onSavePersonResidence: savePersonResidence,
  onSaveAssignments: saveAssignments,
}: Props) {
  return (
    <>
      {assignmentTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4" role="presentation">
          <section className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-metro-border bg-metro-app shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="huelga-assignment-title">
            <div className="flex items-start justify-between gap-4 border-b border-metro-border px-5 py-4">
              <div>
                <h2 id="huelga-assignment-title" className="text-lg font-semibold text-metro-text">Asignación de áreas y zonas</h2>
                <p className="mt-1 text-sm text-metro-muted">
                  {formatDate(assignmentTarget.fecha)} · Define o corrige la residencia y asigna primero la zona; después selecciona una de las áreas disponibles en esa zona. El responsable y email se gestionan a nivel de zona.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <ActionButton variant="secondary" size="sm" iconOnly={false} icon={MapPinned} onClick={openZones}>Gestionar zonas y áreas</ActionButton>
                <button className="rounded-lg px-2 py-1 text-xl text-metro-muted hover:bg-metro-raised hover:text-metro-text" onClick={closeAssignments} type="button" aria-label="Cerrar">×</button>
              </div>
            </div>

            <div className="space-y-4 overflow-y-auto p-5">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-metro-border bg-metro-panel/55 p-3">
                  <p className="text-xs text-metro-muted">Residencia + puesto</p>
                  <strong className="mt-1 block text-xl text-metro-text">{assignmentDraft.length}</strong>
                </div>
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3">
                  <p className="text-xs text-emerald-200/80">Configurados</p>
                  <strong className="mt-1 block text-xl text-emerald-200">{assignmentConfiguredCount}</strong>
                </div>
                <div className={`rounded-xl border p-3 ${assignmentConfiguredCount === assignmentDraft.length ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-amber-500/30 bg-amber-500/10'}`}>
                  <p className={`text-xs ${assignmentConfiguredCount === assignmentDraft.length ? 'text-emerald-200/80' : 'text-amber-200/80'}`}>Pendientes</p>
                  <strong className={`mt-1 block text-xl ${assignmentConfiguredCount === assignmentDraft.length ? 'text-emerald-200' : 'text-amber-200'}`}>{assignmentDraft.length - assignmentConfiguredCount}</strong>
                </div>
              </div>

              <section className="rounded-xl border border-metro-border bg-metro-panel/55 p-4">
                <div className="flex items-start gap-3">
                  <Settings2 className="mt-0.5 shrink-0 text-metro-red" size={19} />
                  <div>
                    <p className="text-sm font-semibold text-metro-text">Configuración reutilizable</p>
                    <p className="mt-1 text-xs leading-5 text-metro-muted">
                      La relación residencia + puesto → área → zona se reutilizará automáticamente en futuras huelgas. La residencia de esta tabla puede ajustarse como agrupación de la huelga; si el dato incorrecto está en una persona concreta, usa «Ver personas» y corrígela allí: esa corrección actualizará también la Plantilla maestra. Los responsables se definen en el maestro de zonas. Esta huelga conservará su propia copia de área, zona y responsable para que los cambios futuros no alteren su histórico.
                    </p>
                  </div>
                </div>
              </section>

              <label className="relative block">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-metro-muted" size={16} />
                <input
                  className="h-10 w-full rounded-xl border border-metro-border bg-metro-panel pl-9 pr-3 text-sm text-metro-text outline-none focus:border-metro-red"
                  placeholder="Buscar residencia, puesto, área, zona o responsable..."
                  value={assignmentSearch}
                  onChange={(event) => setAssignmentSearch(event.target.value)}
                />
              </label>

              <div className="overflow-hidden rounded-xl border border-metro-border">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[980px] text-left text-xs">
                    <thead className="bg-metro-raised/75 text-[11px] text-metro-muted">
                      <tr className="uppercase tracking-wide">
                        {[
                          ['residencia', 'Residencia'],
                          ['puesto', 'Puesto'],
                          ['personas', 'Personas'],
                          ['zona', 'Zona'],
                          ['area', 'Área'],
                          ['responsable', 'Responsable de zona'],
                          ['estado', 'Estado'],
                        ].map(([key, label]) => (
                          <th className={`px-3 py-2.5 font-semibold ${key === 'personas' ? 'w-20 text-center' : key === 'estado' ? 'w-28' : ''}`} key={key}>
                            <button className="inline-flex items-center gap-1 hover:text-metro-text" onClick={() => toggleAssignmentSort(key as AssignmentSortKey)} type="button">
                              {label}
                              <span className="text-[10px]">{assignmentSort.key === key ? (assignmentSort.direction === 'asc' ? '▲' : '▼') : '↕'}</span>
                            </button>
                          </th>
                        ))}
                      </tr>
                      <tr className="border-t border-metro-border/70 normal-case tracking-normal">
                        <th className="px-2 pb-2"><input className="h-8 w-full rounded-md border border-metro-border bg-metro-app px-2 text-[11px] text-metro-text outline-none focus:border-metro-red" placeholder="Filtrar…" value={assignmentFilters.residencia} onChange={(event) => updateAssignmentFilter('residencia', event.target.value)} /></th>
                        <th className="px-2 pb-2"><input className="h-8 w-full rounded-md border border-metro-border bg-metro-app px-2 text-[11px] text-metro-text outline-none focus:border-metro-red" placeholder="Filtrar…" value={assignmentFilters.puesto} onChange={(event) => updateAssignmentFilter('puesto', event.target.value)} /></th>
                        <th className="px-2 pb-2"><input className="h-8 w-full rounded-md border border-metro-border bg-metro-app px-2 text-center text-[11px] text-metro-text outline-none focus:border-metro-red" inputMode="numeric" placeholder="Nº" value={assignmentFilters.personas} onChange={(event) => updateAssignmentFilter('personas', event.target.value.replace(/\D/g, ''))} /></th>
                        <th className="px-2 pb-2"><input className="h-8 w-full rounded-md border border-metro-border bg-metro-app px-2 text-[11px] text-metro-text outline-none focus:border-metro-red" placeholder="Filtrar…" value={assignmentFilters.zona} onChange={(event) => updateAssignmentFilter('zona', event.target.value)} /></th>
                        <th className="px-2 pb-2"><input className="h-8 w-full rounded-md border border-metro-border bg-metro-app px-2 text-[11px] text-metro-text outline-none focus:border-metro-red" placeholder="Filtrar…" value={assignmentFilters.area} onChange={(event) => updateAssignmentFilter('area', event.target.value)} /></th>
                        <th className="px-2 pb-2"><input className="h-8 w-full rounded-md border border-metro-border bg-metro-app px-2 text-[11px] text-metro-text outline-none focus:border-metro-red" placeholder="Filtrar…" value={assignmentFilters.responsable} onChange={(event) => updateAssignmentFilter('responsable', event.target.value)} /></th>
                        <th className="px-2 pb-2"><select className="h-8 w-full rounded-md border border-metro-border bg-metro-app px-2 text-[11px] text-metro-text outline-none focus:border-metro-red" value={assignmentFilters.estado} onChange={(event) => updateAssignmentFilter('estado', event.target.value)}><option value="">Todos</option><option value="configurado">Configurado</option><option value="pendiente">Pendiente</option></select></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-metro-border">
                      {filteredAssignmentDraft.map((item) => {
                        const complete = isAsignacionCompleta(item);
                        const personCount = assignmentPersonCounts.get(asignacionKey(item.residencia, item.puesto)) ?? 0;
                        return (
                          <tr className="align-top hover:bg-metro-raised/35" key={asignacionKey(item.residencia, item.puesto)}>
                            <td className="px-3 py-2">
                              <input
                                className="h-9 w-full rounded-lg border border-metro-border bg-metro-app px-2.5 text-xs font-semibold text-metro-text outline-none focus:border-metro-red"
                                aria-label={`Residencia de ${item.puesto}`}
                                value={item.residencia}
                                onChange={(event) => updateAssignmentResidence(item.residencia, item.puesto, event.target.value)}
                              />
                              <p className="mt-1 text-[10px] text-metro-muted">Agrupación de esta huelga</p>
                            </td>
                            <td className="px-3 py-3">
                              <p className="font-semibold text-metro-text">{item.puesto}</p>
                            </td>
                            <td className="px-3 py-2 text-center">
                              <p className="font-semibold text-metro-text">{personCount}</p>
                              <button
                                className="mt-1 text-[11px] font-semibold text-metro-red hover:underline"
                                type="button"
                                onClick={() => openPersonDetail(item)}
                              >
                                Ver personas
                              </button>
                            </td>
                            <td className="px-3 py-2">
                              <select
                                className="h-9 w-full rounded-lg border border-metro-border bg-metro-app px-2.5 text-xs text-metro-text outline-none focus:border-metro-red"
                                value={item.zonaId}
                                onChange={(event) => updateAssignment(item.residencia, item.puesto, 'zonaId', event.target.value)}
                              >
                                <option value="">Seleccionar zona…</option>
                                {zonas.filter((zona) => zona.active || zona.id === item.zonaId).map((zona) => (
                                  <option key={zona.id} value={zona.id}>{zona.nombre}{zona.active ? '' : ' (inactiva)'}</option>
                                ))}
                              </select>
                            </td>
                            <td className="px-3 py-2">
                              <select
                                className="h-9 w-full rounded-lg border border-metro-border bg-metro-app px-2.5 text-xs text-metro-text outline-none focus:border-metro-red disabled:cursor-not-allowed disabled:opacity-60"
                                value={item.areaId ?? ''}
                                disabled={!item.zonaId}
                                onChange={(event) => updateAssignment(item.residencia, item.puesto, 'areaId', event.target.value)}
                              >
                                <option value="">{item.zonaId ? 'Seleccionar área…' : 'Selecciona primero una zona'}</option>
                                {areas
                                  .filter((area) => area.zonaId === item.zonaId && (area.active || area.id === item.areaId))
                                  .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }))
                                  .map((area) => (
                                    <option key={area.id} value={area.id}>{area.nombre}{area.active ? '' : ' (inactiva)'}</option>
                                  ))}
                              </select>
                            </td>
                            <td className="px-3 py-2">
                              <p className="font-semibold text-metro-text">{item.zonaResponsableNombre || '—'}</p>
                              <p className="mt-1 text-[11px] text-metro-muted">{item.zonaResponsableEmail || 'Sin email'}</p>
                            </td>
                            <td className="px-3 py-3">
                              <span className={`inline-flex rounded-full border px-2 py-1 text-[11px] font-semibold ${complete ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-200' : 'border-amber-500/35 bg-amber-500/10 text-amber-200'}`}>
                                {complete ? 'Configurado' : 'Pendiente'}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {filteredAssignmentDraft.length === 0 && (
                  <div className="px-4 py-8 text-center text-sm text-metro-muted">No hay combinaciones de residencia y puesto que coincidan con la búsqueda.</div>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-metro-border bg-metro-app px-5 py-4">
              <p className="text-xs text-metro-muted">
                Puedes guardar aunque queden combinaciones pendientes. Antes de generar los correos, cada combinación deberá tener Zona y un Área válida del maestro, y cada Zona un responsable con email.
              </p>
              <div className="flex gap-2">
                <ActionButton variant="secondary" iconOnly={false} onClick={closeAssignments}>Cancelar</ActionButton>
                <ActionButton variant="save" iconOnly={false} loading={savingAssignments} onClick={() => void saveAssignments()}>
                  Guardar asignaciones
                </ActionButton>
              </div>
            </div>
          </section>
        </div>
      )}

      {personDetailAssignment && assignmentTarget && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/65 p-4" role="presentation">
          <section
            className="flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-metro-border bg-metro-app shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="huelga-person-detail-title"
          >
            <div className="flex items-start justify-between gap-4 border-b border-metro-border px-5 py-4">
              <div>
                <h2 id="huelga-person-detail-title" className="text-lg font-semibold text-metro-text">Personas de la combinación</h2>
                <p className="mt-1 text-sm text-metro-muted">
                  {personDetailAssignment.residencia} · {personDetailAssignment.puesto} · {personDetailRows.length} personas
                </p>
              </div>
              <button
                className="rounded-lg px-2 py-1 text-xl text-metro-muted hover:bg-metro-raised hover:text-metro-text"
                onClick={closePersonDetail}
                type="button"
                aria-label="Cerrar"
              >
                ×
              </button>
            </div>

            <div className="space-y-4 overflow-y-auto p-5">
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs leading-5 text-amber-100">
                Usa esta vista para localizar la persona que provoca una residencia incorrecta. Al guardar una corrección individual se actualizará también su residencia en Plantilla y el cambio se utilizará en futuras huelgas.
              </div>

              <div className="overflow-hidden rounded-xl border border-metro-border">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1080px] text-left text-xs">
                    <thead className="bg-metro-raised/75 text-[11px] uppercase tracking-wide text-metro-muted">
                      <tr>
                        <th className="px-3 py-2.5 font-semibold">Nº empleado</th>
                        <th className="px-3 py-2.5 font-semibold">Nombre y apellidos</th>
                        <th className="px-3 py-2.5 font-semibold">Residencia Plantilla</th>
                        <th className="px-3 py-2.5 font-semibold">Residencia Excel</th>
                        <th className="px-3 py-2.5 font-semibold">Residencia correcta</th>
                        <th className="px-3 py-2.5 font-semibold">Turno</th>
                        <th className="w-32 px-3 py-2.5 font-semibold">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-metro-border">
                      {personDetailRows.map((persona) => {
                        const linkedEmployee = persona.empleado
                          ? employees.find((employee) => employee.empleado === persona.empleado && !employee.deletedAt)
                          : undefined;
                        const canEditMaster = Boolean(linkedEmployee);
                        const residenceValue = personResidenceDrafts[persona.id] ?? persona.residenciaAsignacion ?? persona.residenciaPlantilla ?? persona.residenciaEstacion ?? '';
                        const plantillaResidence = linkedEmployee?.residencia || persona.residenciaPlantilla || '';
                        return (
                          <tr className="align-top hover:bg-metro-raised/35" key={persona.id}>
                            <td className="px-3 py-3 font-semibold text-metro-text">{persona.empleado || '—'}</td>
                            <td className="px-3 py-3">
                              <p className="font-semibold text-metro-text">{persona.nombreApellidos}</p>
                              <p className="mt-1 text-[11px] text-metro-muted">{persona.puesto}</p>
                            </td>
                            <td className="px-3 py-3 text-metro-text">{plantillaResidence || '—'}</td>
                            <td className="px-3 py-3 text-metro-text">{persona.residenciaExcel || persona.residenciaEstacion || '—'}</td>
                            <td className="px-3 py-2">
                              <div className="flex min-w-[260px] items-center gap-2">
                                <input
                                  className="h-9 min-w-0 flex-1 rounded-lg border border-metro-border bg-metro-app px-2.5 text-xs text-metro-text outline-none focus:border-metro-red disabled:cursor-not-allowed disabled:opacity-60"
                                  value={residenceValue}
                                  disabled={!canEditMaster || savingPersonId === persona.id}
                                  onChange={(event) => setPersonResidenceDrafts((current) => ({ ...current, [persona.id]: event.target.value }))}
                                  aria-label={`Residencia correcta de ${persona.nombreApellidos}`}
                                />
                                <ActionButton
                                  variant="save"
                                  size="sm"
                                  iconOnly={false}
                                  loading={savingPersonId === persona.id}
                                  disabled={!canEditMaster || savingPersonId !== null || sameNormalizedText(plantillaResidence, residenceValue)}
                                  onClick={() => void savePersonResidence(persona)}
                                >
                                  Actualizar
                                </ActionButton>
                              </div>
                              {!canEditMaster && (
                                <p className="mt-1 text-[10px] text-amber-200">No vinculada de forma única con Plantilla</p>
                              )}
                            </td>
                            <td className="px-3 py-3 text-metro-text">{persona.turno || '—'}</td>
                            <td className="px-3 py-3">
                              {persona.plantillaMatch === 'matched' ? (
                                <span className={`inline-flex rounded-full border px-2 py-1 text-[11px] font-semibold ${persona.residenciaDiscrepante ? 'border-amber-500/35 bg-amber-500/10 text-amber-200' : 'border-emerald-500/35 bg-emerald-500/10 text-emerald-200'}`}>
                                  {persona.residenciaDiscrepante ? 'Discrepancia' : 'Coincide'}
                                </span>
                              ) : (
                                <span className="inline-flex rounded-full border border-amber-500/35 bg-amber-500/10 px-2 py-1 text-[11px] font-semibold text-amber-200">
                                  {persona.plantillaMatch === 'ambiguous' ? 'Ambigua' : persona.plantillaMatch === 'no-residence' ? 'Sin residencia' : 'No encontrada'}
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {personDetailRows.length === 0 && (
                  <div className="px-4 py-8 text-center text-sm text-metro-muted">Ya no hay personas en esta combinación después de las correcciones realizadas.</div>
                )}
              </div>
            </div>

            <div className="flex justify-end border-t border-metro-border bg-metro-app px-5 py-4">
              <ActionButton variant="secondary" iconOnly={false} onClick={closePersonDetail}>Cerrar</ActionButton>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
