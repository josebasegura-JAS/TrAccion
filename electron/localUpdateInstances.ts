import { createHash, randomUUID } from 'node:crypto';
import { createServer, connect, type Server } from 'node:net';
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

type PeerMessage =
  | { kind: 'prepare'; token: string; secret: string }
  | { kind: 'close'; token: string; secret: string };
type PeerResponse = { ok: boolean; message: string };
type PeerRegistration = { pid: number; port: number; secret: string; executablePath: string };

const LOCAL_PEER_TIMEOUT_MS = 5_000;
const EXIT_TIMEOUT_MS = 60_000;
const POLL_EXIT_MS = 250;

function currentExecutablePath(): string {
  return path.resolve(process.env.PORTABLE_EXECUTABLE_FILE ?? process.execPath).toLocaleLowerCase('en-US');
}

function peerDirectory(): string {
  const executableKey = createHash('sha256').update(currentExecutablePath()).digest('hex').slice(0, 24);
  return path.join(tmpdir(), 'traccion-update-local-peers', executableKey);
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

function sendMessage(peer: PeerRegistration, message: PeerMessage): Promise<PeerResponse> {
  return new Promise((resolve, reject) => {
    const socket = connect(peer.port, '127.0.0.1');
    let received = '';
    let completed = false;
    const fail = (error: Error) => {
      if (completed) return;
      completed = true;
      socket.destroy();
      reject(error);
    };
    socket.setTimeout(LOCAL_PEER_TIMEOUT_MS, () => fail(new Error('La otra instancia no respondió a tiempo.')));
    socket.on('error', fail);
    socket.on('connect', () => socket.write(JSON.stringify(message) + '\n'));
    socket.on('data', (part: Buffer) => {
      received += part.toString('utf8');
      if (received.length > 4096) return fail(new Error('Respuesta local demasiado larga.'));
      const end = received.indexOf('\n');
      if (end === -1 || completed) return;
      completed = true;
      socket.end();
      try {
        const result = JSON.parse(received.slice(0, end)) as PeerResponse;
        if (typeof result.ok !== 'boolean' || typeof result.message !== 'string') {
          throw new Error('Respuesta local inválida.');
        }
        resolve(result);
      } catch (error) {
        reject(error);
      }
    });
  });
}

async function getOtherLocalPeers(): Promise<PeerRegistration[]> {
  let names: string[];
  try {
    names = await readdir(peerDirectory());
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  const peers: PeerRegistration[] = [];
  for (const name of names) {
    if (!/^instance-\d+-[a-f0-9-]+\.json$/.test(name)) continue;
    const filePath = path.join(peerDirectory(), name);
    let registration: PeerRegistration;
    try {
      registration = JSON.parse(await readFile(filePath, 'utf8')) as PeerRegistration;
    } catch {
      continue;
    }
    if (
      !Number.isSafeInteger(registration.pid) ||
      registration.pid <= 0 ||
      !Number.isSafeInteger(registration.port) ||
      registration.port <= 0 ||
      registration.port > 65535 ||
      typeof registration.secret !== 'string' ||
      !registration.secret ||
      registration.executablePath !== currentExecutablePath()
    ) continue;
    if (registration.pid === process.pid) continue;
    if (!isAlive(registration.pid)) {
      await rm(filePath, { force: true }).catch(() => undefined);
      continue;
    }
    peers.push(registration);
  }
  return peers;
}

async function waitUntilExited(pid: number): Promise<boolean> {
  const started = Date.now();
  while (isAlive(pid)) {
    if (Date.now() - started >= EXIT_TIMEOUT_MS) return false;
    await new Promise((resolve) => setTimeout(resolve, POLL_EXIT_MS));
  }
  return true;
}

/**
 * Dos fases: todas las instancias deben aprobar el cierre ANTES de pedir a
 * ninguna que salga. Si alguna contiene cambios pendientes, no se actualiza.
 * Nunca se usa taskkill ni se cierran procesos de otros equipos.
 */
export async function closeOtherLocalInstancesForUpdate(): Promise<PeerResponse> {
  if (process.platform !== 'win32' || !process.env.PORTABLE_EXECUTABLE_FILE) {
    return { ok: true, message: 'No es necesaria coordinación adicional.' };
  }

  const peers = await getOtherLocalPeers();
  if (peers.length === 0) return { ok: true, message: 'Sin instancias locales adicionales registradas.' };
  const token = randomUUID();
  for (const peer of peers) {
    let response: PeerResponse;
    try {
      response = await sendMessage(peer, { kind: 'prepare', token, secret: peer.secret });
    } catch (error) {
      return { ok: false, message: `No se ha podido contactar con TrAcción (PID ${peer.pid}). Cierra esa instancia manualmente antes de actualizar. ${String(error)}` };
    }
    if (!response.ok) {
      return { ok: false, message: `Actualización cancelada: la instancia ${peer.pid} no puede cerrarse. ${response.message}` };
    }
  }

  for (const peer of peers) {
    try {
      const result = await sendMessage(peer, { kind: 'close', token, secret: peer.secret });
      if (!result.ok) {
        return { ok: false, message: `La instancia ${peer.pid} no aceptó el cierre: ${result.message}` };
      }
    } catch (error) {
      return { ok: false, message: `No se ha confirmado el cierre de la instancia ${peer.pid}: ${String(error)}` };
    }
  }

  const exited = await Promise.all(peers.map((peer) => waitUntilExited(peer.pid)));
  if (exited.some((value) => !value)) {
    return { ok: false, message: 'Alguna instancia local no ha completado su cierre ordenado. La actualización no continuará.' };
  }
  return { ok: true, message: 'Instancias locales cerradas ordenadamente.' };
}

export async function startLocalInstanceUpdateListener(
  canClose: () => Promise<boolean>,
  close: () => void,
): Promise<() => void> {
  if (process.platform !== 'win32' || !process.env.PORTABLE_EXECUTABLE_FILE) return () => undefined;

  const secret = randomUUID();
  const fileName = `instance-${process.pid}-${secret}.json`;
  const filePath = path.join(peerDirectory(), fileName);
  const tmpPath = `${filePath}.tmp`;
  let preparedToken: string | null = null;
  let preparedAt = 0;
  let closing = false;

  const server: Server = createServer((socket) => {
    socket.setTimeout(LOCAL_PEER_TIMEOUT_MS, () => socket.destroy());
    let received = '';
    socket.on('data', (part: Buffer) => {
      received += part.toString('utf8');
      if (received.length > 4096) return socket.destroy();
      const end = received.indexOf('\n');
      if (end < 0) return;
      let request: PeerMessage;
      try {
        request = JSON.parse(received.slice(0, end)) as PeerMessage;
      } catch {
        socket.end(JSON.stringify({ ok: false, message: 'Solicitud local inválida.' }) + '\n');
        return;
      }
      if (request.secret !== secret || typeof request.token !== 'string') {
        socket.end(JSON.stringify({ ok: false, message: 'Solicitud local no autorizada.' }) + '\n');
        return;
      }
      if (request.kind === 'prepare' && !closing) {
        void canClose().then((approved) => {
          if (approved) {
            preparedToken = request.token;
            preparedAt = Date.now();
          }
          socket.end(JSON.stringify({ ok: approved, message: approved ? 'Cierre permitido.' : 'Hay cambios pendientes o se canceló el cierre.' }) + '\n');
        }).catch(() => socket.end(JSON.stringify({ ok: false, message: 'No se pudo confirmar el estado de edición.' }) + '\n'));
      } else if (request.kind === 'close' && request.token === preparedToken && Date.now() - preparedAt < 30_000) {
        closing = true;
        socket.end(JSON.stringify({ ok: true, message: 'Iniciando cierre ordenado.' }) + '\n', () => setImmediate(close));
      } else {
        socket.end(JSON.stringify({ ok: false, message: 'Cierre no preparado o autorización caducada.' }) + '\n');
      }
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject);
      resolve();
    });
  });
  try {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Puerto local no disponible.');
    await mkdir(peerDirectory(), { recursive: true });
    await writeFile(tmpPath, JSON.stringify({
      pid: process.pid,
      port: address.port,
      secret,
      executablePath: currentExecutablePath(),
    } satisfies PeerRegistration), 'utf8');
    await rename(tmpPath, filePath);
  } catch (error) {
    server.close();
    await rm(tmpPath, { force: true }).catch(() => undefined);
    throw error;
  }

  return () => {
    server.close();
    void rm(filePath, { force: true });
  };
}
