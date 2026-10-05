import { useEffect, useState } from 'react';

export type DatabaseConnectivityPhase =
  | 'connected'
  | 'reconnecting'
  | 'syncing'
  | 'recovered';

export interface DatabaseConnectivityState {
  phase: DatabaseConnectivityPhase;
  message: string;
  changedAt: string;
  attempt: number;
}

const CONNECTED_MESSAGE = 'Conexión con la base compartida verificada.';
const listeners = new Set<() => void>();
let recoveredTimer: number | null = null;
let state: DatabaseConnectivityState = {
  phase: 'connected',
  message: CONNECTED_MESSAGE,
  changedAt: new Date().toISOString(),
  attempt: 0,
};

function notify(): void {
  listeners.forEach((listener) => listener());
}

function clearRecoveredTimer(): void {
  if (recoveredTimer !== null && typeof window !== 'undefined') {
    window.clearTimeout(recoveredTimer);
  }
  recoveredTimer = null;
}

export function getDatabaseConnectivityState(): DatabaseConnectivityState {
  return state;
}

export function publishDatabaseConnectivityState(
  phase: DatabaseConnectivityPhase,
  message?: string,
  attempt = phase === 'reconnecting' ? Math.max(1, state.attempt) : 0,
): void {
  clearRecoveredTimer();
  const nextMessage = message?.trim() || (phase === 'connected' ? CONNECTED_MESSAGE : state.message);
  const nextState: DatabaseConnectivityState = {
    phase,
    message: nextMessage,
    changedAt: new Date().toISOString(),
    attempt,
  };

  if (
    state.phase === nextState.phase &&
    state.message === nextState.message &&
    state.attempt === nextState.attempt
  ) {
    return;
  }

  state = nextState;
  notify();

  if (phase === 'recovered' && typeof window !== 'undefined') {
    recoveredTimer = window.setTimeout(() => {
      recoveredTimer = null;
      state = {
        phase: 'connected',
        message: CONNECTED_MESSAGE,
        changedAt: new Date().toISOString(),
        attempt: 0,
      };
      notify();
    }, 3_000);
  }
}

export function subscribeDatabaseConnectivityState(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useDatabaseConnectivityState(): DatabaseConnectivityState {
  const [snapshot, setSnapshot] = useState(getDatabaseConnectivityState);

  useEffect(
    () => subscribeDatabaseConnectivityState(() => setSnapshot(getDatabaseConnectivityState())),
    [],
  );

  return snapshot;
}
