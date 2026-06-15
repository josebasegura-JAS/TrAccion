import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Gift, History, Search, ShieldMinus, Trash2 } from 'lucide-react';
import { useEmployeeStore } from '../../plantilla/store/useEmployeeStore';
import {
  buildSorteosSummary,
  normalizeSorteosPeople,
  searchPeopleForExclusion,
  SORTEOS_MIN_SEARCH_LENGTH,
  validateSorteosDraft,
  type SorteosDraw,
  type SorteosDraft,
  type SorteosExclusion,
  type SorteosWinner,
} from '../domain/sorteos';
import { useSorteosStore } from '../store/useSorteosStore';
import type { ExportColumn } from '../../../shared/export/types';
import { ExportPrintButtons } from '../../../shared/print/ExportPrintButtons';
import { useSharedRecordLock } from '../../../services/useSharedRecordLock';
import { ModuleHelpButton, type ModuleHelpSection } from '../../../components/ModuleHelp';

const today = new Date().toISOString().slice(0, 10);

const SORTEOS_HELP_SECTIONS: ModuleHelpSection[] = [
  {
    title: 'Para qué sirve',
    items: [
      'Gestiona sorteos internos con participantes normalizados desde plantilla, ganadores e histórico.',
      'Permite excluir personas para evitar que vuelvan a participar mientras siga vigente la exclusión.',
      'El histórico conserva resultados y permite desbloquear exclusiones cuando corresponde.',
    ],
  },
  {
    title: 'Uso recomendado',
    items: [
      'Define título, fecha y número de ganadores antes de ejecutar el sorteo.',
      'Revisa exclusiones activas antes de sortear para evitar resultados no deseados.',
      'Exporta o imprime el resultado cuando necesites dejar constancia del sorteo realizado.',
    ],
  },
];

type PendingConfirmation =
  | { type: 'delete-draw'; drawId: string }
  | { type: 'reset-all-exclusions' }
  | null;

const winnerExportColumns = (draw: SorteosDraw): ExportColumn<SorteosWinner>[] => [
  { key: 'position', header: 'Posición', value: (winner) => winner.position },
  { key: 'empleado', header: 'Nº empleado', value: (winner) => winner.empleado },
  {
    key: 'nombreApellidos',
    header: 'Nombre y apellidos',
    value: (winner) => winner.nombreApellidos,
  },
  { key: 'sorteo', header: 'Sorteo', value: () => draw.title },
  { key: 'fecha', header: 'Fecha', value: () => draw.date },
];

const exclusionExportColumns: ExportColumn<SorteosExclusion>[] = [
  { key: 'empleado', header: 'Nº empleado', value: (exclusion) => exclusion.empleado },
  {
    key: 'nombreApellidos',
    header: 'Nombre y apellidos',
    value: (exclusion) => exclusion.nombreApellidos,
  },
  { key: 'reason', header: 'Motivo', value: (exclusion) => exclusion.reason },
  { key: 'excludedAt', header: 'Fecha exclusión', value: (exclusion) => exclusion.excludedAt },
];

const drawHistoryExportColumns: ExportColumn<SorteosDraw>[] = [
  { key: 'title', header: 'Sorteo', value: (draw) => draw.title },
  { key: 'date', header: 'Fecha', value: (draw) => draw.date },
  { key: 'winners', header: 'Ganadores', value: (draw) => draw.winners.length },
];

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0 rounded-lg border border-metro-border bg-metro-surface/70 px-3 py-2 shadow-sm">
      <p className="truncate text-[10px] font-semibold uppercase tracking-[0.16em] text-metro-muted">
        {label}
      </p>
      <p className="mt-0.5 text-xl font-bold leading-none text-metro-text">{value}</p>
    </div>
  );
}

