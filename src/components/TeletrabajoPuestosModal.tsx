import { AlertTriangle, Download, FileUp, Pencil, Plus, RotateCcw, Search, Trash2, Users, X } from 'lucide-react';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useEmployeeStore } from '../features/plantilla/store/useEmployeeStore';
import { normalizeJobPosition, isJobPositionTranslationPending } from '../features/plantilla/domain/jobPositionTranslation';
import { buildGruposCoberturaByIdMap } from '../features/teletrabajo/domain/gruposCobertura';
import {
  EMPTY_TELETRABAJO_PUESTO_DRAFT,
  importTeletrabajoPuestosFromFile,
  normalizeTeletrabajoPuesto,
  type TeletrabajoPuesto,
  type TeletrabajoPuestoDraft,
  type TeletrabajoPuestoImportRow,
} from '../features/teletrabajo/domain/puestosTeletrabajo';
import { useTeletrabajoStore } from '../features/teletrabajo/store/useTeletrabajoStore';
import { readStorageItem, writeStorageItem } from '../services/persistence';
import { buildStableExportFilename } from '../shared/export/tableExport';
import { DataTable, type DataTableColumn } from '../shared/table/DataTable';
import { sortDataTableRows } from '../shared/table/tableSorting';
import {
  useTableViewPreferences,
  type TableViewPreferences,
} from '../shared/table/useTableViewPreferences';
import { TeletrabajoGruposCoberturaModal } from './TeletrabajoGruposCoberturaModal';

interface TeletrabajoPuestosModalProps {
  onClose: () => void;
}

interface PendingImportResolution {
  rows: TeletrabajoPuestoImportRow[];
  unknownPuestos: string[];
  mapping: Record<string, string>;
}

const TELETRABAJO_PUESTOS_ALIASES_STORAGE_KEY = 'traccion.v1.teletrabajo.puestos.translationAliases';
const SIN_GRUPO_VALUE = '';
const TELETRABAJO_PUESTOS_TABLE_STORAGE_KEY = 'traccion.tableView.teletrabajo.puestos';

type TeletrabajoPuestoColumnId =
  | 'puesto'
  | 'maxSolicitudes'
  | 'dotacionComputable'
  | 'grupoCobertura'
  | 'observaciones'
  | 'acciones';

const teletrabajoPuestoColumnIds: readonly TeletrabajoPuestoColumnId[] = [
  'puesto',
  'maxSolicitudes',
  'dotacionComputable',
  'grupoCobertura',
  'observaciones',
  'acciones',
];

const defaultTeletrabajoPuestoTablePreferences: TableViewPreferences<TeletrabajoPuestoColumnId> = {
  sort: null,
  columnWidths: {},
  columnOrder: null,
};

function compareTextEs(first: string, second: string): number {
  return first.localeCompare(second, 'es', { numeric: true, sensitivity: 'base' });
}

function compareTeletrabajoPuestos(first: TeletrabajoPuesto, second: TeletrabajoPuesto): number {
  return compareTextEs(first.puesto, second.puesto);
}

function compareGruposCoberturaByName(
  first: { nombre: string },
  second: { nombre: string },
): number {
  return compareTextEs(first.nombre, second.nombre);
}

function normalizeWorkbookBuffer(buffer: ArrayBuffer | ArrayBufferView): ArrayBuffer {
  if (buffer instanceof ArrayBuffer) {
    return buffer;
  }

  const copy = new Uint8Array(buffer.byteLength);
  copy.set(new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength));
  return copy.buffer;
}

function readStoredAliases(): Record<string, string> {
  try {
    const stored = readStorageItem(TELETRABAJO_PUESTOS_ALIASES_STORAGE_KEY);
    if (!stored) {
      return {};
    }

    const parsed: unknown = JSON.parse(stored);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }

    return Object.entries(parsed).reduce<Record<string, string>>((aliases, [key, value]) => {
      if (typeof value === 'string' && value.trim()) {
        aliases[key] = value;
      }
      return aliases;
    }, {});
  } catch {
    return {};
  }
}

function persistStoredAliases(aliases: Record<string, string>): void {
  writeStorageItem(TELETRABAJO_PUESTOS_ALIASES_STORAGE_KEY, JSON.stringify(aliases));
}

