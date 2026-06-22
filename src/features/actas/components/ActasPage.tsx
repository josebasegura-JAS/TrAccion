import {
  CalendarClock,
  Eye,
  FileText,
  FolderOpen,
  Mail,
  Plus,
  Settings2,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useConfiguracionStore } from '../../configuracion/store/useConfiguracionStore';
import { buildFilterLabel } from '../../../shared/export/filterLabel';
import { ExportPrintButtons } from '../../../shared/print/ExportPrintButtons';
import { DataTable, type DataTableColumn } from '../../../shared/table/DataTable';
import { useTableViewPreferences } from '../../../shared/table/useTableViewPreferences';
import { ACTA_STATES, EMPTY_ACTA_DRAFT, type Acta, type ActaAlegacion, type ActaDraft } from '../domain/acta';
import { useActasStore } from '../store/useActasStore';
import { InlineSaveFeedback } from '../../../components/InlineSaveFeedback';
import { ModalDatabaseStatus } from '../../../components/ModalDatabaseStatus';
import { DeleteConfirmDialog } from '../../../components/ui/DeleteConfirmDialog';
import { relativeDate } from '../../../utils/relativeDate';
import { useAppDialog } from '../../../hooks/useAppDialog';
import { useSharedRecordLock } from '../../../services/useSharedRecordLock';
import { ActionButton } from '../../../components/ui/ActionButton';
import { Input, Select } from '../../../components/ui/Field';
import { PageHeader } from '../../../components/ui/PageHeader';
import {
  ACTAS_HELP_SECTIONS,
  type ActaColumnId,
  type ActasOutlookTemplate,
  EMPTY_ACTAS_OUTLOOK_TEMPLATE,
  actaExportColumns,
  buildDefaultActaOutlookSubject,
  createEmptyAlegacion,
  formatDate,
  formatDateTime,
  getActaYear,
  getAutomaticDeadlineForState,
  getClosedYear,
  getNextState,
  getNextStateLabel,
  getTodayIsoDate,
  isMeaningfulHtml,
  loadActasOutlookTemplate,
  matchesSearch,
  renderActaStateBadge,
  renderDeadlineBadge,
  replaceActaTemplateMarkers,
  saveActasOutlookTemplate,
  validColumnIds,
} from './actasPage.helpers';

