import { appendFileSync, existsSync, statSync, renameSync } from 'node:fs';
import path from 'node:path';

type Pulse =
  | { kind: 'heartbeat' | 'shutdown'; at: number; file?: string }
  | { kind: 'operation'; at: number; phase: 'start' | 'finish'; name: string }
  | { kind: 'network'; at: number; phase: 'online' | 'offline' | 'connection-change' };
const STALL_MS = 15_000;
const CHECK_MS = 2_000;
let lastHeartbeat = Date.now();
let stalled = false;
let receivedHeartbeat = false;
let file = '';
let activeOperation: { name: string; startedAt: number } | null = null;
let lastCompletedOperation: { name: string; endedAt: number } | null = null;
let lastNetworkEvent: { phase: string; at: number } | null = null;

function record(phase: 'stalled' | 'recovered', durationMs: number): void {
  if (!file) return;
  try {
    if (existsSync(file) && statSync(file).size > 256_000) {
      renameSync(file, file + '.previous');
    }
    appendFileSync(file, JSON.stringify({
      at: new Date().toISOString(),
      phase,
      durationMs,
      thresholdMs: STALL_MS,
      activeOperation: activeOperation?.name ?? null,
      activeOperationMs: activeOperation ? Math.max(0, Date.now() - activeOperation.startedAt) : null,
      lastCompletedOperation: lastCompletedOperation?.name ?? null,
      lastCompletedOperationAgeMs: lastCompletedOperation ? Math.max(0, Date.now() - lastCompletedOperation.endedAt) : null,
      networkEvent: lastNetworkEvent?.phase ?? null,
      networkEventAgeMs: lastNetworkEvent ? Math.max(0, Date.now() - lastNetworkEvent.at) : null,
    }) + '\n', 'utf8');
  } catch (error) {
    console.error('[main-watchdog] No se pudo escribir registro local.', error);
  }
}

process.parentPort.on('message', (event: { data: Pulse & { file?: string } }) => {
  const data = event.data;
  if (data.kind === 'shutdown') { process.exit(0); }
  if (data.kind === 'operation') {
    if (data.phase === 'start' && /^[a-z][a-z0-9:-]{0,79}$/.test(data.name)) {
      activeOperation = { name: data.name, startedAt: Date.now() };
    } else if (data.phase === 'finish' && activeOperation?.name === data.name) {
      lastCompletedOperation = { name: data.name, endedAt: Date.now() };
      activeOperation = null;
    }
    return;
  }
  if (data.kind === 'network') {
    lastNetworkEvent = { phase: data.phase, at: Date.now() };
    return;
  }
  if (data.kind !== 'heartbeat') return;
  if (data.file && !file) file = path.join(data.file, 'electron-main-watchdog.jsonl');
  const now = Date.now();
  if (stalled) {
    record('recovered', now - lastHeartbeat);
    stalled = false;
  }
  lastHeartbeat = now;
  receivedHeartbeat = true;
});

setInterval(() => {
  if (!receivedHeartbeat || stalled) return;
  const delayedMs = Date.now() - lastHeartbeat;
  if (delayedMs >= STALL_MS) {
    stalled = true;
    record('stalled', delayedMs);
  }
}, CHECK_MS);
