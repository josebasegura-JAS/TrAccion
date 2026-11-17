/**
 * PR506: actual Electron utilityProcess transport for the supervised writer.
 *
 * Experimental adapter only. No import from main.ts, startup.ts, renderer IPC
 * or sqlitePersistence.ts. The caller must first complete the coordinator's
 * freeze/drain/close handoff and own the durable process store.
 *
 * A kill request is NOT proof of child EXIT. This adapter forwards only the
 * native Electron 'exit' event to the supervisor.
 */
import { utilityProcess } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SupervisedDetachedChild } from './supervisedDetachedWriterSession.js';

const directory = path.dirname(fileURLToPath(import.meta.url));

export function createExperimentalElectronDetachedWriterChild(): SupervisedDetachedChild {
  const child = utilityProcess.fork(path.join(directory, 'detachedCriteriaWriterWorker.js'), [], {
    serviceName: 'TrAcción SQLite isolated writer (experimental)',
  });
  return {
    postMessage(message) {
      child.postMessage(message);
    },
    onMessage(handler) {
      child.on('message', (event) => handler(event.data));
    },
    onExit(handler) {
      child.on('exit', handler);
    },
    kill() {
      // Electron returns whether kill was requested; the supervisor must
      // still receive a distinct native exit event before any reconciliation.
      child.kill();
    },
  };
}
