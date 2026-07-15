import { FileDown, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { ActionButton } from '../../../components/ui/ActionButton';
import { CountBadge } from '../../../components/ui/CountBadge';
import { useAppDialog } from '../../../hooks/useAppDialog';
import {
  type TicketCalendar,
  type TicketPerson,
  type TicketPersonDraft,
} from '../domain/ticketRestaurante';
import type { ExportTablePayload } from '../../../shared/export/types';
import { ExportPrintButtons } from '../../../shared/print/ExportPrintButtons';
import { DataTable, type DataTableColumn } from '../../../shared/table/DataTable';
import {
  type TableViewPreferences,
  useTableViewPreferences,
} from '../../../shared/table/useTableViewPreferences';

type TicketPeopleTableColumnId =
  | 'empleado'
  | 'nombre'
  | 'apellido1'
  | 'apellido2'
  | 'dni'
  | 'puesto'
  | 'calendario'
  | 'estado'
  | 'actions';

const TICKET_PEOPLE_TABLE_STORAGE_KEY = 'traccion.tableView.ticketRestaurante.people';

const defaultTicketPeopleTablePreferences: TableViewPreferences<TicketPeopleTableColumnId> = {
  sort: { columnId: 'empleado', direction: 'asc' },
  columnWidths: {
    empleado: 110,
    nombre: 150,
    apellido1: 150,
    apellido2: 150,
    dni: 110,
    puesto: 190,
    calendario: 160,
    estado: 90,
    actions: 104,
  },
  columnOrder: null,
};

const ticketPeopleTableColumnIds: TicketPeopleTableColumnId[] = [
  'empleado',
  'nombre',
  'apellido1',
  'apellido2',
  'dni',
  'puesto',
  'calendario',
  'estado',
  'actions',
];

export function PeoplePanel({
  calendars,
  draft,
  editingPersonId,
  importMessage,
  onCancel,
  onChange,
  onEdit,
  exportPayload,
  onExportModel,
  onImport,
  onRemove,
  onSave,
  people,
}: {
  calendars: TicketCalendar[];
  draft: TicketPersonDraft;
  editingPersonId: string | null;
  importMessage: string;
  onCancel: () => void;
  onChange: (draft: TicketPersonDraft) => void;
  onEdit: (person: TicketPerson) => void;
  exportPayload: ExportTablePayload<TicketPerson>;
  onExportModel: () => void;
  onImport: () => void;
  onRemove: (empleado: string) => void;
  onSave: () => void;
  people: TicketPerson[];
}) {
  const canSave = draft.empleado.trim() && draft.nombre.trim() && draft.calendarId;
  const { confirm, dialogNode } = useAppDialog();
  const [isPersonFormOpen, setIsPersonFormOpen] = useState(Boolean(editingPersonId));

  useEffect(() => {
    if (editingPersonId) {
      setIsPersonFormOpen(true);
    }
  }, [editingPersonId]);

  const handleSavePerson = () => {
    onSave();
    setIsPersonFormOpen(false);
  };

  const handleCancelPerson = () => {
    onCancel();
    setIsPersonFormOpen(false);
  };

  const { preferences, setSort, setColumnWidth, setColumnOrder, resetColumnWidths } =
    useTableViewPreferences<TicketPeopleTableColumnId>({
      storageKey: TICKET_PEOPLE_TABLE_STORAGE_KEY,
      defaultPreferences: defaultTicketPeopleTablePreferences,
      validColumnIds: ticketPeopleTableColumnIds,
    });
  const peopleColumns = useMemo<Array<DataTableColumn<TicketPerson, TicketPeopleTableColumnId>>>(
    () => [
      {
        id: 'empleado',
        header: 'Nº empleado',
        accessor: (person) => {
          const employeeNumber = Number(person.empleado.trim());
          return Number.isFinite(employeeNumber) ? employeeNumber : person.empleado;
        },
        render: (person) => person.empleado,
        width: 110,
        minWidth: 95,
        maxWidth: 170,
        sortable: true,
        className: 'font-semibold text-metro-text',
      },
      {
        id: 'nombre',
        header: 'Nombre',
        accessor: (person) => person.nombre,
        render: (person) => person.nombre,
        width: 150,
        minWidth: 120,
        maxWidth: 260,
        sortable: true,
        className: 'text-metro-text',
      },
      {
        id: 'apellido1',
        header: 'Apellido1',
        accessor: (person) => person.apellido1,
        render: (person) => person.apellido1,
        width: 150,
        minWidth: 120,
        maxWidth: 260,
        sortable: true,
        className: 'text-metro-muted',
      },
      {
        id: 'apellido2',
        header: 'Apellido2',
        accessor: (person) => person.apellido2,
        render: (person) => person.apellido2,
        width: 150,
        minWidth: 120,
        maxWidth: 260,
        sortable: true,
        className: 'text-metro-muted',
      },
      {
        id: 'dni',
        header: 'DNI',
        accessor: (person) => person.dni,
        render: (person) => person.dni,
        width: 110,
        minWidth: 90,
        maxWidth: 160,
        sortable: true,
        className: 'text-metro-muted',
      },
      {
        id: 'puesto',
        header: 'Puesto',
        accessor: (person) => person.puesto,
        render: (person) => person.puesto,
        width: 190,
        minWidth: 140,
        maxWidth: 360,
        sortable: true,
        className: 'text-metro-muted',
      },
      {
        id: 'calendario',
        header: 'Calendario',
        accessor: (person) =>
          calendars.find((calendar) => calendar.id === person.calendarId)?.nombre ?? '',
        render: (person) =>
          calendars.find((calendar) => calendar.id === person.calendarId)?.nombre ??
          'Sin calendario',
        width: 160,
        minWidth: 130,
        maxWidth: 280,
        sortable: true,
        className: 'text-metro-muted',
      },
      {
        id: 'estado',
        header: 'Estado',
        accessor: (person) => (person.activo ? 'Activo' : 'Inactivo'),
        render: (person) => (person.activo ? 'Activo' : 'Inactivo'),
        width: 90,
        minWidth: 80,
        maxWidth: 130,
        sortable: true,
        className: 'text-metro-muted',
      },
      {
        id: 'actions',
        header: 'Acciones',
        render: (person) => (
          <div className="flex justify-end gap-1.5">
            <button
              className="rounded-md border border-metro-border px-2 py-1 text-[11px] font-semibold text-metro-text hover:border-metro-red"
              onClick={(event) => {
                event.stopPropagation();
                onEdit(person);
              }}
              type="button"
            >
              Editar
            </button>
            <button
              className="rounded-md border border-metro-border p-1 text-metro-text hover:border-metro-red"
              onClick={(event) => {
                event.stopPropagation();
                void (async () => {
                  if (
                    await confirm(`¿Eliminar la persona con Nº empleado ${person.empleado}?`, {
                      confirmLabel: 'Eliminar',
                      danger: true,
                      title: 'Eliminar persona',
                    })
                  ) {
                    onRemove(person.empleado);
                  }
                })();
              }}
              type="button"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ),
        width: 104,
        minWidth: 96,
        maxWidth: 140,
        resizable: false,
        isActionColumn: true,
      },
    ],
    [calendars, confirm, onEdit, onRemove],
  );

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-metro-border bg-metro-panel p-2.5">
        <button
          className="flex w-full items-center justify-between gap-2 rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-left text-sm font-bold text-metro-text hover:border-metro-red"
          onClick={() => setIsPersonFormOpen((isOpen) => !isOpen)}
          type="button"
        >
          <span>{editingPersonId ? 'Editar persona Ticket' : 'Añadir persona Ticket'}</span>
          <span className="text-xs font-semibold text-metro-muted">
            {isPersonFormOpen ? 'Ocultar' : 'Abrir'}
          </span>
        </button>
        {isPersonFormOpen ? (
          <div className="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            <label className="block text-xs font-semibold text-metro-text">
              Nº empleado
              <input
                className="mt-1 w-full rounded-lg border border-metro-border bg-metro-surface px-2.5 py-1.5 text-sm text-metro-text outline-none focus:border-metro-red"
                onChange={(event) => onChange({ ...draft, empleado: event.target.value })}
                value={draft.empleado}
              />
            </label>
            <label className="block text-xs font-semibold text-metro-text">
              Nombre
              <input
                className="mt-1 w-full rounded-lg border border-metro-border bg-metro-surface px-2.5 py-1.5 text-sm text-metro-text outline-none focus:border-metro-red"
                onChange={(event) => onChange({ ...draft, nombre: event.target.value })}
                value={draft.nombre}
              />
            </label>
            <label className="block text-xs font-semibold text-metro-text">
              Apellido 1
              <input
                className="mt-1 w-full rounded-lg border border-metro-border bg-metro-surface px-2.5 py-1.5 text-sm text-metro-text outline-none focus:border-metro-red"
                onChange={(event) => onChange({ ...draft, apellido1: event.target.value })}
                value={draft.apellido1}
              />
            </label>
            <label className="block text-xs font-semibold text-metro-text">
              Apellido 2
              <input
                className="mt-1 w-full rounded-lg border border-metro-border bg-metro-surface px-2.5 py-1.5 text-sm text-metro-text outline-none focus:border-metro-red"
                onChange={(event) => onChange({ ...draft, apellido2: event.target.value })}
                value={draft.apellido2}
              />
            </label>
            <label className="block text-xs font-semibold text-metro-text">
              DNI
              <input
                className="mt-1 w-full rounded-lg border border-metro-border bg-metro-surface px-2.5 py-1.5 text-sm text-metro-text outline-none focus:border-metro-red"
                onChange={(event) => onChange({ ...draft, dni: event.target.value })}
                value={draft.dni}
              />
            </label>
            <label className="block text-xs font-semibold text-metro-text">
              Puesto
              <input
                className="mt-1 w-full rounded-lg border border-metro-border bg-metro-surface px-2.5 py-1.5 text-sm text-metro-text outline-none focus:border-metro-red"
                onChange={(event) => onChange({ ...draft, puesto: event.target.value })}
                value={draft.puesto}
              />
            </label>
            <label className="block text-xs font-semibold text-metro-text">
              Calendario
              <select
                className="mt-1 w-full rounded-lg border border-metro-border bg-metro-surface px-2.5 py-1.5 text-sm text-metro-text outline-none focus:border-metro-red"
                onChange={(event) => onChange({ ...draft, calendarId: event.target.value })}
                value={draft.calendarId}
              >
                <option value="">Seleccionar calendario</option>
                {calendars.map((calendar) => (
                  <option key={calendar.id} value={calendar.id}>
                    {calendar.nombre}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-xs font-semibold text-metro-text">
              <input
                checked={draft.activo}
                className="h-3.5 w-3.5 accent-metro-red"
                onChange={(event) => onChange({ ...draft, activo: event.target.checked })}
                type="checkbox"
              />
              Activo
            </label>
            <div className="flex gap-2">
              <button
                className="flex-1 rounded-lg bg-metro-red px-3 py-1.5 text-xs font-semibold text-white hover:bg-metro-dark disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!canSave}
                onClick={handleSavePerson}
                type="button"
              >
                Guardar
              </button>
              {editingPersonId ? (
                <button
                  className="rounded-lg border border-metro-border px-3 py-1.5 text-xs font-semibold text-metro-text hover:border-metro-red"
                  onClick={handleCancelPerson}
                  type="button"
                >
                  Cancelar
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
      <div className="rounded-xl border border-metro-border bg-metro-panel p-2.5">
        <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-base font-bold text-metro-text">Personas con derecho a ticket</h3>
            {importMessage ? (
              <p className="mt-1 max-w-2xl text-xs text-metro-muted">{importMessage}</p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ExportPrintButtons payload={exportPayload} />
            <button
              className="inline-flex items-center gap-1.5 rounded-lg border border-metro-border px-3 py-1.5 text-xs font-semibold text-metro-text hover:border-metro-red"
              onClick={onExportModel}
              type="button"
            >
              <FileDown className="h-3.5 w-3.5" />
              Modelo personas
            </button>

            <ActionButton iconOnly={false} onClick={onImport} size="sm" variant="import">
              Importar personas
            </ActionButton>
            <CountBadge size="xs">{people.length}</CountBadge>
          </div>
        </div>
        <DataTable
          ariaLabel="Personas con derecho a ticket"
          columnOrder={preferences.columnOrder}
          columnWidths={preferences.columnWidths}
          onResetColumnWidths={resetColumnWidths}
          columns={peopleColumns}
          emptyMessage="Añade personas manualmente para poder calcular tickets."
          getRowId={(person) => person.empleado}
          maxHeightClassName="max-h-[420px]"
          onColumnOrderChange={setColumnOrder}
          onColumnWidthChange={setColumnWidth}
          onRowClick={onEdit}
          onSortChange={setSort}
          rows={people}
          sort={preferences.sort}
        />
      </div>
      {dialogNode}
    </div>
  );
}
