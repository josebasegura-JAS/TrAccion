import ExcelJS from 'exceljs';
import { FileDown, FileUp, Search, SlidersHorizontal, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { filterCriteriosRrll } from '../domain/filters';
import { parseCriteriosRrllImportFile, type CriterioRrllImportPreviewRow } from '../domain/importExcel';
import {
  sortCriteriosRrllByColumn,
  sortCriteriosRrllByDefault,
  type CriterioRrllSortKey,
  type SortDirection,
} from '../domain/sort';
import {
  CRITERIO_RRLL_ESTADOS,
  CRITERIO_RRLL_SENTIDOS,
  type CriterioRrll,
  type CriterioRrllEstado,
  type CriterioRrllSentido,
} from '../domain/criterioRrll';
import { useCriteriosRrllStore } from '../store/useCriteriosRrllStore';
import { CriterioRrllEditor } from './CriterioRrllEditor';
import type { ModuleHelpSection } from '../../../components/ModuleHelp';
import { ActionButton } from '../../../components/ui/ActionButton';
import { PageHeader } from '../../../components/ui/PageHeader';
import { useAppDialog } from '../../../hooks/useAppDialog';

const CRITERIOS_RRLL_HELP_SECTIONS: ModuleHelpSection[] = [
  {
    title: 'Para qué sirve',
    items: [
      'Actúa como repositorio de criterios laborales ya analizados para reutilizarlos en casos similares.',
      'Cada criterio puede registrar tema, resumen, estado, sentido y observaciones de aplicación.',
      'La importación Excel permite incorporar históricos o respuestas ya trabajadas fuera de la app.',
    ],
  },
  {
    title: 'Uso recomendado',
    items: [
      'Resume el caso y la solución de forma clara, evitando textos demasiado largos.',
      'Usa el campo sentido para distinguir criterios de aprobar, denegar u otros resultados.',
      'Filtra por tema, estado o sentido antes de contestar nuevas consultas similares.',
    ],
  },
];

interface SortState {
  key: CriterioRrllSortKey;
  direction: SortDirection;
}

interface ImportPreviewRow extends CriterioRrllImportPreviewRow {
  id: string;
  selected: boolean;
}

interface ImportPreviewState {
  fileName: string;
  rows: ImportPreviewRow[];
}

function createPreviewRowId(row: CriterioRrllImportPreviewRow): string {
  return `${row.rowNumber}-${row.draft.tema}-${row.draft.fecha}`;
}

async function downloadCriteriosRrllTemplate(): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Criterios RRLL');

  worksheet.columns = [
    { header: 'Tema', key: 'tema', width: 42 },
    { header: 'Fecha', key: 'fecha', width: 14 },
    { header: 'Responsable', key: 'responsable', width: 18 },
    { header: 'Criterio', key: 'criterio', width: 90 },
    { header: 'Sentido', key: 'sentido', width: 16 },
  ];

  worksheet.addRows([
    {
      tema: 'Firma de escrituras',
      fecha: '2017',
      responsable: 'RRLL',
      criterio: 'Indicar aquí el criterio aplicable al caso concreto.',
      sentido: 'Denegado',
    },
    {
      tema: 'Necesidad sobrevenida acreditada',
      fecha: '2014',
      responsable: 'RRLL',
      criterio: 'Indicar aquí el criterio aplicable al caso concreto.',
      sentido: 'Aprobado',
    },
  ]);

  worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  worksheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF991B1B' },
  };
  worksheet.getColumn('criterio').alignment = { wrapText: true, vertical: 'top' };
  for (let rowNumber = 2; rowNumber <= 200; rowNumber += 1) {
    worksheet.getCell(`E${rowNumber}`).dataValidation = {
      type: 'list',
      allowBlank: false,
      formulae: ['"Aprobado,Denegado,Sin clasificar"'],
    };
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'Plantilla_Criterios_RRLL.xlsx';
  anchor.click();
  URL.revokeObjectURL(url);
}


const sortableColumns: Array<{ key: CriterioRrllSortKey; label: string; className: string }> = [
  { key: 'tema', label: 'Tema', className: 'w-[220px]' },
  { key: 'estado', label: 'Estado', className: 'w-[120px]' },
  { key: 'sentido', label: 'Sentido', className: 'w-[120px]' },
  { key: 'fecha', label: 'Fecha', className: 'w-[115px]' },
  { key: 'responsable', label: 'Responsable', className: 'w-[150px]' },
];

