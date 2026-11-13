/**
 * PR9C · utilityProcess experimental, sin acceso a SQLite ni a la red.
 * Demuestra que el proceso auxiliar responde a mensajes y puede finalizar.
 */
import { isSqliteWorkerProbeRequest } from './sqliteWorkerProbeProtocol.js';

const port = process.parentPort;
if (!port) {
  throw new Error('sqliteWorkerProbe debe iniciarse desde Electron utilityProcess.');
}

port.on('message', (event: { data: unknown }) => {
  const message = event.data;
  if (!isSqliteWorkerProbeRequest(message)) return;
  if (message.kind === 'probe:shutdown') {
    process.exit(0);
  }
  if (message.kind === 'probe:ping') {
    port.postMessage({ kind: 'probe:pong', id: message.id });
  }
});
port.postMessage({ kind: 'probe:ready' });
