import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, readdir, rename, rm, stat, utimes, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  publishSummaryWord,
  recoverInterruptedSummaryWord,
  withSharedSummaryWordLock,
} from './summaryWordSharedPublication.js';

const directories: string[] = [];
async function tempDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'traccion-summary-word-'));
  directories.push(directory);
  return directory;
}
afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('publicación de resúmenes Word por SMB', () => {
  it.each(['comite', 'paritaria'] as const)('serializa dos equipos en %s', async (kind) => {
    const directory = await tempDirectory();
    const order: string[] = [];
    let unblock!: () => void;
    let signalReady!: () => void;
    const waiting = new Promise<void>((resolve) => { unblock = resolve; });
    const ready = new Promise<void>((resolve) => { signalReady = resolve; });
    const first = withSharedSummaryWordLock(directory, kind, async () => {
      order.push('first');
      signalReady();
      await waiting;
      order.push('first-done');
    });
    await ready;
    const second = withSharedSummaryWordLock(directory, kind, async () => {
      order.push('second');
    });
    expect(order).toEqual(['first']);
    unblock();
    await Promise.all([first, second]);
    expect(order).toEqual(['first', 'first-done', 'second']);
  });

  it('conserva el original si el destino ya existe con nombre distinto', async () => {
    const directory = await tempDirectory();
    const source = path.join(directory, 'Resumen anterior.docx');
    const target = path.join(directory, 'Resumen nuevo.docx');
    await writeFile(source, 'ORIGINAL');
    await writeFile(target, 'AJENO');
    await expect(withSharedSummaryWordLock(directory, 'comite', (assertOwned) =>
      publishSummaryWord(directory, source, target, Buffer.from('ACTUALIZADO'), assertOwned),
    )).rejects.toThrow('Ya existe');
    expect(await readFile(source, 'utf8')).toBe('ORIGINAL');
    expect(await readFile(target, 'utf8')).toBe('AJENO');
  });

  it('sustituye el documento, sin dejar temporales ni respaldos al terminar', async () => {
    const directory = await tempDirectory();
    const source = path.join(directory, 'Resumen antiguo.docx');
    const target = path.join(directory, 'Resumen actualizado.docx');
    await writeFile(source, 'ORIGINAL');
    await withSharedSummaryWordLock(directory, 'paritaria', (assertOwned) =>
      publishSummaryWord(directory, source, target, Buffer.from('ACTUALIZADO'), assertOwned),
    );
    expect(await readFile(target, 'utf8')).toBe('ACTUALIZADO');
    await expect(stat(source)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await readdir(directory)).toEqual(['Resumen actualizado.docx']);
  });

  it('restaura un backup interrumpido solo si no queda Word vigente', async () => {
    const directory = await tempDirectory();
    const original = 'Resumen histórico.docx';
    const backup = `${original}.traccion-backup-12345`;
    await writeFile(path.join(directory, backup), 'ORIGINAL');
    await withSharedSummaryWordLock(directory, 'comite', async (assertOwned) => {
      await recoverInterruptedSummaryWord(directory, (name) => name.endsWith('.docx'), assertOwned);
    });
    expect(await readFile(path.join(directory, original), 'utf8')).toBe('ORIGINAL');
    await expect(stat(path.join(directory, backup))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('no restaura sobre un documento vigente ni borra el backup', async () => {
    const directory = await tempDirectory();
    const original = 'Resumen histórico.docx';
    const backup = `${original}.traccion-backup-12345`;
    await writeFile(path.join(directory, original), 'ACTUALIZADO');
    await writeFile(path.join(directory, backup), 'ANTERIOR');
    await recoverInterruptedSummaryWord(directory, (name) => name.endsWith('.docx'), async () => undefined);
    expect(await readFile(path.join(directory, original), 'utf8')).toBe('ACTUALIZADO');
    expect(await readFile(path.join(directory, backup), 'utf8')).toBe('ANTERIOR');
  });

  it('rechaza publicar si el bloqueo deja de pertenecer a este equipo', async () => {
    const directory = await tempDirectory();
    const source = path.join(directory, 'Resumen histórico.docx');
    await writeFile(source, 'ORIGINAL');
    await expect(withSharedSummaryWordLock(directory, 'comite', async (assertOwned) => {
      await writeFile(path.join(directory, '.traccion-comite-summary.lockdir', 'owner'), 'OTRO-EQUIPO');
      await publishSummaryWord(directory, source, source, Buffer.from('NUEVO'), assertOwned);
    })).rejects.toThrow('bloqueo');
    expect(await readFile(source, 'utf8')).toBe('ORIGINAL');
    // Limpieza deliberadamente omitida si el token cambió.
  });

  it('no elimina ni reutiliza un lock antiguo mientras no se confirme su abandono', async () => {
    const directory = await tempDirectory();
    const lock = path.join(directory, '.traccion-paritaria-summary.lockdir');
    await mkdir(lock);
    await writeFile(path.join(lock, 'owner'), 'PROCESO-CERRADO');
    const old = new Date(Date.now() - 20 * 60_000);
    await utimes(lock, old, old);
    let executed = false;
    await expect(withSharedSummaryWordLock(directory, 'paritaria', async () => { executed = true; }, { waitMs: 2_000 }))
      .rejects.toThrow('Bloqueo antiguo');
    expect(executed).toBe(false);
    expect(await readFile(path.join(lock, 'owner'), 'utf8')).toBe('PROCESO-CERRADO');
  });

  it('recupera un documento movido durante una publicación interrumpida', async () => {
    const directory = await tempDirectory();
    const source = path.join(directory, 'Resumen temático.docx');
    const backup = `${source}.traccion-backup-crash`;
    await writeFile(source, 'ORIGINAL');
    await rename(source, backup);
    await withSharedSummaryWordLock(directory, 'comite', (assertOwned) =>
      recoverInterruptedSummaryWord(directory, (name) => name.endsWith('.docx'), assertOwned),
    );
    expect(await readFile(source, 'utf8')).toBe('ORIGINAL');
  });
});
