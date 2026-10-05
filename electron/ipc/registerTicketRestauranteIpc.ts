/**
 * Ticket Restaurante: calendarios, personas, ausencias, manutenciones y configuración.
 * Extraído de main.ts como parte de la división de registerIpcHandlers()
 * en un fichero por área funcional.
 */
import { ipcMain } from 'electron';
import { openExcelWorkbook } from '../documentOpener.js';
import { buildTicketRestaurantLoadWorkbook, type TicketRestaurantLoadRow } from '../ticketRestaurantLoadWorkbook.js';
import { enqueueSqliteIpc } from '../sqliteIpcQueue.js';
import { validateConditionalJsonRecord, validateConditionalJsonRecordBatch } from './ipcHelpers.js';
import {
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
    const record = validateConditionalJsonRecord(payload, 'Payload de calendario de Ticket Restaurante inválido.');
    if (!record.ok) return record.result;

    return enqueueSqliteIpc('ticket-restaurante-calendars:save-record-if-unchanged', () =>
      saveTicketRestauranteCalendarRecordIfUnchanged({
        id: record.id,
        value: record.value,
        expectedUpdatedAt: record.expectedUpdatedAt,
      }),
    );
  });
  ipcMain.handle('ticket-restaurante-calendars:save-records-if-unchanged', (_event, payload: unknown) => {
    const batch = validateConditionalJsonRecordBatch(
      payload,
      'Payload de lote de calendarios de Ticket Restaurante inválido.',
    );
    if (!batch.ok) return batch.result;

    return enqueueSqliteIpc('ticket-restaurante-calendars:save-records-if-unchanged', () =>
      saveTicketRestauranteCalendarRecordsIfUnchanged(batch.records),
    );
  });
  ipcMain.handle('ticket-restaurante-people:load-records', () =>
    enqueueSqliteIpc('ticket-restaurante-people:load-records', () =>
      loadTicketRestaurantePersonRecordsSnapshot(),
    ),
  );
  ipcMain.handle('ticket-restaurante-people:save-record-if-unchanged', (_event, payload: unknown) => {
    const record = validateConditionalJsonRecord(payload, 'Payload de persona de Ticket Restaurante inválido.');
    if (!record.ok) return record.result;

    return enqueueSqliteIpc('ticket-restaurante-people:save-record-if-unchanged', () =>
      saveTicketRestaurantePersonRecordIfUnchanged({
        id: record.id,
        value: record.value,
        expectedUpdatedAt: record.expectedUpdatedAt,
      }),
    );
  });
  ipcMain.handle('ticket-restaurante-people:save-records-if-unchanged', (_event, payload: unknown) => {
    const batch = validateConditionalJsonRecordBatch(
      payload,
      'Payload de lote de personas de Ticket Restaurante inválido.',
    );
    if (!batch.ok) return batch.result;

    return enqueueSqliteIpc('ticket-restaurante-people:save-records-if-unchanged', () =>
      saveTicketRestaurantePersonRecordsIfUnchanged(batch.records),
    );
  });
  ipcMain.handle('ticket-restaurante-absences:load-records', () =>
    enqueueSqliteIpc('ticket-restaurante-absences:load-records', () =>
      loadTicketRestauranteAbsenceRecordsSnapshot(),
    ),
  );
  ipcMain.handle('ticket-restaurante-absences:save-record-if-unchanged', (_event, payload: unknown) => {
    const record = validateConditionalJsonRecord(payload, 'Payload de ausencia de Ticket Restaurante inválido.');
    if (!record.ok) return record.result;

    return enqueueSqliteIpc('ticket-restaurante-absences:save-record-if-unchanged', () =>
      saveTicketRestauranteAbsenceRecordIfUnchanged({
        id: record.id,
        value: record.value,
        expectedUpdatedAt: record.expectedUpdatedAt,
      }),
    );
  });
  ipcMain.handle('ticket-restaurante-absences:save-records-if-unchanged', (_event, payload: unknown) => {
    const batch = validateConditionalJsonRecordBatch(
      payload,
      'Payload de lote de ausencias de Ticket Restaurante inválido.',
    );
    if (!batch.ok) return batch.result;

    return enqueueSqliteIpc('ticket-restaurante-absences:save-records-if-unchanged', () =>
      saveTicketRestauranteAbsenceRecordsIfUnchanged(batch.records),
    );
  });
  ipcMain.handle('ticket-restaurante-manutenciones:load-records', () =>
    enqueueSqliteIpc('ticket-restaurante-manutenciones:load-records', () =>
      loadTicketRestauranteManutencionRecordsSnapshot(),
    ),
  );
  ipcMain.handle('ticket-restaurante-manutenciones:save-record-if-unchanged', (_event, payload: unknown) => {
    const record = validateConditionalJsonRecord(payload, 'Payload de manutención de Ticket Restaurante inválido.');
    if (!record.ok) return record.result;

    return enqueueSqliteIpc('ticket-restaurante-manutenciones:save-record-if-unchanged', () =>
      saveTicketRestauranteManutencionRecordIfUnchanged({
        id: record.id,
        value: record.value,
        expectedUpdatedAt: record.expectedUpdatedAt,
      }),
    );
  });
  ipcMain.handle('ticket-restaurante-manutenciones:save-records-if-unchanged', (_event, payload: unknown) => {
    const batch = validateConditionalJsonRecordBatch(
      payload,
      'Payload de lote de manutenciones de Ticket Restaurante inválido.',
    );
    if (!batch.ok) return batch.result;

    return enqueueSqliteIpc('ticket-restaurante-manutenciones:save-records-if-unchanged', () =>
      saveTicketRestauranteManutencionRecordsIfUnchanged(batch.records),
    );
  });
  ipcMain.handle('ticket-restaurante-config:load-records', () =>
    enqueueSqliteIpc('ticket-restaurante-config:load-records', () =>
      loadTicketRestauranteConfigRecordsSnapshot(),
    ),
  );
  ipcMain.handle('ticket-restaurante-config:save-record-if-unchanged', (_event, payload: unknown) => {
    const record = validateConditionalJsonRecord(
      payload,
      'Payload de configuración de Ticket Restaurante inválido.',
    );
    if (!record.ok) return record.result;

    return enqueueSqliteIpc('ticket-restaurante-config:save-record-if-unchanged', () =>
      saveTicketRestauranteConfigRecordIfUnchanged({
        id: record.id,
        value: record.value,
        expectedUpdatedAt: record.expectedUpdatedAt,
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
