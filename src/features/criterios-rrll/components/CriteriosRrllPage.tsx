import { FileDown, FileUp, SlidersHorizontal } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { filterCriteriosRrll } from '../domain/filters';
import {
  parseCriteriosRrllImportFile,
  type CriterioRrllImportPreviewRow,
} from '../domain/importExcel';
import { sortCriteriosRrllByDefault } from '../domain/sort';
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
import { ModalCloseButton } from '../../../components/ui/ModalCloseButton';
import { ModalBody, ModalFooter, ModalHeader, ModalShell, ModalTitle } from '../../../components/ui/ModalShell';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { CountBadge } from '../../../components/ui/CountBadge';
import { ActionButton } from '../../../components/ui/ActionButton';
import { DropdownMenu } from '../../../components/ui/DropdownMenu';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Toolbar } from '../../../components/ui/Toolbar';
import { SearchField } from '../../../components/ui/SearchField';
import { FilterSelect } from '../../../components/ui/FilterSelect';
import { useAppDialog } from '../../../hooks/useAppDialog';
import { CompactTable, CompactTableBody, CompactTableHead } from '../../../shared/table/CompactTable';
import { DataTable, type DataTableColumn } from '../../../shared/table/DataTable';
import { useTableViewPreferences } from '../../../shared/table/useTableViewPreferences';

const CRITERIOS_RRLL_HELP_SECTIONS: ModuleHelpSection[] = [
  {
    title: 'Para qué sirve',
    body: 'Actúa como repositorio de criterios laborales ya analizados (tema, criterio aplicado, fecha, responsable, estado y sentido) para reutilizarlos ante casos similares.',
  },
  {
    title: 'Campos de cada criterio',
    items: [
      'Tema y Criterio son los únicos campos obligatorios; el resto son de apoyo.',
      'Estado: vigente, en revisión o archivado.',
      'Sentido: aprobado, denegado o sin clasificar.',
      'Fecha, responsable y observaciones ayudan a documentar el contexto sin ser obligatorios.',
    ],
  },
  {
    title: 'Importación desde Excel',
    items: [
      'Admite Excel, CSV, TSV o TXT, con columnas reconocidas por variantes habituales del nombre (Tema/Asunto/Materia, Criterio/Descripción/Detalle, Sentido/Resultado, etc.); no hace falta que coincidan exactamente.',
      'El campo Fecha también acepta simplemente un año.',
      'Antes de confirmar la importación se muestra una vista previa donde se puede desmarcar fila a fila lo que no se quiera incorporar.',
      'El botón "Descargar plantilla" genera un Excel de ejemplo con las columnas que reconoce el importador.',
    ],
  },
  {
    title: 'Flujo recomendado',
    ordered: true,
    items: [
      'Dar de alta el criterio indicando tema, estado, sentido y responsable.',
      'Redactar el criterio de forma clara para que pueda reutilizarse en casos futuros.',
      'Usar filtros y búsqueda para localizar precedentes similares antes de responder nuevas consultas.',
      'Actualizar el criterio si cambia la interpretación o se consolida una nueva práctica.',
    ],
  },
];


interface ImportPreviewRow extends CriterioRrllImportPreviewRow {
  id: string;
  selected: boolean;
}

interface ImportPreviewState {
  fileName: string;
  rows: ImportPreviewRow[];
}

type CriteriosTableColumnId =
  | 'tema'
  | 'estado'
  | 'sentido'
  | 'fecha'
  | 'responsable'
  | 'criterio'
  | 'acciones';

const criteriosTableColumnIds: CriteriosTableColumnId[] = [
  'tema',
  'estado',
  'sentido',
  'fecha',
  'responsable',
  'criterio',
  'acciones',
];

function createPreviewRowId(row: CriterioRrllImportPreviewRow): string {
  return `${row.rowNumber}-${row.draft.tema}-${row.draft.fecha}`;
}

