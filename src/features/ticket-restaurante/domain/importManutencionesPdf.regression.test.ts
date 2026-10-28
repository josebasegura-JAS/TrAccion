import { describe, expect, it, vi } from 'vitest';
import type { TicketPerson } from './ticketRestauranteTypes';

const mocks = vi.hoisted(() => ({ getDocument: vi.fn() }));
vi.mock('pdfjs-dist/legacy/build/pdf.mjs', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  getDocument: mocks.getDocument,
}));

import { importTicketManutencionesPdf } from './importManutencionesPdf';

const now = '2026-04-01T00:00:00.000Z';
const person: TicketPerson = {
  empleado: '123', nombre: 'Ana', apellido1: 'Metro', apellido2: '',
  nombreApellidos: 'Ana Metro', dni: '', puesto: 'SSCC',
  calendarId: 'sscc', activo: true,
  createdAt: now, updatedAt: now, deletedAt: null,
};
function item(str: string, x: number, y: number) {
  return { str, transform: [1, 0, 0, 1, x, y] };
}
function setPdfPages(pages: Array<Array<ReturnType<typeof item>>>) {
  const destroy = vi.fn(async () => undefined);
  const getPage = vi.fn(async (pageNumber: number) => ({
    getTextContent: vi.fn(async () => ({ items: pages[pageNumber - 1] })),
  }));
  mocks.getDocument.mockReturnValue({
    promise: Promise.resolve({ numPages: pages.length, getPage, destroy }),
  });
  return { destroy, getPage };
}
const bytes = () => new ArrayBuffer(16);

describe('importación PDF de manutenciones — texto seleccionable', () => {
  it('extrae persona y fecha por coordenadas, y cierra el documento', async () => {
    const { destroy } = setPdfPages([[
      item('Empleado/a', 100, 790),
      item('123', 100, 720),
      item('Ana Metro', 210, 720),
      item('06/04/2026', 470, 720),
    ]]);
    const rows = await importTicketManutencionesPdf(bytes(), [person]);
    expect(rows).toMatchObject([{
      empleado: '123', nombreApellidos: 'Ana Metro',
      fechaGasto: '2026-04-06', origen: 'Pagador', importar: true,
    }]);
    expect(destroy).toHaveBeenCalledOnce();
  });

  it('deja de leer al empezar Relaciones Externas, incluso en páginas posteriores', async () => {
    const { getPage, destroy } = setPdfPages([
      [
        item('123', 100, 720), item('Ana Metro', 210, 720),
        item('06/04/2026', 470, 720),
        item('RELACIONES EXTERNAS', 100, 690),
      ],
      [item('123', 100, 720), item('08/04/2026', 470, 720)],
    ]);
    const rows = await importTicketManutencionesPdf(bytes(), [person]);
    expect(rows).toHaveLength(1);
    expect(getPage).toHaveBeenCalledTimes(1);
    expect(destroy).toHaveBeenCalledOnce();
  });

  it('rechaza PDF sin filas interpretables y libera los recursos', async () => {
    const { destroy } = setPdfPages([[
      item('Gastos de Manutención', 100, 790),
      item('Empleado/a', 100, 770),
    ]]);
    await expect(importTicketManutencionesPdf(bytes(), [person]))
      .rejects.toThrow('No se han reconocido filas de manutención');
    expect(destroy).toHaveBeenCalledOnce();
  });
});
