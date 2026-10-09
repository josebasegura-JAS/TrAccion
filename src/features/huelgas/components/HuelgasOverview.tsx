import { CalendarDays, ClipboardCheck, MailPlus, Settings2 } from 'lucide-react';
import { useMemo } from 'react';
import { ActionButton } from '../../../components/ui/ActionButton';
import { PageHeader } from '../../../components/ui/PageHeader';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import type { ModuleHelpSection } from '../../../components/ModuleHelp';
import { DataTable, type DataTableColumn } from '../../../shared/table/DataTable';
import { useTableViewPreferences } from '../../../shared/table/useTableViewPreferences';
import type { HuelgaZona } from './huelgasZones';
import { convocatoriaLabel, formatDate, huelgaStatus, type Huelga } from './huelgasPageModel';

const HUELGAS_HELP_SECTIONS: ModuleHelpSection[] = [
  {
    title: 'Para qué sirve',
    items: [
      'Centraliza cada convocatoria, prepara las siete comunicaciones y consolida la recogida de resultados.',
      'Cada circuito utiliza su destinatario, instrucciones y plantilla Excel real.',
    ],
  },
  {
    title: 'Flujo recomendado',
    ordered: true,
    items: [
      'Crear la convocatoria indicando fecha, sindicatos, jornada completa o paros y circuitos afectados.',
      'Revisar la configuración de los circuitos y preparar las comunicaciones de Outlook.',
      'Cuando vuelvan los Excel, abrir Recogida e importar la respuesta de cada circuito.',
      'Revisar los totales detectados, corregirlos si fuese necesario y marcar cada circuito como revisado.',
      'Exportar el seguimiento consolidado, con resumen por circuito y relación de personal en huelga detectado.',
    ],
  },
  {
    title: 'Recogida',
    items: [
      'El importador intenta reconocer automáticamente personas con turno, servicios mínimos, personas que trabajan y personas en huelga.',
      'Si un fichero tiene un formato distinto o ha sido modificado, los valores se pueden completar o corregir manualmente antes de validarlo.',
    ],
  },
];

type HuelgasColumnId =
  | 'fecha'
  | 'convocantes'
  | 'tipo'
  | 'estado'
  | 'circuitos'
  | 'comunicaciones'
  | 'recogida'
  | 'acciones';

const huelgasColumnIds: HuelgasColumnId[] = [
  'fecha',
  'convocantes',
  'tipo',
  'estado',
  'circuitos',
  'comunicaciones',
  'recogida',
  'acciones',
];

type CollectionStatus = { total: number; received: number; reviewed: number };

type Props = {
  huelgas: Huelga[];
  sortedHuelgas: Huelga[];
  nextHuelga: Huelga | null;
  zonas: HuelgaZona[];
  generatingCollectionForId: string | null;
  collectionStatusFor: (huelga: Huelga) => CollectionStatus;
  onOpenZones: () => void;
  onOpenNew: () => void;
  onOpenEdit: (huelga: Huelga) => void;
  onOpenCollectionMails: (huelga: Huelga) => void;
  onOpenResponseCollection: (huelga: Huelga) => void;
  onRemove: (huelga: Huelga) => void;
};

function circuitIdsFor(huelga: Huelga, zonas: HuelgaZona[]): string[] {
  if (huelga.circuitosZonaIds?.length) return huelga.circuitosZonaIds;
  return zonas.filter((zona) => zona.active && zona.correoActivo).map((zona) => zona.id);
}

