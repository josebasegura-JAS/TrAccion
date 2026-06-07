import { FileText, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTaskStore } from '../../tareas/store/useTaskStore';
import { buildFilterLabel } from '../../../shared/export/filterLabel';
import type { ExportColumn } from '../../../shared/export/types';
import { ExportPrintButtons } from '../../../shared/print/ExportPrintButtons';
import { DataTable, type DataTableColumn } from '../../../shared/table/DataTable';
import { useTableViewPreferences } from '../../../shared/table/useTableViewPreferences';
import {
  ACTA_STATES,
  ACTA_TYPES,
  EMPTY_ACTA_DRAFT,
  type Acta,
  type ActaAlegacion,
  type ActaDraft,
} from '../domain/acta';
import { useActasStore } from '../store/useActasStore';

type ActaColumnId = 'tipo' | 'fechaSesion' | 'fechaCreacion' | 'titulo' | 'estado' | 'alegaciones' | 'acciones';

const validColumnIds: ActaColumnId[] = [
  'tipo',
  'fechaSesion',
  'fechaCreacion',
  'titulo',
  'estado',
  'alegaciones',
  'acciones',
];

const actaExportColumns: ExportColumn<Acta>[] = [
  { key: 'tipo', header: 'Tipo', value: (acta) => acta.tipo },
  { key: 'fechaSesion', header: 'Fecha sesión', value: (acta) => acta.fechaSesion || null },
  { key: 'fechaCreacion', header: 'Fecha creación', value: (acta) => acta.fechaCreacion || null },
  { key: 'titulo', header: 'Título', value: (acta) => acta.titulo },
  { key: 'estado', header: 'Estado', value: (acta) => acta.estado },
  { key: 'observaciones', header: 'Observaciones', value: (acta) => acta.observaciones || null },
  {
    key: 'alegaciones',
    header: 'Alegaciones',
    value: (acta) =>
      acta.alegaciones
        .map((alegacion) =>
          `${alegacion.sindicato}: ${alegacion.presentada ? 'presentada' : 'no presentada'}${
            alegacion.fecha ? ` (${alegacion.fecha})` : ''
          }${alegacion.observacion ? ` - ${alegacion.observacion}` : ''}`,
        )
        .join('\n') || null,
  },
];

function getActaYear(acta: Acta): string {
  return acta.fechaSesion.slice(0, 4) || 'Sin año';
}

function matchesSearch(acta: Acta, search: string): boolean {
  const normalizedSearch = search.trim().toLowerCase();
  if (!normalizedSearch) {
    return true;
  }

  return [acta.titulo, acta.tipo, acta.estado, acta.observaciones, acta.fechaSesion]
    .join(' ')
    .toLowerCase()
    .includes(normalizedSearch);
}

function createEmptyAlegacion(sindicato = ''): ActaAlegacion {
  return { sindicato, presentada: false, fecha: '', observacion: '' };
}