function WinnersTable({ draw }: { draw: SorteosDraw }) {
  return (
    <div className="overflow-hidden rounded-xl border border-metro-border bg-metro-surface">
      <table className="w-full table-auto text-left text-sm">
        <thead className="bg-metro-panel text-[11px] uppercase tracking-[0.16em] text-metro-muted">
          <tr>
            <th className="px-3 py-2 font-semibold">Posición</th>
            <th className="px-3 py-2 font-semibold">Nº empleado</th>
            <th className="px-3 py-2 font-semibold">Nombre y apellidos</th>
            <th className="px-3 py-2 font-semibold">Sorteo</th>
            <th className="px-3 py-2 font-semibold">Fecha</th>
          </tr>
        </thead>
        <tbody className="[&>tr:nth-child(even)]:bg-metro-panel/45 [&>tr:hover]:bg-metro-red/10">
          {draw.winners.map((winner: SorteosWinner) => (
            <tr
              className="hover:bg-metro-panel/70"
              key={`${draw.id}-${winner.position}-${winner.empleado}`}
            >
              <td className="px-3 py-2 font-semibold text-metro-red">{winner.position}</td>
              <td className="px-3 py-2 text-metro-text">{winner.empleado}</td>
              <td className="px-3 py-2 text-metro-text">{winner.nombreApellidos}</td>
              <td className="px-3 py-2 text-metro-muted">{draw.title}</td>
              <td className="px-3 py-2 text-metro-muted">{draw.date}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SorteosPage() {
  const { employees, load: loadEmployees } = useEmployeeStore();
  const {
    addExclusionWithConcurrencyCheck,
    createDrawWithConcurrencyCheck,
    deleteDrawWithConcurrencyCheck,
    draws,
    exclusions,
    load: loadSorteos,
    removeExclusionWithConcurrencyCheck,
    resetAllExclusionsWithConcurrencyCheck,
    resetDrawWinnerExclusionsWithConcurrencyCheck,
    viewDraw,
    visibleResult,
  } = useSorteosStore();
  const [draft, setDraft] = useState<SorteosDraft>({ title: '', date: today, winnersCount: 1 });
  const [errors, setErrors] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [exclusionsOpen, setExclusionsOpen] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation>(null);
  const isSorteosEditing = Boolean(
    draft.title.trim() ||
      draft.date !== today ||
      draft.winnersCount !== 1 ||
      search.trim() ||
      pendingConfirmation,
  );
  const moduleLock = useSharedRecordLock({
    module: 'sorteos',
    recordId: '__module__',
    enabled: isSorteosEditing,
  });
  const isReadOnly = moduleLock.isReadOnly;

  useEffect(() => {
    loadEmployees();
    loadSorteos();
  }, [loadEmployees, loadSorteos]);

  const people = useMemo(() => normalizeSorteosPeople(employees), [employees]);
  const summary = useMemo(
    () => buildSorteosSummary(people, exclusions, draws),
    [draws, exclusions, people],
  );
  const searchResults = useMemo(
    () => searchPeopleForExclusion(people, exclusions, search),
    [exclusions, people, search],
  );

  const handleDraftChange = <K extends keyof SorteosDraft>(key: K, value: SorteosDraft[K]) => {
    if (isReadOnly) {
      return;
    }
    setDraft((currentDraft) => ({ ...currentDraft, [key]: value }));
  };

  const handleDraw = () => {
    if (isReadOnly) {
      return;
    }
    const validation = validateSorteosDraft(draft, people, exclusions);
    if (!validation.valid) {
      setErrors(validation.errors);
      return;
    }

    void (async () => {
      const result = await createDrawWithConcurrencyCheck(draft, people);
      setErrors(result.errors);
      if (result.valid) {
        setDraft({ title: '', date: today, winnersCount: 1 });
      }
    })();
  };

  const requestDeleteDraw = (drawId: string) => {
    if (isReadOnly) {
      return;
    }
    setPendingConfirmation({ type: 'delete-draw', drawId });
  };

  const requestResetAllExclusions = () => {
    if (isReadOnly) {
      return;
    }
    setPendingConfirmation({ type: 'reset-all-exclusions' });
  };

  const cancelConfirmation = () => {
    setPendingConfirmation(null);
  };

  const confirmDeleteDraw = (removeLinkedWinnerExclusions: boolean) => {
    if (isReadOnly) {
      return;
    }
    if (pendingConfirmation?.type !== 'delete-draw') {
      return;
    }

    void (async () => {
      const result = await deleteDrawWithConcurrencyCheck(
        pendingConfirmation.drawId,
        removeLinkedWinnerExclusions,
      );
      if (!result.ok) {
        setErrors([result.message]);
        return;
      }
      setPendingConfirmation(null);
    })();
  };

  const confirmResetAllExclusions = () => {
    if (isReadOnly) {
      return;
    }
    void (async () => {
      const result = await resetAllExclusionsWithConcurrencyCheck();
      if (!result.ok) {
        setErrors([result.message]);
        return;
      }
      setPendingConfirmation(null);
    })();
  };

  return (
    <section
      className="space-y-4 rounded-2xl border border-metro-border bg-metro-surface p-4 shadow-card"
      id="sorteos"
    >
      {moduleLock.status === 'locked' && moduleLock.lockedBy && (
        <div className="rounded-xl border border-yellow-400/40 bg-yellow-500/10 px-4 py-3 text-sm font-semibold text-yellow-100">
          📖 Modo consulta — editando: {moduleLock.lockedBy.ownerName}@{moduleLock.lockedBy.machineName}
        </div>
      )}
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-metro-red">Módulo</p>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-bold text-metro-text">Sorteos</h2>
            <ModuleHelpButton
              title="Sorteos"
              subtitle="Guía rápida de creación de sorteos, exclusiones, ganadores e histórico."
              sections={SORTEOS_HELP_SECTIONS}
            />
          </div>
          <p className="mt-0.5 text-sm text-metro-muted">Gestión compacta de sorteos, exclusiones e histórico de resultados.</p>
        </div>
      </div>

      <div className="grid min-w-0 gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.48fr)] xl:items-start">
        <div className="min-w-0 rounded-xl border border-metro-border bg-metro-panel p-3">
          <div className="mb-2 flex items-center gap-2">
            <Gift className="h-4 w-4 shrink-0 text-metro-red" />
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-metro-red">
                Acciones
              </p>
              <h3 className="truncate text-base font-bold text-metro-text">Crear sorteo</h3>
            </div>
          </div>
          <div className="grid min-w-0 gap-2 md:grid-cols-[minmax(180px,1fr)_minmax(140px,0.45fr)_minmax(96px,0.3fr)_auto] md:items-end">
            <label className="min-w-0 text-xs font-semibold text-metro-text">
              Título
              <input
                className="mt-1 w-full min-w-0 rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-sm text-metro-text outline-none focus:border-metro-red"
                onChange={(event) => handleDraftChange('title', event.target.value)}
                disabled={isReadOnly}
                value={draft.title}
              />
            </label>
            <label className="min-w-0 text-xs font-semibold text-metro-text">
              Fecha
              <input
                className="mt-1 w-full min-w-0 rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-sm text-metro-text outline-none focus:border-metro-red"
                onChange={(event) => handleDraftChange('date', event.target.value)}
                type="date"
                disabled={isReadOnly}
                value={draft.date}
              />
            </label>
            <label className="min-w-0 text-xs font-semibold text-metro-text">
              Nº ganadores
              <input
                className="mt-1 w-full min-w-0 rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-sm text-metro-text outline-none focus:border-metro-red"
                min="1"
                onChange={(event) => handleDraftChange('winnersCount', Number(event.target.value))}
                type="number"
                disabled={isReadOnly}
                value={draft.winnersCount}
              />
            </label>
            <button
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-metro-red px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-red-600 md:w-auto md:self-end"
              disabled={isReadOnly}
              onClick={handleDraw}
              type="button"
            >
              <Gift className="h-4 w-4" />
              Sortear
            </button>
          </div>
          {errors.length > 0 && (
            <div className="mt-2 rounded-lg border border-red-300/40 bg-red-500/10 p-2 text-sm text-red-100">
              <ul className="list-disc space-y-1 pl-4">
                {errors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="min-w-0 rounded-xl border border-metro-border bg-metro-panel p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-metro-red">
              Plantilla / disponibilidad
            </p>
          </div>
          <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-4">
            <SummaryCard label="Total plantilla" value={summary.totalPlantilla} />
            <SummaryCard label="Disponibles" value={summary.disponibles} />
            <SummaryCard label="Excluidos" value={summary.excluidos} />
            <SummaryCard label="Histórico" value={summary.historico} />
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-metro-border bg-metro-panel p-3">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-base font-bold text-metro-text">Resultado del sorteo</h3>
            <p className="text-xs text-metro-muted">
              Se muestra inmediatamente tras sortear o al ver histórico.
            </p>
          </div>
          {visibleResult ? (
            <ExportPrintButtons
              payload={{
                title: `Ganadores - ${visibleResult.title}`,
                filename: `sorteo-ganadores-${visibleResult.date}-${visibleResult.title}`,
                columns: winnerExportColumns(visibleResult),
                rows: visibleResult.winners,
                filterLabel: `Sorteo: ${visibleResult.title} · Fecha: ${visibleResult.date}`,
              }}
            />
          ) : null}
        </div>
        {visibleResult ? (
          <WinnersTable draw={visibleResult} />
        ) : (
          <div className="rounded-xl border border-dashed border-metro-border bg-metro-surface p-6 text-center text-sm text-metro-muted">
            No hay resultado visible. Realiza un sorteo o pulsa “Ver ganadores” en el histórico.
          </div>
        )}
      </div>

      <div className="rounded-xl border border-metro-border bg-metro-panel">
        <button
          className="flex w-full items-center justify-between px-3 py-3 text-left"
          onClick={() => setExclusionsOpen((open) => !open)}
          type="button"
        >
          <span className="flex items-center gap-2 text-base font-bold text-metro-text">
            <ShieldMinus className="h-4 w-4 text-metro-red" />
            Exclusiones
          </span>
          {exclusionsOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        {exclusionsOpen && (
          <div className="space-y-3 border-t border-metro-border p-3">
            <div className="grid gap-3 lg:grid-cols-[minmax(280px,0.8fr)_minmax(420px,1.2fr)]">
              <div className="rounded-xl border border-metro-border bg-metro-surface p-3">
                <label className="block text-sm font-semibold text-metro-text">
                  Buscar persona a excluir
                  <div className="mt-1 flex items-center gap-2 rounded-lg border border-metro-border bg-metro-panel px-3 py-2 focus-within:border-metro-red">
                    <Search className="h-4 w-4 text-metro-muted" />
                    <input
                      className="w-full bg-transparent text-sm text-metro-text outline-none"
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Nº empleado, nombre o apellidos"
                      value={search}
                    />
                  </div>
                </label>
                <p className="mt-2 text-xs text-metro-muted">
                  Introduce al menos {SORTEOS_MIN_SEARCH_LENGTH} caracteres. Se muestran hasta 30
                  resultados.
                </p>
                <div className="mt-3 space-y-2">
                  {searchResults.map((person) => (
                    <div
                      className="flex items-center justify-between gap-2 rounded-lg border border-metro-border bg-metro-panel px-3 py-2"
                      key={person.empleado}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-metro-text">
                          {person.nombreApellidos}
                        </p>
                        <p className="text-xs text-metro-muted">{person.empleado}</p>
                      </div>
                      <button
                        className="rounded-lg bg-metro-red px-3 py-1.5 text-xs font-bold text-white hover:bg-red-600"
                        onClick={() => {
                          void (async () => {
                            const result = await addExclusionWithConcurrencyCheck(person);
                            if (!result.ok) {
                              setErrors([result.message]);
                            }
                          })();
                        }}
                        type="button"
                      >
                        Excluir
                      </button>
                    </div>
                  ))}
                  {search.length >= SORTEOS_MIN_SEARCH_LENGTH && searchResults.length === 0 && (
                    <p className="rounded-lg border border-dashed border-metro-border p-3 text-sm text-metro-muted">
                      No hay resultados disponibles para excluir.
                    </p>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-metro-border bg-metro-surface p-3">
                <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <h4 className="text-sm font-bold text-metro-text">Personas excluidas</h4>
                  <ExportPrintButtons
                    payload={{
                      title: 'Personas excluidas de sorteos',
                      filename: 'sorteos-excluidos',
                      columns: exclusionExportColumns,
                      rows: exclusions,
                    }}
                  />
                  <button
                    className="rounded-lg border border-metro-border px-3 py-1.5 text-xs font-bold text-metro-text transition hover:border-metro-red disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={exclusions.length === 0}
                    onClick={requestResetAllExclusions}
                    type="button"
                  >
                    Resetear todas las exclusiones
                  </button>
                </div>
                <div className="overflow-hidden rounded-lg border border-metro-border">
                  <table className="w-full table-auto text-left text-sm">
                    <thead className="bg-metro-panel text-[11px] uppercase tracking-[0.16em] text-metro-muted">
                      <tr>
                        <th className="px-3 py-2">Nº empleado</th>
                        <th className="px-3 py-2">Nombre</th>
                        <th className="px-3 py-2">Motivo</th>
                        <th className="px-3 py-2">Fecha</th>
                        <th className="px-3 py-2">Acción</th>
                      </tr>
                    </thead>
                    <tbody className="[&>tr:nth-child(even)]:bg-metro-panel/45 [&>tr:hover]:bg-metro-red/10">
                      {exclusions.map((exclusion) => (
                        <tr key={exclusion.id}>
                          <td className="px-3 py-2 text-metro-text">{exclusion.empleado}</td>
                          <td className="px-3 py-2 text-metro-text">{exclusion.nombreApellidos}</td>
                          <td className="px-3 py-2 text-metro-muted">{exclusion.reason}</td>
                          <td className="px-3 py-2 text-metro-muted">
                            {exclusion.excludedAt.slice(0, 10)}
                          </td>
                          <td className="px-3 py-2">
                            <button
                              className="rounded-lg border border-metro-border px-2 py-1 text-xs font-semibold text-metro-text hover:border-metro-red"
                              onClick={() => {
                                void (async () => {
                                  const result = await removeExclusionWithConcurrencyCheck(exclusion.id);
                                  if (!result.ok) {
                                    setErrors([result.message]);
                                  }
                                })();
                              }}
                              type="button"
                            >
                              Quitar
                            </button>
                          </td>
                        </tr>
                      ))}
                      {exclusions.length === 0 && (
                        <tr>
                          <td className="px-3 py-4 text-center text-metro-muted" colSpan={5}>
                            No hay exclusiones registradas.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {pendingConfirmation?.type === 'delete-draw' && (
        <div className="rounded-xl border border-red-400/40 bg-red-500/10 p-3 text-sm text-metro-text">
          <p className="font-semibold">¿Eliminar sorteo?</p>
          <p className="mt-1 text-metro-muted">
            Indica si quieres quitar también las exclusiones vinculadas a ganadores de ese sorteo.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              className="rounded-lg bg-metro-red px-3 py-2 text-xs font-bold text-white hover:bg-red-600"
              onClick={() => confirmDeleteDraw(true)}
              type="button"
            >
              Eliminar y quitar exclusiones
            </button>
            <button
              className="rounded-lg border border-metro-border px-3 py-2 text-xs font-bold text-metro-text hover:border-metro-red"
              onClick={() => confirmDeleteDraw(false)}
              type="button"
            >
              Eliminar solo sorteo
            </button>
            <button
              className="rounded-lg border border-metro-border px-3 py-2 text-xs font-bold text-metro-text hover:border-metro-red"
              onClick={cancelConfirmation}
              type="button"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {pendingConfirmation?.type === 'reset-all-exclusions' && (
        <div className="rounded-xl border border-red-400/40 bg-red-500/10 p-3 text-sm text-metro-text">
          <p className="font-semibold">¿Resetear todas las exclusiones?</p>
          <p className="mt-1 text-metro-muted">
            Esta acción elimina exclusiones manuales y de ganadores.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              className="rounded-lg bg-metro-red px-3 py-2 text-xs font-bold text-white hover:bg-red-600"
              onClick={confirmResetAllExclusions}
              type="button"
            >
              Resetear todas las exclusiones
            </button>
            <button
              className="rounded-lg border border-metro-border px-3 py-2 text-xs font-bold text-metro-text hover:border-metro-red"
              onClick={cancelConfirmation}
              type="button"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-metro-border bg-metro-panel">
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-3">
          <button
            className="flex items-center gap-2 text-left text-base font-bold text-metro-text"
            onClick={() => setHistoryOpen((open) => !open)}
            type="button"
          >
            <History className="h-4 w-4 text-metro-red" />
            Histórico de sorteos
            {historyOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          <ExportPrintButtons
            payload={{
              title: 'Histórico de sorteos',
              filename: 'sorteos-historico',
              columns: drawHistoryExportColumns,
              rows: draws,
            }}
          />
        </div>
        {historyOpen && (
          <div className="border-t border-metro-border p-3">
            <div className="overflow-hidden rounded-lg border border-metro-border bg-metro-surface">
              <table className="w-full table-auto text-left text-sm">
                <thead className="bg-metro-panel text-[11px] uppercase tracking-[0.16em] text-metro-muted">
                  <tr>
                    <th className="px-3 py-2">Sorteo</th>
                    <th className="px-3 py-2">Fecha</th>
                    <th className="px-3 py-2">Ganadores</th>
                    <th className="px-3 py-2">Acciones</th>
                  </tr>
                </thead>
                <tbody className="[&>tr:nth-child(even)]:bg-metro-panel/45 [&>tr:hover]:bg-metro-red/10">
                  {draws.map((draw) => (
                    <tr key={draw.id}>
                      <td className="px-3 py-2 font-semibold text-metro-text">{draw.title}</td>
                      <td className="px-3 py-2 text-metro-muted">{draw.date}</td>
                      <td className="px-3 py-2 text-metro-muted">{draw.winners.length}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-2">
                          <button
                            className="rounded-lg border border-metro-border px-2 py-1 text-xs font-semibold text-metro-text hover:border-metro-red"
                            onClick={() => viewDraw(draw.id)}
                            type="button"
                          >
                            Ver ganadores
                          </button>
                          <ExportPrintButtons
                            payload={{
                              title: `Ganadores - ${draw.title}`,
                              filename: `sorteo-ganadores-${draw.date}-${draw.title}`,
                              columns: winnerExportColumns(draw),
                              rows: draw.winners,
                              filterLabel: `Sorteo: ${draw.title} · Fecha: ${draw.date}`,
                            }}
                          />
                          <button
                            className="rounded-lg border border-metro-border px-2 py-1 text-xs font-semibold text-metro-text hover:border-metro-red"
                            onClick={() => {
                              void (async () => {
                                const result = await resetDrawWinnerExclusionsWithConcurrencyCheck(draw.id);
                                if (!result.ok) {
                                  setErrors([result.message]);
                                }
                              })();
                            }}
                            type="button"
                          >
                            Resetear exclusiones por sorteo
                          </button>
                          <button
                            className="inline-flex items-center gap-1 rounded-lg border border-red-400/40 px-2 py-1 text-xs font-semibold text-red-100 hover:border-red-300"
                            onClick={() => requestDeleteDraw(draw.id)}
                            type="button"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Eliminar
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {draws.length === 0 && (
                    <tr>
                      <td className="px-3 py-4 text-center text-metro-muted" colSpan={4}>
                        No hay sorteos en el histórico.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
