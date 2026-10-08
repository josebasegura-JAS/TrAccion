import { readStorageItem, writeJsonStorageAsync } from '../../../services/persistence';
import type { CoordinationMeeting, CoordinationState } from '../domain/coordinacion';
import { EMPTY_COORDINATION_STATE } from '../domain/coordinacion';

export const LEGACY_COORDINATION_STORAGE_KEY = 'traccion.v1.coordinacion.state';
export const COORDINATION_INDEX_STORAGE_KEY = 'traccion.v1.coordinacion.index';
export const COORDINATION_MEETING_STORAGE_PREFIX = 'traccion.v1.coordinacion.meeting.';

type CoordinationIndex = {
  meetingIds: string[];
  directionTaskIds: string[];
  unionTaskIds: Record<string, string[]>;
  areaTaskIds: Record<string, string[]>;
};

type PersistResult = { ok: boolean; message: string };

type SavedExistingMeeting = {
  key: string;
  previous: CoordinationMeeting;
};

export function coordinationMeetingStorageKey(meetingId: string): string {
  return `${COORDINATION_MEETING_STORAGE_PREFIX}${meetingId}`;
}

function normalizeTargets(value: Partial<CoordinationState>): Pick<CoordinationState, 'directionTaskIds' | 'unionTaskIds' | 'areaTaskIds'> | null {
  if (!Array.isArray(value.directionTaskIds)) return null;
  const unionTaskIds = value.unionTaskIds && typeof value.unionTaskIds === 'object'
    ? Object.fromEntries(Object.entries(value.unionTaskIds).filter((entry): entry is [string, string[]] => Array.isArray(entry[1]) && entry[1].every((id) => typeof id === 'string')))
    : {};
  const areaTaskIds = value.areaTaskIds && typeof value.areaTaskIds === 'object'
    ? Object.fromEntries(Object.entries(value.areaTaskIds).filter((entry): entry is [string, string[]] => Array.isArray(entry[1]) && entry[1].every((id) => typeof id === 'string')))
    : {};
  return { directionTaskIds: value.directionTaskIds, unionTaskIds, areaTaskIds };
}

function parseLegacyState(stored: string | null): CoordinationState | null {
  if (!stored) return null;
  try {
    const parsed: unknown = JSON.parse(stored);
    if (!parsed || typeof parsed !== 'object') return null;
    const candidate = parsed as Partial<CoordinationState>;
    if (!Array.isArray(candidate.meetings)) return null;
    const targets = normalizeTargets(candidate);
    return targets ? { meetings: candidate.meetings, ...targets } : null;
  } catch {
    return null;
  }
}

function parseIndex(stored: string | null): CoordinationIndex | null {
  if (!stored) return null;
  try {
    const parsed: unknown = JSON.parse(stored);
    if (!parsed || typeof parsed !== 'object') return null;
    const candidate = parsed as Partial<CoordinationIndex>;
    if (!Array.isArray(candidate.meetingIds) || !candidate.meetingIds.every((id) => typeof id === 'string')) return null;
    const targets = normalizeTargets(candidate as Partial<CoordinationState>);
    return targets ? { meetingIds: candidate.meetingIds, ...targets } : null;
  } catch {
    return null;
  }
}

export function parseCoordinationMeeting(stored: string | null): CoordinationMeeting | null {
  if (!stored) return null;
  try {
    const parsed: unknown = JSON.parse(stored);
    if (!parsed || typeof parsed !== 'object') return null;
    const candidate = parsed as Partial<CoordinationMeeting>;
    if (typeof candidate.id !== 'string' || !Array.isArray(candidate.points)) return null;
    return candidate as CoordinationMeeting;
  } catch {
    return null;
  }
}

