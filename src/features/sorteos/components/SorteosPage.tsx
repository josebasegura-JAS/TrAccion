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
import { withSharedModuleLocks } from '../../../services/sharedModuleLock';
import type { ModuleHelpSection } from '../../../components/ModuleHelp';
import { ActionButton } from '../../../components/ui/ActionButton';
import { Input } from '../../../components/ui/Field';
import { PageHeader } from '../../../components/ui/PageHeader';

const today = new Date().toISOString().slice(0, 10);

const SORTEOS_HELP_SECTIONS: ModuleHelpSection[] = [
  {
    title: 'Para qué sirve',
    body: 'Realiza sorteos internos entre la plantilla, evitando que quien ya ha ganado (o quien se excluya a mano) vuelva a entrar en el bombo mientras la exclusión siga activa.',
  },
  {
    title: 'Participantes y exclusiones',
    items: [
      'Los participantes se toman automáticamente de Plantilla; no hace falta darlos de alta aparte.',
      'Cada ganador de un sorteo se excluye automáticamente de futuros sorteos (motivo "Ganador sorteo"), sin necesidad de hacerlo a mano.',
      'También se pueden añadir exclusiones manuales a personas concretas (motivo "Manual"), buscándolas por nombre o número de empleado.',
      'Una persona con exclusión activa (manual o por haber ganado antes) no entra en el sorteo hasta que se elimine esa exclusión.',
    ],
  },
  {
    title: 'Cómo funciona el sorteo',
    items: [
      'Antes de sortear, la app comprueba que haya título, fecha, un nº de ganadores válido y que ese número no supere las personas disponibles (sin exclusión activa).',
      'El sorteo elige al azar, sin repetición, tantas personas como ganadores se hayan indicado, únicamente entre las personas disponibles.',
      'El resultado queda guardado en el histórico con la fecha, el título y la posición de cada ganador.',
    ],
  },
  {
    title: 'Eliminar un sorteo del histórico',
    items: [
      'Al borrar un sorteo se puede elegir si también se liberan las exclusiones de sus ganadores (para que vuelvan a poder participar) o si se mantienen esas exclusiones aunque se borre el sorteo.',
    ],
  },
  {
    title: 'Uso recomendado',
    items: [
      'Define título, fecha y número de ganadores antes de ejecutar el sorteo.',
      'Revisa las exclusiones activas antes de sortear para evitar resultados no deseados.',
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
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const isActionDisabled = busyAction !== null;

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
    setDraft((currentDraft) => ({ ...currentDraft, [key]: value }));
  };

  const handleDraw = () => {
    const validation = validateSorteosDraft(draft, people, exclusions);
    if (!validation.valid) {
      setErrors(validation.errors);
      return;
    }

    void (async () => {
      setBusyAction('draw');
      try {
        const result = await withSharedModuleLocks(
          [{ module: 'sorteos', label: 'Sorteos' }],
          () => createDrawWithConcurrencyCheck(draft, people),
        );
        setErrors(result.errors);
        if (result.valid) {
          setDraft({ title: '', date: today, winnersCount: 1 });
        }
      } catch (error) {
        setErrors([error instanceof Error ? error.message : 'No se ha podido realizar el sorteo.']);
      } finally {
        setBusyAction(null);
      }
    })();
  };

  const requestDeleteDraw = (drawId: string) => {
    setPendingConfirmation({ type: 'delete-draw', drawId });
  };

  const requestResetAllExclusions = () => {
    setPendingConfirmation({ type: 'reset-all-exclusions' });
  };

  const cancelConfirmation = () => {
    setPendingConfirmation(null);
  };

  const confirmDeleteDraw = (removeLinkedWinnerExclusions: boolean) => {
    if (pendingConfirmation?.type !== 'delete-draw') {
      return;
    }

    void (async () => {
      setBusyAction('delete-draw');
      try {
        const result = await withSharedModuleLocks(
          [{ module: 'sorteos', label: 'Sorteos' }],
          () => deleteDrawWithConcurrencyCheck(
            pendingConfirmation.drawId,
            removeLinkedWinnerExclusions,
          ),
        );
        if (!result.ok) {
          setErrors([result.message]);
          return;
        }
        setPendingConfirmation(null);
      } catch (error) {
        setErrors([error instanceof Error ? error.message : 'No se ha podido eliminar el sorteo.']);
      } finally {
        setBusyAction(null);
      }
    })();
  };

  const confirmResetAllExclusions = () => {
    void (async () => {
      setBusyAction('reset-all-exclusions');
      try {
        const result = await withSharedModuleLocks(
          [{ module: 'sorteos', label: 'Sorteos' }],
          () => resetAllExclusionsWithConcurrencyCheck(),
        );
        if (!result.ok) {
          setErrors([result.message]);
          return;
        }
        setPendingConfirmation(null);
      } catch (error) {
        setErrors([error instanceof Error ? error.message : 'No se han podido resetear las exclusiones.']);
      } finally {
        setBusyAction(null);
      }
    })();
  };

  return (
    <section
      className="space-y-4 rounded-2xl border border-metro-border bg-metro-surface p-4 shadow-card"
      id="sorteos"
    >
      <PageHeader
        icon={Gift}
        title="Sorteos"
        subtitle="Gestión compacta de sorteos, exclusiones e histórico de resultados."
        helpSections={SORTEOS_HELP_SECTIONS}
        helpSubtitle="Guía rápida de creación de sorteos, exclusiones, ganadores e histórico."
        className="mb-0"
      />

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
              <Input
                className="mt-1 w-full min-w-0"
                onChange={(event) => handleDraftChange('title', event.target.value)}
                disabled={isActionDisabled}
                value={draft.title}
              />
            </label>
            <label className="min-w-0 text-xs font-semibold text-metro-text">
              Fecha
              <Input
                className="mt-1 w-full min-w-0"
                onChange={(event) => handleDraftChange('date', event.target.value)}
                type="date"
                disabled={isActionDisabled}
                value={draft.date}
              />
            </label>
            <label className="min-w-0 text-xs font-semibold text-metro-text">
              Nº ganadores
              <Input
                className="mt-1 w-full min-w-0"
                min="1"
                onChange={(event) => handleDraftChange('winnersCount', Number(event.target.value))}
                type="number"
                disabled={isActionDisabled}
                value={draft.winnersCount}
              />
            </label>
            <ActionButton
              variant="save"
              iconOnly={false}
              className="w-full md:w-auto md:self-end"
              disabled={isActionDisabled}
              onClick={handleDraw}
            >
              <Gift className="h-4 w-4" />
              Sortear
            </ActionButton>
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
                            setBusyAction(`exclude-${person.empleado}`);
                            try {
                              const result = await withSharedModuleLocks(
                                [{ module: 'sorteos', label: 'Sorteos' }],
                                () => addExclusionWithConcurrencyCheck(person),
                              );
                              if (!result.ok) {
                                setErrors([result.message]);
                              }
                            } catch (error) {
                              setErrors([error instanceof Error ? error.message : 'No se ha podido añadir la exclusión.']);
                            } finally {
                              setBusyAction(null);
                            }
                          })();
                        }}
                        disabled={isActionDisabled}
                        type="button"
                      >
                        {busyAction === `exclude-${person.empleado}` ? 'Excluyendo…' : 'Excluir'}
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
                    disabled={isActionDisabled || exclusions.length === 0}
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
                                  setBusyAction(`remove-exclusion-${exclusion.id}`);
                                  try {
                                    const result = await withSharedModuleLocks(
                                      [{ module: 'sorteos', label: 'Sorteos' }],
                                      () => removeExclusionWithConcurrencyCheck(exclusion.id),
                                    );
                                    if (!result.ok) {
                                      setErrors([result.message]);
                                    }
                                  } catch (error) {
                                    setErrors([error instanceof Error ? error.message : 'No se ha podido quitar la exclusión.']);
                                  } finally {
                                    setBusyAction(null);
                                  }
                                })();
                              }}
                              disabled={isActionDisabled}
                              type="button"
                            >
                              {busyAction === `remove-exclusion-${exclusion.id}`
                                ? 'Quitando…'
                                : 'Quitar'}
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
              disabled={isActionDisabled}
              onClick={() => confirmDeleteDraw(true)}
              type="button"
            >
              Eliminar y quitar exclusiones
            </button>
            <button
              className="rounded-lg border border-metro-border px-3 py-2 text-xs font-bold text-metro-text hover:border-metro-red"
              disabled={isActionDisabled}
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
              disabled={isActionDisabled}
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
                                setBusyAction(`reset-draw-exclusions-${draw.id}`);
                                try {
                                  const result = await withSharedModuleLocks(
                                    [{ module: 'sorteos', label: 'Sorteos' }],
                                    () => resetDrawWinnerExclusionsWithConcurrencyCheck(draw.id),
                                  );
                                  if (!result.ok) {
                                    setErrors([result.message]);
                                  }
                                } catch (error) {
                                  setErrors([error instanceof Error ? error.message : 'No se han podido resetear las exclusiones.']);
                                } finally {
                                  setBusyAction(null);
                                }
                              })();
                            }}
                            disabled={isActionDisabled}
                            type="button"
                          >
                            {busyAction === `reset-draw-exclusions-${draw.id}`
                              ? 'Reseteando…'
                              : 'Resetear exclusiones por sorteo'}
                          </button>
                          <button
                            className="inline-flex items-center gap-1 rounded-lg border border-red-400/40 px-2 py-1 text-xs font-semibold text-red-100 hover:border-red-300"
                            disabled={isActionDisabled}
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
