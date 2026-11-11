import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  publishOperationalExcelBackup,
  selectObsoleteOperationalExcelBackups,
} from './operationalExcelPublication.js';

const directories: string[] = [];
async function makeDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'traccion-operational-excel-'));
  directories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

const bytes = (value: string) => Buffer.from(value, 'utf8');

describe('publicación de respaldos Excel operativos', () => {
  it('sustituye el archivo publicado con rename y no deja temporales', async () => {
    const directory = await makeDirectory();
    const name = 'Coordinacion_Direccion.xlsx';
    await writeFile(path.join(directory, name), 'VERSION-ANTERIOR');
    await publishOperationalExcelBackup(directory, name, 'Coordinacion_Direccion', bytes('VERSION-NUEVA'));
    expect(await readFile(path.join(directory, name), 'utf8')).toBe('VERSION-NUEVA');
    expect((await readdir(directory)).sort()).toEqual([name]);
  });

  it('conserva la versión publicada y limpia su temporal si falla el rename', async () => {
    const directory = await makeDirectory();
    const name = 'Criterios_RRLL.xlsx';
    // Un directorio con el nombre destino impide que rename publique el temporal.
    await mkdir(path.join(directory, name));
    await expect(publishOperationalExcelBackup(directory, name, 'Criterios_RRLL', bytes('NUEVO')))
      .rejects.toThrow();
    expect((await readdir(directory)).sort()).toEqual([name]);
  });

  it('no borra documentos ajenos aunque compartan prefijo con el respaldo fijo', async () => {
    const directory = await makeDirectory();
    const current = 'Coordinacion_Direccion.xlsx';
    const unrelated = 'Coordinacion_Direccion_Notas.xlsx';
    await writeFile(path.join(directory, unrelated), 'DOCUMENTO-USUARIO');
    await publishOperationalExcelBackup(directory, current, 'Coordinacion_Direccion', bytes('EXCEL'));
    expect(await readFile(path.join(directory, unrelated), 'utf8')).toBe('DOCUMENTO-USUARIO');
  });

  it('limpia solo versiones anteriores con fecha válida y mismo módulo', async () => {
    const directory = await makeDirectory();
    const current = 'Vinculograma_11-11-2026.xlsx';
    const old = 'Vinculograma_10-11-2026.xlsx';
    const others = [
      'Vinculograma_notas.xlsx',
      'Vinculograma_32-11-2026.xlsx',
      'Vinculograma_10-11-2026_personal.xlsx',
      'Licencias_y_Excedencias_10-11-2026.xlsx',
      'Vinculograma_10-11-2026.xlsm',
    ];
    await writeFile(path.join(directory, old), 'ANTERIOR');
    for (const name of others) await writeFile(path.join(directory, name), 'NO-BORRAR');
    await publishOperationalExcelBackup(directory, current, 'Vinculograma_', bytes('ACTUAL'));
    expect(await readdir(directory)).not.toContain(old);
    for (const name of others) expect(await readFile(path.join(directory, name), 'utf8')).toBe('NO-BORRAR');
    expect(await readFile(path.join(directory, current), 'utf8')).toBe('ACTUAL');
  });

  it('no permite a un prefijo arbitrario ordenar eliminaciones', () => {
    expect(selectObsoleteOperationalExcelBackups(
      ['Computo_Enero_2026.xlsx', 'Computo_Enero_2026_notas.xlsx'],
      'Computo_Enero_2026.xlsx',
      'Computo_',
    )).toEqual([]);
    expect(selectObsoleteOperationalExcelBackups(
      ['Licencias_y_Excedencias_10-11-2026.xlsx'],
      'Licencias_y_Excedencias.xlsx',
      'Licencias_y_Excedencias_',
    )).toEqual([]);
  });

  it('para Licencias conserva los ficheros que no cumplen el patrón fechado', () => {
    expect(selectObsoleteOperationalExcelBackups([
      'Licencias_y_Excedencias_10-11-2026.xlsx',
      'Licencias_y_Excedencias_01-13-2026.xlsx',
      'Licencias_y_Excedencias_informe.xlsx',
      'Licencias_y_Excedencias_11-11-2026.xlsx',
    ], 'Licencias_y_Excedencias_11-11-2026.xlsx', 'Licencias_y_Excedencias_'))
      .toEqual(['Licencias_y_Excedencias_10-11-2026.xlsx']);
  });
});
