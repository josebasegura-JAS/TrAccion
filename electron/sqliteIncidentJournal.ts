import { app } from 'electron';
import { appendFileSync, existsSync, readFileSync, renameSync, statSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export interface SqliteIncidentEvent {
  id: string;
  at: string;
  operation: string;
  phase: 'started' | 'completed' | 'failed' | 'timeout';
  outcome?: string;
}
const MAX_FILE_BYTES = 512 * 1024;
const MAX_READ_EVENTS = 200;
let journalPath: string | null = null;

function filePath(): string {
  if (!journalPath) journalPath = path.join(app.getPath('userData'), 'sqlite-incidents.jsonl');
  return journalPath;
}

function readEvents(): SqliteIncidentEvent[] {
  try {
    if (!existsSync(filePath())) return [];
    return readFileSync(filePath(), 'utf8').split('\n').filter(Boolean).slice(-MAX_READ_EVENTS)
      .flatMap((line) => {
        try {
          const value = JSON.parse(line) as SqliteIncidentEvent;
          return value && typeof value.id === 'string' && typeof value.phase === 'string' ? [value] : [];
        } catch { return []; }
      });
  } catch { return []; }
}

function appendEvent(event: SqliteIncidentEvent): void {
  try {
    const file = filePath();
    if (existsSync(file) && statSync(file).size > MAX_FILE_BYTES) {
      const previous = readEvents().slice(-100);
      const archived = file + '.old';
      try { renameSync(file, archived); } catch { /* preserve original log */ }
      // Previous events remain accessible in the current file after rotation.
      if (!existsSync(file)) previous.forEach((item) => appendFileSync(file, JSON.stringify(item) + '\n'));
    }
    appendFileSync(file, JSON.stringify(event) + '\n');
  } catch (error) {
    console.warn('[sqlite-incident-journal] No se pudo escribir en el registro local.', error);
  }
}

export function beginSqliteWrite(operation: string): string {
  const id = randomUUID();
  appendEvent({ id, at: new Date().toISOString(), operation, phase: 'started' });
  return id;
}

export function finishSqliteWrite(id: string, operation: string, phase: 'completed' | 'failed' | 'timeout', outcome?: string): void {
  appendEvent({ id, at: new Date().toISOString(), operation, phase, outcome: outcome?.slice(0, 500) });
}

export function getSqliteIncidentReport(): { events: SqliteIncidentEvent[]; uncertain: SqliteIncidentEvent[] } {
  const events = readEvents();
  const active = new Map<string, SqliteIncidentEvent>();
  for (const event of events) {
    if (event.phase === 'started') active.set(event.id, event);
    else if (event.phase === 'completed' || event.phase === 'failed') active.delete(event.id);
    else if (event.phase === 'timeout') active.set(event.id, event);
  }
  return { events: events.slice(-40), uncertain: [...active.values()] };
}
