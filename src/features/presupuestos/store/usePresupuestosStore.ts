import { create } from 'zustand';
import { readStorageItem, writeJsonStorageAsync } from '../../../services/persistence';
import {
  hasPresupuestosSqliteRepository,
  loadPresupuestosFromSqlite,
  savePresupuestosToSqlite,
} from './presupuestosSqliteRepository';
import {
  normalizeBudgetActual,
  normalizeBudgetNumber,
  normalizeBudgetRate,
  validateBudgetActual,
  validateBudgetManualItem,
  validateBudgetScenario,
  validateBudgetTicketGroup,
  type BudgetActual,
  type BudgetManualItem,
  type BudgetScenario,
  type BudgetTicketCalculationType,
  type BudgetTicketGroup,
  type BudgetValidationResult,
} from '../domain/presupuestos';

export const BUDGET_SCENARIOS_STORAGE_KEY = 'traccion.v1.presupuestos.scenarios';
export const BUDGET_MANUAL_ITEMS_STORAGE_KEY = 'traccion.v1.presupuestos.manualItems';
export const BUDGET_TICKET_GROUPS_STORAGE_KEY = 'traccion.v1.presupuestos.ticketGroups';
export const BUDGET_ACTUALS_STORAGE_KEY = 'traccion.v1.presupuestos.actuals';

export type BudgetScenarioDraft = Pick<BudgetScenario, 'name' | 'year' | 'ticketAmount' | 'notes'>;
export type BudgetManualItemDraft = Pick<BudgetManualItem, 'scenarioId' | 'concept' | 'category' | 'monthlyAmount' | 'annualAmount' | 'notes'>;
export type BudgetTicketGroupDraft = Pick<BudgetTicketGroup, 'scenarioId' | 'name' | 'peopleCount' | 'ticketCalendar' | 'absenceRate' | 'ticketAmount' | 'calculationType' | 'manualTickets' | 'annualTickets' | 'manualMonthlyAmount' | 'notes'>;
export type BudgetActualDraft = Pick<BudgetActual, 'year' | 'month' | 'block' | 'concept' | 'amount' | 'notes'>;

interface PresupuestosStoreState {
  scenarios: BudgetScenario[];
  manualItems: BudgetManualItem[];
  ticketGroups: BudgetTicketGroup[];
  actuals: BudgetActual[];
  activeScenarioId: string | null;
  sqliteUpdatedAt: string | null;
  load: () => void;
  reloadFromStorage: () => void;
  setActiveScenario: (scenarioId: string) => void;
  upsertScenario: (draft: BudgetScenarioDraft, scenarioId?: string) => BudgetValidationResult & { id?: string };
  duplicateScenario: (scenarioId: string) => string | null;
  removeScenario: (scenarioId: string) => void;
  upsertManualItem: (draft: BudgetManualItemDraft, itemId?: string) => BudgetValidationResult & { id?: string };
  removeManualItem: (itemId: string) => void;
  upsertTicketGroup: (draft: BudgetTicketGroupDraft, groupId?: string) => BudgetValidationResult & { id?: string };
  removeTicketGroup: (groupId: string) => void;
  upsertActual: (draft: BudgetActualDraft, actualId?: string) => BudgetValidationResult & { id?: string };
  removeActual: (actualId: string) => void;
}

function nowIso(): string {
  return new Date().toISOString();
}