export function TeletrabajoPuestosModal({ onClose }: TeletrabajoPuestosModalProps) {
  const {
    createPuestoTeletrabajo,
    gruposCobertura,
    importPuestosTeletrabajoDrafts,
    puestosTeletrabajo,
    removePuestoTeletrabajo,
    updatePuestoTeletrabajo,
  } = useTeletrabajoStore();
  const jobPositionTranslations = useEmployeeStore((state) => state.jobPositionTranslations);
  const [search, setSearch] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [editingPuestoId, setEditingPuestoId] = useState<string | null>(null);
  const [draft, setDraft] = useState<TeletrabajoPuestoDraft>(EMPTY_TELETRABAJO_PUESTO_DRAFT);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [pendingImport, setPendingImport] = useState<PendingImportResolution | null>(null);
  const [isGruposModalOpen, setIsGruposModalOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const masterPuestos = useMemo(
    () =>
      Array.from(
        new Map(
          jobPositionTranslations
            .map((translation) => translation.puestoCastellano.trim())
            .filter(Boolean)
            .map((puesto): [string, string] => [normalizeJobPosition(puesto), puesto]),
        ).values(),
      ).sort(compareTextEs),
    [jobPositionTranslations],
  );

  const masterPuestosByKey = useMemo(
    () => new Map(masterPuestos.map((puesto): [string, string] => [normalizeJobPosition(puesto), puesto])),
    [masterPuestos],
  );

  /**
   * Claves (texto normalizado) de puestoCastellano que existen en
   * Traducción de puestos pero todavía no tienen traducción al euskera.
   * Permite resaltar en esta tabla qué puestos teletrabajables están
   * esperando esa traducción, sin tener que ir a comprobarlo aparte.
   */
  const pendingTranslationKeys = useMemo(
    () =>
      new Set(
        jobPositionTranslations
          .filter((translation) => isJobPositionTranslationPending(translation))
          .map((translation) => normalizeJobPosition(translation.puestoCastellano)),
      ),
    [jobPositionTranslations],
  );

  const visibleGruposCobertura = useMemo(
    () => gruposCobertura.filter((grupo) => !grupo.deletedAt).sort(compareGruposCoberturaByName),
    [gruposCobertura],
  );

  const gruposById = useMemo(() => buildGruposCoberturaByIdMap(gruposCobertura), [gruposCobertura]);

  const visiblePuestos = useMemo(
    () => puestosTeletrabajo.filter((puesto) => !puesto.deletedAt).sort(compareTeletrabajoPuestos),
    [puestosTeletrabajo],
  );

  const filteredPuestos = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    if (!normalizedSearch) {
      return visiblePuestos;
    }

    return visiblePuestos.filter((puesto) => {
      const nombreGrupo = puesto.grupoCoberturaId
        ? gruposById.get(puesto.grupoCoberturaId)?.nombre ?? ''
        : '';
      return `${puesto.puesto} ${puesto.maxSolicitudes} ${puesto.dotacionComputable} ${nombreGrupo} ${puesto.observaciones}`
        .toLowerCase()
        .includes(normalizedSearch);
    });
  }, [search, visiblePuestos, gruposById]);

  const updateDraft = <K extends keyof TeletrabajoPuestoDraft>(
    key: K,
    value: TeletrabajoPuestoDraft[K],
  ) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const handleCreate = async () => {
    const puesto = draft.puesto.trim();
    if (!puesto) {
      setError('Indica el puesto antes de guardar.');
      setStatus('');
      return;
    }

    if (masterPuestos.length > 0 && !masterPuestosByKey.has(normalizeJobPosition(puesto))) {
      setError('El puesto indicado no existe en la tabla de Traducción de puestos. Selecciona un puesto válido de esa tabla.');
      setStatus('');
      return;
    }

    const result = await createPuestoTeletrabajo({ ...draft, puesto });
    if (!result.ok) {
      setError(result.message);
      setStatus('');
      return;
    }

    setDraft(EMPTY_TELETRABAJO_PUESTO_DRAFT);
    setIsCreating(false);
    setError('');
    setStatus('Puesto teletrabajable añadido.');
  };

  const handleStartEdit = useCallback((puesto: TeletrabajoPuesto) => {
    setIsCreating(false);
    setEditingPuestoId(puesto.id);
    setDraft({
      puesto: puesto.puesto,
      maxSolicitudes: puesto.maxSolicitudes,
      dotacionComputable: puesto.dotacionComputable,
      grupoCoberturaId: puesto.grupoCoberturaId,
      observaciones: puesto.observaciones,
    });
    setError('');
    setStatus('');
  }, []);

  const handleCancelEdit = () => {
    setEditingPuestoId(null);
    setDraft(EMPTY_TELETRABAJO_PUESTO_DRAFT);
    setError('');
  };

  const handleUpdate = async () => {
    if (!editingPuestoId) {
      return;
    }

    const puesto = draft.puesto.trim();
    if (!puesto) {
      setError('Indica el puesto antes de guardar.');
      setStatus('');
      return;
    }

    if (masterPuestos.length > 0 && !masterPuestosByKey.has(normalizeJobPosition(puesto))) {
      setError('El puesto indicado no existe en la tabla de Traducción de puestos. Selecciona un puesto válido de esa tabla.');
      setStatus('');
      return;
    }

    const duplicate = puestosTeletrabajo.find(
      (existing) =>
        existing.id !== editingPuestoId &&
        !existing.deletedAt &&
        normalizeTeletrabajoPuesto(existing.puesto) === normalizeTeletrabajoPuesto(puesto),
    );
    if (duplicate) {
      setError('Ya existe otro puesto teletrabajable con ese mismo nombre.');
      setStatus('');
      return;
    }

    const result = await updatePuestoTeletrabajo(editingPuestoId, { ...draft, puesto });
    if (!result.ok) {
      setError(result.message);
      setStatus('');
      return;
    }

    setEditingPuestoId(null);
    setDraft(EMPTY_TELETRABAJO_PUESTO_DRAFT);
    setError('');
    setStatus('Puesto teletrabajable actualizado.');
  };

  const handleRemove = useCallback(
    async (puesto: TeletrabajoPuesto) => {
      const result = await removePuestoTeletrabajo(puesto.id);
      if (!result.ok) {
        setError(result.message);
        setStatus('');
        return;
      }
      setError('');
      setStatus(`Puesto «${puesto.puesto}» eliminado.`);
    },
    [removePuestoTeletrabajo],
  );

  const applyResolvedImport = (rows: readonly TeletrabajoPuestoImportRow[]) => {
    const count = importPuestosTeletrabajoDrafts(rows);
    setPendingImport(null);
    setError('');
    setStatus(`Importación completada: ${count} puestos procesados.`);
  };

  const handleImport = async (file: File) => {
    try {
      setError('');
      setStatus('');
      setPendingImport(null);

      if (masterPuestos.length === 0) {
        throw new Error('Antes de importar puestos teletrabajables debes importar la tabla de Traducción de puestos.');
      }

      const rows = await importTeletrabajoPuestosFromFile(file);
      const aliases = readStoredAliases();
      const mapping: Record<string, string> = {};
      const unknownByKey = new Map<string, string>();

      rows.forEach((row) => {
        const original = row.draft.puesto.trim();
        const key = normalizeTeletrabajoPuesto(original);
        if (!original || masterPuestosByKey.has(normalizeJobPosition(original))) {
          return;
        }

        const alias = aliases[key];
        if (alias && masterPuestosByKey.has(normalizeJobPosition(alias))) {
          mapping[key] = alias;
          return;
        }

        unknownByKey.set(key, original);
      });

      if (unknownByKey.size === 0) {
        applyResolvedImport(
          rows.map((row) => {
            const alias = mapping[normalizeTeletrabajoPuesto(row.draft.puesto)];
            return alias ? { ...row, draft: { ...row.draft, puesto: alias } } : row;
          }),
        );
        return;
      }

      setPendingImport({
        rows,
        unknownPuestos: Array.from(unknownByKey.values()).sort(compareTextEs),
        mapping,
      });
      setError('');
      setStatus('');
    } catch (importError) {
      setStatus('');
      setPendingImport(null);
      setError(
        importError instanceof Error
          ? importError.message
          : 'No se pudo importar el fichero de puestos.',
      );
    }
  };

  const handleGenerateSampleExcel = async () => {
    try {
      setError('');
      setStatus('');

      const openExcelWorkbook = window.traccion?.openExcelWorkbook;
      if (!openExcelWorkbook) {
        throw new Error('La generación del Excel de muestra no está disponible en este entorno.');
      }

      const { default: ExcelJS } = await import('exceljs');
      const generatedAt = new Date();
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'TrAccion';
      workbook.created = generatedAt;
      workbook.modified = generatedAt;

      const worksheet = workbook.addWorksheet('Puestos Teletrabajo', {
        views: [{ state: 'frozen', ySplit: 1 }],
      });

      worksheet.columns = [
        { header: 'Puesto Organizativo', key: 'puesto', width: 42 },
        { header: 'Presencialidad mínima', key: 'presencialidadMinima', width: 24 },
        { header: 'Dotación computable', key: 'dotacionComputable', width: 24 },
        { header: 'Grupo cobertura', key: 'grupoCobertura', width: 28 },
        { header: 'Observaciones', key: 'observaciones', width: 44 },
      ];

      worksheet.getRow(1).font = { bold: true };
      worksheet.getRow(1).alignment = { horizontal: 'center', vertical: 'middle' };

      const puestosMuestra = masterPuestos.length > 0
        ? masterPuestos.slice(0, 10)
        : ['Ejemplo puesto teletrabajable 1', 'Ejemplo puesto teletrabajable 2'];

      puestosMuestra.forEach((puesto, index) => {
        worksheet.addRow({
          puesto,
          presencialidadMinima: index === 0 ? 1 : '',
          dotacionComputable: index === 0 ? 2 : '',
          grupoCobertura: '',
          observaciones: index === 0
            ? 'Fila de ejemplo: sustituir o borrar antes de importar.'
            : '',
        });
      });

      const notesSheet = workbook.addWorksheet('Instrucciones');
      notesSheet.columns = [{ header: 'Campo', width: 28 }, { header: 'Uso', width: 82 }];
      notesSheet.addRows([
        ['Puesto Organizativo', 'Obligatorio. Debe coincidir con un puesto existente en la tabla de Traducción de puestos.'],
        ['Presencialidad mínima', 'Opcional. Número mínimo de personas que deben quedar presencialmente en ese puesto si no se usa grupo de cobertura.'],
        ['Dotación computable', 'Opcional. Número de personas computables para el cálculo del puesto. Si se deja vacío, la app guarda 0.'],
        ['Grupo cobertura', 'Opcional. Si varios puestos comparten cobertura, indica el mismo nombre de grupo en todos ellos.'],
        ['Observaciones', 'Opcional. Texto interno de apoyo para RRLL.'],
      ]);
      notesSheet.getRow(1).font = { bold: true };

      const buffer = await workbook.xlsx.writeBuffer();

      const result = await openExcelWorkbook(
        normalizeWorkbookBuffer(buffer),
        buildStableExportFilename('muestra-puestos-teletrabajo', generatedAt),
      );

      if (!result.ok) {
        throw new Error(result.message || 'No se ha podido abrir el Excel de muestra.');
      }

      setStatus('Excel de muestra generado.');
    } catch (sampleError) {
      setStatus('');
      setError(
        sampleError instanceof Error
          ? sampleError.message
          : 'No se pudo generar el Excel de muestra.',
      );
    }
  };

  const handleResolvePendingImport = () => {
    if (!pendingImport) {
      return;
    }

    const missing = pendingImport.unknownPuestos.filter((puesto) => {
      const selected = pendingImport.mapping[normalizeTeletrabajoPuesto(puesto)] ?? '';
      return !selected.trim();
    });

    if (missing.length > 0) {
      setError('Asigna un puesto válido a todos los puestos no reconocidos antes de continuar.');
      setStatus('');
      return;
    }

    const aliases = readStoredAliases();
    const resolvedRows = pendingImport.rows.map((row) => {
      const key = normalizeTeletrabajoPuesto(row.draft.puesto);
      const resolved = pendingImport.mapping[key] ?? row.draft.puesto;
      if (resolved !== row.draft.puesto && masterPuestosByKey.has(normalizeJobPosition(resolved))) {
        aliases[key] = resolved;
      }
      return { ...row, draft: { ...row.draft, puesto: resolved } };
    });

    persistStoredAliases(aliases);
    applyResolvedImport(resolvedRows);
  };

  const {
    preferences,
    setSort,
    setColumnWidth,
    setColumnOrder,
    resetColumnWidths,
    resetPreferences,
  } = useTableViewPreferences<TeletrabajoPuestoColumnId>({
    storageKey: TELETRABAJO_PUESTOS_TABLE_STORAGE_KEY,
    defaultPreferences: defaultTeletrabajoPuestoTablePreferences,
    validColumnIds: teletrabajoPuestoColumnIds,
  });

  const puestoColumns = useMemo<Array<DataTableColumn<TeletrabajoPuesto, TeletrabajoPuestoColumnId>>>(
    () => [
      {
        id: 'puesto',
        header: 'Puesto',
        accessor: (puesto) => puesto.puesto,
        render: (puesto) =>
          pendingTranslationKeys.has(normalizeJobPosition(puesto.puesto)) ? (
            <span className="text-red-300">
              {puesto.puesto} <span className="text-xs font-normal">(sin traducción)</span>
            </span>
          ) : (
            puesto.puesto
          ),
        width: 320,
        minWidth: 180,
        maxWidth: 640,
        sortable: true,
        className: 'font-semibold text-metro-text',
      },
      {
        id: 'maxSolicitudes',
        header: 'Presencialidad mínima',
        accessor: (puesto) => {
          const grupo = puesto.grupoCoberturaId ? gruposById.get(puesto.grupoCoberturaId) : null;
          return grupo ? grupo.presencialidadMinima : puesto.maxSolicitudes;
        },
        render: (puesto) => {
          const grupo = puesto.grupoCoberturaId ? gruposById.get(puesto.grupoCoberturaId) : null;
          return grupo ? `${grupo.presencialidadMinima} (grupo)` : puesto.maxSolicitudes || '—';
        },
        width: 176,
        minWidth: 140,
        maxWidth: 260,
        sortable: true,
        className: 'text-metro-muted',
      },
      {
        id: 'dotacionComputable',
        header: 'Dotación computable',
        accessor: (puesto) => puesto.dotacionComputable,
        render: (puesto) => puesto.dotacionComputable || '—',
        width: 160,
        minWidth: 120,
        maxWidth: 240,
        sortable: true,
        className: 'text-metro-muted',
      },
      {
        id: 'grupoCobertura',
        header: 'Grupo cobertura',
        accessor: (puesto) =>
          puesto.grupoCoberturaId ? gruposById.get(puesto.grupoCoberturaId)?.nombre ?? '' : '',
        render: (puesto) => (puesto.grupoCoberturaId ? gruposById.get(puesto.grupoCoberturaId)?.nombre ?? '—' : '—'),
        width: 176,
        minWidth: 140,
        maxWidth: 280,
        sortable: true,
        className: 'text-metro-muted',
      },
      {
        id: 'observaciones',
        header: 'Observaciones',
        accessor: (puesto) => puesto.observaciones,
        render: (puesto) => puesto.observaciones || '—',
        width: 220,
        minWidth: 140,
        maxWidth: 480,
        sortable: true,
        className: 'text-metro-muted',
      },
      {
        id: 'acciones',
        header: 'Acciones',
        render: (puesto) => (
          <div className="flex items-center justify-end gap-1.5">
            <button
              aria-label={`Editar ${puesto.puesto}`}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-metro-border bg-metro-surface text-metro-muted hover:border-metro-red hover:text-metro-text"
              onClick={(event) => {
                event.stopPropagation();
                handleStartEdit(puesto);
              }}
              title="Editar puesto"
              type="button"
            >
              <Pencil size={15} />
            </button>
            <button
              aria-label={`Eliminar ${puesto.puesto}`}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-metro-border bg-metro-surface text-metro-muted hover:border-metro-red hover:text-metro-red"
              onClick={(event) => {
                event.stopPropagation();
                void handleRemove(puesto);
              }}
              title="Eliminar puesto"
              type="button"
            >
              <Trash2 size={15} />
            </button>
          </div>
        ),
        width: 96,
        minWidth: 88,
        maxWidth: 120,
        isActionColumn: true,
        reorderable: false,
      },
    ],
    [gruposById, handleStartEdit, handleRemove, pendingTranslationKeys],
  );

  const sortedPuestos = useMemo(
    () => sortDataTableRows(filteredPuestos, puestoColumns, preferences.sort),
    [filteredPuestos, preferences.sort, puestoColumns],
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
      <section className="flex max-h-[88vh] w-full max-w-5xl flex-col rounded-2xl border border-metro-border bg-metro-surface shadow-card">
        <header className="flex items-start justify-between gap-3 border-b border-metro-border p-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-metro-red">
              Teletrabajo
            </p>
            <h3 className="text-xl font-bold text-metro-text">Puestos Teletrabajo</h3>
            <p className="mt-1 text-sm text-metro-muted">
              Importa o mantén los puestos organizativos teletrabajables usando Traducción de puestos como tabla maestra.
              Si varios puestos van coordinados (comparten presencialidad mínima), asígnales el mismo Grupo de cobertura.
            </p>
          </div>
          <button
            aria-label="Cerrar puestos teletrabajo"
            className="rounded-xl border border-metro-border bg-metro-panel p-2 text-metro-muted hover:border-metro-red hover:text-metro-text"
            onClick={onClose}
            type="button"
          >
            <X size={18} />
          </button>
        </header>

        <div className="grid gap-3 border-b border-metro-border p-4 lg:grid-cols-[minmax(220px,1fr)_auto] lg:items-center">
          <label className="flex items-center gap-2 rounded-xl border border-metro-border bg-metro-panel px-3 py-2 text-sm text-metro-muted">
            <Search size={16} />
            <input
              className="w-full bg-transparent text-metro-text outline-none placeholder:text-metro-muted"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar puesto..."
              type="search"
              value={search}
            />
          </label>
          <div className="flex flex-wrap justify-end gap-2">
            <input
              accept=".xlsx,.xls,.csv,.tsv,.txt"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  void handleImport(file);
                }
                event.target.value = '';
              }}
              ref={fileInputRef}
              type="file"
            />
            <button
              className="inline-flex items-center gap-2 rounded-xl border border-metro-border bg-metro-panel px-3 py-2 text-sm font-semibold text-metro-text hover:border-metro-red"
              onClick={() => setIsGruposModalOpen(true)}
              type="button"
            >
              <Users size={16} /> Grupos de cobertura
            </button>
            <button
              className="inline-flex items-center gap-2 rounded-xl border border-metro-border bg-metro-panel px-3 py-2 text-sm font-semibold text-metro-text hover:border-metro-red"
              onClick={() => void handleGenerateSampleExcel()}
              title="Generar un Excel compatible con el importador de puestos teletrabajables"
              type="button"
            >
              <Download size={16} /> Excel muestra
            </button>
            <button
              className="inline-flex items-center gap-2 rounded-xl border border-metro-border bg-metro-panel px-3 py-2 text-sm font-semibold text-metro-text hover:border-metro-red disabled:cursor-not-allowed disabled:opacity-60"
              disabled={masterPuestos.length === 0}
              onClick={() => fileInputRef.current?.click()}
              title={masterPuestos.length === 0 ? 'Importa primero la tabla de Traducción de puestos en Plantilla.' : 'Importar puestos'}
              type="button"
            >
              <FileUp size={16} /> Importar puestos
            </button>
            <button
              className="inline-flex items-center gap-2 rounded-xl bg-metro-red px-3 py-2 text-sm font-semibold text-white hover:bg-metro-dark"
              onClick={() => {
                setEditingPuestoId(null);
                setDraft(EMPTY_TELETRABAJO_PUESTO_DRAFT);
                setIsCreating((current) => !current);
              }}
              type="button"
            >
              <Plus size={16} /> Añadir puesto
            </button>
          </div>
        </div>

        {(isCreating || editingPuestoId || status || error || pendingImport) && (
          <div className="space-y-3 border-b border-metro-border p-4">
            {(isCreating || editingPuestoId) && (
              <div className="grid gap-2 rounded-xl border border-metro-border bg-metro-panel p-3 lg:grid-cols-[minmax(220px,1fr)_110px_110px_minmax(160px,0.9fr)_minmax(180px,1fr)_auto_auto] lg:items-end">
                <label className="text-xs font-semibold uppercase tracking-wide text-metro-muted">
                  Puesto
                  <input
                    className="mt-1 w-full rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-sm text-metro-text outline-none focus:border-metro-red"
                    list="teletrabajo-puestos-maestros"
                    onChange={(event) => updateDraft('puesto', event.target.value)}
                    placeholder="Escribe para buscar..."
                    type="text"
                    value={draft.puesto}
                  />
                  <datalist id="teletrabajo-puestos-maestros">
                    {masterPuestos.map((puesto) => (
                      <option key={puesto} value={puesto} />
                    ))}
                  </datalist>
                </label>
                <label className="text-xs font-semibold uppercase tracking-wide text-metro-muted">
                  Presencialidad mínima
                  <input
                    className="mt-1 w-full rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-sm text-metro-text outline-none focus:border-metro-red disabled:opacity-50"
                    disabled={Boolean(draft.grupoCoberturaId)}
                    min={0}
                    onChange={(event) => updateDraft('maxSolicitudes', Number(event.target.value))}
                    title={
                      draft.grupoCoberturaId
                        ? 'Este puesto pertenece a un grupo de cobertura: la presencialidad mínima se gestiona en el grupo.'
                        : undefined
                    }
                    type="number"
                    value={draft.maxSolicitudes}
                  />
                </label>
                <label className="text-xs font-semibold uppercase tracking-wide text-metro-muted">
                  Dotación computable
                  <input
                    className="mt-1 w-full rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-sm text-metro-text outline-none focus:border-metro-red"
                    min={0}
                    onChange={(event) => updateDraft('dotacionComputable', Number(event.target.value))}
                    type="number"
                    value={draft.dotacionComputable}
                  />
                </label>
                <label className="text-xs font-semibold uppercase tracking-wide text-metro-muted">
                  Grupo cobertura
                  <select
                    className="mt-1 w-full rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-sm text-metro-text outline-none focus:border-metro-red"
                    onChange={(event) =>
                      updateDraft('grupoCoberturaId', event.target.value === SIN_GRUPO_VALUE ? null : event.target.value)
                    }
                    value={draft.grupoCoberturaId ?? SIN_GRUPO_VALUE}
                  >
                    <option value={SIN_GRUPO_VALUE}>Sin grupo (cobertura individual)</option>
                    {visibleGruposCobertura.map((grupo) => (
                      <option key={grupo.id} value={grupo.id}>
                        {grupo.nombre} (mín. {grupo.presencialidadMinima})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs font-semibold uppercase tracking-wide text-metro-muted">
                  Observaciones
                  <input
                    className="mt-1 w-full rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-sm text-metro-text outline-none focus:border-metro-red"
                    onChange={(event) => updateDraft('observaciones', event.target.value)}
                    placeholder="Opcional"
                    type="text"
                    value={draft.observaciones}
                  />
                </label>
                <button
                  className="rounded-xl bg-metro-red px-4 py-2 text-sm font-semibold text-white hover:bg-metro-dark"
                  onClick={() => void (editingPuestoId ? handleUpdate() : handleCreate())}
                  type="button"
                >
                  {editingPuestoId ? 'Guardar cambios' : 'Guardar'}
                </button>
                {editingPuestoId && (
                  <button
                    className="rounded-xl border border-metro-border bg-metro-surface px-4 py-2 text-sm font-semibold text-metro-text hover:border-metro-red"
                    onClick={handleCancelEdit}
                    type="button"
                  >
                    Cancelar
                  </button>
                )}
              </div>
            )}
            {pendingImport && (
              <div className="rounded-xl border border-amber-400/40 bg-amber-400/10 p-3 text-sm text-amber-100">
                <div className="mb-3 flex items-start gap-2 font-semibold">
                  <AlertTriangle size={18} className="mt-0.5 shrink-0" />
                  <div>
                    Se han encontrado {pendingImport.unknownPuestos.length} puestos que no existen en Traducción de puestos.
                    Asigna cada puesto importado al Puesto correcto de la tabla maestra.
                  </div>
                </div>
                <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                  {pendingImport.unknownPuestos.map((puesto) => {
                    const key = normalizeTeletrabajoPuesto(puesto);
                    return (
                      <div key={key} className="grid gap-2 rounded-lg border border-amber-400/20 bg-metro-surface/80 p-2 lg:grid-cols-[minmax(220px,1fr)_minmax(260px,1.2fr)] lg:items-center">
                        <div>
                          <p className="text-xs uppercase tracking-wide text-amber-200/80">Puesto importado</p>
                          <p className="font-semibold text-metro-text">{puesto}</p>
                        </div>
                        <label className="text-xs font-semibold uppercase tracking-wide text-amber-200/80">
                          Puesto válido
                          <select
                            className="mt-1 w-full rounded-lg border border-metro-border bg-metro-panel px-3 py-2 text-sm text-metro-text outline-none focus:border-metro-red"
                            onChange={(event) =>
                              setPendingImport((current) => current
                                ? { ...current, mapping: { ...current.mapping, [key]: event.target.value } }
                                : current)
                            }
                            value={pendingImport.mapping[key] ?? ''}
                          >
                            <option value="">Selecciona puesto...</option>
                            {masterPuestos.map((candidate) => (
                              <option key={candidate} value={candidate}>{candidate}</option>
                            ))}
                          </select>
                        </label>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-3 flex flex-wrap justify-end gap-2">
                  <button
                    className="rounded-xl border border-metro-border bg-metro-panel px-3 py-2 text-sm font-semibold text-metro-text hover:border-metro-red"
                    onClick={() => setPendingImport(null)}
                    type="button"
                  >
                    Cancelar importación
                  </button>
                  <button
                    className="rounded-xl bg-metro-red px-3 py-2 text-sm font-semibold text-white hover:bg-metro-dark"
                    onClick={handleResolvePendingImport}
                    type="button"
                  >
                    Confirmar e importar
                  </button>
                </div>
              </div>
            )}
            {status && (
              <div className="rounded-xl border border-metro-success/30 bg-metro-success/10 px-3 py-2 text-sm font-semibold text-emerald-200">
                {status}
              </div>
            )}
            {error && (
              <div className="rounded-xl border border-metro-red/40 bg-metro-red/10 px-3 py-2 text-sm font-semibold text-red-200">
                {error}
              </div>
            )}
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="overflow-hidden rounded-xl border border-metro-border">
            <div className="flex items-center justify-between border-b border-metro-border bg-metro-panel px-3 py-2 text-sm font-semibold text-metro-text">
              <span>Puestos organizativos con posibilidad de teletrabajo</span>
              <span className="rounded-full bg-metro-red/10 px-3 py-1 text-xs font-bold text-red-200">
                {sortedPuestos.length} registros
              </span>
            </div>
            <div className="flex justify-end px-3 py-2">
              <button
                className="inline-flex items-center gap-1 rounded-lg border border-metro-border bg-metro-surface px-2.5 py-1 text-xs font-semibold text-metro-muted hover:border-metro-red hover:text-metro-text"
                onClick={resetPreferences}
                type="button"
              >
                <RotateCcw size={14} /> Restablecer vista
              </button>
            </div>
            <DataTable
              ariaLabel="Puestos teletrabajables"
              columnOrder={preferences.columnOrder}
              columnWidths={preferences.columnWidths}
              columns={puestoColumns}
              emptyMessage="No hay puestos teletrabajables para los criterios indicados."
              getRowId={(puesto) => puesto.id}
              maxHeightClassName="max-h-[46vh]"
              onColumnOrderChange={setColumnOrder}
              onColumnWidthChange={setColumnWidth}
              onResetColumnWidths={resetColumnWidths}
              onRowDoubleClick={handleStartEdit}
              onSortChange={setSort}
              rowClassName={(puesto) => {
                const isPending = pendingTranslationKeys.has(normalizeJobPosition(puesto.puesto));
                if (isPending) {
                  return 'bg-red-500/10 text-metro-text';
                }
                return puesto.id === editingPuestoId ? 'bg-metro-red/5 text-metro-text' : 'text-metro-text';
              }}
              rows={sortedPuestos}
              sort={preferences.sort}
            />
          </div>
        </div>
      </section>

      {isGruposModalOpen && (
        <TeletrabajoGruposCoberturaModal onClose={() => setIsGruposModalOpen(false)} />
      )}
    </div>
  );
}
