import { appendFileSync, existsSync, statSync, renameSync } from 'node:fs';
import path from 'node:path';

type Pulse = { kind: 'heartbeat' | 'shutdown'; at: number };
const STALL_MS = 15_000;
const CHECK_MS = 2_000;
let lastHeartbeat = Date.now();
let stalled = false;
let receivedHeartbeat = false;
let file = '';

function record(phase: 'stalled' | 'recovered', durationMs: number): void {
  if (!file) return;
  try {
    if (existsSync(file) && statSync(file).size > 256_000) {
      renameSync(file, file + '.previous');
    }
    appendFileSync(file, JSON.stringify({ at: new Date().toISOString(), phase, durationMs, thresholdMs: STALL_MS }) + '\n', 'utf8');
  } catch (error) {
    console.error('[main-watchdog] No se pudo escribir registro local.', error);
  }
}

process.parentPort.on('message', (event: { data: Pulse & { file?: string } }) => {
  const data = event.data;
  if (data.kind === 'shutdown') { process.exit(0); }
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