async function downloadCriteriosRrllTemplate(): Promise<void> {
  const { default: ExcelJS } = await import('exceljs');
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


function SentidoBadge({ sentido }: { sentido: CriterioRrllSentido }) {
  const tone = sentido === 'aprobado' ? 'success' : sentido === 'denegado' ? 'error' : 'muted';

  return (
    <StatusBadge size="xs" tone={tone} className="uppercase tracking-wide">
      {sentido}
    </StatusBadge>
  );
}

export function CriteriosRrllPage() {
  const {
    criterios,
    filters,
    importDrafts,
    load,
    removeWithConcurrencyCheck,
    selectCriterio,
    setFilter,
  } = useCriteriosRrllStore();
  const { alert, dialogNode } = useAppDialog();
  const [editorMode, setEditorMode] = useState<'create' | 'edit' | null>(null);
  const [editingCriterioId, setEditingCriterioId] = useState<string | null>(null);
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
  const sortedCriterios = useMemo(
    () => sortCriteriosRrllByDefault(filteredCriterios),
    [filteredCriterios],
  );

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

  const {
    preferences: tablePreferences,
    setSort: setTableSort,
    setColumnWidth: setTableColumnWidth,
    setColumnOrder: setTableColumnOrder,
    resetColumnWidths: resetTableColumnWidths,
  } = useTableViewPreferences<CriteriosTableColumnId>({
    storageKey: 'traccion.tableView.criteriosRrll.main',
    defaultPreferences: {
      sort: null,
      columnWidths: {},
      columnOrder: null,
    },
    validColumnIds: criteriosTableColumnIds,
  });

  const tableColumns = useMemo<Array<DataTableColumn<CriterioRrll, CriteriosTableColumnId>>>(() => [
    {
      id: 'tema',
      header: 'Tema',
      tone: 'identity',
      accessor: (criterio) => criterio.tema,
      render: (criterio) => <span className="font-semibold text-metro-text" title={criterio.tema}>{criterio.tema}</span>,
      width: 220,
      minWidth: 150,
      sortable: true,
    },
    {
      id: 'estado',
      header: 'Estado',
      accessor: (criterio) => criterio.estado,
      render: (criterio) => criterio.estado,
      width: 120,
      sortable: true,
    },
    {
      id: 'sentido',
      header: 'Sentido',
      accessor: (criterio) => criterio.sentido,
      render: (criterio) => <SentidoBadge sentido={criterio.sentido} />,
      width: 120,
      sortable: true,
    },
    {
      id: 'fecha',
      header: 'Fecha',
      accessor: (criterio) => criterio.fecha,
      render: (criterio) => criterio.fecha || '—',
      width: 115,
      sortable: true,
    },
    {
      id: 'responsable',
      header: 'Responsable',
      accessor: (criterio) => criterio.responsable,
      render: (criterio) => criterio.responsable || '—',
      width: 150,
      sortable: true,
    },
    {
      id: 'criterio',
      header: 'Criterio',
      accessor: (criterio) => criterio.criterio,
      render: (criterio) => <span title={criterio.criterio}>{criterio.criterio}</span>,
      width: 300,
      minWidth: 220,
      sortable: true,
    },
    {
      id: 'acciones',
      header: 'Acciones',
      width: 72,
      minWidth: 72,
      maxWidth: 72,
      isActionColumn: true,
      reorderable: false,
      resizable: false,
      render: (criterio) => (
        <div className="flex justify-end">
          <ActionButton
            aria-label="Eliminar criterio"
            size="sm"
            variant="delete"
            iconOnly
            onClick={(event) => {
              event.stopPropagation();
              void (async () => {
                const result = await removeWithConcurrencyCheck(criterio.id, criterio.updatedAt);
                if (!result.ok) {
                  await alert(result.message, { type: 'error' });
                }
              })();
            }}
          />
        </div>
      ),
    },
  ], [alert, removeWithConcurrencyCheck]);


  const selectedImportRows = importPreview?.rows.filter((row) => row.selected) ?? [];

  const toggleImportRow = (id: string) => {
    setImportPreview((current) =>
      current
        ? {
            ...current,
            rows: current.rows.map((row) =>
              row.id === id ? { ...row, selected: !row.selected } : row,
            ),
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
      setImportMessage(
        error instanceof Error ? error.message : 'No se ha podido completar la importación.',
      );
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
      className="space-y-3"
      id="criterios-rrll"
    >
      <PageHeader
        title="Criterios RRLL"
        helpSections={CRITERIOS_RRLL_HELP_SECTIONS}
        helpSubtitle="Guía rápida del repositorio de criterios, sentido, filtros e importación."
        className="mb-3"
        actions={
          <Toolbar
            filters={
              <>
                <SearchField
                  onChange={(event) => setFilter('search', event.target.value)}
                  onClear={() => setFilter('search', '')}
                  placeholder="Buscar por tema, criterio, sentido u observaciones..."
                  value={filters.search}
                  wrapperClassName="min-w-[320px]"
                />
                <FilterSelect
                  allLabel="Todos los estados"
                  aria-label="Filtrar criterios por estado"
                  onChange={(event) =>
                    setFilter('estado', event.target.value as '' | CriterioRrllEstado)
                  }
                  options={CRITERIO_RRLL_ESTADOS}
                  value={filters.estado}
                  wrapperClassName="w-[180px]"
                />
                <FilterSelect
                  allLabel="Todos los sentidos"
                  aria-label="Filtrar criterios por sentido"
                  onChange={(event) =>
                    setFilter('sentido', event.target.value as '' | CriterioRrllSentido)
                  }
                  options={CRITERIO_RRLL_SENTIDOS}
                  value={filters.sentido}
                  wrapperClassName="w-[180px]"
                />
              </>
            }
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
                    rows: rows.map((row) => ({
                      ...row,
                      id: createPreviewRowId(row),
                      selected: true,
                    })),
                  });
                } catch (error) {
                  console.error('Error al previsualizar la importación de Criterios RRLL:', error);
                  setImportMessage(
                    'No se ha podido leer la Excel. Revisa que respete la plantilla.',
                  );
                } finally {
                  event.target.value = '';
                }
              }}
              ref={fileInputRef}
              type="file"
            />
            <DropdownMenu
              icon={<FileUp size={14} />}
              size="sm"
              items={[
                {
                  key: 'descargar-plantilla',
                  label: 'Descargar plantilla',
                  icon: <FileDown size={14} />,
                  onClick: () => {
                    void handleTemplateDownload();
                  },
                },
                {
                  key: 'importar-excel',
                  label: 'Importar Excel',
                  icon: <FileUp size={14} />,
                  onClick: () => fileInputRef.current?.click(),
                },
              ]}
              label="Importar"
            />
            <ActionButton variant="add" iconOnly={false} onClick={openCreateEditor} size="sm">
              Nuevo criterio
            </ActionButton>
              </>
            }
          />
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

      <div className="overflow-hidden rounded-xl border border-metro-border">
        <div className="flex items-center justify-between border-b border-metro-border bg-metro-surface px-3 py-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-metro-text">
            <SlidersHorizontal size={16} className="text-metro-red" /> Criterios RRLL
          </div>
          <CountBadge>{filteredCriterios.length} registros</CountBadge>
        </div>
        <div className="p-2">
          <DataTable
            ariaLabel="Criterios RRLL"
            columns={tableColumns}
            rows={sortedCriterios}
            getRowId={(criterio) => criterio.id}
            sort={tablePreferences.sort}
            onSortChange={setTableSort}
            columnWidths={tablePreferences.columnWidths}
            onColumnWidthChange={setTableColumnWidth}
            onResetColumnWidths={resetTableColumnWidths}
            columnOrder={tablePreferences.columnOrder}
            onColumnOrderChange={setTableColumnOrder}
            emptyMessage="No hay criterios para los filtros seleccionados."
            onRowClick={openEditor}
            maxHeightClassName="max-h-[460px]"
          />
        </div>
      </div>

      {importPreview && (
        <ModalShell
          labelledBy="criterios-import-preview-title"
          maxWidthClassName="max-w-6xl"
          onClose={() => setImportPreview(null)}
        >
          <ModalHeader>
            <ModalTitle
              id="criterios-import-preview-title"
              subtitle={`${importPreview.fileName} · ${selectedImportRows.length} de ${importPreview.rows.length} registros seleccionados`}
            >
              Importar Criterios RRLL
            </ModalTitle>
            <ModalCloseButton onClick={() => setImportPreview(null)} />
          </ModalHeader>
          <ModalBody className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
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
            <div className="overflow-auto rounded-xl border border-metro-border">
              <CompactTable>
                <CompactTableHead>
                  <tr>
                    <th className="w-[70px] px-3 py-2">Importar</th>
                    <th className="w-[70px] px-3 py-2">Fila</th>
                    <th className="w-[230px] px-3 py-2">Tema</th>
                    <th className="w-[100px] px-3 py-2">Fecha</th>
                    <th className="w-[120px] px-3 py-2">Responsable</th>
                    <th className="w-[120px] px-3 py-2">Sentido</th>
                    <th className="w-[420px] px-3 py-2">Criterio</th>
                  </tr>
                </CompactTableHead>
                <CompactTableBody>
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
                </CompactTableBody>
              </CompactTable>
              {importPreview.rows.length === 0 && (
                <p className="px-4 py-5 text-sm text-metro-muted">
                  No se han encontrado registros importables. Revisa que la hoja tenga las columnas Tema, Fecha, Responsable, Criterio y Sentido.
                </p>
              )}
            </div>
          </ModalBody>
          <ModalFooter>
            <ActionButton variant="secondary" iconOnly={false} onClick={() => setImportPreview(null)}>
              Cancelar
            </ActionButton>
            <ActionButton
              variant="save"
              iconOnly={false}
              disabled={selectedImportRows.length === 0}
              onClick={() => { void confirmImport(); }}
            >
              Importar seleccionados
            </ActionButton>
          </ModalFooter>
        </ModalShell>
      )}

      {editorMode && (
        <CriterioRrllEditor criterio={editorCriterio} mode={editorMode} onDone={closeEditor} />
      )}

      {dialogNode}
    </section>
  );
}
