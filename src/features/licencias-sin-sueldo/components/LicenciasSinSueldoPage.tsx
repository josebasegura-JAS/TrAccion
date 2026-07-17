import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  FileSignature,
  Search,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActionButton } from '../../../components/ui/ActionButton';
import { FieldLabel, Input, Select } from '../../../components/ui/Field';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Notice } from '../../../components/ui/Notice';
import { CountBadge } from '../../../components/ui/CountBadge';
import { useAppDialog } from '../../../hooks/useAppDialog';
import { saveDocxWithDialog } from '../../teletrabajo/domain/download';
import { useConfiguracionStore } from '../../configuracion/store/useConfiguracionStore';
import { useEmployeeStore } from '../../plantilla/store/useEmployeeStore';
import {
  getEffectiveLicenciaEstado,
  licenciaSinSueldoTipos,
  visibleLicenciasSinSueldo,
  type LicenciaSinSueldoDraft,
  type LicenciaSinSueldoRecord,
  type LicenciaSinSueldoTipo,
} from '../domain/licenciaSinSueldo';
import { useLicenciasSinSueldoStore } from '../store/useLicenciasSinSueldoStore';
import { generateLicenciaSinSueldoWord } from '../domain/word';
import { LicenciasSinSueldoEditor } from './LicenciasSinSueldoEditor';
import { LicenciasBlock, LicenciasTable } from './LicenciasSinSueldoTable';
import {
  LICENCIAS_HELP_SECTIONS,
  buildHaystack,
  getHistoricalYear,
  todayIso,
  toDraft,
  type EditorMode,
} from './licenciasSinSueldoPage.helpers';