export function HuelgasOverview({
  huelgas,
  sortedHuelgas,
  nextHuelga,
  zonas,
  generatingCollectionForId,
  collectionStatusFor,
  onOpenZones,
  onOpenNew,
  onOpenEdit,
  onOpenCollectionMails,
  onOpenResponseCollection,
  onRemove,
}: Props) {
  const { preferences, setSort, setColumnWidth, setColumnOrder, resetColumnWidths } =
    useTableViewPreferences<HuelgasColumnId>({
      storageKey: 'traccion.tableView.huelgas.convocatorias.v3',
      defaultPreferences: { sort: null, columnWidths: {}, columnOrder: null },
      validColumnIds: huelgasColumnIds,
    });

  const columns = useMemo<Array<DataTableColumn<Huelga, HuelgasColumnId>>>(() => [
    {
      id: 'fecha',
      header: 'Fecha',
      accessor: (huelga) => huelga.fecha,
      render: (huelga) => <span className="whitespace-nowrap font-medium text-metro-text">{formatDate(huelga.fecha)}</span>,
      width: 125,
      minWidth: 110,
      tone: 'start',
    },
    {
      id: 'convocantes',
      header: 'Convocantes',
      accessor: (huelga) => huelga.sindicatos.join(' · '),
      render: (huelga) => <span className="text-metro-text">{huelga.sindicatos.join(' · ')}</span>,
      width: 170,
      minWidth: 135,
    },
    {
      id: 'tipo',
      header: 'Tipo',
      accessor: convocatoriaLabel,
      render: (huelga) => <span className="text-metro-muted">{convocatoriaLabel(huelga)}</span>,
      width: 150,
      minWidth: 125,
    },
    {
      id: 'estado',
      header: 'Estado',
      accessor: (huelga) => huelgaStatus(huelga.fecha),
      render: (huelga) => {
        const currentStatus = huelgaStatus(huelga.fecha);
        const tone = currentStatus === 'Hoy' ? 'error' : currentStatus === 'Próxima' ? 'warning' : 'muted';
        return <StatusBadge tone={tone} size="xs">{currentStatus}</StatusBadge>;
      },
      width: 105,
      minWidth: 95,
    },
    {
      id: 'circuitos',
      header: 'Circuitos',
      accessor: (huelga) => circuitIdsFor(huelga, zonas).length,
      render: (huelga) => {
        const total = circuitIdsFor(huelga, zonas).length;
        return <StatusBadge tone="muted" size="xs">{total} circuito{total === 1 ? '' : 's'}</StatusBadge>;
      },
      width: 110,
      minWidth: 100,
    },
    {
      id: 'comunicaciones',
      header: 'Comunicaciones',
      accessor: (huelga) => Object.keys(huelga.correosPreparadosPorZona ?? {}).length,
      render: (huelga) => {
        const ids = circuitIdsFor(huelga, zonas);
        const prepared = ids.filter((id) => Boolean(huelga.correosPreparadosPorZona?.[id])).length;
        return (
          <StatusBadge tone={prepared === ids.length && ids.length > 0 ? 'success' : prepared > 0 ? 'warning' : 'muted'} size="xs">
            {prepared}/{ids.length} preparados
          </StatusBadge>
        );
      },
      width: 145,
      minWidth: 130,
    },
    {
      id: 'recogida',
      header: 'Recogida',
      accessor: (huelga) => collectionStatusFor(huelga).reviewed,
      render: (huelga) => {
        const status = collectionStatusFor(huelga);
        const complete = status.total > 0 && status.reviewed === status.total;
        const tone = complete ? 'success' : status.received > 0 ? 'warning' : 'muted';
        const label = complete
          ? `${status.reviewed}/${status.total} revisados`
          : `${status.received}/${status.total} recibidos`;
        return <StatusBadge tone={tone} size="xs">{label}</StatusBadge>;
      },
      width: 135,
      minWidth: 120,
    },
    {
      id: 'acciones',
      header: 'Acciones',
      width: 330,
      minWidth: 300,
      sortable: false,
      resizable: false,
      reorderable: false,
      isActionColumn: true,
      headerClassName: 'text-right',
      className: 'text-right',
      render: (huelga) => (
        <div className="flex items-center justify-end gap-1.5">
          <ActionButton
            variant="primary"
            size="sm"
            iconOnly={false}
            icon={MailPlus}
            loading={generatingCollectionForId === huelga.id}
            onClick={() => onOpenCollectionMails(huelga)}
            title="Revisar y preparar los correos de recogida"
          >
            Comunicaciones
          </ActionButton>
          <ActionButton
            variant="secondary"
            size="sm"
            iconOnly={false}
            icon={ClipboardCheck}
            onClick={() => onOpenResponseCollection(huelga)}
            title="Importar y consolidar las respuestas de los circuitos"
          >
            Recogida
          </ActionButton>
          <span aria-hidden="true" className="mx-0.5 h-5 w-px bg-metro-border" />
          <ActionButton variant="edit" size="sm" onClick={() => onOpenEdit(huelga)} title="Editar huelga" iconOnly />
          <ActionButton variant="delete" size="sm" onClick={() => onRemove(huelga)} title="Eliminar huelga" iconOnly />
        </div>
      ),
    },
  ], [collectionStatusFor, generatingCollectionForId, onOpenCollectionMails, onOpenEdit, onOpenResponseCollection, onRemove, zonas]);

  return (
    <>
      <PageHeader
        title="Huelgas"
        helpSections={HUELGAS_HELP_SECTIONS}
        helpSubtitle="Guía del flujo completo: convocatoria, comunicaciones, recogida y consolidación."
        actions={(
          <div className="flex items-center gap-2">
            <ActionButton variant="secondary" icon={Settings2} iconOnly={false} onClick={onOpenZones}>Configurar circuitos</ActionButton>
            <ActionButton variant="add" iconOnly={false} onClick={onOpenNew}>Nueva huelga</ActionButton>
          </div>
        )}
      />

      {nextHuelga && (
        <section className="rounded-xl border border-amber-500/25 bg-amber-500/5 px-4 py-3">
          <div className="flex items-center gap-3">
            <CalendarDays className="text-amber-300" size={20} />
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-200/80">Próxima convocatoria</p>
              <p className="truncate text-sm font-semibold text-metro-text">{formatDate(nextHuelga.fecha)} · {nextHuelga.sindicatos.join(' · ')} · {convocatoriaLabel(nextHuelga)}</p>
            </div>
          </div>
        </section>
      )}

      <section className="rounded-xl border border-metro-border bg-metro-panel/45 p-3">
        {huelgas.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-5 py-7 text-center">
            <CalendarDays className="text-metro-muted" size={32} />
            <div>
              <p className="font-medium text-metro-text">Todavía no hay huelgas registradas</p>
              <p className="mt-1 text-sm text-metro-muted">Da de alta la primera convocatoria para preparar sus comunicaciones.</p>
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
            maxHeightClassName="max-h-[58vh]"
          />
        )}
      </section>
    </>
  );
}