function createId(prefix: string): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${prefix}-${Date.now()}`;
}

function readJsonArray<T>(storageKey: string, guard: (value: unknown) => value is T): T[] {
  const stored = readStorageItem(storageKey);
  if (!stored) return [];
  try {
    const parsed: unknown = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed.filter(guard) : [];
  } catch {
    return [];
  }
}

async function persist(state: Pick<PresupuestosStoreState, 'scenarios' | 'manualItems' | 'ticketGroups' | 'actuals'>): Promise<void> {
  const writes = [
    [BUDGET_SCENARIOS_STORAGE_KEY, state.scenarios],
    [BUDGET_MANUAL_ITEMS_STORAGE_KEY, state.manualItems],
    [BUDGET_TICKET_GROUPS_STORAGE_KEY, state.ticketGroups],
    [BUDGET_ACTUALS_STORAGE_KEY, state.actuals],
  ] as const;

  for (const [storageKey, value] of writes) {
    const result = await writeJsonStorageAsync(storageKey, value);
    if (!result.ok) {
      throw new Error(result.message);
    }
  }
}

type PresupuestosPatch = Partial<Pick<PresupuestosStoreState, 'scenarios' | 'manualItems' | 'ticketGroups' | 'actuals' | 'activeScenarioId' | 'sqliteUpdatedAt'>>;

function commitPresupuestosState(
  set: (partial: PresupuestosPatch) => void,
  nextState: Pick<PresupuestosStoreState, 'scenarios' | 'manualItems' | 'ticketGroups' | 'actuals'>,
  patch: PresupuestosPatch,
  expectedSqliteUpdatedAt: string | null,
): void {
  void (async () => {
    try {
      const sqliteResult = hasPresupuestosSqliteRepository()
        ? await savePresupuestosToSqlite(nextState, expectedSqliteUpdatedAt)
        : null;
      if (sqliteResult && !sqliteResult.ok) {
        console.warn(sqliteResult.message);
        return;
      }
      await persist(nextState);
      set({ ...patch, sqliteUpdatedAt: sqliteResult?.currentUpdatedAt ?? expectedSqliteUpdatedAt });
    } catch (error) {
      console.warn('Presupuestos no guardado en SQLite.', error);
    }
  })();
}

function isScenario(value: unknown): value is BudgetScenario {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<BudgetScenario>;
  return typeof candidate.id === 'string' && typeof candidate.name === 'string' && typeof candidate.year === 'number' && typeof candidate.ticketAmount === 'number' && typeof candidate.notes === 'string' && typeof candidate.createdAt === 'string' && typeof candidate.updatedAt === 'string';
}

function isManualItem(value: unknown): value is BudgetManualItem {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<BudgetManualItem>;
  return typeof candidate.id === 'string' && typeof candidate.scenarioId === 'string' && typeof candidate.concept === 'string' && typeof candidate.category === 'string' && typeof candidate.monthlyAmount === 'number' && typeof candidate.annualAmount === 'number';
}

function isBudgetTicketCalculationType(value: unknown): value is BudgetTicketCalculationType {
  return value === 'calendar_people' || value === 'manual_tickets' || value === 'annual_tickets' || value === 'manual_amount';
}

function isTicketGroup(value: unknown): value is BudgetTicketGroup {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<BudgetTicketGroup>;
  return typeof candidate.id === 'string' && typeof candidate.scenarioId === 'string' && typeof candidate.name === 'string' && isBudgetTicketCalculationType(candidate.calculationType);
}

function isActual(value: unknown): value is BudgetActual {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<BudgetActual>;
  return typeof candidate.id === 'string' && typeof candidate.year === 'number' && typeof candidate.month === 'number' && typeof candidate.block === 'string' && typeof candidate.concept === 'string' && typeof candidate.amount === 'number';
}

function normalizeScenarioDraft(draft: BudgetScenarioDraft): BudgetScenarioDraft {
  return {
    name: draft.name.trim(),
    year: Math.trunc(normalizeBudgetNumber(draft.year)),
    ticketAmount: normalizeBudgetNumber(draft.ticketAmount),
    notes: draft.notes.trim(),
  };
}

function normalizeManualDraft(draft: BudgetManualItemDraft): BudgetManualItemDraft {
  return {
    scenarioId: draft.scenarioId,
    concept: draft.concept.trim(),
    category: draft.category.trim(),
    monthlyAmount: normalizeBudgetNumber(draft.monthlyAmount),
    annualAmount: normalizeBudgetNumber(draft.annualAmount),
    notes: draft.notes.trim(),
  };
}

function normalizeTicketDraft(draft: BudgetTicketGroupDraft): BudgetTicketGroupDraft {
  return {
    ...draft,
    name: draft.name.trim(),
    ticketCalendar: draft.ticketCalendar.trim(),
    peopleCount: Math.max(0, normalizeBudgetNumber(draft.peopleCount)),
    absenceRate: normalizeBudgetRate(draft.absenceRate),
    ticketAmount: normalizeBudgetNumber(draft.ticketAmount),
    manualTickets: Math.max(0, normalizeBudgetNumber(draft.manualTickets)),
    annualTickets: Math.max(0, normalizeBudgetNumber(draft.annualTickets)),
    manualMonthlyAmount: Math.max(0, normalizeBudgetNumber(draft.manualMonthlyAmount)),
    notes: draft.notes.trim(),
  };
}

function loadState(): Pick<PresupuestosStoreState, 'scenarios' | 'manualItems' | 'ticketGroups' | 'actuals' | 'activeScenarioId' | 'sqliteUpdatedAt'> {
  const scenarios = readJsonArray(BUDGET_SCENARIOS_STORAGE_KEY, isScenario);
  return {
    scenarios,
    manualItems: readJsonArray(BUDGET_MANUAL_ITEMS_STORAGE_KEY, isManualItem),
    ticketGroups: readJsonArray(BUDGET_TICKET_GROUPS_STORAGE_KEY, isTicketGroup),
    actuals: readJsonArray(BUDGET_ACTUALS_STORAGE_KEY, isActual),
    activeScenarioId: scenarios.find((scenario) => !scenario.deletedAt)?.id ?? null,
    sqliteUpdatedAt: null,
  };
}

async function loadStateFromSqlite(): Promise<Pick<PresupuestosStoreState, 'scenarios' | 'manualItems' | 'ticketGroups' | 'actuals' | 'activeScenarioId' | 'sqliteUpdatedAt'> | null> {
  const sqliteState = await loadPresupuestosFromSqlite();
  if (!sqliteState) {
    return null;
  }

  return {
    scenarios: sqliteState.scenarios,
    manualItems: sqliteState.manualItems,
    ticketGroups: sqliteState.ticketGroups,
    actuals: sqliteState.actuals,
    activeScenarioId: sqliteState.scenarios.find((scenario) => !scenario.deletedAt)?.id ?? null,
    sqliteUpdatedAt: sqliteState.updatedAt,
  };
}

function areBudgetCollectionsEquivalent(
  left: Pick<PresupuestosStoreState, 'scenarios' | 'manualItems' | 'ticketGroups' | 'actuals'>,
  right: Pick<PresupuestosStoreState, 'scenarios' | 'manualItems' | 'ticketGroups' | 'actuals'>,
): boolean {
  return (
    JSON.stringify(left.scenarios) === JSON.stringify(right.scenarios) &&
    JSON.stringify(left.manualItems) === JSON.stringify(right.manualItems) &&
    JSON.stringify(left.ticketGroups) === JSON.stringify(right.ticketGroups) &&
    JSON.stringify(left.actuals) === JSON.stringify(right.actuals)
  );
}

export const usePresupuestosStore = create<PresupuestosStoreState>((set, get) => ({
  scenarios: [],
  manualItems: [],
  ticketGroups: [],
  actuals: [],
  activeScenarioId: null,
  sqliteUpdatedAt: null,
  load: () => {
    set(loadState());
    void loadStateFromSqlite()
      .then((sqliteState) => {
        if (sqliteState) {
          set(sqliteState);
        }
      })
      .catch((error) => console.warn('Presupuestos no cargado desde SQLite.', error));
  },
  reloadFromStorage: () => {
    // Compara las colecciones de datos (no activeScenarioId, que es selección
    // de UI, ni sqliteUpdatedAt, que es metadato técnico) antes de actualizar
    // el estado, para no perder la selección activa del usuario ni provocar
    // un re-render cuando el contenido normalizado no ha cambiado realmente.
    const applyIfChanged = (
      nextState: Pick<PresupuestosStoreState, 'scenarios' | 'manualItems' | 'ticketGroups' | 'actuals' | 'activeScenarioId' | 'sqliteUpdatedAt'>,
    ) => {
      const current = get();
      if (areBudgetCollectionsEquivalent(current, nextState)) {
        return;
      }

      const currentActiveScenarioStillExists = current.activeScenarioId
        ? nextState.scenarios.some(
            (scenario) => scenario.id === current.activeScenarioId && !scenario.deletedAt,
          )
        : false;

      set({
        ...nextState,
        activeScenarioId: currentActiveScenarioStillExists
          ? current.activeScenarioId
          : nextState.activeScenarioId,
      });
    };

    // Si hay repositorio SQLite disponible, es la única fuente de verdad: no
    // se aplica primero la lectura legacy de localStorage, que podría estar
    // vacía o desactualizada y pisaría momentáneamente el estado correcto.
    if (hasPresupuestosSqliteRepository()) {
      void loadStateFromSqlite()
        .then((sqliteState) => {
          if (sqliteState) {
            applyIfChanged(sqliteState);
          }
        })
        .catch((error) => console.warn('Presupuestos no recargado desde SQLite.', error));
      return;
    }

    applyIfChanged(loadState());
  },
  setActiveScenario: (scenarioId) => set({ activeScenarioId: scenarioId }),
  upsertScenario: (draft, scenarioId) => {
    const normalized = normalizeScenarioDraft(draft);
    const validation = validateBudgetScenario(normalized);
    if (!validation.valid) return validation;
    const id = scenarioId ?? createId('budget-scenario');
    const timestamp = nowIso();
    const state = get();
    const previous = state.scenarios.find((scenario) => scenario.id === id);
    const scenario: BudgetScenario = {
      id,
      ...normalized,
      createdAt: previous?.createdAt ?? timestamp,
      updatedAt: timestamp,
      deletedAt: previous?.deletedAt ?? null,
    };
    const scenarios = previous
      ? state.scenarios.map((item) => (item.id === id ? scenario : item))
      : [...state.scenarios, scenario];
    commitPresupuestosState(set, { ...state, scenarios }, { scenarios, activeScenarioId: id }, state.sqliteUpdatedAt);
    return { ...validation, id };
  },
  duplicateScenario: (scenarioId) => {
    const id = createId('budget-scenario');
    const timestamp = nowIso();
    const state = get();
    const scenario = state.scenarios.find((item) => item.id === scenarioId && !item.deletedAt);
    if (!scenario) return null;
    const duplicate: BudgetScenario = {
      ...scenario,
      id,
      name: `${scenario.name} (copia)`,
      createdAt: timestamp,
      updatedAt: timestamp,
      deletedAt: null,
    };
    const manualItems = [
      ...state.manualItems,
      ...state.manualItems
        .filter((item) => item.scenarioId === scenarioId && !item.deletedAt)
        .map((item) => ({
          ...item,
          id: createId('budget-manual'),
          scenarioId: id,
          createdAt: timestamp,
          updatedAt: timestamp,
          deletedAt: null,
        })),
    ];
    const ticketGroups = [
      ...state.ticketGroups,
      ...state.ticketGroups
        .filter((group) => group.scenarioId === scenarioId && !group.deletedAt)
        .map((group) => ({
          ...group,
          id: createId('budget-ticket'),
          scenarioId: id,
          createdAt: timestamp,
          updatedAt: timestamp,
          deletedAt: null,
        })),
    ];
    const scenarios = [...state.scenarios, duplicate];
    commitPresupuestosState(
      set,
      { ...state, scenarios, manualItems, ticketGroups },
      { scenarios, manualItems, ticketGroups, activeScenarioId: id },
      state.sqliteUpdatedAt,
    );
    return id;
  },
  removeScenario: (scenarioId) => {
    const state = get();
    const timestamp = nowIso();
    const scenarios = state.scenarios.map((scenario) =>
      scenario.id === scenarioId ? { ...scenario, deletedAt: timestamp, updatedAt: timestamp } : scenario,
    );
    commitPresupuestosState(
      set,
      { ...state, scenarios },
      { scenarios, activeScenarioId: scenarios.find((scenario) => !scenario.deletedAt)?.id ?? null },
      state.sqliteUpdatedAt,
    );
  },
  upsertManualItem: (draft, itemId) => {
    const normalized = normalizeManualDraft(draft);
    const validation = validateBudgetManualItem(normalized);
    if (!validation.valid) return validation;
    const id = itemId ?? createId('budget-manual');
    const timestamp = nowIso();
    const state = get();
    const previous = state.manualItems.find((item) => item.id === id);
    const displayOrder =
      previous?.displayOrder ?? state.manualItems.filter((item) => item.scenarioId === draft.scenarioId).length + 1;
    const manualItem: BudgetManualItem = {
      id,
      ...normalized,
      displayOrder,
      createdAt: previous?.createdAt ?? timestamp,
      updatedAt: timestamp,
      deletedAt: previous?.deletedAt ?? null,
    };
    const manualItems = previous
      ? state.manualItems.map((item) => (item.id === id ? manualItem : item))
      : [...state.manualItems, manualItem];
    commitPresupuestosState(set, { ...state, manualItems }, { manualItems }, state.sqliteUpdatedAt);
    return { ...validation, id };
  },
  removeManualItem: (itemId) => {
    const state = get();
    const timestamp = nowIso();
    const manualItems = state.manualItems.map((item) =>
      item.id === itemId ? { ...item, deletedAt: timestamp, updatedAt: timestamp } : item,
    );
    commitPresupuestosState(set, { ...state, manualItems }, { manualItems }, state.sqliteUpdatedAt);
  },
  upsertTicketGroup: (draft, groupId) => {
    const normalized = normalizeTicketDraft(draft);
    const validation = validateBudgetTicketGroup(normalized);
    if (!validation.valid) return validation;
    const id = groupId ?? createId('budget-ticket');
    const timestamp = nowIso();
    const state = get();
    const previous = state.ticketGroups.find((group) => group.id === id);
    const displayOrder =
      previous?.displayOrder ?? state.ticketGroups.filter((group) => group.scenarioId === draft.scenarioId).length + 1;
    const ticketGroup: BudgetTicketGroup = {
      id,
      ...normalized,
      displayOrder,
      createdAt: previous?.createdAt ?? timestamp,
      updatedAt: timestamp,
      deletedAt: previous?.deletedAt ?? null,
    };
    const ticketGroups = previous
      ? state.ticketGroups.map((group) => (group.id === id ? ticketGroup : group))
      : [...state.ticketGroups, ticketGroup];
    commitPresupuestosState(set, { ...state, ticketGroups }, { ticketGroups }, state.sqliteUpdatedAt);
    return { ...validation, id };
  },
  removeTicketGroup: (groupId) => {
    const state = get();
    const timestamp = nowIso();
    const ticketGroups = state.ticketGroups.map((group) =>
      group.id === groupId ? { ...group, deletedAt: timestamp, updatedAt: timestamp } : group,
    );
    commitPresupuestosState(set, { ...state, ticketGroups }, { ticketGroups }, state.sqliteUpdatedAt);
  },
  upsertActual: (draft, actualId) => {
    const validation = validateBudgetActual(draft);
    if (!validation.valid) return validation;
    const id = actualId ?? createId('budget-actual');
    const timestamp = nowIso();
    const state = get();
    const previous = state.actuals.find((actual) => actual.id === id);
    const actual = normalizeBudgetActual({
      id,
      ...draft,
      createdAt: previous?.createdAt ?? timestamp,
      updatedAt: timestamp,
      deletedAt: previous?.deletedAt ?? null,
    });
    const actuals = previous
      ? state.actuals.map((item) => (item.id === id ? actual : item))
      : [...state.actuals, actual];
    commitPresupuestosState(set, { ...state, actuals }, { actuals }, state.sqliteUpdatedAt);
    return { ...validation, id };
  },
  removeActual: (actualId) => {
    const state = get();
    const timestamp = nowIso();
    const actuals = state.actuals.map((actual) =>
      actual.id === actualId ? { ...actual, deletedAt: timestamp, updatedAt: timestamp } : actual,
    );
    commitPresupuestosState(set, { ...state, actuals }, { actuals }, state.sqliteUpdatedAt);
  },
}));
