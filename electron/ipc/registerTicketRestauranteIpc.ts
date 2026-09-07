/**
 * Ticket Restaurante: calendarios, personas, ausencias, manutenciones y configuración.
 * Extraído de main.ts como parte de la división de registerIpcHandlers()
 * en un fichero por área funcional.
 */
import { ipcMain } from 'electron';
import { openExcelWorkbook } from '../documentOpener.js';
import { buildTicketRestaurantLoadWorkbook, type TicketRestaurantLoadRow } from '../ticketRestaurantLoadWorkbook.js';
import { enqueueSqliteIpc } from '../sqliteIpcQueue.js';
import {
  getSqliteStatus,
  loadTicketRestauranteCalendarRecordsSnapshot,
  loadTicketRestaurantePersonRecordsSnapshot,
  loadTicketRestauranteAbsenceRecordsSnapshot,
  loadTicketRestauranteConfigRecordsSnapshot,
  loadTicketRestauranteManutencionRecordsSnapshot,
  saveTicketRestauranteCalendarRecordIfUnchanged,
  saveTicketRestauranteCalendarRecordsIfUnchanged,
  saveTicketRestaurantePersonRecordIfUnchanged,
  saveTicketRestaurantePersonRecordsIfUnchanged,
  saveTicketRestauranteAbsenceRecordIfUnchanged,
  saveTicketRestauranteAbsenceRecordsIfUnchanged,
  saveTicketRestauranteConfigRecordIfUnchanged,
  saveTicketRestauranteManutencionRecordIfUnchanged,
  saveTicketRestauranteManutencionRecordsIfUnchanged,
} from '../sqlitePersistence.js';