export function ActasPage() {
  const { actas, load, create, update, remove } = useActasStore();
  const { tasks, load: loadTasks } = useTaskStore();
  const [draft, setDraft] = useState<ActaDraft>(EMPTY_ACTA_DRAFT);
  const [editingActaId, setEditingActaId] = useState<string | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState('');
  const [yearFilter, setYearFilter] = useState('');
  const { preferences, setSort, setColumnWidth } = useTableViewPreferences<ActaColumnId>({
    storageKey: 'traccion.v1.actas.table',
    defaultPreferences: {
      sort: { columnId: 'fechaSesion', direction: 'desc' },
      columnWidths: {},
    },
    validColumnIds,
  });

  useEffect(() => {
    load();
    loadTasks();
  }, [load, loadTasks]);

  const sindicatoOptions = useMemo(() => {
    const values = new Set<string>();
    for (const task of tasks) {
      if (task.sindicato.trim()) {
        values.add(task.sindicato.trim());
      }
    }
    for (const acta of actas) {
      for (const alegacion of acta.alegaciones) {
        if (alegacion.sindicato.trim()) {
          values.add(alegacion.sindicato.trim());
        }
      }
    }
    return [...values].sort((first, second) => first.localeCompare(second, 'es'));
  }, [actas, tasks]);

  const years = useMemo(
    () => [...new Set(actas.map(getActaYear))].sort((first, second) => second.localeCompare(first)),
    [actas],
  );

  const filteredActas = useMemo(
    () =>
      actas.filter(
        (acta) =>
          matchesSearch(acta, search) &&
          (!stateFilter || acta.estado === stateFilter) &&
          (!yearFilter || getActaYear(acta) === yearFilter),
      ),
    [actas, search, stateFilter, yearFilter],
  );

  const filterLabel = buildFilterLabel([
    ['Búsqueda', search],
    ['Estado', stateFilter],
    ['Año', yearFilter],
  ]);

  const columns = useMemo<Array<DataTableColumn<Acta, ActaColumnId>>>(
    () => [
      { id: 'tipo', header: 'Tipo', accessor: (acta) => acta.tipo, render: (acta) => acta.tipo, width: 120, sortable: true, resizable: true },
      {
        id: 'fechaSesion',
        header: 'Fecha sesión',
        accessor: (acta) => acta.fechaSesion,
        render: (acta) => acta.fechaSesion || '—',
        width: 130,
        sortable: true,
        resizable: true,
      },
      {
        id: 'fechaCreacion',
        header: 'Creación',
        accessor: (acta) => acta.fechaCreacion,
        render: (acta) => acta.fechaCreacion || '—',
        width: 120,
        sortable: true,
        resizable: true,
      },
      {
        id: 'titulo',
        header: 'Título',
        accessor: (acta) => acta.titulo,
        render: (acta) => <span className="font-semibold text-metro-text">{acta.titulo}</span>,
        width: 280,
        sortable: true,
        resizable: true,
      },
      {
        id: 'estado',
        header: 'Estado',
        accessor: (acta) => acta.estado,
        render: (acta) => acta.estado,
        width: 190,
        sortable: true,
        resizable: true,
      },
      {
        id: 'alegaciones',
        header: 'Alegaciones',
        accessor: (acta) => acta.alegaciones.length,
        render: (acta) => `${acta.alegaciones.filter((alegacion) => alegacion.presentada).length}/${acta.alegaciones.length}`,
        width: 120,
        sortable: true,
        resizable: true,
      },
      {
        id: 'acciones',
        header: 'Acciones',
        render: (acta) => (
          <button
            className="inline-flex items-center gap-1 rounded-lg border border-red-500/40 px-2 py-1 text-xs font-semibold text-red-200 hover:bg-red-500/10"
            onClick={(event) => {
              event.stopPropagation();
              remove(acta.id);
            }}
            type="button"
          >
            <Trash2 size={13} /> Eliminar
          </button>
        ),
        width: 120,
        minWidth: 110,
        isActionColumn: true,
      },
    ],
    [remove],
  );

  const openEditor = (acta?: Acta) => {
    if (acta) {
      setDraft({
        titulo: acta.titulo,
        tipo: acta.tipo,
        fechaSesion: acta.fechaSesion,
        estado: acta.estado,
        observaciones: acta.observaciones,
        alegaciones: acta.alegaciones,
      });
      setEditingActaId(acta.id);
    } else {
      setDraft(EMPTY_ACTA_DRAFT);
      setEditingActaId(null);
    }
    setIsEditorOpen(true);
  };

  const updateDraft = <K extends keyof ActaDraft>(key: K, value: ActaDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const updateAlegacion = <K extends keyof ActaAlegacion>(index: number, key: K, value: ActaAlegacion[K]) => {
    setDraft((current) => ({
      ...current,
      alegaciones: current.alegaciones.map((alegacion, currentIndex) =>
        currentIndex === index ? { ...alegacion, [key]: value } : alegacion,
      ),
    }));
  };

  const saveActa = () => {
    if (!draft.titulo.trim() || !draft.fechaSesion) {
      window.alert('Indica título y fecha de sesión.');
      return;
    }

    if (editingActaId) {
      update(editingActaId, draft);
    } else {
      create(draft);
    }
    setIsEditorOpen(false);
    setEditingActaId(null);
    setDraft(EMPTY_ACTA_DRAFT);
  };

  return (
    <section className="space-y-4 rounded-2xl border border-metro-border bg-metro-surface p-4 shadow-card" id="actas">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-metro-red">Módulo</p>
          <h2 className="flex items-center gap-2 text-2xl font-bold text-metro-text">
            <FileText size={24} /> Actas
          </h2>
          <p className="mt-0.5 text-base text-metro-muted">
            Registro de actas de Comité y Comisión Paritaria con alegaciones por sindicato.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ExportPrintButtons
            payload={{
              title: 'Actas',
              filename: 'actas',
              columns: actaExportColumns,
              rows: filteredActas,
              filterLabel,
            }}
          />
          <button
            className="inline-flex items-center gap-2 rounded-xl bg-metro-red px-3 py-2 text-sm font-semibold text-white hover:bg-metro-dark"
            onClick={() => openEditor()}
            type="button"
          >
            <Plus size={16} /> Nueva acta
          </button>
        </div>
      </div>

      <div className="grid gap-2 xl:grid-cols-[minmax(220px,1fr)_220px_160px]">
        <input
          className="rounded-lg border border-metro-border bg-metro-panel px-3 py-2 text-sm text-metro-text outline-none focus:border-metro-red"
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar por título, tipo, estado u observaciones..."
          value={search}
        />
        <select
          className="rounded-lg border border-metro-border bg-metro-panel px-3 py-2 text-sm text-metro-text outline-none focus:border-metro-red"
          onChange={(event) => setStateFilter(event.target.value)}
          value={stateFilter}
        >
          <option value="">Todos los estados</option>
          {ACTA_STATES.map((state) => (
            <option key={state} value={state}>
              {state}
            </option>
          ))}
        </select>
        <select
          className="rounded-lg border border-metro-border bg-metro-panel px-3 py-2 text-sm text-metro-text outline-none focus:border-metro-red"
          onChange={(event) => setYearFilter(event.target.value)}
          value={yearFilter}
        >
          <option value="">Todos los años</option>
          {years.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
      </div>

      <DataTable
        ariaLabel="Actas"
        columnWidths={preferences.columnWidths}
        columns={columns}
        emptyMessage="No hay actas con los filtros actuales."
        getRowId={(acta) => acta.id}
        onColumnWidthChange={setColumnWidth}
        onRowClick={openEditor}
        onSortChange={setSort}
        rows={filteredActas}
        sort={preferences.sort}
      />

      {isEditorOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4">
          <div className="max-h-[88vh] w-full max-w-4xl overflow-auto rounded-2xl border border-metro-border bg-metro-surface p-4 shadow-2xl">
            <h3 className="text-lg font-bold text-metro-text">{editingActaId ? 'Editar acta' : 'Nueva acta'}</h3>
            <div className="mt-3 grid gap-2 xl:grid-cols-[160px_180px_minmax(220px,1fr)]">
              <select
                className="rounded-lg border border-metro-border bg-metro-panel px-3 py-2 text-sm text-metro-text outline-none focus:border-metro-red"
                onChange={(event) => updateDraft('tipo', event.target.value === 'Paritaria' ? 'Paritaria' : 'Comité')}
                value={draft.tipo}
              >
                {ACTA_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
              <input
                className="rounded-lg border border-metro-border bg-metro-panel px-3 py-2 text-sm text-metro-text outline-none focus:border-metro-red"
                onChange={(event) => updateDraft('fechaSesion', event.target.value)}
                type="date"
                value={draft.fechaSesion}
              />
              <input
                className="rounded-lg border border-metro-border bg-metro-panel px-3 py-2 text-sm text-metro-text outline-none focus:border-metro-red"
                onChange={(event) => updateDraft('titulo', event.target.value)}
                placeholder="Título"
                value={draft.titulo}
              />
            </div>
            <select
              className="mt-2 w-full rounded-lg border border-metro-border bg-metro-panel px-3 py-2 text-sm text-metro-text outline-none focus:border-metro-red"
              onChange={(event) => updateDraft('estado', event.target.value as ActaDraft['estado'])}
              value={draft.estado}
            >
              {ACTA_STATES.map((state) => (
                <option key={state} value={state}>
                  {state}
                </option>
              ))}
            </select>
            <textarea
              className="mt-2 min-h-[120px] w-full rounded-lg border border-metro-border bg-metro-panel px-3 py-2 text-sm text-metro-text outline-none focus:border-metro-red"
              onChange={(event) => updateDraft('observaciones', event.target.value)}
              placeholder="Observaciones"
              value={draft.observaciones}
            />

            <div className="mt-4 rounded-xl border border-metro-border bg-metro-panel p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-sm font-bold uppercase tracking-wide text-metro-muted">Alegaciones</h4>
                <button
                  className="rounded-lg border border-metro-border px-3 py-1.5 text-xs font-semibold text-metro-muted hover:border-metro-red hover:text-metro-text"
                  onClick={() => updateDraft('alegaciones', [...draft.alegaciones, createEmptyAlegacion()])}
                  type="button"
                >
                  Añadir sindicato
                </button>
              </div>
              <div className="mt-3 space-y-2">
                {draft.alegaciones.length === 0 && (
                  <p className="text-sm text-metro-muted">Sin alegaciones configuradas.</p>
                )}
                {draft.alegaciones.map((alegacion, index) => (
                  <div className="grid gap-2 rounded-lg border border-metro-border bg-metro-surface p-2 xl:grid-cols-[180px_110px_150px_minmax(220px,1fr)_80px]" key={`${alegacion.sindicato}-${index}`}>
                    <input
                      className="rounded-lg border border-metro-border bg-metro-panel px-2 py-1.5 text-sm text-metro-text outline-none focus:border-metro-red"
                      list="actas-sindicatos"
                      onChange={(event) => updateAlegacion(index, 'sindicato', event.target.value)}
                      placeholder="Sindicato"
                      value={alegacion.sindicato}
                    />
                    <label className="flex items-center gap-2 text-sm text-metro-muted">
                      <input
                        checked={alegacion.presentada}
                        onChange={(event) => updateAlegacion(index, 'presentada', event.target.checked)}
                        type="checkbox"
                      />
                      Presentada
                    </label>
                    <input
                      className="rounded-lg border border-metro-border bg-metro-panel px-2 py-1.5 text-sm text-metro-text outline-none focus:border-metro-red"
                      onChange={(event) => updateAlegacion(index, 'fecha', event.target.value)}
                      type="date"
                      value={alegacion.fecha}
                    />
                    <input
                      className="rounded-lg border border-metro-border bg-metro-panel px-2 py-1.5 text-sm text-metro-text outline-none focus:border-metro-red"
                      onChange={(event) => updateAlegacion(index, 'observacion', event.target.value)}
                      placeholder="Observación"
                      value={alegacion.observacion}
                    />
                    <button
                      className="rounded-lg border border-red-500/40 px-2 py-1.5 text-xs font-semibold text-red-200 hover:bg-red-500/10"
                      onClick={() =>
                        updateDraft(
                          'alegaciones',
                          draft.alegaciones.filter((_, currentIndex) => currentIndex !== index),
                        )
                      }
                      type="button"
                    >
                      Quitar
                    </button>
                  </div>
                ))}
              </div>
              <datalist id="actas-sindicatos">
                {sindicatoOptions.map((sindicato) => (
                  <option key={sindicato} value={sindicato} />
                ))}
              </datalist>
            </div>

            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                className="rounded-xl border border-metro-border px-3 py-2 text-sm font-semibold text-metro-muted hover:border-metro-red hover:text-metro-text"
                onClick={() => setIsEditorOpen(false)}
                type="button"
              >
                Cancelar
              </button>
              <button
                className="rounded-xl bg-metro-red px-3 py-2 text-sm font-semibold text-white hover:bg-metro-dark"
                onClick={saveActa}
                type="button"
              >
                Guardar acta
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