function SelectFilter({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  options: readonly string[];
  value: string;
}) {
  return (
    <label className="flex items-center gap-2 rounded-lg border border-metro-border bg-metro-surface px-3 py-1.5 text-sm text-metro-muted">
      <span className="shrink-0 text-xs font-bold uppercase tracking-wide">{label}</span>
      <select
        className="w-full bg-transparent text-metro-text outline-none"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        <option value="">Todos</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}


function SentidoBadge({ sentido }: { sentido: CriterioRrllSentido }) {
  const className = sentido === 'aprobado'
    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
    : sentido === 'denegado'
      ? 'border-red-500/40 bg-red-500/10 text-red-200'
      : 'border-metro-border bg-metro-panel text-metro-muted';

  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${className}`}>
      {sentido}
    </span>
  );
}

export function CriteriosRrllPage() {
  const { criterios, filters, importDrafts, load, removeWithConcurrencyCheck, selectCriterio, setFilter } = useCriteriosRrllStore();
  const { alert, dialogNode } = useAppDialog();
  const [editorMode, setEditorMode] = useState<'create' | 'edit' | null>(null);
  const [editingCriterioId, setEditingCriterioId] = useState<string | null>(null);
  const [sortState, setSortState] = useState<SortState | null>(null);
  const [importMessage, setImportMessage] = useState('');
  const [importPreview, setImportPreview] = useState<ImportPreviewState | null>(null);
  const [templateMessage, setTemplateMessage] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    load();
  }, [load]);

  const visibleCriterios = useMemo(
    () => criterios.filter((criterio) => !criterio.deletedAt),
    [criterios],
  );
  const filteredCriterios = useMemo(
    () => filterCriteriosRrll(criterios, filters),
    [criterios, filters],
  );
  const sortedCriterios = useMemo(() => {
    if (!sortState) {
      return sortCriteriosRrllByDefault(filteredCriterios);
    }

    return sortCriteriosRrllByColumn(filteredCriterios, sortState.key, sortState.direction);
  }, [filteredCriterios, sortState]);

  const editorCriterio =
    editorMode === 'edit'
      ? (visibleCriterios.find((criterio) => criterio.id === editingCriterioId) ?? null)
      : null;

  const openEditor = (criterio: CriterioRrll) => {
    selectCriterio(criterio.id);
    setEditingCriterioId(criterio.id);
    setEditorMode('edit');
  };

  const openCreateEditor = () => {
    setEditingCriterioId(null);
    setEditorMode('create');
  };

  const closeEditor = () => {
    setEditorMode(null);
    setEditingCriterioId(null);
  };

  const toggleSort = (key: CriterioRrllSortKey) => {
    setSortState((current) => ({
      key,
      direction: current?.key === key && current.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  const selectedImportRows = importPreview?.rows.filter((row) => row.selected) ?? [];

  const toggleImportRow = (id: string) => {
    setImportPreview((current) =>
      current
        ? {
            ...current,
            rows: current.rows.map((row) => (row.id === id ? { ...row, selected: !row.selected } : row)),
          }
        : current,
    );
  };

  const setAllImportRowsSelected = (selected: boolean) => {
    setImportPreview((current) =>
      current ? { ...current, rows: current.rows.map((row) => ({ ...row, selected })) } : current,
    );
  };

  const confirmImport = async () => {
    if (!importPreview) {
      return;
    }

    const selectedDrafts = importPreview.rows.filter((row) => row.selected).map((row) => row.draft);
    try {
      await importDrafts(selectedDrafts);
      setImportMessage(
        `Importación completada: ${selectedDrafts.length} de ${importPreview.rows.length} registros de ${importPreview.fileName}`,
      );
      setImportPreview(null);
    } catch (error) {
      setImportMessage(error instanceof Error ? error.message : 'No se ha podido completar la importación.');
    }
  };

  const handleTemplateDownload = async () => {
    setTemplateMessage('');
    try {
      await downloadCriteriosRrllTemplate();
    } catch (error) {
      console.error('Error al descargar la plantilla de Criterios RRLL:', error);
      setTemplateMessage('No se ha podido generar la plantilla Excel.');
    }
  };

  return (
    <section
      className="rounded-2xl border border-metro-border bg-metro-surface p-4 shadow-card"
      id="criterios-rrll"
    >
      <PageHeader
        title="Criterios RRLL"
        subtitle="Listado de criterios con alta manual, edición, importación Excel, búsqueda y filtros."
        helpSections={CRITERIOS_RRLL_HELP_SECTIONS}
        helpSubtitle="Guía rápida del repositorio de criterios, sentido, filtros e importación."
        className="mb-3"
        actions={
          <>
            <input
              accept=".xlsx,.xls,.csv,.tsv,.txt"
              className="hidden"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) {
                  return;
                }

                try {
                  const rows = await parseCriteriosRrllImportFile(file);
                  setImportMessage('');
                  setImportPreview({
                    fileName: file.name,
                    rows: rows.map((row) => ({ ...row, id: createPreviewRowId(row), selected: true })),
                  });
                } catch (error) {
                  console.error('Error al previsualizar la importación de Criterios RRLL:', error);
                  setImportMessage('No se ha podido leer la Excel. Revisa que respete la plantilla.');
                } finally {
                  event.target.value = '';
                }
              }}
              ref={fileInputRef}
              type="file"
            />
            <ActionButton variant="secondary" iconOnly={false} onClick={handleTemplateDownload}>
              <FileDown size={16} /> Descargar plantilla
            </ActionButton>
            <ActionButton variant="secondary" iconOnly={false} onClick={() => fileInputRef.current?.click()}>
              <FileUp size={16} /> Importar Excel
            </ActionButton>
            <ActionButton variant="add" iconOnly={false} onClick={openCreateEditor}>
              Nuevo criterio
            </ActionButton>
          </>
        }
      />

      {importMessage && (
        <p className="mb-3 rounded-xl border border-metro-border bg-metro-panel px-3 py-2 text-sm text-metro-muted">
          {importMessage}
        </p>
      )}
      {templateMessage && (
        <p className="mb-3 rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-100">
          {templateMessage}
        </p>
      )}

      <div className="mb-3 grid gap-2 rounded-xl border border-metro-border bg-metro-panel p-2 lg:grid-cols-[minmax(220px,1.2fr)_minmax(150px,0.8fr)_minmax(150px,0.8fr)]">
        <label className="flex items-center gap-2 rounded-lg border border-metro-border bg-metro-surface px-3 py-1.5 text-sm text-metro-muted">
          <Search size={16} />
          <input
            className="w-full bg-transparent text-metro-text outline-none placeholder:text-metro-muted"
            onChange={(event) => setFilter('search', event.target.value)}
            placeholder="Buscar por tema, criterio, sentido u observaciones..."
            type="search"
            value={filters.search}
          />
        </label>
        <SelectFilter
          label="Estado"
          onChange={(value) => setFilter('estado', value as '' | CriterioRrllEstado)}
          options={CRITERIO_RRLL_ESTADOS}
          value={filters.estado}
        />
        <SelectFilter
          label="Sentido"
          onChange={(value) => setFilter('sentido', value as '' | CriterioRrllSentido)}
          options={CRITERIO_RRLL_SENTIDOS}
          value={filters.sentido}
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-metro-border">
        <div className="flex items-center justify-between border-b border-metro-border bg-metro-surface px-3 py-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-metro-text">
            <SlidersHorizontal size={16} className="text-metro-red" /> Criterios RRLL
          </div>
          <span className="rounded-full bg-metro-red/10 px-3 py-1 text-xs font-bold text-red-200">
            {filteredCriterios.length} registros
          </span>
        </div>
        <div className="max-h-[460px] overflow-auto">
          <table className="w-full table-fixed text-left text-xs">
            <thead className="sticky top-0 z-10 bg-metro-panel text-[11px] uppercase tracking-wide text-metro-muted">
              <tr>
                {sortableColumns.map((column) => {
                  const isActive = sortState?.key === column.key;

                  return (
                    <th className={`${column.className} px-3 py-2`} key={column.key}>
                      <button
                        className="flex w-full items-center gap-1 text-left font-bold uppercase tracking-wide hover:text-metro-text"
                        onClick={() => toggleSort(column.key)}
                        type="button"
                      >
                        <span>{column.label}</span>
                        {isActive && <span>{sortState.direction === 'asc' ? '↑' : '↓'}</span>}
                      </button>
                    </th>
                  );
                })}
                <th className="w-[300px] px-3 py-2">Criterio</th>
                <th className="w-[100px] px-3 py-2 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-metro-border bg-metro-surface">
              {sortedCriterios.map((criterio) => (
                <tr
                  className="cursor-pointer hover:bg-metro-red/10"
                  key={criterio.id}
                  onClick={() => openEditor(criterio)}
                >
                  <td
                    className="truncate px-3 py-1.5 font-semibold text-metro-text"
                    title={criterio.tema}
                  >
                    {criterio.tema}
                  </td>
                  <td className="truncate px-3 py-1.5 text-metro-muted" title={criterio.estado}>
                    {criterio.estado}
                  </td>
                  <td className="truncate px-3 py-1.5 text-metro-muted" title={criterio.sentido}>
                    <SentidoBadge sentido={criterio.sentido} />
                  </td>
                  <td
                    className="truncate px-3 py-1.5 text-metro-muted"
                    title={criterio.fecha || '—'}
                  >
                    {criterio.fecha || '—'}
                  </td>
                  <td
                    className="truncate px-3 py-1.5 text-metro-muted"
                    title={criterio.responsable}
                  >
                    {criterio.responsable}
                  </td>
                  <td className="truncate px-3 py-1.5 text-metro-muted" title={criterio.criterio}>
                    {criterio.criterio}
                  </td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-right">
                    <ActionButton
                      size="sm"
                      variant="delete"
                      iconOnly={false}
                      onClick={(event) => {
                        event.stopPropagation();
                        void (async () => {
                          const result = await removeWithConcurrencyCheck(
                            criterio.id,
                            criterio.updatedAt,
                          );
                          if (!result.ok) {
                            await alert(result.message, { type: 'error' });
                          }
                        })();
                      }}
                    >
                      Eliminar
                    </ActionButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {sortedCriterios.length === 0 && (
            <p className="border-t border-metro-border bg-metro-surface px-3 py-3 text-sm text-metro-muted">
              No hay criterios para los filtros seleccionados.
            </p>
          )}
        </div>
      </div>


      {importPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="flex max-h-[86vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-metro-border bg-metro-panel shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-metro-border bg-metro-surface px-4 py-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-metro-red">Previsualización</p>
                <h3 className="text-xl font-bold text-metro-text">Importar Criterios RRLL</h3>
                <p className="text-sm text-metro-muted">
                  {importPreview.fileName} · {selectedImportRows.length} de {importPreview.rows.length} registros seleccionados
                </p>
              </div>
              <button
                className="rounded-full border border-metro-border p-2 text-metro-muted hover:border-metro-red hover:text-metro-text"
                onClick={() => setImportPreview(null)}
                type="button"
              >
                <X size={18} />
              </button>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-metro-border px-4 py-2 text-sm">
              <p className="text-metro-muted">
                Desmarca los registros que no quieras importar. Tema y Criterio son obligatorios.
              </p>
              <div className="flex flex-wrap gap-2">
                <ActionButton variant="secondary" iconOnly={false} onClick={() => setAllImportRowsSelected(true)}>
                  Marcar todos
                </ActionButton>
                <ActionButton variant="secondary" iconOnly={false} onClick={() => setAllImportRowsSelected(false)}>
                  Desmarcar todos
                </ActionButton>
              </div>
            </div>
            <div className="overflow-auto">
              <table className="w-full table-fixed text-left text-xs">
                <thead className="sticky top-0 z-10 bg-metro-panel text-[11px] uppercase tracking-wide text-metro-muted">
                  <tr>
                    <th className="w-[70px] px-3 py-2">Importar</th>
                    <th className="w-[70px] px-3 py-2">Fila</th>
                    <th className="w-[230px] px-3 py-2">Tema</th>
                    <th className="w-[100px] px-3 py-2">Fecha</th>
                    <th className="w-[120px] px-3 py-2">Responsable</th>
                    <th className="w-[120px] px-3 py-2">Sentido</th>
                    <th className="w-[420px] px-3 py-2">Criterio</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-metro-border bg-metro-surface">
                  {importPreview.rows.map((row) => (
                    <tr className="hover:bg-metro-red/10" key={row.id}>
                      <td className="px-3 py-2 text-center">
                        <input
                          checked={row.selected}
                          className="h-4 w-4 accent-red-700"
                          onChange={() => toggleImportRow(row.id)}
                          type="checkbox"
                        />
                      </td>
                      <td className="px-3 py-2 text-metro-muted">{row.rowNumber}</td>
                      <td className="truncate px-3 py-2 font-semibold text-metro-text" title={row.draft.tema}>
                        {row.draft.tema}
                      </td>
                      <td className="truncate px-3 py-2 text-metro-muted" title={row.draft.fecha || '—'}>
                        {row.draft.fecha || '—'}
                      </td>
                      <td className="truncate px-3 py-2 text-metro-muted" title={row.draft.responsable || '—'}>
                        {row.draft.responsable || '—'}
                      </td>
                      <td className="px-3 py-2 text-metro-muted">
                        <SentidoBadge sentido={row.draft.sentido} />
                      </td>
                      <td className="truncate px-3 py-2 text-metro-muted" title={row.draft.criterio}>
                        {row.draft.criterio}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {importPreview.rows.length === 0 && (
                <p className="px-4 py-5 text-sm text-metro-muted">
                  No se han encontrado registros importables. Revisa que la hoja tenga las columnas Tema, Fecha, Responsable, Criterio y Sentido.
                </p>
              )}
            </div>
            <div className="flex flex-wrap justify-end gap-2 border-t border-metro-border bg-metro-surface px-4 py-3">
              <ActionButton variant="secondary" iconOnly={false} onClick={() => setImportPreview(null)}>
                Cancelar
              </ActionButton>
              <ActionButton
                variant="save"
                iconOnly={false}
                disabled={selectedImportRows.length === 0}
                onClick={() => {
                  void confirmImport();
                }}
              >
                Importar seleccionados
              </ActionButton>
            </div>
          </div>
        </div>
      )}

      {editorMode && (
        <CriterioRrllEditor criterio={editorCriterio} mode={editorMode} onDone={closeEditor} />
      )}

      {dialogNode}
    </section>
  );
}