export function readCoordinationState(): CoordinationState {
  const index = parseIndex(readStorageItem(COORDINATION_INDEX_STORAGE_KEY));
  if (index) {
    const meetings = index.meetingIds
      .map((id) => parseCoordinationMeeting(readStorageItem(coordinationMeetingStorageKey(id))))
      .filter((meeting): meeting is CoordinationMeeting => Boolean(meeting));
    return {
      meetings,
      directionTaskIds: index.directionTaskIds,
      unionTaskIds: index.unionTaskIds,
      areaTaskIds: index.areaTaskIds,
    };
  }

  return parseLegacyState(readStorageItem(LEGACY_COORDINATION_STORAGE_KEY)) ?? EMPTY_COORDINATION_STATE;
}

function indexFromState(state: CoordinationState): CoordinationIndex {
  return {
    meetingIds: state.meetings.map((meeting) => meeting.id),
    directionTaskIds: state.directionTaskIds,
    unionTaskIds: state.unionTaskIds,
    areaTaskIds: state.areaTaskIds,
  };
}

function equalJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

async function migrateLegacyState(state: CoordinationState): Promise<PersistResult> {
  // La primera escritura sigue validando el snapshot monolítico antiguo. De este modo
  // la migración no puede arrancar desde una copia obsoleta y pisar cambios remotos.
  const legacyResult = await writeJsonStorageAsync(LEGACY_COORDINATION_STORAGE_KEY, state);
  if (!legacyResult.ok) return { ok: false, message: legacyResult.message };

  for (const meeting of state.meetings) {
    const result = await writeJsonStorageAsync(coordinationMeetingStorageKey(meeting.id), meeting);
    if (!result.ok) return { ok: false, message: result.message };
  }
  const indexResult = await writeJsonStorageAsync(COORDINATION_INDEX_STORAGE_KEY, indexFromState(state));
  return { ok: indexResult.ok, message: indexResult.message };
}

async function rollbackMeetings(saved: SavedExistingMeeting[]): Promise<boolean> {
  let ok = true;
  for (const item of [...saved].reverse()) {
    const result = await writeJsonStorageAsync(item.key, item.previous);
    if (!result.ok) ok = false;
  }
  return ok;
}

export async function persistCoordinationState(next: CoordinationState): Promise<PersistResult> {
  const storedIndex = parseIndex(readStorageItem(COORDINATION_INDEX_STORAGE_KEY));
  if (!storedIndex) return migrateLegacyState(next);

  const current = readCoordinationState();
  const currentById = new Map(current.meetings.map((meeting) => [meeting.id, meeting]));
  const savedExisting: SavedExistingMeeting[] = [];

  for (const meeting of next.meetings) {
    const previous = currentById.get(meeting.id);
    if (previous && equalJson(previous, meeting)) continue;

    const key = coordinationMeetingStorageKey(meeting.id);
    const result = await writeJsonStorageAsync(key, meeting);
    if (!result.ok) {
      if (savedExisting.length > 0) await rollbackMeetings(savedExisting);
      return { ok: false, message: result.message };
    }
    if (previous) savedExisting.push({ key, previous });
  }

  // El índice es la autoridad sobre qué reuniones están activas. Al borrar una
  // reunión no eliminamos físicamente su registro: queda huérfano e inaccesible,
  // evitando que un conflicto posterior deje una eliminación a medias.
  const currentIndex = indexFromState(current);
  const nextIndex = indexFromState(next);
  if (!equalJson(currentIndex, nextIndex)) {
    const result = await writeJsonStorageAsync(COORDINATION_INDEX_STORAGE_KEY, nextIndex);
    if (!result.ok) {
      const rolledBack = await rollbackMeetings(savedExisting);
      return {
        ok: false,
        message: rolledBack
          ? result.message
          : `${result.message} Además, no se ha podido restaurar completamente la reunión previa; recarga Coordinación antes de continuar.`,
      };
    }
  }

  return { ok: true, message: 'Guardado en SQLite.' };
}

export async function persistCoordinationMeeting(meeting: CoordinationMeeting): Promise<PersistResult> {
  const state = readCoordinationState();
  if (!state.meetings.some((candidate) => candidate.id === meeting.id)) {
    return { ok: false, message: 'No se ha encontrado la reunión.' };
  }
  const result = await writeJsonStorageAsync(coordinationMeetingStorageKey(meeting.id), meeting);
  return { ok: result.ok, message: result.message };
}