export function LicenciasSinSueldoPage() {
  const { employees, load: loadEmployees } = useEmployeeStore();
  const jobPositionTranslations = useEmployeeStore((state) => state.jobPositionTranslations);
  const rutaPlantillaLicenciaSinSueldo = useConfiguracionStore(
    (state) => state.rutaPlantillaLicenciaSinSueldo,
  );
  const {
    records,
    load,
    createWithConcurrencyCheck,
    updateWithConcurrencyCheck,
    removeWithConcurrencyCheck,
  } = useLicenciasSinSueldoStore();
  const [editor, setEditor] = useState<{
    mode: EditorMode;
    record: LicenciaSinSueldoRecord | null;
  } | null>(null);
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'todos' | LicenciaSinSueldoTipo>('todos');
  const [yearFilter, setYearFilter] = useState<'todos' | string>('todos');
  const [openHistoryYears, setOpenHistoryYears] = useState<Set<number>>(new Set());
  const [wordStatus, setWordStatus] = useState('');
  const [generatingWordId, setGeneratingWordId] = useState<string | null>(null);
  const { alert, confirm, dialogNode } = useAppDialog();

  useEffect(() => {
    loadEmployees();
    load();
  }, [load, loadEmployees]);

  const today = todayIso();
  const visibleRecords = useMemo(() => visibleLicenciasSinSueldo(records), [records]);
  const effectiveRecords = useMemo(
    () =>
      visibleRecords.map((record) => ({
        ...record,
        estado: getEffectiveLicenciaEstado(record, today),
      })),
    [today, visibleRecords],
  );
  const historicalYears = useMemo(
    () =>
      [
        ...new Set(
          effectiveRecords
            .filter((record) => record.estado === 'historico')
            .map((record) => getHistoricalYear(record)),
        ),
      ].sort((first, second) => second - first),
    [effectiveRecords],
  );

  const filteredRecords = useMemo(() => {
    const normalizedQuery = query
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase('es')
      .trim();
    return effectiveRecords.filter((record) => {
      const matchesQuery =
        !normalizedQuery || buildHaystack(record, record.estado).includes(normalizedQuery);
      const matchesType = typeFilter === 'todos' || record.tipo === typeFilter;
      const matchesYear =
        yearFilter === 'todos' || String(getHistoricalYear(record)) === yearFilter;
      return matchesQuery && matchesType && matchesYear;
    });
  }, [effectiveRecords, query, typeFilter, yearFilter]);

  const blocks = useMemo(
    () => ({
      pendienteAprobacion: filteredRecords.filter(
        (record) => record.estado === 'pendiente_aprobacion',
      ),
      pendienteFirma: filteredRecords.filter((record) => record.estado === 'pendiente_firma'),
      vigente: filteredRecords.filter((record) => record.estado === 'vigente'),
    }),
    [filteredRecords],
  );

  const shouldMaterializeHistory = yearFilter !== 'todos' || query.trim().length >= 2;
  const groupedHistory = useMemo(() => {
    const groups = new Map<number, { count: number; records: LicenciaSinSueldoRecord[] }>();

    for (const record of filteredRecords) {
      if (record.estado !== 'historico') {
        continue;
      }

      const year = getHistoricalYear(record);
      const current = groups.get(year) ?? { count: 0, records: [] };
      current.count += 1;
      if (shouldMaterializeHistory || openHistoryYears.has(year)) {
        current.records.push(record);
      }
      groups.set(year, current);
    }

    return [...groups.entries()]
      .sort(([first], [second]) => second - first)
      .map(([year, value]) => ({ year, count: value.count, records: value.records }));
  }, [filteredRecords, openHistoryYears, shouldMaterializeHistory]);

  const historicalCount = useMemo(
    () =>
      filteredRecords.reduce((count, record) => count + (record.estado === 'historico' ? 1 : 0), 0),
    [filteredRecords],
  );

  const acquireMutationLock = useCallback(
    async (record: LicenciaSinSueldoRecord) => {
      const payload = { module: 'licencias-sin-sueldo', recordId: record.id };
      const api = window.traccion;
      const result = await api?.acquireRecordLock?.(payload);
      if (result?.status === 'locked') {
        await alert(result.message, { type: 'warning' });
        return false;
      }
      return true;
    },
    [alert],
  );

  const releaseMutationLock = useCallback(async (record: LicenciaSinSueldoRecord) => {
    await window.traccion?.releaseRecordLock?.({
      module: 'licencias-sin-sueldo',
      recordId: record.id,
    });
  }, []);

  const saveDraft = async (
    draft: LicenciaSinSueldoDraft,
  ): Promise<{ ok: boolean; message: string }> => {
    if (!editor) {
      return { ok: false, message: 'No hay editor activo.' };
    }
    if (editor.mode === 'create') {
      const result = await createWithConcurrencyCheck({ ...draft, estado: 'pendiente_aprobacion' });
      if (result.ok) {
        setEditor(null);
      }
      return result;
    }
    if (editor.record) {
      const result = await updateWithConcurrencyCheck(
        editor.record.id,
        draft,
        editor.record.updatedAt,
      );
      if (result.ok) {
        setEditor(null);
      }
      return result;
    }
    return { ok: false, message: 'No se ha encontrado el registro a guardar.' };
  };

  const deleteRecord = async (record: LicenciaSinSueldoRecord) => {
    if (
      !(await confirm(`¿Eliminar la solicitud de ${record.nombreCompleto}?`, {
        confirmLabel: 'Eliminar',
        danger: true,
        title: 'Eliminar solicitud',
      }))
    ) {
      return;
    }
    if (!(await acquireMutationLock(record))) {
      return;
    }
    const result = await removeWithConcurrencyCheck(record.id, record.updatedAt);
    if (!result.ok) {
      await alert(result.message, { type: 'error' });
    }
    await releaseMutationLock(record);
    setEditor(null);
  };

  const advanceRecord = async (record: LicenciaSinSueldoRecord) => {
    if (!(await acquireMutationLock(record))) {
      return;
    }
    const nextEstado =
      record.estado === 'pendiente_aprobacion'
        ? 'pendiente_firma'
        : record.estado === 'pendiente_firma'
          ? 'vigente'
          : record.estado;
    const result = await updateWithConcurrencyCheck(
      record.id,
      { ...toDraft(record), estado: nextEstado },
      record.updatedAt,
    );
    if (!result.ok) {
      await alert(result.message, { type: 'error' });
    }
    await releaseMutationLock(record);
  };

  const generateWord = useCallback(
    async (record: LicenciaSinSueldoRecord) => {
      if (
        record.estado !== 'pendiente_firma' ||
        record.tipo !== 'Licencia sin sueldo' ||
        generatingWordId
      ) {
        return;
      }

      const plantillaEmployee =
        employees.find(
          (employee) =>
            !employee.deletedAt && employee.empleado.trim() === record.numeroEmpleado.trim(),
        ) ?? null;

      setGeneratingWordId(record.id);
      setWordStatus('');
      try {
        const result = await generateLicenciaSinSueldoWord(
          record,
          plantillaEmployee,
          rutaPlantillaLicenciaSinSueldo,
          jobPositionTranslations,
        );
        await saveDocxWithDialog(result.blob, result.fileName);
        setWordStatus(`Word generado: ${result.detectedMarkers.length} marcadores sustituidos.`);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'No se ha podido generar el Word.';
        setWordStatus(message);
      } finally {
        setGeneratingWordId(null);
      }
    },
    [employees, generatingWordId, jobPositionTranslations, rutaPlantillaLicenciaSinSueldo],
  );

  const toggleYear = (year: number) => {
    setOpenHistoryYears((current) => {
      const next = new Set(current);
      if (next.has(year)) next.delete(year);
      else next.add(year);
      return next;
    });
  };

  return (
    <section
      className="space-y-4 rounded-2xl border border-metro-border bg-metro-surface p-4 shadow-card"
      id="licencias-sin-sueldo"
    >
      <PageHeader
        title="Licencias sin sueldo y permisos no retribuidos"
        helpSections={LICENCIAS_HELP_SECTIONS}
        helpSubtitle="Guía rápida de estados, reglas, vigencia, histórico y generación documental."
        className="mb-0"
        actions={
          <div className="flex max-w-full items-center gap-2 overflow-x-auto pb-1">
            <FieldLabel className="min-w-[18rem] shrink-0">
              <span className="sr-only">Buscar</span>
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-metro-muted"
                  size={15}
                />
                <Input
                  className="h-9 pl-9"
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Buscar por número, nombre, tipo o estado"
                  value={query}
                />
              </div>
            </FieldLabel>

            <FieldLabel className="w-48 shrink-0">
              <span className="sr-only">Tipo</span>
              <Select
                className="h-9"
                aria-label="Filtrar por tipo"
                onChange={(event) =>
                  setTypeFilter(event.target.value as 'todos' | LicenciaSinSueldoTipo)
                }
                value={typeFilter}
              >
                <option value="todos">Todos los tipos</option>
                {licenciaSinSueldoTipos.map((tipo) => (
                  <option key={tipo}>{tipo}</option>
                ))}
              </Select>
            </FieldLabel>

            <FieldLabel className="w-40 shrink-0">
              <span className="sr-only">Año histórico</span>
              <Select
                className="h-9"
                aria-label="Filtrar por año histórico"
                onChange={(event) => setYearFilter(event.target.value)}
                value={yearFilter}
              >
                <option value="todos">Todos los años</option>
                {historicalYears.map((year) => (
                  <option key={year} value={year}>
                    {year || 'Sin año'}
                  </option>
                ))}
              </Select>
            </FieldLabel>

            <ActionButton
              variant="add"
              iconOnly={false}
              onClick={() => setEditor({ mode: 'create', record: null })}
              size="sm"
              className="shrink-0"
            >
              Nueva solicitud
            </ActionButton>
          </div>
        }
      />

      {wordStatus && <Notice tone="muted">{wordStatus}</Notice>}

      <div className="grid gap-3 xl:grid-cols-2">
        <div className="min-w-0">
          <LicenciasBlock
            count={blocks.pendienteAprobacion.length}
            icon={<Clock size={18} />}
            title="Pendientes de aprobar"
          >
            <LicenciasTable
              blockId="pendiente_aprobacion"
              emptyText="No hay solicitudes pendientes de aprobar."
              onAdvance={advanceRecord}
              generatingWordId={generatingWordId}
              onDelete={deleteRecord}
              onEdit={(record) => setEditor({ mode: 'edit', record })}
              onGenerateWord={(record) => {
                void generateWord(record);
              }}
              records={blocks.pendienteAprobacion}
              title="Licencias sin sueldo - Pendientes de aprobar"
            />
          </LicenciasBlock>
        </div>

        <div className="min-w-0">
          <LicenciasBlock
            count={blocks.pendienteFirma.length}
            icon={<FileSignature size={18} />}
            title="Pendientes de firma"
          >
            <LicenciasTable
              blockId="pendiente_firma"
              emptyText="No hay solicitudes pendientes de firma."
              onAdvance={advanceRecord}
              generatingWordId={generatingWordId}
              onDelete={deleteRecord}
              onEdit={(record) => setEditor({ mode: 'edit', record })}
              onGenerateWord={(record) => {
                void generateWord(record);
              }}
              records={blocks.pendienteFirma}
              title="Licencias sin sueldo - Pendientes de firma"
            />
          </LicenciasBlock>
        </div>
      </div>

      <LicenciasBlock
        count={blocks.vigente.length}
        icon={<CheckCircle2 size={18} />}
        title="Vigentes"
      >
        <LicenciasTable
          blockId="vigente"
          emptyText="No hay solicitudes vigentes."
          onAdvance={advanceRecord}
          generatingWordId={generatingWordId}
          onDelete={deleteRecord}
          onEdit={(record) => setEditor({ mode: 'edit', record })}
          onGenerateWord={(record) => {
            void generateWord(record);
          }}
          records={blocks.vigente}
          title="Licencias sin sueldo - Vigentes"
        />
      </LicenciasBlock>

      <section className="rounded-2xl border border-metro-border bg-metro-panel p-4 shadow-sm shadow-slate-950/20">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-metro-text">Histórico por año</h2>
          <CountBadge tone="muted">{historicalCount}</CountBadge>
        </div>
        <div className="space-y-3">
          {groupedHistory.length === 0 && (
            <p className="rounded-xl border border-dashed border-metro-border p-4 text-sm text-metro-muted">
              No hay registros históricos.
            </p>
          )}
          {groupedHistory.map(({ year, count, records: yearRecords }) => {
            const isYearOpen =
              yearFilter !== 'todos' || query.trim().length >= 2 || openHistoryYears.has(year);
            const visibleYearRecords = isYearOpen ? yearRecords : [];

            return (
              <div className="rounded-xl border border-metro-border bg-slate-950/10 p-3" key={year}>
                <button
                  className="mb-3 flex w-full items-center justify-between text-left"
                  onClick={() => toggleYear(year)}
                  type="button"
                >
                  <span className="inline-flex items-center gap-2 text-sm font-semibold text-metro-text">
                    {isYearOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}{' '}
                    {year || 'Sin año'}
                  </span>
                  <span className="text-xs text-metro-muted">{count} registros</span>
                </button>
                {isYearOpen && (
                  <LicenciasTable
                    blockId={`historico-${year}`}
                    emptyText="Sin históricos para este año con los filtros actuales."
                    onAdvance={advanceRecord}
                    generatingWordId={generatingWordId}
                    onDelete={deleteRecord}
                    onEdit={(record) => setEditor({ mode: 'edit', record })}
                    onGenerateWord={(record) => {
                      void generateWord(record);
                    }}
                    records={visibleYearRecords}
                    title={`Licencias sin sueldo - Histórico ${year || 'sin año'}`}
                  />
                )}
              </div>
            );
          })}
        </div>
      </section>

      {editor && (
        <LicenciasSinSueldoEditor
          employees={employees}
          mode={editor.mode}
          onClose={() => setEditor(null)}
          onDelete={() => {
            if (editor.record) void deleteRecord(editor.record);
          }}
          onSave={saveDraft}
          record={editor.record}
        />
      )}
      {dialogNode}
    </section>
  );
}