export function ActasPage() {
  const {
    actas,
    actaTypes,
    hasLoadedHistoricalActas,
    load,
    loadHistoricalActas,
    createWithConcurrencyCheck,
    updateWithConcurrencyCheck,
    removeWithConcurrencyCheck,
    createActaType,
    toggleActaType,
    removeActaType,
  } = useActasStore();
  const taskOrigins = useConfiguracionStore((state) => state.taskOrigins);
  const loadConfiguracion = useConfiguracionStore((state) => state.load);
  const [draft, setDraft] = useState<ActaDraft>(EMPTY_ACTA_DRAFT);
  const [editingActaId, setEditingActaId] = useState<string | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState('');
  const [yearFilter, setYearFilter] = useState('');
  const [newUpdateText, setNewUpdateText] = useState('');
  const [pathStatus, setPathStatus] = useState('');
  const [pathStatusIsError, setPathStatusIsError] = useState(false);
  const [deadlineWasAutoUpdated, setDeadlineWasAutoUpdated] = useState(false);
  const [isTypeManagerOpen, setIsTypeManagerOpen] = useState(false);
  const [newActaTypeName, setNewActaTypeName] = useState('');
  const [pendingDeleteActaId, setPendingDeleteActaId] = useState<string | null>(null);
  const [openHistoryYears, setOpenHistoryYears] = useState<Record<string, boolean>>({});
  const [pendingDeleteActaTypeId, setPendingDeleteActaTypeId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState('');
  const [isOutlookTemplateOpen, setIsOutlookTemplateOpen] = useState(false);
  const [outlookTemplate, setOutlookTemplate] = useState<ActasOutlookTemplate>(
    EMPTY_ACTAS_OUTLOOK_TEMPLATE,
  );
  const [outlookTemplateStatus, setOutlookTemplateStatus] = useState('');
  const [outlookTemplateStatusIsError, setOutlookTemplateStatusIsError] = useState(false);
  const [outlookDraftStatus, setOutlookDraftStatus] = useState('');
  const [outlookDraftStatusIsError, setOutlookDraftStatusIsError] = useState(false);
  const { alert, dialogNode } = useAppDialog();
  const outlookTemplateBodyRef = useRef<HTMLDivElement | null>(null);
  const recordLock = useSharedRecordLock({
    module: 'actas',
    recordId: editingActaId ?? '__new__',
    enabled: isEditorOpen,
  });
  const isEditorReadOnly = recordLock.isReadOnly;
  const { preferences, setSort, setColumnWidth, resetColumnWidths } =
    useTableViewPreferences<ActaColumnId>({
      storageKey: 'traccion.tableView.actas.main',
      defaultPreferences: {
        sort: { columnId: 'fechaSesion', direction: 'desc' },
        columnWidths: {},
      },
      validColumnIds,
    });

  useEffect(() => {
    load();
    loadConfiguracion();
  }, [load, loadConfiguracion]);

  useEffect(() => {
    if (hasLoadedHistoricalActas) {
      return;
    }

    const needsHistoricalActas = Boolean(
      search.trim() || yearFilter || Object.values(openHistoryYears).some(Boolean),
    );
    if (needsHistoricalActas) {
      loadHistoricalActas();
    }
  }, [hasLoadedHistoricalActas, loadHistoricalActas, openHistoryYears, search, yearFilter]);

  useEffect(() => {
    setOutlookTemplate(loadActasOutlookTemplate());
  }, []);

  useEffect(() => {
    if (isOutlookTemplateOpen && outlookTemplateBodyRef.current) {
      outlookTemplateBodyRef.current.innerHTML = outlookTemplate.bodyHtml;
    }
  }, [isOutlookTemplateOpen, outlookTemplate.bodyHtml]);

  const sindicatoOptions = useMemo(
    () =>
      taskOrigins
        .filter((origin) => origin.active && !origin.deletedAt)
        .map((origin) => origin.nombre)
        .sort((first, second) => first.localeCompare(second, 'es', { sensitivity: 'base' })),
    [taskOrigins],
  );

  const selectableActaTypes = useMemo(() => {
    const activeTypes = actaTypes.filter((type) => !type.disabled);
    if (draft.tipo && !activeTypes.some((type) => type.nombre === draft.tipo)) {
      const currentType = actaTypes.find((type) => type.nombre === draft.tipo);
      return [
        ...activeTypes,
        currentType ?? {
          id: `acta-type-current-${draft.tipo}`,
          nombre: draft.tipo,
          disabled: true,
          createdAt: '',
          updatedAt: '',
        },
      ];
    }
    return activeTypes;
  }, [actaTypes, draft.tipo]);

  const actaTypeUsage = useMemo(() => {
    const usage = new Map<string, number>();
    for (const acta of actas) {
      usage.set(acta.tipo.toLowerCase(), (usage.get(acta.tipo.toLowerCase()) ?? 0) + 1);
    }
    return usage;
  }, [actas]);

  const saveNewActaType = async () => {
    const result = createActaType(newActaTypeName);
    if (!result.ok) {
      await alert(result.message ?? 'No se ha podido crear el tipo de acta.', { type: 'error' });
      return;
    }
    setNewActaTypeName('');
  };

  const deleteActaType = async (typeId: string) => {
    const result = removeActaType(typeId);
    if (!result.ok) {
      await alert(result.message ?? 'No se ha podido eliminar el tipo de acta.', { type: 'error' });
      return;
    }
    setPendingDeleteActaTypeId(null);
  };

  const deleteActa = useCallback(
    async (actaId: string) => {
      const acta = actas.find((candidate) => candidate.id === actaId);
      if (!acta) {
        await alert('El acta ya no existe. Recarga antes de continuar.', { type: 'warning' });
        setPendingDeleteActaId(null);
        return;
      }

      const result = await removeWithConcurrencyCheck(actaId, acta.updatedAt);
      if (!result.ok) {
        await alert(result.message, { type: 'error' });
        return;
      }
      setPendingDeleteActaId(null);
    },
    [actas, alert, removeWithConcurrencyCheck],
  );

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

  const openActas = useMemo(
    () => filteredActas.filter((acta) => acta.estado !== 'Cerrada'),
    [filteredActas],
  );

  const shouldMaterializeClosedActas = Boolean(search.trim() || yearFilter);
  const closedActasByYear = useMemo(() => {
    const groups = new Map<string, { count: number; rows: Acta[] }>();

    for (const acta of filteredActas) {
      if (acta.estado !== 'Cerrada') {
        continue;
      }

      const year = getClosedYear(acta);
      const current = groups.get(year) ?? { count: 0, rows: [] };
      current.count += 1;
      if (shouldMaterializeClosedActas || openHistoryYears[year]) {
        current.rows.push(acta);
      }
      groups.set(year, current);
    }

    return [...groups.entries()].sort(([first], [second]) => second.localeCompare(first));
  }, [filteredActas, openHistoryYears, shouldMaterializeClosedActas]);

  const filterLabel = buildFilterLabel([
    ['Búsqueda', search],
    ['Estado', stateFilter],
    ['Año', yearFilter],
  ]);

  const openOutlookTemplateManager = () => {
    setOutlookTemplate(loadActasOutlookTemplate());
    setOutlookTemplateStatus('');
    setOutlookTemplateStatusIsError(false);
    setIsOutlookTemplateOpen(true);
  };

  const saveOutlookTemplate = async () => {
    const nextTemplate = {
      subject: outlookTemplate.subject,
      bodyHtml: outlookTemplateBodyRef.current?.innerHTML ?? outlookTemplate.bodyHtml,
    };

    if (!isMeaningfulHtml(nextTemplate.bodyHtml)) {
      setOutlookTemplateStatus('Pega primero el cuerpo de la plantilla Outlook.');
      setOutlookTemplateStatusIsError(true);
      return;
    }

    try {
      await saveActasOutlookTemplate(nextTemplate);
      setOutlookTemplate(nextTemplate);
      setOutlookTemplateStatus('');
      setOutlookTemplateStatusIsError(false);
      setOutlookDraftStatus('Plantilla Outlook guardada correctamente.');
      setOutlookDraftStatusIsError(false);
      setIsOutlookTemplateOpen(false);
    } catch (error) {
      setOutlookTemplateStatus(
        error instanceof Error ? error.message : 'No se ha podido guardar la plantilla Outlook.',
      );
      setOutlookTemplateStatusIsError(true);
    }
  };

  const createActaOutlookDraft = useCallback(
    async (acta: Pick<Acta, 'titulo' | 'tipo' | 'fechaSesion' | 'fechaLimite'>) => {
      setOutlookDraftStatus('');
      setOutlookDraftStatusIsError(false);

      const storedTemplate = loadActasOutlookTemplate();
      const effectiveTemplate = isMeaningfulHtml(outlookTemplate.bodyHtml)
        ? outlookTemplate
        : storedTemplate;
      const subjectTemplate =
        effectiveTemplate.subject.trim() || buildDefaultActaOutlookSubject(acta);
      const subject = replaceActaTemplateMarkers(subjectTemplate, acta, 'plain').trim();
      const html = replaceActaTemplateMarkers(effectiveTemplate.bodyHtml, acta, 'html').trim();

      if (!isMeaningfulHtml(html)) {
        setOutlookDraftStatus('Configura primero el cuerpo de la plantilla Outlook de Actas.');
        setOutlookDraftStatusIsError(true);
        setIsOutlookTemplateOpen(true);
        return;
      }

      const api = window.traccion?.createOutlookDraft ?? window.rrllOutlook?.createDraft;
      if (!api) {
        setOutlookDraftStatus('Outlook no está disponible en este entorno.');
        setOutlookDraftStatusIsError(true);
        return;
      }

      try {
        const result = await api({ subject, html, to: [], cc: [] });
        setOutlookDraftStatus(
          result.message ||
            (result.ok ? 'Borrador Outlook abierto.' : 'No se ha podido abrir Outlook.'),
        );
        setOutlookDraftStatusIsError(!result.ok);
      } catch (error) {
        setOutlookDraftStatus(
          error instanceof Error ? error.message : 'No se ha podido abrir Outlook.',
        );
        setOutlookDraftStatusIsError(true);
      }
    },
    [outlookTemplate],
  );

  const createActaOutlookCalendar = useCallback(
    async (acta: Pick<Acta, 'titulo' | 'fechaLimite'>) => {
      setOutlookDraftStatus('');
      setOutlookDraftStatusIsError(false);

      if (!acta.fechaLimite) {
        setOutlookDraftStatus('El acta no tiene fecha límite para crear la cita de calendario.');
        setOutlookDraftStatusIsError(true);
        return;
      }

      const api = window.traccion?.createOutlookCalendar ?? window.rrllOutlook?.createCalendar;
      if (!api) {
        setOutlookDraftStatus('Outlook no está disponible en este entorno.');
        setOutlookDraftStatusIsError(true);
        return;
      }

      try {
        const result = await api({
          subject: `FIN ALEGACIONES ${acta.titulo}`.trim(),
          date: acta.fechaLimite,
          startTime: '09:00',
          endTime: '09:30',
          requiredAttendees: ['jasegura@metrobilbao.eus', 'acabrera@metrobilbao.eus'],
        });
        setOutlookDraftStatus(
          result.message ||
            (result.ok ? 'Cita de Outlook abierta.' : 'No se ha podido abrir la cita de Outlook.'),
        );
        setOutlookDraftStatusIsError(!result.ok);
      } catch (error) {
        setOutlookDraftStatus(
          error instanceof Error ? error.message : 'No se ha podido abrir la cita de Outlook.',
        );
        setOutlookDraftStatusIsError(true);
      }
    },
    [],
  );

  const columns = useMemo<Array<DataTableColumn<Acta, ActaColumnId>>>(
    () => [
      {
        id: 'tipo',
        header: 'Tipo',
        accessor: (acta) => acta.tipo,
        render: (acta) => acta.tipo,
        width: 120,
        sortable: true,
        resizable: true,
      },
      {
        id: 'fechaSesion',
        header: 'Fecha sesión',
        accessor: (acta) => acta.fechaSesion,
        render: (acta) => {
          if (!acta.fechaSesion) {
            return '—';
          }
          const relative = relativeDate(acta.fechaSesion);
          return (
            <span title={formatDate(acta.fechaSesion)}>
              {acta.fechaSesion}
              {relative && <span className="ml-1.5 text-xs text-metro-muted">{relative}</span>}
            </span>
          );
        },
        width: 130,
        sortable: true,
        resizable: true,
      },
      {
        id: 'fechaCreacion',
        header: 'Creación',
        accessor: (acta) => acta.fechaCreacion,
        render: (acta) => {
          if (!acta.fechaCreacion) {
            return '—';
          }
          const relative = relativeDate(acta.fechaCreacion);
          return (
            <span title={formatDate(acta.fechaCreacion)}>
              {acta.fechaCreacion}
              {relative && <span className="ml-1.5 text-xs text-metro-muted">{relative}</span>}
            </span>
          );
        },
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
        render: (acta) => renderActaStateBadge(acta.estado),
        width: 190,
        sortable: true,
        resizable: true,
      },
      {
        id: 'fechaLimite',
        header: 'Fecha límite',
        accessor: (acta) => acta.fechaLimite,
        render: (acta) => renderDeadlineBadge(acta.fechaLimite),
        width: 130,
        sortable: true,
        resizable: true,
      },
      {
        id: 'actaPath',
        header: 'Acta',
        accessor: (acta) => acta.actaPath,
        render: (acta) => (acta.actaPath ? 'Vinculada' : '—'),
        width: 110,
        sortable: true,
        resizable: true,
      },
      {
        id: 'alegaciones',
        header: 'Alegaciones',
        accessor: (acta) => acta.alegaciones.length,
        render: (acta) =>
          `${acta.alegaciones.filter((alegacion) => alegacion.presentada).length}/${acta.alegaciones.length}`,
        width: 120,
        sortable: true,
        resizable: true,
      },
      {
        id: 'acciones',
        header: 'Acciones',
        render: (acta) => (
          <div
            className="flex flex-wrap items-center gap-2"
            onClick={(event) => event.stopPropagation()}
          >
            {acta.estado === 'Pendiente de alegaciones' && (
              <button
                className="inline-flex items-center gap-1 rounded-lg border border-sky-400/50 px-2 py-1 text-xs font-bold text-sky-200 hover:bg-sky-500/10"
                onClick={() => void createActaOutlookDraft(acta)}
                title="Abrir borrador Outlook de alegaciones"
                type="button"
              >
                O
              </button>
            )}
            {pendingDeleteActaId === acta.id ? (
              <DeleteConfirmDialog
                label={`el acta «${acta.titulo}»`}
                onCancel={() => setPendingDeleteActaId(null)}
                onConfirm={() => deleteActa(acta.id)}
              />
            ) : (
              <button
                className="inline-flex items-center gap-1 rounded-lg border border-red-500/40 px-2 py-1 text-xs font-semibold text-red-200 hover:bg-red-500/10"
                onClick={() => setPendingDeleteActaId(acta.id)}
                title="Eliminar acta"
                type="button"
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>
        ),
        width: 80,
        minWidth: 70,
        isActionColumn: true,
      },
    ],
    [createActaOutlookDraft, deleteActa, pendingDeleteActaId, setPendingDeleteActaId],
  );

  const openEditor = (acta?: Acta) => {
    if (acta) {
      setDraft({
        titulo: acta.titulo,
        tipo: acta.tipo,
        fechaSesion: acta.fechaSesion,
        estado: acta.estado,
        fechaLimite: acta.fechaLimite,
        observaciones: acta.observaciones,
        alegaciones: acta.alegaciones,
        actualizaciones: acta.actualizaciones,
        actaPath: acta.actaPath,
      });
      setEditingActaId(acta.id);
    } else {
      setDraft(EMPTY_ACTA_DRAFT);
      setEditingActaId(null);
    }
    setNewUpdateText('');
    setPathStatus('');
    setPathStatusIsError(false);
    setDeadlineWasAutoUpdated(false);
    setIsEditorOpen(true);
  };

  const updateDraft = <K extends keyof ActaDraft>(key: K, value: ActaDraft[K]) => {
    if (isEditorReadOnly) {
      return;
    }
    if (key === 'fechaLimite') {
      setDeadlineWasAutoUpdated(false);
    }
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const updateAlegacion = <K extends keyof ActaAlegacion>(
    index: number,
    key: K,
    value: ActaAlegacion[K],
  ) => {
    if (isEditorReadOnly) {
      return;
    }
    setDraft((current) => ({
      ...current,
      alegaciones: current.alegaciones.map((alegacion, currentIndex) =>
        currentIndex === index ? { ...alegacion, [key]: value } : alegacion,
      ),
    }));
  };

  const addDraftUpdate = () => {
    if (isEditorReadOnly) {
      return;
    }
    const trimmedText = newUpdateText.trim();
    if (!trimmedText) {
      return;
    }

    setDraft((current) => ({
      ...current,
      actualizaciones: [
        {
          id: `acta-update-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
          fecha: new Date().toISOString(),
          texto: trimmedText,
        },
        ...current.actualizaciones,
      ],
    }));
    setNewUpdateText('');
  };

  const saveActa = async () => {
    if (isEditorReadOnly) {
      return;
    }
    if (!draft.titulo.trim() || !draft.fechaSesion) {
      await alert('Indica título y fecha de sesión.', { type: 'warning' });
      return;
    }

    const expectedUpdatedAt = editingActaId
      ? (actas.find((acta) => acta.id === editingActaId)?.updatedAt ?? null)
      : null;

    void (async () => {
      setSaveError('');
      const result = editingActaId
        ? await updateWithConcurrencyCheck(editingActaId, draft, expectedUpdatedAt)
        : await createWithConcurrencyCheck(draft);

      if (!result.ok) {
        setSaveError(result.message);
        return;
      }

      setIsEditorOpen(false);
      setEditingActaId(null);
      setDraft(EMPTY_ACTA_DRAFT);
    })();
  };

  const applyStateChange = (nextState: ActaDraft['estado']) => {
    if (isEditorReadOnly) {
      return;
    }
    const automaticDeadline = getAutomaticDeadlineForState(nextState);
    setDraft((current) => ({
      ...current,
      estado: nextState,
      fechaLimite: automaticDeadline ?? current.fechaLimite,
    }));
    setDeadlineWasAutoUpdated(Boolean(automaticDeadline));
  };

  const advanceState = () => {
    const nextState = getNextState(draft.estado);
    if (!nextState) {
      return;
    }

    applyStateChange(nextState);
  };

  const selectActaPath = async () => {
    const selector = window.traccion?.selectTaskDocument;
    if (!selector) {
      setPathStatus('Selector de documentos no disponible. Pega la ruta manualmente.');
      setPathStatusIsError(true);
      return;
    }

    try {
      const selectedPaths = await selector();
      if (!selectedPaths?.length) {
        return;
      }

      updateDraft('actaPath', selectedPaths[0]);
      setPathStatus('Ruta de acta vinculada.');
      setPathStatusIsError(false);
    } catch (error) {
      setPathStatus(
        error instanceof Error ? error.message : 'No se ha podido seleccionar el acta.',
      );
      setPathStatusIsError(true);
    }
  };

  const openActaPath = async () => {
    const trimmedPath = draft.actaPath.trim();
    if (!trimmedPath) {
      setPathStatus('No hay ruta de acta vinculada.');
      setPathStatusIsError(true);
      return;
    }

    const opener = window.traccion?.openTaskDocument;
    if (!opener) {
      setPathStatus('Previsualización no disponible en este entorno.');
      setPathStatusIsError(true);
      return;
    }

    try {
      const result = await opener(trimmedPath);
      setPathStatus(
        result.message || (result.ok ? 'Acta abierta.' : 'No se ha podido abrir el acta.'),
      );
      setPathStatusIsError(!result.ok);
    } catch (error) {
      setPathStatus(error instanceof Error ? error.message : 'No se ha podido abrir el acta.');
      setPathStatusIsError(true);
    }
  };

  const editingActa = editingActaId ? actas.find((acta) => acta.id === editingActaId) : null;
  const displayedCreationDate = editingActa?.fechaCreacion ?? getTodayIsoDate();
  const canAttachFinalActa = draft.estado === 'Pendiente de firma' || draft.estado === 'Cerrada';
  const canCreateOutlookDraftFromEditor = draft.estado === 'Pendiente de alegaciones';

  return (
    <section
      className="space-y-4 rounded-2xl border border-metro-border bg-metro-surface p-4 shadow-card"
      id="actas"
    >
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <FileText size={24} /> Actas
          </span>
        }
        helpTitle="Actas"
        subtitle="Registro de actas de Comité y Comisión Paritaria con seguimiento, alegaciones, firma e histórico."
        helpSections={ACTAS_HELP_SECTIONS}
        helpSubtitle="Guía rápida del ciclo de actas, estados, alegaciones e histórico."
        actions={
          <>
            <ActionButton
              variant="secondary"
              iconOnly={false}
              onClick={() => setIsTypeManagerOpen(true)}
              title="Gestionar tipos de acta"
            >
              <Settings2 size={16} />
              Nuevo tipo
            </ActionButton>
            <ActionButton
              variant="secondary"
              iconOnly={false}
              onClick={openOutlookTemplateManager}
              title="Configurar plantilla Outlook de Actas"
            >
              <Mail size={16} />
              Outlook
            </ActionButton>
            <ExportPrintButtons
              payload={{
                title: 'Actas',
                filename: 'actas',
                columns: actaExportColumns,
                rows: filteredActas,
                filterLabel,
              }}
            />
            <ActionButton variant="add" onClick={() => openEditor()} title="Nueva acta" />
          </>
        }
      />

      <div className="grid gap-2 xl:grid-cols-[minmax(220px,1fr)_220px_160px]">
        <Input
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar por título, estado, actualización, alegación o ruta..."
          value={search}
        />
        <Select
          onChange={(event) => setStateFilter(event.target.value)}
          value={stateFilter}
        >
          <option value="">Todos los estados</option>
          {ACTA_STATES.map((state) => (
            <option key={state} value={state}>
              {state}
            </option>
          ))}
        </Select>
        <Select
          onChange={(event) => setYearFilter(event.target.value)}
          value={yearFilter}
        >
          <option value="">Todos los años</option>
          {years.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </Select>
      </div>

      {outlookDraftStatus && (
        <p
          className={`rounded-lg border px-3 py-2 text-xs font-semibold ${outlookDraftStatusIsError ? 'border-red-500/40 bg-red-500/10 text-red-200' : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'}`}
        >
          {outlookDraftStatus}
        </p>
      )}

      <div className="rounded-xl border border-metro-border bg-metro-panel/40 p-3">
        <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-metro-muted">
          Actas abiertas
        </h3>
        <DataTable
          ariaLabel="Actas abiertas"
          columnWidths={preferences.columnWidths}
          onResetColumnWidths={resetColumnWidths}
          columns={columns}
          emptyMessage="No hay actas abiertas con los filtros actuales."
          getRowId={(acta) => acta.id}
          onColumnWidthChange={setColumnWidth}
          onRowClick={openEditor}
          onSortChange={setSort}
          rows={openActas}
          sort={preferences.sort}
        />
      </div>

      <div className="space-y-3 rounded-xl border border-metro-border bg-metro-panel/40 p-3">
        <h3 className="text-sm font-bold uppercase tracking-wide text-metro-muted">
          Histórico de actas
        </h3>
        {!hasLoadedHistoricalActas && !search.trim() && !yearFilter && (
          <p className="rounded-lg border border-dashed border-metro-border px-3 py-4 text-sm text-metro-muted">
            El histórico se cargará al buscar, filtrar por año o abrir un ejercicio.
          </p>
        )}
        {closedActasByYear.length === 0 && hasLoadedHistoricalActas && (
          <p className="rounded-lg border border-dashed border-metro-border px-3 py-4 text-sm text-metro-muted">
            No hay actas cerradas con los filtros actuales.
          </p>
        )}
        {closedActasByYear.map(([year, group]) => {
          const isYearOpen = Boolean(search || yearFilter || openHistoryYears[year]);
          const rows = isYearOpen ? group.rows : [];

          return (
            <details
              className="rounded-xl border border-metro-border bg-metro-surface p-3"
              key={year}
              onToggle={(event) => {
                if (search || yearFilter) {
                  return;
                }
                setOpenHistoryYears((current) => ({
                  ...current,
                  [year]: event.currentTarget.open,
                }));
              }}
              open={isYearOpen}
            >
              <summary className="cursor-pointer text-sm font-bold text-metro-text">
                {year} · {group.count} acta{group.count === 1 ? '' : 's'}
              </summary>
              {isYearOpen && (
                <div className="mt-3">
                  <DataTable
                    ariaLabel={`Actas históricas ${year}`}
                    columnWidths={preferences.columnWidths}
                    onResetColumnWidths={resetColumnWidths}
                    columns={columns}
                    emptyMessage="No hay actas cerradas."
                    getRowId={(acta) => acta.id}
                    onColumnWidthChange={setColumnWidth}
                    onRowClick={openEditor}
                    onSortChange={setSort}
                    rows={rows}
                    sort={preferences.sort}
                  />
                </div>
              )}
            </details>
          );
        })}
      </div>

      {isOutlookTemplateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
          <div className="flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-metro-border bg-metro-surface shadow-2xl">
            <div className="flex items-center justify-between border-b border-metro-border px-4 py-3">
              <div>
                <h3 className="text-lg font-bold text-metro-text">Plantilla Outlook Actas</h3>
                <p className="text-xs text-metro-muted">
                  Pega el cuerpo desde Outlook. No se configuran destinatarios: Para y CC quedarán
                  vacíos.
                </p>
              </div>
              <button
                className="rounded-lg border border-metro-border p-2 text-metro-muted hover:border-metro-red hover:text-metro-text"
                onClick={() => setIsOutlookTemplateOpen(false)}
                title="Cerrar"
                type="button"
              >
                <X size={16} />
              </button>
            </div>

            {outlookTemplateStatus && (
              <p
                className={`mx-4 mt-3 rounded-lg border px-3 py-2 text-xs font-semibold ${outlookTemplateStatusIsError ? 'border-red-500/40 bg-red-500/10 text-red-200' : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'}`}
              >
                {outlookTemplateStatus}
              </p>
            )}

            <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
              <label className="block text-xs font-semibold uppercase tracking-wide text-metro-muted">
                Asunto plantilla
                <input
                  className="mt-1 w-full rounded-lg border border-metro-border bg-metro-panel px-3 py-2 text-sm font-normal normal-case tracking-normal text-metro-text outline-none focus:border-metro-red"
                  onChange={(event) =>
                    setOutlookTemplate((current) => ({ ...current, subject: event.target.value }))
                  }
                  placeholder="Akta ZIRRIBORROA BORRADOR Acta [Título Acta]"
                  value={outlookTemplate.subject}
                />
              </label>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-metro-muted">
                  Cuerpo plantilla
                </p>
                <div
                  className="mt-1 min-h-[320px] rounded-lg border border-metro-border bg-white px-4 py-3 text-sm text-slate-950 outline-none focus:border-metro-red"
                  contentEditable
                  ref={outlookTemplateBodyRef}
                  role="textbox"
                  suppressContentEditableWarning
                />
              </div>

              <div className="rounded-xl border border-metro-border bg-metro-panel px-3 py-3 text-xs text-metro-muted">
                <p className="font-semibold text-metro-text">Marcadores disponibles</p>
                <p className="mt-2 break-words">
                  [Título Acta] · [Tipo Acta] · [Fecha Acta formato DD/MM/AAAA] · [Fecha Límite
                  formato AAAA/MM/DD] · [Fecha Límite formato DD/MM/AAAA]
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-metro-border px-4 py-3">
              <button
                className="rounded-xl border border-metro-border px-3 py-2 text-sm font-semibold text-metro-muted hover:border-metro-red hover:text-metro-text"
                onClick={() => setIsOutlookTemplateOpen(false)}
                type="button"
              >
                Cancelar
              </button>
              <button
                className="rounded-xl bg-metro-red px-3 py-2 text-sm font-semibold text-white hover:bg-metro-dark"
                onClick={saveOutlookTemplate}
                type="button"
              >
                Guardar plantilla
              </button>
            </div>
          </div>
        </div>
      )}

      {isTypeManagerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
          <div className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-metro-border bg-metro-surface shadow-2xl">
            <div className="flex items-center justify-between border-b border-metro-border px-4 py-3">
              <div>
                <h3 className="text-lg font-bold text-metro-text">Tipos de acta</h3>
                <p className="text-xs text-metro-muted">
                  Alta, deshabilitado y borrado seguro de tipos sin actas asociadas.
                </p>
              </div>
              <button
                className="rounded-lg border border-metro-border p-2 text-metro-muted hover:border-metro-red hover:text-metro-text"
                onClick={() => setIsTypeManagerOpen(false)}
                title="Cerrar"
                type="button"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
              <div className="grid gap-2 xl:grid-cols-[minmax(220px,1fr)_120px]">
                <input
                  className="rounded-lg border border-metro-border bg-metro-panel px-3 py-2 text-sm text-metro-text outline-none focus:border-metro-red"
                  onChange={(event) => setNewActaTypeName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      void saveNewActaType();
                    }
                  }}
                  placeholder="Nuevo tipo de acta..."
                  value={newActaTypeName}
                />
                <button
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-metro-red px-3 py-2 text-sm font-semibold text-white hover:bg-metro-dark"
                  onClick={() => void saveNewActaType()}
                  type="button"
                >
                  <Plus size={16} />
                  Alta
                </button>
              </div>

              <div className="space-y-2">
                {actaTypes.map((type) => {
                  const usageCount = actaTypeUsage.get(type.nombre.toLowerCase()) ?? 0;
                  return (
                    <div
                      className="grid gap-2 rounded-xl border border-metro-border bg-metro-panel p-3 xl:grid-cols-[minmax(180px,1fr)_90px_130px_44px] xl:items-center"
                      key={type.id}
                    >
                      <div>
                        <p className="text-sm font-semibold text-metro-text">{type.nombre}</p>
                        <p className="text-xs text-metro-muted">
                          {type.disabled ? 'Deshabilitado' : 'Activo'}
                        </p>
                      </div>
                      <span className="text-xs font-semibold text-metro-muted">
                        {usageCount} acta{usageCount === 1 ? '' : 's'}
                      </span>
                      <button
                        className="rounded-lg border border-metro-border px-3 py-2 text-xs font-semibold text-metro-muted hover:border-metro-red hover:text-metro-text"
                        onClick={() => toggleActaType(type.id)}
                        type="button"
                      >
                        {type.disabled ? 'Habilitar' : 'Deshabilitar'}
                      </button>
                      {pendingDeleteActaTypeId === type.id ? (
                        <div className="xl:col-span-4">
                          <DeleteConfirmDialog
                            label={`el tipo de acta «${type.nombre}»`}
                            onCancel={() => setPendingDeleteActaTypeId(null)}
                            onConfirm={() => {
                              void deleteActaType(type.id);
                            }}
                          />
                        </div>
                      ) : (
                        <button
                          className="inline-flex items-center justify-center rounded-lg border border-red-500/40 p-2 text-red-200 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-40"
                          disabled={usageCount > 0}
                          onClick={() => setPendingDeleteActaTypeId(type.id)}
                          title={
                            usageCount > 0
                              ? 'No se puede eliminar: tiene actas asociadas'
                              : 'Eliminar tipo de acta'
                          }
                          type="button"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  );
                })}
                {actaTypes.length === 0 && (
                  <p className="rounded-lg border border-dashed border-metro-border px-3 py-4 text-sm text-metro-muted">
                    No hay tipos de acta configurados.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {isEditorOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
          <div
            aria-labelledby="actas-editor-title"
            aria-modal="true"
            className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-metro-border bg-metro-surface shadow-2xl"
            role="dialog"
          >
            <div className="flex items-center justify-between gap-3 border-b border-metro-border px-4 py-3">
              <div className="min-w-0">
                <h3 className="text-lg font-bold text-metro-text" id="actas-editor-title">
                  {editingActaId ? 'Editar acta' : 'Nueva acta'}
                </h3>
                <p className="text-xs text-metro-muted">Estado actual: {draft.estado}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <ModalDatabaseStatus />
              <button
                className="rounded-lg border border-metro-border p-2 text-metro-muted hover:border-metro-red hover:text-metro-text"
                onClick={() => setIsEditorOpen(false)}
                title="Cerrar"
                type="button"
              >
                <X size={16} />
              </button>
              </div>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
              {recordLock.status === 'locked' && recordLock.lockedBy && (
                <div className="rounded-xl border border-yellow-400/40 bg-yellow-500/10 px-4 py-3 text-sm font-semibold text-yellow-100">
                  📖 Modo consulta — editando: {recordLock.lockedBy.ownerName}@
                  {recordLock.lockedBy.machineName}
                </div>
              )}
              <div className="grid gap-2 xl:grid-cols-[150px_150px_170px_190px_minmax(220px,1fr)]">
                <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-metro-muted">
                  Tipo
                  <select
                    className="rounded-lg border border-metro-border bg-metro-panel px-3 py-2 text-sm font-normal normal-case tracking-normal text-metro-text outline-none focus:border-metro-red"
                    onChange={(event) => updateDraft('tipo', event.target.value)}
                    value={draft.tipo}
                  >
                    {selectableActaTypes.map((type) => (
                      <option key={type.id} value={type.nombre}>
                        {type.nombre}
                        {type.disabled ? ' (deshabilitado)' : ''}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-metro-muted">
                  Fecha sesión
                  <input
                    className="rounded-lg border border-metro-border bg-metro-panel px-3 py-2 text-sm font-normal normal-case tracking-normal text-metro-text outline-none focus:border-metro-red"
                    onChange={(event) => updateDraft('fechaSesion', event.target.value)}
                    type="date"
                    value={draft.fechaSesion}
                  />
                </label>
                <div className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-metro-muted">
                  Fecha creación
                  <div className="rounded-lg border border-metro-border bg-metro-panel px-3 py-2 text-sm font-normal normal-case tracking-normal text-metro-text">
                    {formatDate(displayedCreationDate)}
                  </div>
                </div>
                <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-metro-muted">
                  Fecha límite
                  <span className="relative block">
                    <input
                      className="w-full rounded-lg border border-metro-border bg-metro-panel px-3 py-2 pr-9 text-sm font-normal normal-case tracking-normal text-metro-text outline-none focus:border-metro-red"
                      onChange={(event) => updateDraft('fechaLimite', event.target.value)}
                      title="Fecha límite"
                      type="date"
                      value={draft.fechaLimite}
                    />
                    {deadlineWasAutoUpdated && (
                      <CalendarClock
                        aria-label="Fecha límite recalculada automáticamente"
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-metro-red"
                        size={16}
                      />
                    )}
                  </span>
                </label>
                <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-metro-muted">
                  Título
                  <input
                    className="rounded-lg border border-metro-border bg-metro-panel px-3 py-2 text-sm font-normal normal-case tracking-normal text-metro-text outline-none focus:border-metro-red"
                    onChange={(event) => updateDraft('titulo', event.target.value)}
                    placeholder="Título"
                    value={draft.titulo}
                  />
                </label>
              </div>

              <div className="grid gap-2 xl:grid-cols-[260px_minmax(220px,1fr)]">
                <select
                  className="rounded-lg border border-metro-border bg-metro-panel px-3 py-2 text-sm text-metro-text outline-none focus:border-metro-red"
                  onChange={(event) => applyStateChange(event.target.value as ActaDraft['estado'])}
                  value={draft.estado}
                >
                  {ACTA_STATES.map((state) => (
                    <option key={state} value={state}>
                      {state}
                    </option>
                  ))}
                </select>
                <button
                  className="rounded-lg border border-metro-border px-3 py-2 text-sm font-semibold text-metro-muted hover:border-metro-red hover:text-metro-text disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={!getNextState(draft.estado)}
                  onClick={advanceState}
                  type="button"
                >
                  {getNextStateLabel(draft.estado)}
                </button>
              </div>

              <textarea
                className="min-h-[120px] w-full rounded-lg border border-metro-border bg-metro-panel px-3 py-2 text-sm text-metro-text outline-none focus:border-metro-red"
                onChange={(event) => updateDraft('observaciones', event.target.value)}
                placeholder="Observaciones"
                value={draft.observaciones}
              />

              <div className="rounded-xl border border-metro-border bg-metro-panel p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-sm font-bold uppercase tracking-wide text-metro-muted">
                    Actualizaciones
                  </h4>
                  <span className="text-xs text-metro-muted">
                    {draft.actualizaciones.length} registro(s)
                  </span>
                </div>
                <div className="mt-3 grid gap-2 xl:grid-cols-[minmax(220px,1fr)_140px]">
                  <input
                    className="rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-sm text-metro-text outline-none focus:border-metro-red"
                    onChange={(event) => setNewUpdateText(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        addDraftUpdate();
                      }
                    }}
                    placeholder="Nueva actualización..."
                    value={newUpdateText}
                  />
                  <button
                    className="rounded-lg border border-metro-border px-3 py-2 text-sm font-semibold text-metro-muted hover:border-metro-red hover:text-metro-text"
                    onClick={addDraftUpdate}
                    type="button"
                  >
                    Añadir
                  </button>
                </div>
                <div className="mt-3 max-h-36 space-y-2 overflow-y-auto pr-1">
                  {draft.actualizaciones.length === 0 && (
                    <p className="text-sm text-metro-muted">Sin actualizaciones.</p>
                  )}
                  {draft.actualizaciones.map((entry) => (
                    <div
                      className="rounded-lg border border-metro-border bg-metro-surface px-3 py-2"
                      key={entry.id}
                    >
                      <p className="text-xs font-semibold text-metro-muted">
                        {formatDateTime(entry.fecha)}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-metro-text">
                        {entry.texto}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-metro-border bg-metro-panel p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-sm font-bold uppercase tracking-wide text-metro-muted">
                    Alegaciones
                  </h4>
                  <button
                    className="rounded-lg border border-metro-border px-3 py-1.5 text-xs font-semibold text-metro-muted hover:border-metro-red hover:text-metro-text"
                    onClick={() =>
                      updateDraft('alegaciones', [...draft.alegaciones, createEmptyAlegacion()])
                    }
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
                    <div
                      className="grid gap-2 rounded-lg border border-metro-border bg-metro-surface p-2 xl:grid-cols-[180px_110px_150px_minmax(220px,1fr)_80px]"
                      key={`${alegacion.sindicato}-${index}`}
                    >
                      <input
                        className="rounded-lg border border-metro-border bg-metro-panel px-2 py-1.5 text-sm text-metro-text outline-none focus:border-metro-red"
                        list="actas-sindicatos"
                        onChange={(event) =>
                          updateAlegacion(index, 'sindicato', event.target.value)
                        }
                        placeholder="Sindicato"
                        value={alegacion.sindicato}
                      />
                      <label className="flex items-center gap-2 text-sm text-metro-muted">
                        <input
                          checked={alegacion.presentada}
                          onChange={(event) =>
                            updateAlegacion(index, 'presentada', event.target.checked)
                          }
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
                        onChange={(event) =>
                          updateAlegacion(index, 'observacion', event.target.value)
                        }
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

              <div className="rounded-xl border border-metro-border bg-metro-panel p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h4 className="text-sm font-bold uppercase tracking-wide text-metro-muted">
                      Acta firmada
                    </h4>
                    <p className="text-xs text-metro-muted">
                      Se habilita en estado Pendiente de firma para vincular la ruta de red del
                      acta.
                    </p>
                  </div>
                  {!canAttachFinalActa && (
                    <span className="rounded-full border border-metro-border px-2 py-1 text-xs text-metro-muted">
                      Disponible al pasar a firma
                    </span>
                  )}
                </div>
                <div className="mt-3 grid gap-2 xl:grid-cols-[minmax(220px,1fr)_120px_120px]">
                  <input
                    className="rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-sm text-metro-text outline-none focus:border-metro-red disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={!canAttachFinalActa}
                    onChange={(event) => updateDraft('actaPath', event.target.value)}
                    placeholder="Ruta de red del acta firmada..."
                    value={draft.actaPath}
                  />
                  <button
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-metro-border px-3 py-2 text-sm font-semibold text-metro-muted hover:border-metro-red hover:text-metro-text disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={!canAttachFinalActa}
                    onClick={selectActaPath}
                    type="button"
                  >
                    <FolderOpen size={15} /> Ruta
                  </button>
                  <button
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-metro-border px-3 py-2 text-sm font-semibold text-metro-muted hover:border-metro-red hover:text-metro-text disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={!canAttachFinalActa || !draft.actaPath.trim()}
                    onClick={openActaPath}
                    type="button"
                  >
                    <Eye size={15} /> Ver
                  </button>
                </div>
                {pathStatus && (
                  <p
                    className={`mt-2 text-xs ${pathStatusIsError ? 'text-red-200' : 'text-metro-muted'}`}
                  >
                    {pathStatus}
                  </p>
                )}
              </div>
            </div>

            {outlookDraftStatus && (
              <p
                className={`mx-4 rounded-lg border px-3 py-2 text-xs font-semibold ${outlookDraftStatusIsError ? 'border-red-500/40 bg-red-500/10 text-red-200' : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'}`}
              >
                {outlookDraftStatus}
              </p>
            )}

            {saveError && (
              <p className="mx-4 rounded-lg border border-metro-red/40 bg-metro-red/10 px-3 py-2 text-xs font-semibold text-metro-red">
                {saveError}
              </p>
            )}
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-metro-border px-4 py-3">
              <button
                className="rounded-xl border border-metro-border px-3 py-2 text-sm font-semibold text-metro-muted hover:border-metro-red hover:text-metro-text"
                onClick={() => setIsEditorOpen(false)}
                type="button"
              >
                Cancelar
              </button>
              {canAttachFinalActa && draft.estado !== 'Cerrada' && (
                <button
                  className="rounded-xl border border-metro-border px-3 py-2 text-sm font-semibold text-metro-muted hover:border-metro-red hover:text-metro-text"
                  onClick={() => applyStateChange('Cerrada')}
                  type="button"
                >
                  Cerrar acta
                </button>
              )}
              {canCreateOutlookDraftFromEditor && (
                <button
                  className="inline-flex items-center gap-2 rounded-xl border border-sky-400/60 bg-sky-500/10 px-3 py-2 text-sm font-bold text-sky-200 hover:bg-sky-500/20"
                  onClick={() => void createActaOutlookDraft(draft)}
                  title="Abrir borrador Outlook de alegaciones"
                  type="button"
                >
                  O Outlook
                </button>
              )}
              {canCreateOutlookDraftFromEditor && (
                <button
                  className="inline-flex items-center gap-2 rounded-xl border border-blue-400/60 bg-blue-500/10 px-3 py-2 text-sm font-bold text-blue-200 hover:bg-blue-500/20"
                  onClick={() => void createActaOutlookCalendar(draft)}
                  title="Abrir cita Outlook para fin de alegaciones"
                  type="button"
                >
                  <CalendarClock className="h-4 w-4" />
                  Calendario
                </button>
              )}
              <button
                className="rounded-xl bg-metro-red px-3 py-2 text-sm font-semibold text-white hover:bg-metro-dark"
                disabled={isEditorReadOnly}
                onClick={() => void saveActa()}
                type="button"
              >
                Guardar acta
              </button>
              <InlineSaveFeedback />
            </div>
          </div>
        </div>
      )}
      {dialogNode}
    </section>
  );
}