export function registerTicketRestauranteIpc(): void {
  ipcMain.handle('ticket-restaurante-calendars:load-records', () =>
    enqueueSqliteIpc('ticket-restaurante-calendars:load-records', () =>
      loadTicketRestauranteCalendarRecordsSnapshot(),
    ),
  );
  ipcMain.handle('ticket-restaurante-calendars:save-record-if-unchanged', (_event, payload: unknown) => {
    if (!payload || typeof payload !== 'object') {
      return {
        ok: false,
        status: getSqliteStatus(),
        currentUpdatedAt: null,
        message: 'Payload de calendario de Ticket Restaurante inválido.',
      };
    }

    const candidate = payload as { id?: unknown; value?: unknown; expectedUpdatedAt?: unknown };
    if (
      typeof candidate.id !== 'string' ||
      typeof candidate.value !== 'string' ||
      (typeof candidate.expectedUpdatedAt !== 'string' && candidate.expectedUpdatedAt !== null)
    ) {
      return {
        ok: false,
        status: getSqliteStatus(),
        currentUpdatedAt: null,
        message: 'Payload de calendario de Ticket Restaurante inválido.',
      };
    }

    const id = candidate.id;
    const value = candidate.value;
    const expectedUpdatedAt = typeof candidate.expectedUpdatedAt === 'string'
      ? candidate.expectedUpdatedAt
      : null;
    return enqueueSqliteIpc('ticket-restaurante-calendars:save-record-if-unchanged', () =>
      saveTicketRestauranteCalendarRecordIfUnchanged({
        id,
        value,
        expectedUpdatedAt,
      }),
    );
  });
  ipcMain.handle('ticket-restaurante-calendars:save-records-if-unchanged', (_event, payload: unknown) => {
    const invalidPayloadResult = {
      ok: false,
      status: getSqliteStatus(),
      results: [],
      message: 'Payload de lote de calendarios de Ticket Restaurante inválido.',
    };

    if (!payload || typeof payload !== 'object') {
      return invalidPayloadResult;
    }

    const candidate = payload as { records?: unknown };
    if (!Array.isArray(candidate.records)) {
      return invalidPayloadResult;
    }

    const records: Array<{ id: string; value: string; expectedUpdatedAt: string | null }> = [];
    for (const item of candidate.records) {
      if (!item || typeof item !== 'object') {
        return invalidPayloadResult;
      }
      const recordCandidate = item as { id?: unknown; value?: unknown; expectedUpdatedAt?: unknown };
      if (
        typeof recordCandidate.id !== 'string' ||
        typeof recordCandidate.value !== 'string' ||
        (typeof recordCandidate.expectedUpdatedAt !== 'string' && recordCandidate.expectedUpdatedAt !== null)
      ) {
        return invalidPayloadResult;
      }
      records.push({
        id: recordCandidate.id,
        value: recordCandidate.value,
        expectedUpdatedAt: recordCandidate.expectedUpdatedAt,
      });
    }

    return enqueueSqliteIpc('ticket-restaurante-calendars:save-records-if-unchanged', () =>
      saveTicketRestauranteCalendarRecordsIfUnchanged(records),
    );
  });
  ipcMain.handle('ticket-restaurante-people:load-records', () =>
    enqueueSqliteIpc('ticket-restaurante-people:load-records', () =>
      loadTicketRestaurantePersonRecordsSnapshot(),
    ),
  );
  ipcMain.handle('ticket-restaurante-people:save-record-if-unchanged', (_event, payload: unknown) => {
    if (!payload || typeof payload !== 'object') {
      return {
        ok: false,
        status: getSqliteStatus(),
        currentUpdatedAt: null,
        message: 'Payload de persona de Ticket Restaurante inválido.',
      };
    }

    const candidate = payload as { id?: unknown; value?: unknown; expectedUpdatedAt?: unknown };
    if (
      typeof candidate.id !== 'string' ||
      typeof candidate.value !== 'string' ||
      (typeof candidate.expectedUpdatedAt !== 'string' && candidate.expectedUpdatedAt !== null)
    ) {
      return {
        ok: false,
        status: getSqliteStatus(),
        currentUpdatedAt: null,
        message: 'Payload de persona de Ticket Restaurante inválido.',
      };
    }

    const id = candidate.id;
    const value = candidate.value;
    const expectedUpdatedAt = typeof candidate.expectedUpdatedAt === 'string'
      ? candidate.expectedUpdatedAt
      : null;
    return enqueueSqliteIpc('ticket-restaurante-people:save-record-if-unchanged', () =>
      saveTicketRestaurantePersonRecordIfUnchanged({
        id,
        value,
        expectedUpdatedAt,
      }),
    );
  });
  ipcMain.handle('ticket-restaurante-people:save-records-if-unchanged', (_event, payload: unknown) => {
    const invalidPayloadResult = {
      ok: false,
      status: getSqliteStatus(),
      results: [],
      message: 'Payload de lote de personas de Ticket Restaurante inválido.',
    };

    if (!payload || typeof payload !== 'object') {
      return invalidPayloadResult;
    }

    const candidate = payload as { records?: unknown };
    if (!Array.isArray(candidate.records)) {
      return invalidPayloadResult;
    }

    const records: Array<{ id: string; value: string; expectedUpdatedAt: string | null }> = [];
    for (const item of candidate.records) {
      if (!item || typeof item !== 'object') {
        return invalidPayloadResult;
      }
      const recordCandidate = item as { id?: unknown; value?: unknown; expectedUpdatedAt?: unknown };
      if (
        typeof recordCandidate.id !== 'string' ||
        typeof recordCandidate.value !== 'string' ||
        (typeof recordCandidate.expectedUpdatedAt !== 'string' && recordCandidate.expectedUpdatedAt !== null)
      ) {
        return invalidPayloadResult;
      }
      records.push({
        id: recordCandidate.id,
        value: recordCandidate.value,
        expectedUpdatedAt: recordCandidate.expectedUpdatedAt,
      });
    }

    return enqueueSqliteIpc('ticket-restaurante-people:save-records-if-unchanged', () =>
      saveTicketRestaurantePersonRecordsIfUnchanged(records),
    );
  });
  ipcMain.handle('ticket-restaurante-absences:load-records', () =>
    enqueueSqliteIpc('ticket-restaurante-absences:load-records', () =>
      loadTicketRestauranteAbsenceRecordsSnapshot(),
    ),
  );
  ipcMain.handle('ticket-restaurante-absences:save-record-if-unchanged', (_event, payload: unknown) => {
    if (!payload || typeof payload !== 'object') {
      return {
        ok: false,
        status: getSqliteStatus(),
        currentUpdatedAt: null,
        message: 'Payload de ausencia de Ticket Restaurante inválido.',
      };
    }

    const candidate = payload as { id?: unknown; value?: unknown; expectedUpdatedAt?: unknown };
    if (
      typeof candidate.id !== 'string' ||
      typeof candidate.value !== 'string' ||
      (typeof candidate.expectedUpdatedAt !== 'string' && candidate.expectedUpdatedAt !== null)
    ) {
      return {
        ok: false,
        status: getSqliteStatus(),
        currentUpdatedAt: null,
        message: 'Payload de ausencia de Ticket Restaurante inválido.',
      };
    }

    const id = candidate.id;
    const value = candidate.value;
    const expectedUpdatedAt = typeof candidate.expectedUpdatedAt === 'string'
      ? candidate.expectedUpdatedAt
      : null;
    return enqueueSqliteIpc('ticket-restaurante-absences:save-record-if-unchanged', () =>
      saveTicketRestauranteAbsenceRecordIfUnchanged({
        id,
        value,
        expectedUpdatedAt,
      }),
    );
  });
  ipcMain.handle('ticket-restaurante-absences:save-records-if-unchanged', (_event, payload: unknown) => {
    const invalidPayloadResult = {
      ok: false,
      status: getSqliteStatus(),
      results: [],
      message: 'Payload de lote de ausencias de Ticket Restaurante inválido.',
    };

    if (!payload || typeof payload !== 'object') {
      return invalidPayloadResult;
    }

    const candidate = payload as { records?: unknown };
    if (!Array.isArray(candidate.records)) {
      return invalidPayloadResult;
    }

    const records: Array<{ id: string; value: string; expectedUpdatedAt: string | null }> = [];
    for (const item of candidate.records) {
      if (!item || typeof item !== 'object') {
        return invalidPayloadResult;
      }
      const recordCandidate = item as { id?: unknown; value?: unknown; expectedUpdatedAt?: unknown };
      if (
        typeof recordCandidate.id !== 'string' ||
        typeof recordCandidate.value !== 'string' ||
        (typeof recordCandidate.expectedUpdatedAt !== 'string' && recordCandidate.expectedUpdatedAt !== null)
      ) {
        return invalidPayloadResult;
      }
      records.push({
        id: recordCandidate.id,
        value: recordCandidate.value,
        expectedUpdatedAt: recordCandidate.expectedUpdatedAt,
      });
    }

    return enqueueSqliteIpc('ticket-restaurante-absences:save-records-if-unchanged', () =>
      saveTicketRestauranteAbsenceRecordsIfUnchanged(records),
    );
  });
  ipcMain.handle('ticket-restaurante-manutenciones:load-records', () =>
    enqueueSqliteIpc('ticket-restaurante-manutenciones:load-records', () =>
      loadTicketRestauranteManutencionRecordsSnapshot(),
    ),
  );
  ipcMain.handle('ticket-restaurante-manutenciones:save-record-if-unchanged', (_event, payload: unknown) => {
    if (!payload || typeof payload !== 'object') {
      return {
        ok: false,
        status: getSqliteStatus(),
        currentUpdatedAt: null,
        message: 'Payload de manutención de Ticket Restaurante inválido.',
      };
    }

    const candidate = payload as { id?: unknown; value?: unknown; expectedUpdatedAt?: unknown };
    if (
      typeof candidate.id !== 'string' ||
      typeof candidate.value !== 'string' ||
      (typeof candidate.expectedUpdatedAt !== 'string' && candidate.expectedUpdatedAt !== null)
    ) {
      return {
        ok: false,
        status: getSqliteStatus(),
        currentUpdatedAt: null,
        message: 'Payload de manutención de Ticket Restaurante inválido.',
      };
    }

    const id = candidate.id;
    const value = candidate.value;
    const expectedUpdatedAt = typeof candidate.expectedUpdatedAt === 'string'
      ? candidate.expectedUpdatedAt
      : null;
    return enqueueSqliteIpc('ticket-restaurante-manutenciones:save-record-if-unchanged', () =>
      saveTicketRestauranteManutencionRecordIfUnchanged({
        id,
        value,
        expectedUpdatedAt,
      }),
    );
  });
  ipcMain.handle('ticket-restaurante-manutenciones:save-records-if-unchanged', (_event, payload: unknown) => {
    const invalidPayloadResult = {
      ok: false,
      status: getSqliteStatus(),
      results: [],
      message: 'Payload de lote de manutenciones de Ticket Restaurante inválido.',
    };

    if (!payload || typeof payload !== 'object') {
      return invalidPayloadResult;
    }

    const candidate = payload as { records?: unknown };
    if (!Array.isArray(candidate.records)) {
      return invalidPayloadResult;
    }

    const records: Array<{ id: string; value: string; expectedUpdatedAt: string | null }> = [];
    for (const item of candidate.records) {
      if (!item || typeof item !== 'object') {
        return invalidPayloadResult;
      }
      const recordCandidate = item as { id?: unknown; value?: unknown; expectedUpdatedAt?: unknown };
      if (
        typeof recordCandidate.id !== 'string' ||
        typeof recordCandidate.value !== 'string' ||
        (typeof recordCandidate.expectedUpdatedAt !== 'string' && recordCandidate.expectedUpdatedAt !== null)
      ) {
        return invalidPayloadResult;
      }
      records.push({
        id: recordCandidate.id,
        value: recordCandidate.value,
        expectedUpdatedAt: recordCandidate.expectedUpdatedAt,
      });
    }

    return enqueueSqliteIpc('ticket-restaurante-manutenciones:save-records-if-unchanged', () =>
      saveTicketRestauranteManutencionRecordsIfUnchanged(records),
    );
  });
  ipcMain.handle('ticket-restaurante-config:load-records', () =>
    enqueueSqliteIpc('ticket-restaurante-config:load-records', () =>
      loadTicketRestauranteConfigRecordsSnapshot(),
    ),
  );
  ipcMain.handle('ticket-restaurante-config:save-record-if-unchanged', (_event, payload: unknown) => {
    if (!payload || typeof payload !== 'object') {
      return {
        ok: false,
        status: getSqliteStatus(),
        currentUpdatedAt: null,
        message: 'Payload de configuración de Ticket Restaurante inválido.',
      };
    }

    const candidate = payload as { id?: unknown; value?: unknown; expectedUpdatedAt?: unknown };
    if (
      typeof candidate.id !== 'string' ||
      typeof candidate.value !== 'string' ||
      (typeof candidate.expectedUpdatedAt !== 'string' && candidate.expectedUpdatedAt !== null)
    ) {
      return {
        ok: false,
        status: getSqliteStatus(),
        currentUpdatedAt: null,
        message: 'Payload de configuración de Ticket Restaurante inválido.',
      };
    }

    const id = candidate.id;
    const value = candidate.value;
    const expectedUpdatedAt = typeof candidate.expectedUpdatedAt === 'string'
      ? candidate.expectedUpdatedAt
      : null;
    return enqueueSqliteIpc('ticket-restaurante-config:save-record-if-unchanged', () =>
      saveTicketRestauranteConfigRecordIfUnchanged({
        id,
        value,
        expectedUpdatedAt,
      }),
    );
  });
  ipcMain.handle('ticket-restaurante:open-load-workbook', async (_event, payload: unknown) => {
    try {
      if (!payload || typeof payload !== 'object') {
        throw new Error('Datos de carga de Ticket Restaurante no válidos.');
      }

      const candidate = payload as { rows?: unknown; fileName?: unknown };
      if (!Array.isArray(candidate.rows) || typeof candidate.fileName !== 'string') {
        throw new Error('Datos de carga de Ticket Restaurante no válidos.');
      }

      const rows: TicketRestaurantLoadRow[] = candidate.rows.map((item) => {
        if (!item || typeof item !== 'object') {
          throw new Error('Se ha recibido una fila de carga no válida.');
        }
        const row = item as Record<string, unknown>;
        const stringFields = [
          'nombre',
          'apellido1',
          'apellido2',
          'dni',
          'pedido',
          'ceco',
          'fechaInicio',
          'fechaCaducidad',
        ] as const;
        for (const field of stringFields) {
          if (typeof row[field] !== 'string') {
            throw new Error(`El campo ${field} de la carga no es válido.`);
          }
        }
        if (typeof row.importeTotal !== 'number') {
          throw new Error('El importe total de la carga no es válido.');
        }
        return {
          nombre: row.nombre as string,
          apellido1: row.apellido1 as string,
          apellido2: row.apellido2 as string,
          dni: row.dni as string,
          pedido: row.pedido as string,
          ceco: row.ceco as string,
          importeTotal: row.importeTotal,
          fechaInicio: row.fechaInicio as string,
          fechaCaducidad: row.fechaCaducidad as string,
        };
      });

      const buffer = await buildTicketRestaurantLoadWorkbook(rows);
      return openExcelWorkbook({ buffer, fileName: candidate.fileName });
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : 'No se ha podido generar la carga de Cheque Gourmet.',
      };
    }
  });

}
