import { CalendarDays, MailPlus, MapPinned, Settings2, UsersRound } from 'lucide-react';
import { useMemo } from 'react';
import { ActionButton } from '../../../components/ui/ActionButton';
import { PageHeader } from '../../../components/ui/PageHeader';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import type { ModuleHelpSection } from '../../../components/ModuleHelp';
import { DataTable, type DataTableColumn } from '../../../shared/table/DataTable';
import { useTableViewPreferences } from '../../../shared/table/useTableViewPreferences';
import { buildAsignacionesForPersonal, isAsignacionCompleta, type HuelgaPuestoAsignacion } from './huelgasAssignments';
import type { HuelgaZona } from './huelgasZones';
import type { HuelgaArea } from './huelgasAreas';
import { convocatoriaLabel, formatDate, huelgaStatus, type Huelga } from './huelgasPageModel';


const HUELGAS_HELP_SECTIONS: ModuleHelpSection[] = [
  { title: 'Para qué sirve', items: ['Centraliza cada convocatoria de huelga y prepara la recogida de información por zonas responsables.', 'Relaciona el personal que trabaja ese día con su puesto, área y zona para generar los correos y Excel de seguimiento.'] },
  { title: 'Flujo recomendado', ordered: true, items: ['Crear la convocatoria indicando fecha, sindicatos convocantes, tipo de jornada o paros y observaciones.', 'Importar el personal con turno del día desde el Excel. TrAcción contrasta los datos con Plantilla para completar la residencia cuando sea posible.', 'Revisar Áreas y Zonas y completar las asignaciones que falten. Cada puesto debe quedar asociado al área y zona responsables.', 'Abrir Correos cuando todas las asignaciones estén completas. Revisar destinatarios y texto antes de generar los borradores de Outlook.', 'Usar el Excel de recogida como soporte del seguimiento de la convocatoria.'] },
  { title: 'Zonas y áreas', items: ['Área describe la adscripción organizativa del puesto; Zona agrupa el destino operativo al que se enviará la petición de información.', 'Las asignaciones guardadas se reutilizan en convocatorias posteriores. Si cambia una residencia o puesto, conviene revisar su correspondencia antes de generar correos.', 'Los responsables y correos se mantienen por zona; Servicios Centrales puede quedar sin destinatario cuando el proceso no requiera correo.'] },
  { title: 'Importación y revisión', items: ['La importación corresponde al personal previsto con turno en la fecha concreta de huelga; no sustituye a Plantilla.', 'Antes de generar comunicaciones revisa especialmente personas sin área, zona o responsable, porque impiden completar correctamente la distribución.', 'Editar una convocatoria permite corregir sus datos sin tener que crearla de nuevo. Eliminar debe reservarse para convocatorias registradas por error.'] },
  { title: 'Correos y Excel', items: ['Los correos se generan por zona con el texto configurado y la información correspondiente a esa convocatoria.', 'La generación de correos solo se habilita cuando las asignaciones necesarias están completas, para evitar enviar una recogida incompleta.', 'El Excel generado agrupa la información que necesita cada zona para realizar el seguimiento.'] },
];

