import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, readdir, utimes, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { rm } from 'node:fs/promises';
import {
  publishTaskExcel,
  TASK_EXCEL_GENERATION_LOCK_DIRECTORY,
  TaskExcelLockBusyError,
  hasPublishedTaskExcelSignature,
  markPublishedTaskExcelSignature,
  taskExcelSnapshotSignature,
  withSharedTaskExcelLock,
} from './taskExcelSharedPublication.js';

const dirs: string[] = [];
async function tempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'traccion-excel-lock-'));
  dirs.push(dir);
  return dir;
}
afterEach(async () => {
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true });
});

describe('publicación segura del Excel de Tareas', () => {
  it('serializa dos instancias independientes mediante el lock compartido', async () => {
    const dir = await tempDir();
    const sequence: string[] = [];
    let release!: () => void;
    let firstReady!: () => void;
    const wait = new Promise<void>((resolve) => { release = resolve; });
    const ready = new Promise<void>((resolve) => { firstReady = resolve; });
    const first = withSharedTaskExcelLock(dir, async () => {
      sequence.push('first-start');
      firstReady();
      await wait;
      sequence.push('first-end');
    });
    await ready;
    const second = withSharedTaskExcelLock(dir, async () => { sequence.push('second-start'); });
    await Promise.resolve();
    expect(sequence).toEqual(['first-start']);
    release();
    await Promise.all([first, second]);
    expect(sequence).toEqual(['first-start', 'first-end', 'second-start']);
  });

  it('una instantánea obsoleta no sustituye el Excel existente', async () => {
    const dir = await tempDir();
    const finalPath = path.join(dir, 'Tareas_abiertas_03-11-2026.xlsx');
    const tempPath = path.join(dir, '.temp.xlsx');
    await writeFile(finalPath, 'VERSION-NUEVA');
    await writeFile(tempPath, 'VERSION-ANTIGUA');
    const result = await publishTaskExcel(dir, tempPath, finalPath, async () => false, async () => undefined);
    expect(result).toEqual({ published: false, stale: true });
    expect(await readFile(finalPath, 'utf8')).toBe('VERSION-NUEVA');
  });

  it('publica el fichero íntegro con rename y libera el lock al terminar', async () => {
    const dir = await tempDir();
    const finalPath = path.join(dir, 'Tareas_abiertas.xlsx');
    const tempPath = path.join(dir, '.temp.xlsx');
    await writeFile(finalPath, 'ANTERIOR');
    await writeFile(tempPath, 'COMPLETO');
    const result = await publishTaskExcel(dir, tempPath, finalPath, async () => true, async () => undefined);
    expect(result).toEqual({ published: true, stale: false });
    expect(await readFile(finalPath, 'utf8')).toBe('COMPLETO');
    expect((await readdir(dir)).some((name) => name.endsWith('.lockdir'))).toBe(false);
  });

  it('revalida con bloqueo y conserva el fichero ante fallo de comprobación', async () => {
    const dir = await tempDir();
    const finalPath = path.join(dir, 'Tareas_abiertas.xlsx');
    const tempPath = path.join(dir, '.temp.xlsx');
    await writeFile(finalPath, 'VIGENTE');
    await writeFile(tempPath, 'NUEVO');
    await expect(publishTaskExcel(
      dir, tempPath, finalPath,
      async () => { throw new Error('sin conexión SMB'); },
      async () => undefined,
    )).rejects.toThrow('sin conexión SMB');
    expect(await readFile(finalPath, 'utf8')).toBe('VIGENTE');
  });

  it('no elimina ni reutiliza un lock antiguo sin verificar que el titular ha terminado', async () => {
    const dir = await tempDir();
    const lockPath = path.join(dir, '.traccion-tareas-excel.lockdir');
    await import('node:fs/promises').then((fs) => fs.mkdir(lockPath));
    await writeFile(path.join(lockPath, 'owner.json'), 'proceso-finalizado');
    const old = new Date(Date.now() - 20 * 60_000);
    await utimes(lockPath, old, old);
    let invoked = 0;
    await expect(withSharedTaskExcelLock(dir, async () => { invoked += 1; }, { waitMs: 2_000 }))
      .rejects.toThrow('Bloqueo antiguo');
    expect(invoked).toBe(0);
    expect(await readFile(path.join(lockPath, 'owner.json'), 'utf8')).toBe('proceso-finalizado');
  });

  it('la firma cambia ante altas, cierres y modificaciones, pero no con el orden', () => {
    const a = { value: '{"id":"a","estado":"pendiente"}' };
    const b = { value: '{"id":"b","estado":"pendiente"}' };
    expect(taskExcelSnapshotSignature([a,b])).toBe(taskExcelSnapshotSignature([b,a]));
    expect(taskExcelSnapshotSignature([a,b])).not.toBe(taskExcelSnapshotSignature([a]));
    expect(taskExcelSnapshotSignature([a,b])).not.toBe(
      taskExcelSnapshotSignature([a,{ value: '{"id":"b","estado":"cerrada"}' }]),
    );
  });
  it('no permite dos generaciones simultáneas; el segundo equipo reintentará', async () => {
    const dir = await tempDir();
    let release!: () => void;
    let ready!: () => void;
    const waiting = new Promise<void>((resolve) => { release = resolve; });
    const started = new Promise<void>((resolve) => { ready = resolve; });
    const first = withSharedTaskExcelLock(dir, async () => {
      ready();
      await waiting;
    }, { lockDirectoryName: TASK_EXCEL_GENERATION_LOCK_DIRECTORY, waitMs: 0 });
    await started;
    await expect(withSharedTaskExcelLock(dir, async () => {
      throw new Error('No debe llegar a generar');
    }, { lockDirectoryName: TASK_EXCEL_GENERATION_LOCK_DIRECTORY, waitMs: 0 }))
      .rejects.toBeInstanceOf(TaskExcelLockBusyError);
    release();
    await first;
    const result = await withSharedTaskExcelLock(dir, async () => 'nuevo turno', {
      lockDirectoryName: TASK_EXCEL_GENERATION_LOCK_DIRECTORY, waitMs: 0,
    });
    expect(result).toBe('nuevo turno');
  });

  it('omite generación solo si la firma coincide y el fichero publicado existe', async () => {
    const dir = await tempDir();
    const name = 'Tareas_abiertas_04-11-2026.xlsx';
    await writeFile(path.join(dir, name), 'documento-vigente');
    await markPublishedTaskExcelSignature(dir, 'firma-1', name);
    expect(await hasPublishedTaskExcelSignature(dir, 'firma-1', name)).toBe(true);
    expect(await hasPublishedTaskExcelSignature(dir, 'firma-2', name)).toBe(false);
    expect(await hasPublishedTaskExcelSignature(dir, 'firma-1', 'otro.xlsx')).toBe(false);
    await rm(path.join(dir, name));
    expect(await hasPublishedTaskExcelSignature(dir, 'firma-1', name)).toBe(false);
  });

});
