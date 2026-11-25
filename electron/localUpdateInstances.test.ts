import { createHash, randomUUID } from 'node:crypto';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { connect, createServer, type Server } from 'node:net';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { closeOtherLocalInstancesForUpdate, startLocalInstanceUpdateListener } from './localUpdateInstances.js';

const windowsIt = process.platform === 'win32' ? it : it.skip;
const originalPortablePath = process.env.PORTABLE_EXECUTABLE_FILE;
let child: ChildProcessWithoutNullStreams | null = null;
let server: Server | null = null;
let folder: string | null = null;

afterEach(async () => {
  if (originalPortablePath === undefined) delete process.env.PORTABLE_EXECUTABLE_FILE;
  else process.env.PORTABLE_EXECUTABLE_FILE = originalPortablePath;
  server?.close();
  server = null;
  if (child && child.exitCode === null) child.kill();
  child = null;
  if (folder) await rm(folder, { recursive: true, force: true });
  folder = null;
});

async function prepareFakePeer(approve: boolean) {
  folder = await mkdtemp(path.join(tmpdir(), 'traccion-peer-test-'));
  const exe = path.join(folder, 'Traccion-test.exe').toLocaleLowerCase('en-US');
  process.env.PORTABLE_EXECUTABLE_FILE = exe;

  child = spawn(process.execPath, ['-e', [
    "process.stdin.resume();",
    "process.stdin.on('data', () => process.exit(0));",
    "setInterval(() => {}, 1000);",
  ].join('')]);
  if (!child.pid) throw new Error('No se pudo abrir el proceso de prueba.');

  const commands: string[] = [];
  server = createServer((socket) => {
    let buffer = '';
    socket.on('data', (data: Buffer) => {
      buffer += data.toString('utf8');
      if (!buffer.includes('\n')) return;
      const request = JSON.parse(buffer.split('\n')[0]) as { kind: string };
      commands.push(request.kind);
      if (request.kind === 'prepare') {
        socket.end(JSON.stringify({ ok: approve, message: approve ? 'Preparado.' : 'Cambios sin guardar.' }) + '\n');
      } else if (request.kind === 'close' && approve) {
        socket.end(JSON.stringify({ ok: true, message: 'Cerrando.' }) + '\n', () => child?.stdin.write('close'));
      } else {
        socket.end(JSON.stringify({ ok: false, message: 'No permitido.' }) + '\n');
      }
    });
  });
  await new Promise<void>((resolve, reject) => {
    server!.once('error', reject);
    server!.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No se pudo crear el servidor local.');
  const hash = createHash('sha256').update(exe).digest('hex').slice(0, 24);
  const dir = path.join(tmpdir(), 'traccion-update-local-peers', hash);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, `instance-${child.pid}-${randomUUID()}.json`), JSON.stringify({
    pid: child.pid,
    port: address.port,
    secret: randomUUID(),
    executablePath: exe,
  }));
  return { commands, directory: dir };
}

describe('actualizador: cierre de instancias locales', () => {
  windowsIt('cierra la otra instancia ordenadamente antes de permitir instalar', async () => {
    const peer = await prepareFakePeer(true);

    const result = await closeOtherLocalInstancesForUpdate();

    expect(result.ok).toBe(true);
    expect(peer.commands).toEqual(['prepare', 'close']);
    await rm(peer.directory, { recursive: true, force: true });
  }, 15_000);

  windowsIt('si una instancia tiene cambios pendientes, no envía la orden de cierre', async () => {
    const peer = await prepareFakePeer(false);

    const result = await closeOtherLocalInstancesForUpdate();

    expect(result.ok).toBe(false);
    expect(peer.commands).toEqual(['prepare']);
    await rm(peer.directory, { recursive: true, force: true });
  }, 15_000);
});

describe('revalidación real del listener local', () => {
  windowsIt('rechaza cierre si aparecen cambios después de preparar y consume la autorización', async () => {
    folder = await mkdtemp(path.join(tmpdir(), 'traccion-peer-recheck-'));
    const exe = path.join(folder, 'Traccion-test.exe').toLocaleLowerCase('en-US');
    process.env.PORTABLE_EXECUTABLE_FILE = exe;
    const hash = createHash('sha256').update(exe).digest('hex').slice(0, 24);
    const directory = path.join(tmpdir(), 'traccion-update-local-peers', hash);
    const close = vi.fn();
    const finalCheck = vi.fn(async () => false);
    const stop = await startLocalInstanceUpdateListener(async () => true, close, finalCheck);
    try {
      const names = await readdir(directory);
      const registration = JSON.parse(await readFile(path.join(directory, names[0]), 'utf8')) as { port: number; secret: string };
      async function request(kind: string, token: string): Promise<{ ok: boolean }> {
        return new Promise((resolve, reject) => {
          const socket = connect(registration.port, '127.0.0.1');
          let data = '';
          socket.setTimeout(5000, () => socket.destroy(new Error('timeout')));
          socket.on('error', reject);
          socket.on('connect', () => socket.write(JSON.stringify({ kind, token, secret: registration.secret }) + '\n'));
          socket.on('data', chunk => { data += chunk.toString(); });
          socket.on('end', () => {
            try { resolve(JSON.parse(data) as { ok: boolean }); } catch (error) { reject(error); }
          });
        });
      }
      expect((await request('prepare', 'one')).ok).toBe(true);
      expect((await request('close', 'one')).ok).toBe(false);
      expect(finalCheck).toHaveBeenCalledTimes(1);
      expect((await request('close', 'one')).ok).toBe(false);
      expect(close).not.toHaveBeenCalled();
      expect((await request('prepare', 'two')).ok).toBe(true);
      finalCheck.mockResolvedValueOnce(true);
      expect((await request('close', 'two')).ok).toBe(true);
      await vi.waitFor(() => expect(close).toHaveBeenCalledTimes(1));
    } finally {
      stop();
      await rm(directory, { recursive: true, force: true });
    }
  }, 15_000);
});
