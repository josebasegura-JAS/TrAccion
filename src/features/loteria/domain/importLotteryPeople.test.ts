import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  parseXlsxRows: vi.fn(),
}));

vi.mock('../../../shared/import/xlsxParser', () => ({
  parseXlsxRows: mocks.parseXlsxRows,
}));

import { importLotteryPeopleFromXlsx } from './importLotteryPeople';

function fakeFile(): File {
  return {
    arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(0)),
  } as unknown as File;
}

describe('Lotería - importación de participantes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('localiza la cabecera aunque existan filas previas y normaliza tildes en los encabezados', async () => {
    mocks.parseXlsxRows.mockResolvedValue([
      ['Lotería Navidad 2026'],
      ['Listado provisional'],
      ['Nombre y Apellidos', 'Correo electrónico', 'Móvil'],
      ['  Ana Pérez López  ', ' ana@empresa.test ', ' 600 111 222 '],
      ['Iñaki García', '', ''],
    ]);

    const people = await importLotteryPeopleFromXlsx(fakeFile());

    expect(people).toEqual([
      { nombre: 'Ana Pérez López', email: 'ana@empresa.test', telefono: '600 111 222' },
      { nombre: 'Iñaki García', email: '', telefono: '' },
    ]);
  });

  it('admite un Excel que solo tenga columna de nombre', async () => {
    mocks.parseXlsxRows.mockResolvedValue([
      ['Persona'],
      ['Persona Uno'],
      ['Persona Dos'],
    ]);

    const people = await importLotteryPeopleFromXlsx(fakeFile());

    expect(people).toEqual([
      { nombre: 'Persona Uno', email: '', telefono: '' },
      { nombre: 'Persona Dos', email: '', telefono: '' },
    ]);
  });

  it.each([
    'TOTAL',
    'Importe total',
    'Entregado a administración',
    'A Gustavo pendiente',
    'Año 2026',
    'Se le pide 20 décimos',
  ])('ignora filas de resumen: %s', async (summary) => {
    mocks.parseXlsxRows.mockResolvedValue([
      ['Nombre', 'Email'],
      ['Persona Válida', 'persona@empresa.test'],
      [summary, ''],
    ]);

    const people = await importLotteryPeopleFromXlsx(fakeFile());

    expect(people).toEqual([
      { nombre: 'Persona Válida', email: 'persona@empresa.test', telefono: '' },
    ]);
  });

  it('ignora filas vacías sin crear participantes fantasma', async () => {
    mocks.parseXlsxRows.mockResolvedValue([
      ['Nombre', 'Correo', 'Teléfono'],
      ['', 'sin-nombre@empresa.test', '600000000'],
      ['Persona', '', ''],
      ['', '', ''],
    ]);

    const people = await importLotteryPeopleFromXlsx(fakeFile());

    expect(people).toEqual([{ nombre: 'Persona', email: '', telefono: '' }]);
  });

  it('devuelve vacío cuando el Excel no contiene suficientes filas', async () => {
    mocks.parseXlsxRows.mockResolvedValue([['Nombre']]);

    await expect(importLotteryPeopleFromXlsx(fakeFile())).resolves.toEqual([]);
  });

  it('falla de forma explícita si no encuentra una columna de nombre', async () => {
    mocks.parseXlsxRows.mockResolvedValue([
      ['Cabecera'],
      ['Correo', 'Teléfono'],
      ['usuario@empresa.test', '600000000'],
    ]);

    await expect(importLotteryPeopleFromXlsx(fakeFile())).rejects.toThrow(
      'No se ha encontrado una columna de Nombre en el Excel.',
    );
  });

  it('solo busca la cabecera en las primeras 12 filas', async () => {
    mocks.parseXlsxRows.mockResolvedValue([
      ...Array.from({ length: 12 }, (_, index) => [`Fila ${index + 1}`]),
      ['Nombre', 'Email'],
      ['Persona', 'persona@empresa.test'],
    ]);

    await expect(importLotteryPeopleFromXlsx(fakeFile())).rejects.toThrow(
      'No se ha encontrado una columna de Nombre en el Excel.',
    );
  });
});
