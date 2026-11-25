import { createEngineDispatcher, type EngineOperation } from './sqliteEngineTransport.js';
import { verifySqliteIntegrityReadOnly, type ExpectedSqliteIdentity } from './persistence/sqliteIntegrityVerification.js';

const port = process.parentPort;
if (!port) throw new Error('Se requiere utilityProcess.');

const dispatch = createEngineDispatcher(new Map<string, EngineOperation>([
  ['verify-integrity', (file, identity) => {
    if (typeof file !== 'string' || !identity || typeof identity !== 'object') {
      throw new Error('Solicitud de integridad inválida.');
    }
    const expected = identity as ExpectedSqliteIdentity;
    if (expected.environment !== 'test') throw new Error('El motor experimental solo admite bases test.');
    verifySqliteIntegrityReadOnly(file, expected);
    return true;
  }],
]));

port.on('message', (event: { data: unknown }) => {
  if (event.data === 'shutdown') {
    process.exit(0);
  }
  void dispatch(event.data).then((response) => {
    if (response) port.postMessage(response);
  });
});
