import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useConfiguracionStore } from '../../configuracion/store/useConfiguracionStore';
import { buildFilterLabel } from '../../../shared/export/filterLabel';
import type { DataTableColumn } from '../../../shared/table/DataTable';
import { useTableViewPreferences } from '../../../shared/table/useTableViewPreferences';
import {
  EMPTY_ACTA_DRAFT,
  type Acta,
  type ActaAlegacion,
  type ActaDraft,
} from '../domain/acta';
import { useActasStore } from '../store/useActasStore';
import { relativeDate } from '../../../utils/relativeDate';
import { useAppDialog } from '../../../hooks/useAppDialog';
import { useUnsavedChanges } from '../../../hooks/useUnsavedChanges';
import { buildRecoverableDraftKey, useRecoverableDraft } from '../../../hooks/useRecoverableDraft';
import { useSharedRecordLock } from '../../../services/useSharedRecordLock';
import { ActionButton } from '../../../components/ui/ActionButton';
import { PageHeader } from '../../../components/ui/PageHeader';
import { ActasOutlookTemplateModal } from './ActasOutlookTemplateModal';
import { ActaTypeManagerModal } from './ActaTypeManagerModal';
import { ActaEditorModal } from './ActaEditorModal';
import { ActasWorkflow } from './ActasWorkflow';
import { ActasOperationalView } from './ActasOperationalView';
import {
  ACTAS_HELP_SECTIONS,
  type ActaColumnId,
  type ActasOutlookTemplate,
  EMPTY_ACTAS_OUTLOOK_TEMPLATE,
  buildBorradorActaOutlookHtml,
  buildBorradorActaOutlookSubject,
  buildDefaultActaOutlookSubject,
  buildFirmaActaOutlookHtml,
  buildFirmaActaOutlookSubject,
  formatDate,
  getActaYear,
  getAutomaticDeadlineForState,
  getClosedYear,
  getNextState,
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
  const [isWorkflowHome, setIsWorkflowHome] = useState(true);
  const { alert, confirm, dialogNode } = useAppDialog();
  const outlookTemplateBodyRef = useRef<HTMLDivElement | null>(null);
  const recordLock = useSharedRecordLock({
    module: 'actas',
    recordId: editingActaId ?? '__new__',
    enabled: isEditorOpen,
  });
  const editingActa = editingActaId ? actas.find((acta) => acta.id === editingActaId) : null;
  const isClosedActa = editingActa?.estado === 'Cerrada';
  const isEditorReadOnly = recordLock.isReadOnly || isClosedActa;
  const initialEditorDraft = useMemo<ActaDraft>(() => {
    if (!editingActa) return EMPTY_ACTA_DRAFT;
    return {
      titulo: editingActa.titulo,
      tipo: editingActa.tipo,
      fechaSesion: editingActa.fechaSesion,
      estado: editingActa.estado,
      fechaLimite: editingActa.fechaLimite,
      observaciones: editingActa.observaciones,
      alegaciones: editingActa.alegaciones,
      actualizaciones: editingActa.actualizaciones,
      actaPath: editingActa.actaPath,
    };
  }, [editingActa]);
  const recoveryKey = buildRecoverableDraftKey('actas', editingActaId ?? '__new__');
  const { clearDraft: clearRecoveryDraft, dialogNode: recoveryDialogNode } = useRecoverableDraft({
    currentValue: draft,
    initialValue: initialEditorDraft,
    enabled: isEditorOpen && !isEditorReadOnly,
    onRecover: setDraft,
    storageKey: recoveryKey,
  });
  const { requestClose: requestEditorClose, dialogNode: unsavedDialogNode } = useUnsavedChanges({
    currentValue: draft,
    initialValue: initialEditorDraft,
    enabled: isEditorOpen && !isEditorReadOnly,
    onDiscard: () => {
      clearRecoveryDraft();
      setIsEditorOpen(false);
    },
  });
  const { preferences, setSort, setColumnWidth, setColumnOrder, resetColumnWidths } =
    useTableViewPreferences<ActaColumnId>({
      storageKey: 'traccion.tableView.actas.main',
      defaultPreferences: {
        sort: { columnId: 'fechaSesion', direction: 'desc' },
        columnWidths: {},
        columnOrder: null,
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
          deletedAt: null,
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
    const result = await createActaType(newActaTypeName);
    if (!result.ok) {
      await alert(result.message ?? 'No se ha podido crear el tipo de acta.', { type: 'error' });
      return;
    }
    setNewActaTypeName('');
  };

  const deleteActaType = async (typeId: string) => {
    const result = await removeActaType(typeId);
    if (!result.ok) {
      await alert(result.message ?? 'No se ha podido eliminar el tipo de acta.', { type: 'error' });
      return;
    }
    setPendingDeleteActaTypeId(null);
  };

  const toggleActaTypeWithFeedback = async (typeId: string) => {
    const result = await toggleActaType(typeId);
    if (!result.ok) {
      await alert(result.message ?? 'No se ha podido actualizar el tipo de acta.', {
        type: 'error',
      });
    }
  };

  const deleteActa = useCallback(
    async (actaId: string) => {
      const acta = actas.find((candidate) => candidate.id === actaId);
      if (!acta) {
        await alert('El acta ya no existe. Recarga antes de continuar.', { type: 'warning' });
        return;
      }

      const confirmed = await confirm(`¿Eliminar el acta «${acta.titulo}»?`, {
        confirmLabel: 'Eliminar',
        danger: true,
        title: 'Eliminar acta',
      });
      if (!confirmed) {
        return;
      }

      const result = await removeWithConcurrencyCheck(actaId, acta.updatedAt);
      if (!result.ok) {
        await alert(result.message, { type: 'error' });
      }
    },
    [actas, alert, confirm, removeWithConcurrencyCheck],
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

  const createActaBorradorOutlookDraft = useCallback(
    async (acta: ActaDraft, actaId: string) => {
      setOutlookDraftStatus('');
      setOutlookDraftStatusIsError(false);

      const api = window.traccion?.createOutlookDraft ?? window.rrllOutlook?.createDraft;
      if (!api) {
        setOutlookDraftStatus('Outlook no está disponible en este entorno.');
        setOutlookDraftStatusIsError(true);
        return;
      }

      try {
        const result = await api({
          subject: buildBorradorActaOutlookSubject(acta),
          html: buildBorradorActaOutlookHtml(acta),
          to: [],
          cc: [],
        });

        if (!result.ok) {
          setOutlookDraftStatus(result.message || 'No se ha podido abrir Outlook.');
          setOutlookDraftStatusIsError(true);
          return;
        }

        const fechaLimite = getAutomaticDeadlineForState('Pendiente de alegaciones') ?? '';
        const nextDraft: ActaDraft = {
          ...acta,
          estado: 'Pendiente de alegaciones',
          fechaLimite,
        };
        const currentActa = actas.find((candidate) => candidate.id === actaId);
        const updateResult = await updateWithConcurrencyCheck(
          actaId,
          nextDraft,
          currentActa?.updatedAt ?? null,
        );

        if (!updateResult.ok) {
          setOutlookDraftStatus(
            `Outlook abierto, pero no se ha podido actualizar el estado del acta: ${updateResult.message}`,
          );
          setOutlookDraftStatusIsError(true);
          return;
        }

        if (editingActaId === actaId) {
          setDraft(nextDraft);
          setDeadlineWasAutoUpdated(true);
        }
        setOutlookDraftStatus(
          result.message || 'Borrador Outlook abierto. El acta ha pasado a Pendiente de alegaciones.',
        );
        setOutlookDraftStatusIsError(false);
      } catch (error) {
        setOutlookDraftStatus(
          error instanceof Error ? error.message : 'No se ha podido abrir Outlook.',
        );
        setOutlookDraftStatusIsError(true);
      }
    },
    [actas, editingActaId, updateWithConcurrencyCheck],
  );

  const createActaFirmaOutlookDraft = useCallback(
    async (acta: Pick<Acta, 'titulo'>) => {
      setOutlookDraftStatus('');
      setOutlookDraftStatusIsError(false);

      const api = window.traccion?.createOutlookDraft ?? window.rrllOutlook?.createDraft;
      if (!api) {
        setOutlookDraftStatus('Outlook no está disponible en este entorno.');
        setOutlookDraftStatusIsError(true);
        return;
      }

      try {
        const result = await api({
          subject: buildFirmaActaOutlookSubject(acta),
          html: buildFirmaActaOutlookHtml(),
          to: [],
          cc: [],
        });
        setOutlookDraftStatus(
          result.message ||
            (result.ok ? 'Borrador Outlook del acta definitiva abierto.' : 'No se ha podido abrir Outlook.'),
        );
        setOutlookDraftStatusIsError(!result.ok);
      } catch (error) {
        setOutlookDraftStatus(
          error instanceof Error ? error.message : 'No se ha podido abrir Outlook.',
        );
        setOutlookDraftStatusIsError(true);
      }
    },
    [],
  );

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
            {acta.estado === 'Pendiente de realizar' && (
              <ActionButton
                onClick={() => void createActaBorradorOutlookDraft(acta, acta.id)}
                size="sm"
                title="Generar Outlook del borrador del acta"
                variant="outlook"
              />
            )}
            {acta.estado === 'Pendiente de alegaciones' && (
              <ActionButton
                onClick={() => void createActaOutlookDraft(acta)}
                size="sm"
                title="Abrir borrador Outlook de alegaciones"
                variant="outlook"
              />
            )}
            {acta.estado === 'Pendiente de firma' && (
              <ActionButton
                onClick={() => void createActaFirmaOutlookDraft(acta)}
                size="sm"
                title="Exportar Outlook del acta definitiva"
                variant="outlook"
              />
            )}
            <ActionButton
              onClick={() => void deleteActa(acta.id)}
              size="sm"
              title="Eliminar acta"
              variant="delete"
            />
          </div>
        ),
        width: 80,
        minWidth: 70,
        isActionColumn: true,
      },
    ],
    [createActaBorradorOutlookDraft, createActaFirmaOutlookDraft, createActaOutlookDraft, deleteActa],
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

    setSaveError('');

    if (editingActaId) {
      const result = await updateWithConcurrencyCheck(editingActaId, draft, expectedUpdatedAt);
      if (!result.ok) {
        setSaveError(result.message);
      } else {
        clearRecoveryDraft();
      }
      return;
    }

    const result = await createWithConcurrencyCheck(draft);
    if (!result.ok) {
      setSaveError(result.message);
      return;
    }
    clearRecoveryDraft();

    // Guardar no cierra el editor: tras crearla, seguimos trabajando sobre el registro ya persistido.
    if (result.recordId) {
      setEditingActaId(result.recordId);
    }
  };

  const applyStateChange = (nextState: ActaDraft['estado']) => {
    if (isEditorReadOnly) {
      return;
    }
    const automaticDeadline = getAutomaticDeadlineForState(nextState);
    const shouldClearDeadline = nextState === 'Pendiente de firma' || nextState === 'Cerrada';
    setDraft((current) => ({
      ...current,
      estado: nextState,
      fechaLimite: automaticDeadline ?? (shouldClearDeadline ? '' : current.fechaLimite),
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


  const reopenActa = async () => {
    if (!editingActa || editingActa.estado !== 'Cerrada' || recordLock.isReadOnly) {
      return;
    }

    const confirmed = await confirm(
      `¿Reabrir el acta «${editingActa.titulo}»? Volverá a “Pendiente de firma”.`,
      { confirmLabel: 'Reabrir', title: 'Reabrir acta' },
    );
    if (!confirmed) {
      return;
    }

    const reopenedDraft: ActaDraft = {
      ...draft,
      estado: 'Pendiente de firma',
    };
    setSaveError('');
    const result = await updateWithConcurrencyCheck(
      editingActa.id,
      reopenedDraft,
      editingActa.updatedAt,
    );
    if (!result.ok) {
      setSaveError(result.message);
      return;
    }

    setDraft(reopenedDraft);
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

  const openOperationalView = useCallback(
    (state?: ActaDraft['estado']) => {
      setSearch('');
      setYearFilter('');
      setStateFilter(state ?? '');
      setIsWorkflowHome(false);
      if (state === 'Cerrada' && !hasLoadedHistoricalActas) {
        void loadHistoricalActas();
      }
    },
    [hasLoadedHistoricalActas, loadHistoricalActas],
  );

  const displayedCreationDate = editingActa?.fechaCreacion ?? getTodayIsoDate();
  const canAttachFinalActa = draft.estado === 'Pendiente de firma' || draft.estado === 'Cerrada';
  const canCreateBorradorOutlookFromEditor =
    draft.estado === 'Pendiente de realizar' && Boolean(editingActaId);
  const canCreateFirmaOutlookFromEditor = draft.estado === 'Pendiente de firma';
  const canCreateOutlookDraftFromEditor = draft.estado === 'Pendiente de alegaciones';

  return (
    <section
      className="space-y-3"
      id="actas"
    >
      <PageHeader
        title="Actas"
        helpSections={ACTAS_HELP_SECTIONS}
        helpSubtitle="Guía rápida del ciclo de actas, estados, alegaciones e histórico."
      />
      {isWorkflowHome ? (
        <ActasWorkflow
          actas={actas}
          onNewActa={() => openEditor()}
          onDeleteActa={(actaId) => void deleteActa(actaId)}
          onOpenActa={(acta) => openEditor(acta)}
          onOpenOperational={openOperationalView}
          onOpenTypeManager={() => {
            if (!hasLoadedHistoricalActas) {
              void loadHistoricalActas();
            }
            setIsTypeManagerOpen(true);
          }}
        />
      ) : (
        <ActasOperationalView
          closedActasByYear={closedActasByYear}
          columns={columns}
          filterLabel={filterLabel}
          filteredActas={filteredActas}
          hasLoadedHistoricalActas={hasLoadedHistoricalActas}
          onBack={() => {
            setIsEditorOpen(false);
            setEditingActaId(null);
            setStateFilter('');
            setSearch('');
            setYearFilter('');
            setIsWorkflowHome(true);
          }}
          onColumnOrderChange={setColumnOrder}
          onColumnWidthChange={setColumnWidth}
          onNewActa={() => openEditor()}
          onOpenActa={openEditor}
          onOpenOutlookTemplate={openOutlookTemplateManager}
          onOpenTypeManager={() => {
            if (!hasLoadedHistoricalActas) {
              void loadHistoricalActas();
            }
            setIsTypeManagerOpen(true);
          }}
          onResetColumnWidths={resetColumnWidths}
          onSortChange={setSort}
          openActas={openActas}
          openHistoryYears={openHistoryYears}
          preferences={preferences}
          search={search}
          setOpenHistoryYears={setOpenHistoryYears}
          setSearch={setSearch}
          setStateFilter={setStateFilter}
          setYearFilter={setYearFilter}
          stateFilter={stateFilter}
          yearFilter={yearFilter}
          years={years}
        />
      )}

      {isOutlookTemplateOpen && (
        <ActasOutlookTemplateModal
          onClose={() => setIsOutlookTemplateOpen(false)}
          onSave={() => void saveOutlookTemplate()}
          outlookTemplate={outlookTemplate}
          outlookTemplateBodyRef={outlookTemplateBodyRef}
          outlookTemplateStatus={outlookTemplateStatus}
          outlookTemplateStatusIsError={outlookTemplateStatusIsError}
          setOutlookTemplate={setOutlookTemplate}
        />
      )}

      {isTypeManagerOpen && (
        <ActaTypeManagerModal
          actaTypeUsage={actaTypeUsage}
          actaTypes={actaTypes}
          deleteActaType={deleteActaType}
          newActaTypeName={newActaTypeName}
          onClose={() => setIsTypeManagerOpen(false)}
          pendingDeleteActaTypeId={pendingDeleteActaTypeId}
          saveNewActaType={saveNewActaType}
          setNewActaTypeName={setNewActaTypeName}
          setPendingDeleteActaTypeId={setPendingDeleteActaTypeId}
          toggleActaTypeWithFeedback={toggleActaTypeWithFeedback}
        />
      )}

      {isEditorOpen && (
        <ActaEditorModal
          addDraftUpdate={addDraftUpdate}
          advanceState={advanceState}
          applyStateChange={applyStateChange}
          canAttachFinalActa={canAttachFinalActa}
          canCreateBorradorOutlookFromEditor={canCreateBorradorOutlookFromEditor}
          canCreateFirmaOutlookFromEditor={canCreateFirmaOutlookFromEditor}
          canCreateOutlookDraftFromEditor={canCreateOutlookDraftFromEditor}
          createActaBorradorOutlookDraft={(acta) =>
            editingActaId
              ? createActaBorradorOutlookDraft(acta, editingActaId)
              : Promise.resolve()
          }
          createActaFirmaOutlookDraft={createActaFirmaOutlookDraft}
          createActaOutlookCalendar={createActaOutlookCalendar}
          createActaOutlookDraft={createActaOutlookDraft}
          deadlineWasAutoUpdated={deadlineWasAutoUpdated}
          displayedCreationDate={displayedCreationDate}
          draft={draft}
          editingActa={editingActa}
          editingActaId={editingActaId}
          isEditorReadOnly={isEditorReadOnly}
          isClosedActa={isClosedActa}
          newUpdateText={newUpdateText}
          onClose={() => void requestEditorClose()}
          openActaPath={openActaPath}
          outlookDraftStatus={outlookDraftStatus}
          outlookDraftStatusIsError={outlookDraftStatusIsError}
          pathStatus={pathStatus}
          pathStatusIsError={pathStatusIsError}
          reopenActa={reopenActa}
          recordLock={recordLock}
          saveActa={saveActa}
          saveError={saveError}
          selectActaPath={selectActaPath}
          selectableActaTypes={selectableActaTypes}
          setNewUpdateText={setNewUpdateText}
          sindicatoOptions={sindicatoOptions}
          updateAlegacion={updateAlegacion}
          updateDraft={updateDraft}
        />
      )}
      {recoveryDialogNode}
      {unsavedDialogNode}
      {dialogNode}
    </section>
  );
}
