import { CalendarDays, MailPlus, MapPinned, Settings2, UsersRound } from 'lucide-react';
import { ActionButton } from '../../../components/ui/ActionButton';
import { PageHeader } from '../../../components/ui/PageHeader';
import { buildAsignacionesForPersonal, isAsignacionCompleta, type HuelgaPuestoAsignacion } from './huelgasAssignments';
import type { HuelgaZona } from './huelgasZones';
import type { HuelgaArea } from './huelgasAreas';
import { convocatoriaLabel, formatDate, huelgaStatus, statusClass, type Huelga } from './huelgasPageModel';

type Props = {
  huelgas: Huelga[];
  sortedHuelgas: Huelga[];
  nextHuelga: Huelga | null;
  puestoResponsables: HuelgaPuestoAsignacion[];
  zonas: HuelgaZona[];
  areas: HuelgaArea[];
  generatingCollectionForId: string | null;
  onOpenZones: () => void;
  onOpenNew: () => void;
  onOpenEdit: (huelga: Huelga) => void;
  onOpenImport: (huelga: Huelga) => void;
  onOpenAssignments: (huelga: Huelga) => void;
  onOpenCollectionMails: (huelga: Huelga) => void;
  onRemove: (huelga: Huelga) => void;
};

export function HuelgasOverview({
  huelgas,
  sortedHuelgas,
  nextHuelga,
  puestoResponsables,
  zonas,
  areas,
  generatingCollectionForId,
  onOpenZones,
  onOpenNew,
  onOpenEdit,
  onOpenImport,
  onOpenAssignments,
  onOpenCollectionMails,
  onRemove,
}: Props) {
  return (
    <>
      <PageHeader
        title="Huelgas"
        actions={
          <div className="flex items-center gap-2">
            <ActionButton variant="secondary" iconOnly={false} icon={MapPinned} onClick={onOpenZones}>Zonas y áreas</ActionButton>
            <ActionButton variant="add" iconOnly={false} onClick={onOpenNew}>Nueva huelga</ActionButton>
          </div>
        }
      />

      {nextHuelga ? (
        <section className="ui3-operational-card rounded-xl border border-metro-border bg-metro-panel/75 p-3">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-metro-red/15 text-metro-red">
                <CalendarDays size={21} />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-metro-muted">Próxima convocatoria</p>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <strong className="text-base text-metro-text">{formatDate(nextHuelga.fecha)}</strong>
                  <span className="text-sm text-metro-muted">{convocatoriaLabel(nextHuelga)}</span>
                </div>
                <p className="mt-1 truncate text-sm text-metro-muted">{nextHuelga.sindicatos.join(' · ')}</p>
              </div>
            </div>
            <ActionButton variant="edit" onClick={() => onOpenEdit(nextHuelga)} title="Editar próxima huelga" />
          </div>
        </section>
      ) : (
        <section className="ui3-empty-state rounded-xl border border-dashed border-metro-border bg-metro-panel/35 px-4 py-3 text-sm text-metro-muted">
          No hay próximas convocatorias registradas.
        </section>
      )}

      <section className="ui3-operational-card overflow-hidden rounded-xl border border-metro-border bg-metro-panel/75">
        <div className="flex items-center justify-between border-b border-metro-border px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold text-metro-text">Convocatorias</h3>
            <p className="mt-0.5 text-xs text-metro-muted">{huelgas.length} registrada{huelgas.length === 1 ? '' : 's'}</p>
          </div>
        </div>

        {sortedHuelgas.length === 0 ? (
          <div className="ui3-empty-state flex min-h-36 flex-col items-center justify-center gap-2.5 px-5 py-7 text-center">
            <CalendarDays className="text-metro-muted" size={32} />
            <div>
              <p className="font-medium text-metro-text">Todavía no hay huelgas registradas</p>
              <p className="mt-1 text-sm text-metro-muted">Da de alta la primera convocatoria para iniciar el seguimiento.</p>
            </div>
            <ActionButton variant="add" iconOnly={false} onClick={onOpenNew}>Nueva huelga</ActionButton>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="bg-metro-raised/70 text-[11px] uppercase tracking-wide text-metro-muted">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Fecha</th>
                  <th className="px-4 py-2.5 font-semibold">Convocantes</th>
                  <th className="px-4 py-2.5 font-semibold">Tipo</th>
                  <th className="px-4 py-2.5 font-semibold">Estado</th>
                  <th className="px-4 py-2.5 font-semibold">Personal del día</th>
                  <th className="px-4 py-2.5 font-semibold">Áreas y zonas</th>
                  <th className="w-64 px-4 py-2.5 text-right font-semibold">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-metro-border">
                {sortedHuelgas.map((huelga) => {
                  const status = huelgaStatus(huelga.fecha);
                  const assignments = buildAsignacionesForPersonal(
                    huelga.personalConTurno ?? [],
                    huelga.asignacionesPuesto ?? [],
                    puestoResponsables,
                    zonas,
                    areas,
                  );
                  const configuredAssignments = assignments.filter(isAsignacionCompleta).length;
                  return (
                    <tr className="transition hover:bg-metro-raised/45" key={huelga.id}>
                      <td className="whitespace-nowrap px-4 py-3 font-medium text-metro-text">{formatDate(huelga.fecha)}</td>
                      <td className="px-4 py-3 text-metro-text">{huelga.sindicatos.join(' · ')}</td>
                      <td className="px-4 py-3 text-metro-muted">{convocatoriaLabel(huelga)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass(status)}`}>{status}</span>
                      </td>
                      <td className="px-4 py-3">
                        {(huelga.personalConTurno?.length ?? 0) > 0 ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/35 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-200">
                            <UsersRound size={13} /> {huelga.personalConTurno?.length} personas
                          </span>
                        ) : (
                          <span className="text-xs text-metro-muted">Sin importar</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {assignments.length === 0 ? (
                          <span className="text-xs text-metro-muted">Pendiente de personal</span>
                        ) : configuredAssignments === assignments.length ? (
                          <span className="inline-flex rounded-full border border-emerald-500/35 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-200">
                            {configuredAssignments}/{assignments.length} configurados
                          </span>
                        ) : (
                          <span className="inline-flex rounded-full border border-amber-500/35 bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-200">
                            {configuredAssignments}/{assignments.length} configurados
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <ActionButton variant="import" size="sm" iconOnly={false} onClick={() => onOpenImport(huelga)} title="Importar personal trabajador del día de la huelga">Importar personal</ActionButton>
                          <ActionButton
                            variant="secondary"
                            size="sm"
                            iconOnly={false}
                            icon={Settings2}
                            disabled={(huelga.personalConTurno?.length ?? 0) === 0}
                            onClick={() => onOpenAssignments(huelga)}
                            title="Asignar área y zona a los puestos de trabajo"
                          >
                            Áreas y zonas
                          </ActionButton>
                          <ActionButton
                            variant="secondary"
                            size="sm"
                            iconOnly={false}
                            icon={MailPlus}
                            loading={generatingCollectionForId === huelga.id}
                            disabled={(huelga.personalConTurno?.length ?? 0) === 0 || configuredAssignments !== assignments.length}
                            onClick={() => onOpenCollectionMails(huelga)}
                            title={configuredAssignments !== assignments.length ? 'Completa primero todas las áreas, zonas y responsables de zona' : 'Generar borradores de Outlook con Excel de recogida'}
                          >
                            Correos
                          </ActionButton>
                          <ActionButton variant="edit" size="sm" onClick={() => onOpenEdit(huelga)} title="Editar huelga" />
                          <ActionButton variant="delete" size="sm" onClick={() => onRemove(huelga)} title="Eliminar huelga" />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
