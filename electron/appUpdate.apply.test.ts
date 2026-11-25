import { EventEmitter } from 'node:events';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  temp: '',
  peers: vi.fn(async () => ({ ok: true, message: 'Preparado' })),
  spawn: vi.fn(),
  unref: vi.fn(),
}));
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, tmpdir: () => mocks.temp || actual.tmpdir() };
});
vi.mock('node:child_process', () => ({ spawn: mocks.spawn }));
vi.mock('./localUpdateInstances.js', () => ({ closeOtherLocalInstancesForUpdate: mocks.peers }));

let applyAppUpdate: typeof import('./appUpdate.js').applyAppUpdate;
let checkForAppUpdate: typeof import('./appUpdate.js').checkForAppUpdate;

let root: string;
let updates: string;
let executable: string;
let originalArgv: string[];
const packageBytes = Buffer.from('contenido ficticio de actualización; nunca se ejecuta');
const sha = createHash('sha256').update(packageBytes).digest('hex');

async function publish(version = '2.0.1', hash = sha) {
  await writeFile(path.join(updates, 'version.json'), JSON.stringify({
    version, file: 'Traccion 2.0.piz', sha256: hash,
  }));
  await writeFile(path.join(updates, 'Traccion 2.0.piz'), packageBytes);
}

beforeEach(async () => {
  vi.resetModules();
  vi.resetAllMocks();
  ({ applyAppUpdate, checkForAppUpdate } = await import('./appUpdate.js'));
  originalArgv = process.argv;
  process.argv = ['electron', 'main.js', '--traccion-env=production'];
  root = await mkdtemp(path.join(tmpdir(), 'traccion-update-apply-'));
  mocks.temp = root;
  updates = path.join(root, 'publicado');
  await mkdir(updates);
  executable = path.join(root, 'Traccion 1.2.exe');
  await writeFile(executable, 'versión anterior');
  vi.stubEnv('PORTABLE_EXECUTABLE_FILE', executable);
  mocks.peers.mockResolvedValue({ ok: true, message: 'Preparado' });
  mocks.spawn.mockImplementation(() => {
    const child = Object.assign(new EventEmitter(), { unref: mocks.unref });
    queueMicrotask(() => child.emit('spawn'));
    return child;
  });
});
afterEach(async () => {
  process.argv = originalArgv;
  vi.unstubAllEnvs();
  mocks.temp = '';
  await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

describe('preparación de actualización portable', () => {
  it('desactiva consulta e instalación en PRUEBAS sin tocar el paquete', async () => {
    process.argv = ['electron', 'main.js', '--traccion-env=test', '--traccion-test-user-b'];
    expect(await checkForAppUpdate('1.2.1', updates)).toMatchObject({ updateAvailable: false, message: expect.stringContaining('PRUEBAS') });
    expect(await applyAppUpdate('1.2.1', updates)).toMatchObject({ ok: false, message: expect.stringContaining('PRUEBAS') });
    expect(mocks.peers).not.toHaveBeenCalled();
    expect(mocks.spawn).not.toHaveBeenCalled();
  });
  it('rechaza una versión anterior o igual antes de preparar el instalador', async () => {
    await publish('2.0.1');
    expect(await applyAppUpdate('2.0.1', updates)).toMatchObject({ ok: false, message: expect.stringContaining('no es más reciente') });
    expect(await applyAppUpdate('2.0.2', updates)).toMatchObject({ ok: false });
    expect(mocks.peers).not.toHaveBeenCalled();
    expect(mocks.spawn).not.toHaveBeenCalled();
  });
  it('no coordina cierres ni lanza scripts si el SHA-256 no coincide', async () => {
    await publish('2.0.1', '0'.repeat(64));
    expect(await applyAppUpdate('1.2.1', updates)).toMatchObject({ ok: false, message: expect.stringContaining('SHA-256') });
    expect(mocks.peers).not.toHaveBeenCalled();
    expect(mocks.spawn).not.toHaveBeenCalled();
    expect(await readFile(executable, 'utf8')).toBe('versión anterior');
  });
  it('conserva el ejecutable cuando falta el paquete publicado', async () => {
    await publish();
    await rm(path.join(updates, 'Traccion 2.0.piz'));
    expect(await applyAppUpdate('1.2.1', updates)).toMatchObject({ ok: false, message: expect.stringContaining('copiar o verificar') });
    expect(mocks.peers).not.toHaveBeenCalled();
    expect(mocks.spawn).not.toHaveBeenCalled();
    expect(await readFile(executable, 'utf8')).toBe('versión anterior');
  });
  it('no lanza el sustituidor si otra instancia no acepta cerrar', async () => {
    await publish();
    mocks.peers.mockResolvedValueOnce({ ok: false, message: 'Cambios sin guardar' });
    expect(await applyAppUpdate('1.2.1', updates)).toEqual({ ok: false, message: 'Cambios sin guardar' });
    expect(mocks.spawn).not.toHaveBeenCalled();
  });
  it('no lanza el sustituidor si falla la coordinación local', async () => {
    await publish();
    mocks.peers.mockRejectedValueOnce(new Error('conexión local fallida'));
    expect(await applyAppUpdate('1.2.1', updates)).toMatchObject({ ok: false, message: expect.stringContaining('coordinar el cierre local') });
    expect(mocks.spawn).not.toHaveBeenCalled();
  });
  it('prepara bytes verificados y script de sustitución solo después de aprobar los cierres', async () => {
    await publish();
    const stagingRoot = path.join(root, 'traccion-update-staging');
    let staging = '';
    mocks.peers.mockImplementationOnce(async () => {
      const attempts = await readdir(stagingRoot);
      expect(attempts).toHaveLength(1);
      staging = path.join(stagingRoot, attempts[0]);
      expect(await readFile(path.join(staging, 'TrAccion-nueva.exe'))).toEqual(packageBytes);
      expect(mocks.spawn).not.toHaveBeenCalled();
      return { ok: true, message: 'Preparado' };
    });
    expect(await applyAppUpdate('1.2.1', updates)).toMatchObject({ ok: true });
    const script = path.join(staging, 'traccion-apply-update.cmd');
    const scriptText = await readFile(script, 'utf8');
    expect(scriptText).toContain(path.join(root, 'Traccion 2.0.exe'));
    expect(scriptText.split('\r\n')[0]).toBe('@echo off');
    expect(scriptText.split('\r\n')).toContain(':publish');
    expect(scriptText).not.toContain('\\r\\n');
    expect(mocks.spawn).toHaveBeenCalledWith('cmd.exe', ['/d', '/c', 'traccion-apply-update.cmd'], { cwd: staging, detached: true, stdio: 'ignore', windowsHide: true });
    expect(mocks.unref).toHaveBeenCalledTimes(1);
    expect(await readFile(executable, 'utf8')).toBe('versión anterior');
  });
  it('informa de fallo síncrono al lanzar el sustituidor sin ejecutar el paquete', async () => {
    await publish();
    mocks.spawn.mockImplementationOnce(() => { throw new Error('cmd no disponible'); });
    expect(await applyAppUpdate('1.2.1', updates)).toMatchObject({ ok: false, message: expect.stringContaining('cmd no disponible') });
    expect(await readFile(executable, 'utf8')).toBe('versión anterior');
  });
});

describe('regresiones del actualizador', () => {
  it('no confirma instalación cuando spawn emite un error asíncrono y permite reintentar', async () => {
    await publish();
    mocks.spawn.mockImplementationOnce(() => {
      const child = Object.assign(new EventEmitter(), { unref: mocks.unref });
      queueMicrotask(() => child.emit('error', new Error('ENOENT asíncrono')));
      return child;
    });
    expect(await applyAppUpdate('1.2.1', updates)).toMatchObject({ ok: false, message: expect.stringContaining('ENOENT asíncrono') });
    expect(mocks.unref).not.toHaveBeenCalled();
    expect(await readdir(path.join(root, 'traccion-update-staging'))).toEqual([]);
    expect(await applyAppUpdate('1.2.1', updates)).toMatchObject({ ok: true });
  });
  it('rechaza una segunda petición durante la preparación y después de lanzar el instalador', async () => {
    await publish();
    let approve!: (value: boolean) => void;
    let entered!: () => void;
    const ready = new Promise<void>(resolve => { entered = resolve; });
    const first = applyAppUpdate('1.2.1', updates, () => {
      entered();
      return new Promise<boolean>(resolve => { approve = resolve; });
    });
    await ready;
    expect(await applyAppUpdate('1.2.1', updates)).toMatchObject({ ok: false, message: expect.stringContaining('en preparación') });
    approve(true);
    expect(await first).toMatchObject({ ok: true });
    expect(await applyAppUpdate('1.2.1', updates)).toMatchObject({ ok: false });
    expect(mocks.spawn).toHaveBeenCalledTimes(1);
  });
  it('no elimina el staging de otra instalación y cancela si aparecen cambios antes de lanzar', async () => {
    await publish();
    const foreign = path.join(root, 'traccion-update-staging', 'attempt-other');
    await mkdir(foreign, { recursive: true });
    await writeFile(path.join(foreign, 'keep.txt'), 'intacto');
    expect(await applyAppUpdate('1.2.1', updates, async () => false)).toMatchObject({ ok: false, message: expect.stringContaining('cancelada') });
    expect(mocks.spawn).not.toHaveBeenCalled();
    expect(await readdir(path.dirname(foreign))).toEqual(['attempt-other']);
    expect(await readFile(path.join(foreign, 'keep.txt'), 'utf8')).toBe('intacto');
  });
});