type HuelgasColumnId = 'fecha' | 'convocantes' | 'tipo' | 'estado' | 'personal' | 'asignaciones' | 'acciones';
const huelgasColumnIds: HuelgasColumnId[] = ['fecha', 'convocantes', 'tipo', 'estado', 'personal', 'asignaciones', 'acciones'];

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
  const { preferences, setSort, setColumnWidth, setColumnOrder, resetColumnWidths } = useTableViewPreferences<HuelgasColumnId>({
    storageKey: 'traccion.tableView.huelgas.convocatorias',
    defaultPreferences: { sort: null, columnWidths: {}, columnOrder: null },
    validColumnIds: huelgasColumnIds,
  });

  const columns = useMemo<Array<DataTableColumn<Huelga, HuelgasColumnId>>>(() => [
    { id: 'fecha', header: 'Fecha', accessor: (huelga) => huelga.fecha, render: (huelga) => <span className="whitespace-nowrap font-medium text-metro-text">{formatDate(huelga.fecha)}</span>, width: 130, minWidth: 115, tone: 'start' },
    { id: 'convocantes', header: 'Convocantes', accessor: (huelga) => huelga.sindicatos.join(' · '), render: (huelga) => <span className="text-metro-text">{huelga.sindicatos.join(' · ')}</span>, width: 210, minWidth: 160 },
    { id: 'tipo', header: 'Tipo', accessor: convocatoriaLabel, render: (huelga) => <span className="text-metro-muted">{convocatoriaLabel(huelga)}</span>, width: 155, minWidth: 130 },
    { id: 'estado', header: 'Estado', accessor: (huelga) => huelgaStatus(huelga.fecha), render: (huelga) => { const currentStatus = huelgaStatus(huelga.fecha); const tone = currentStatus === 'Hoy' ? 'error' : currentStatus === 'Próxima' ? 'warning' : 'muted'; return <StatusBadge tone={tone} size="xs">{currentStatus}</StatusBadge>; }, width: 130, minWidth: 115 },
    { id: 'personal', header: 'Personal del día', accessor: (huelga) => huelga.personalConTurno?.length ?? 0, render: (huelga) => (huelga.personalConTurno?.length ?? 0) > 0 ? <StatusBadge tone="success" size="xs" icon={<UsersRound size={13} />}>{huelga.personalConTurno?.length} personas</StatusBadge> : <span className="text-xs text-metro-muted">Sin importar</span>, width: 160, minWidth: 145 },
    { id: 'asignaciones', header: 'Áreas y zonas', accessor: (huelga) => { const assignments = buildAsignacionesForPersonal(huelga.personalConTurno ?? [], huelga.asignacionesPuesto ?? [], puestoResponsables, zonas, areas); return assignments.length ? assignments.filter(isAsignacionCompleta).length / assignments.length : -1; }, render: (huelga) => { const assignments = buildAsignacionesForPersonal(huelga.personalConTurno ?? [], huelga.asignacionesPuesto ?? [], puestoResponsables, zonas, areas); const configured = assignments.filter(isAsignacionCompleta).length; const pending = assignments.length - configured; if (!assignments.length) return <span className="text-xs text-metro-muted">Pendiente de personal</span>; return <div className="flex flex-col items-start gap-1"><StatusBadge tone={pending === 0 ? 'success' : 'warning'} size="xs">{configured}/{assignments.length} configurados</StatusBadge>{pending > 0 ? <span className="text-[11px] font-medium text-amber-200">{pending} pendiente{pending === 1 ? '' : 's'} de asignación</span> : <span className="text-[11px] text-metro-muted">Listo para comunicaciones</span>}</div>; }, width: 190, minWidth: 170 },
    { id: 'acciones', header: 'Siguiente paso', width: 340, minWidth: 320, sortable: false, resizable: false, reorderable: false, isActionColumn: true, headerClassName: 'text-right', className: 'text-right', render: (huelga) => {
      const personalCount = huelga.personalConTurno?.length ?? 0;
      const assignments = buildAsignacionesForPersonal(huelga.personalConTurno ?? [], huelga.asignacionesPuesto ?? [], puestoResponsables, zonas, areas);
      const configured = assignments.filter(isAsignacionCompleta).length;
      const assignmentsComplete = assignments.length > 0 && configured === assignments.length;

      return (
        <div className="flex items-center justify-end gap-1.5">
          {personalCount === 0 ? (
            <ActionButton variant="primary" size="sm" iconOnly={false} onClick={() => onOpenImport(huelga)} title="Primer paso: importar el personal trabajador del día de la huelga">Importar personal</ActionButton>
          ) : assignmentsComplete ? (
            <>
              <ActionButton variant="import" size="sm" iconOnly onClick={() => onOpenImport(huelga)} title="Volver a importar el personal del día" />
              <ActionButton variant="secondary" size="sm" iconOnly icon={Settings2} onClick={() => onOpenAssignments(huelga)} title="Revisar áreas y zonas" />
              <ActionButton variant="primary" size="sm" iconOnly={false} icon={MailPlus} loading={generatingCollectionForId === huelga.id} onClick={() => onOpenCollectionMails(huelga)} title="Siguiente paso: generar borradores de Outlook y Excel de recogida">Generar correos</ActionButton>
            </>
          ) : (
            <>
              <ActionButton variant="import" size="sm" iconOnly onClick={() => onOpenImport(huelga)} title="Volver a importar el personal del día" />
              <ActionButton variant="primary" size="sm" iconOnly={false} icon={Settings2} onClick={() => onOpenAssignments(huelga)} title="Siguiente paso: completar las áreas, zonas y responsables pendientes">Completar áreas y zonas</ActionButton>
            </>
          )}
          <span aria-hidden="true" className="mx-0.5 h-5 w-px bg-metro-border" />
          <ActionButton variant="edit" size="sm" onClick={() => onOpenEdit(huelga)} title="Editar huelga" iconOnly />
          <ActionButton variant="delete" size="sm" onClick={() => onRemove(huelga)} title="Eliminar huelga" iconOnly />
        </div>
      );
    } },
  ], [areas, generatingCollectionForId, onOpenAssignments, onOpenCollectionMails, onOpenEdit, onOpenImport, onRemove, puestoResponsables, zonas]);

  return (
    <>
      <PageHeader
        title="Huelgas"
        helpSections={HUELGAS_HELP_SECTIONS}
        helpSubtitle="Guía rápida de convocatorias, personal, áreas, zonas y comunicaciones."
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
            <ActionButton variant="edit" onClick={() => onOpenEdit(nextHuelga)} title="Editar próxima huelga" iconOnly />
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
          <DataTable
            ariaLabel="Convocatorias de huelga"
            columns={columns}
            rows={sortedHuelgas}
            getRowId={(huelga) => huelga.id}
            sort={preferences.sort}
            onSortChange={setSort}
            columnWidths={preferences.columnWidths}
            onColumnWidthChange={setColumnWidth}
            onResetColumnWidths={resetColumnWidths}
            columnOrder={preferences.columnOrder}
            onColumnOrderChange={setColumnOrder}
            emptyMessage="Todavía no hay huelgas registradas."
            strongZebra
            density="compact"
            stickyActionColumn
            maxHeightClassName="max-h-[52vh]"
          />
        )}
      </section>
    </>
  );
}
