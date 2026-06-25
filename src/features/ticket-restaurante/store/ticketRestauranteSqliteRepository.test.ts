import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  hasTicketRestauranteCalendarsSqliteRepository,
  hasTicketRestaurantePeopleSqliteRepository,
  loadTicketRestauranteCalendarRecordsFromSqlite,
  loadTicketRestaurantePersonRecordsFromSqlite,
  saveTicketRestauranteCalendarsToSqlite,
  saveTicketRestauranteCalendarToSqlite,
  saveTicketRestaurantePeopleToSqlite,
  saveTicketRestaurantePersonToSqlite,
} from './ticketRestauranteSqliteRepository';

const timestamp = '2026-06-17T08:00:00.000Z';

describe('ticketRestauranteSqliteRepository', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'requestAnimationFrame', {
      configurable: true,
      value: (callback: FrameRequestCallback) => window.setTimeout(() => callback(performance.now()), 0),
    });
    Object.defineProperty(window, 'traccion', { configurable: true, value: undefined });
  });

  describe('calendars', () => {
    it('detecta si el repositorio SQLite de calendarios está disponible', () => {
      expect(hasTicketRestauranteCalendarsSqliteRepository()).toBe(false);

      Object.defineProperty(window, 'traccion', {
        configurable: true,
        value: {
          loadTicketRestauranteCalendarRecords: vi.fn(),
          saveTicketRestauranteCalendarRecordIfUnchanged: vi.fn(),
        },
      });

      expect(hasTicketRestauranteCalendarsSqliteRepository()).toBe(true);
    });

    it('devuelve null si SQLite no está activo para lectura', async () => {
      Object.defineProperty(window, 'traccion', {
        configurable: true,
        value: {
          loadTicketRestauranteCalendarRecords: vi.fn(async () => ({
            status: { ready: false, phase: 'initializing', message: 'Inicializando' },
            records: [],
          })),
        },
      });

      await expect(loadTicketRestauranteCalendarRecordsFromSqlite()).resolves.toBeNull();
    });

    it('carga los registros crudos cuando SQLite está activo', async () => {
      const rawRecord = {
        id: 'ticket-calendar-1',
        value: JSON.stringify({ id: 'ticket-calendar-1', nombre: 'Calendario central' }),
        createdAt: timestamp,
        updatedAt: timestamp,
        deletedAt: null,
      };
      Object.defineProperty(window, 'traccion', {
        configurable: true,
        value: {
          loadTicketRestauranteCalendarRecords: vi.fn(async () => ({
            status: { ready: true, phase: 'active', message: 'SQLite activo' },
            records: [rawRecord],
          })),
        },
      });

      await expect(loadTicketRestauranteCalendarRecordsFromSqlite()).resolves.toEqual([rawRecord]);
    });

    it('guarda un calendario con expectedUpdatedAt y devuelve el resultado normalizado', async () => {
      const saver = vi.fn(async () => ({
        ok: true,
        status: { ready: true, phase: 'active', message: 'SQLite activo' },
        message: 'Calendario guardado.',
        currentUpdatedAt: timestamp,
      }));
      Object.defineProperty(window, 'traccion', {
        configurable: true,
        value: { saveTicketRestauranteCalendarRecordIfUnchanged: saver },
      });

      const result = await saveTicketRestauranteCalendarToSqlite(
        { id: 'ticket-calendar-1' },
        '{"id":"ticket-calendar-1"}',
        'previous-token',
      );

      expect(saver).toHaveBeenCalledWith({
        id: 'ticket-calendar-1',
        value: '{"id":"ticket-calendar-1"}',
        expectedUpdatedAt: 'previous-token',
      });
      expect(result).toEqual({ ok: true, message: 'Calendario guardado.', currentUpdatedAt: timestamp });
    });

    it('devuelve null si no existe saver SQLite para escritura', async () => {
      await expect(
        saveTicketRestauranteCalendarToSqlite({ id: 'ticket-calendar-1' }, '{}', null),
      ).resolves.toBeNull();
    });

    it('propaga el conflicto de concurrencia sin lanzar excepción', async () => {
      const saver = vi.fn(async () => ({
        ok: false,
        status: { ready: true, phase: 'active', message: 'SQLite activo' },
        message: 'El calendario ha sido modificado por otro usuario.',
        currentUpdatedAt: '2026-06-18T00:00:00.000Z',
      }));
      Object.defineProperty(window, 'traccion', {
        configurable: true,
        value: { saveTicketRestauranteCalendarRecordIfUnchanged: saver },
      });

      const result = await saveTicketRestauranteCalendarToSqlite(
        { id: 'ticket-calendar-1' },
        '{}',
        'stale-token',
      );

      expect(result).toEqual({
        ok: false,
        message: 'El calendario ha sido modificado por otro usuario.',
        currentUpdatedAt: '2026-06-18T00:00:00.000Z',
      });
    });

    it('guarda un lote de calendarios en una sola llamada IPC, no una por registro', async () => {
      const saver = vi.fn(async () => ({
        ok: true,
        status: { ready: true, phase: 'active', message: 'SQLite activo' },
        results: [],
        message: '2 registros de Calendario de Ticket Restaurante guardados en SQLite.',
      }));
      Object.defineProperty(window, 'traccion', {
        configurable: true,
        value: { saveTicketRestauranteCalendarRecordsIfUnchanged: saver },
      });

      const result = await saveTicketRestauranteCalendarsToSqlite([
        { id: 'ticket-calendar-1', serializedValue: '{"id":"ticket-calendar-1"}', expectedUpdatedAt: 'token-a' },
        { id: 'ticket-calendar-2', serializedValue: '{"id":"ticket-calendar-2"}', expectedUpdatedAt: null },
      ]);

      expect(saver).toHaveBeenCalledTimes(1);
      expect(saver).toHaveBeenCalledWith([
        { id: 'ticket-calendar-1', value: '{"id":"ticket-calendar-1"}', expectedUpdatedAt: 'token-a' },
        { id: 'ticket-calendar-2', value: '{"id":"ticket-calendar-2"}', expectedUpdatedAt: null },
      ]);
      expect(result).toEqual({
        ok: true,
        message: '2 registros de Calendario de Ticket Restaurante guardados en SQLite.',
        failedRecordId: undefined,
      });
    });

    it('no llama al saver de lote si la lista de registros está vacía', async () => {
      const saver = vi.fn();
      Object.defineProperty(window, 'traccion', {
        configurable: true,
        value: { saveTicketRestauranteCalendarRecordsIfUnchanged: saver },
      });

      const result = await saveTicketRestauranteCalendarsToSqlite([]);

      expect(saver).not.toHaveBeenCalled();
      expect(result).toEqual({ ok: true, message: 'Nada que importar.' });
    });

    it('propaga el conflicto de concurrencia de un registro del lote junto a su id', async () => {
      const saver = vi.fn(async () => ({
        ok: false,
        status: { ready: true, phase: 'active', message: 'SQLite activo' },
        results: [
          {
            ok: false,
            status: { ready: true, phase: 'active', message: 'SQLite activo' },
            currentUpdatedAt: '2026-06-18T00:00:00.000Z',
            message: 'Calendario de Ticket Restaurante ha sido modificado por otro usuario. Recarga antes de guardar.',
          },
        ],
        failedRecordId: 'ticket-calendar-2',
        message: 'Calendario de Ticket Restaurante ha sido modificado por otro usuario. Recarga antes de guardar.',
      }));
      Object.defineProperty(window, 'traccion', {
        configurable: true,
        value: { saveTicketRestauranteCalendarRecordsIfUnchanged: saver },
      });

      const result = await saveTicketRestauranteCalendarsToSqlite([
        { id: 'ticket-calendar-1', serializedValue: '{}', expectedUpdatedAt: 'token-a' },
        { id: 'ticket-calendar-2', serializedValue: '{}', expectedUpdatedAt: 'stale-token' },
      ]);

      expect(result).toEqual({
        ok: false,
        message: 'Calendario de Ticket Restaurante ha sido modificado por otro usuario. Recarga antes de guardar.',
        failedRecordId: 'ticket-calendar-2',
      });
    });
  });

  describe('people', () => {
    it('detecta si el repositorio SQLite de personas está disponible', () => {
      expect(hasTicketRestaurantePeopleSqliteRepository()).toBe(false);

      Object.defineProperty(window, 'traccion', {
        configurable: true,
        value: {
          loadTicketRestaurantePersonRecords: vi.fn(),
          saveTicketRestaurantePersonRecordIfUnchanged: vi.fn(),
        },
      });

      expect(hasTicketRestaurantePeopleSqliteRepository()).toBe(true);
    });

    it('devuelve null si SQLite no está activo para lectura', async () => {
      Object.defineProperty(window, 'traccion', {
        configurable: true,
        value: {
          loadTicketRestaurantePersonRecords: vi.fn(async () => ({
            status: { ready: false, phase: 'initializing', message: 'Inicializando' },
            records: [],
          })),
        },
      });

      await expect(loadTicketRestaurantePersonRecordsFromSqlite()).resolves.toBeNull();
    });

    it('carga los registros crudos cuando SQLite está activo', async () => {
      const rawRecord = {
        id: '00001',
        value: JSON.stringify({ empleado: '00001', nombre: 'Ana' }),
        createdAt: timestamp,
        updatedAt: timestamp,
        deletedAt: null,
      };
      Object.defineProperty(window, 'traccion', {
        configurable: true,
        value: {
          loadTicketRestaurantePersonRecords: vi.fn(async () => ({
            status: { ready: true, phase: 'active', message: 'SQLite activo' },
            records: [rawRecord],
          })),
        },
      });

      await expect(loadTicketRestaurantePersonRecordsFromSqlite()).resolves.toEqual([rawRecord]);
    });

    it('guarda una persona usando el número de empleado como id y devuelve el resultado normalizado', async () => {
      const saver = vi.fn(async () => ({
        ok: true,
        status: { ready: true, phase: 'active', message: 'SQLite activo' },
        message: 'Persona guardada.',
        currentUpdatedAt: timestamp,
      }));
      Object.defineProperty(window, 'traccion', {
        configurable: true,
        value: { saveTicketRestaurantePersonRecordIfUnchanged: saver },
      });

      const result = await saveTicketRestaurantePersonToSqlite(
        { id: '00001' },
        '{"empleado":"00001"}',
        'previous-token',
      );

      expect(saver).toHaveBeenCalledWith({
        id: '00001',
        value: '{"empleado":"00001"}',
        expectedUpdatedAt: 'previous-token',
      });
      expect(result).toEqual({ ok: true, message: 'Persona guardada.', currentUpdatedAt: timestamp });
    });

    it('devuelve null si no existe saver SQLite para escritura', async () => {
      await expect(saveTicketRestaurantePersonToSqlite({ id: '00001' }, '{}', null)).resolves.toBeNull();
    });

    it('propaga el conflicto de concurrencia sin lanzar excepción', async () => {
      const saver = vi.fn(async () => ({
        ok: false,
        status: { ready: true, phase: 'active', message: 'SQLite activo' },
        message: 'La persona ha sido modificada por otro usuario.',
        currentUpdatedAt: '2026-06-18T00:00:00.000Z',
      }));
      Object.defineProperty(window, 'traccion', {
        configurable: true,
        value: { saveTicketRestaurantePersonRecordIfUnchanged: saver },
      });

      const result = await saveTicketRestaurantePersonToSqlite({ id: '00001' }, '{}', 'stale-token');

      expect(result).toEqual({
        ok: false,
        message: 'La persona ha sido modificada por otro usuario.',
        currentUpdatedAt: '2026-06-18T00:00:00.000Z',
      });
    });

    it('guarda un lote de personas en una sola llamada IPC, no una por registro (importPeople)', async () => {
      const saver = vi.fn(async () => ({
        ok: true,
        status: { ready: true, phase: 'active', message: 'SQLite activo' },
        results: [],
        message: '2 registros de Persona de Ticket Restaurante guardados en SQLite.',
      }));
      Object.defineProperty(window, 'traccion', {
        configurable: true,
        value: { saveTicketRestaurantePersonRecordsIfUnchanged: saver },
      });

      const result = await saveTicketRestaurantePeopleToSqlite([
        { id: '00001', serializedValue: '{"empleado":"00001"}', expectedUpdatedAt: 'token-a' },
        { id: '00002', serializedValue: '{"empleado":"00002"}', expectedUpdatedAt: null },
      ]);

      expect(saver).toHaveBeenCalledTimes(1);
      expect(saver).toHaveBeenCalledWith([
        { id: '00001', value: '{"empleado":"00001"}', expectedUpdatedAt: 'token-a' },
        { id: '00002', value: '{"empleado":"00002"}', expectedUpdatedAt: null },
      ]);
      expect(result).toEqual({
        ok: true,
        message: '2 registros de Persona de Ticket Restaurante guardados en SQLite.',
        failedRecordId: undefined,
      });
    });

    it('no llama al saver de lote si la lista de registros está vacía', async () => {
      const saver = vi.fn();
      Object.defineProperty(window, 'traccion', {
        configurable: true,
        value: { saveTicketRestaurantePersonRecordsIfUnchanged: saver },
      });

      const result = await saveTicketRestaurantePeopleToSqlite([]);

      expect(saver).not.toHaveBeenCalled();
      expect(result).toEqual({ ok: true, message: 'Nada que importar.' });
    });

    it('propaga el conflicto de concurrencia de un registro del lote junto a su id (empleado)', async () => {
      const saver = vi.fn(async () => ({
        ok: false,
        status: { ready: true, phase: 'active', message: 'SQLite activo' },
        results: [
          {
            ok: false,
            status: { ready: true, phase: 'active', message: 'SQLite activo' },
            currentUpdatedAt: '2026-06-18T00:00:00.000Z',
            message: 'Persona de Ticket Restaurante ha sido modificada por otro usuario. Recarga antes de guardar.',
          },
        ],
        failedRecordId: '00002',
        message: 'Persona de Ticket Restaurante ha sido modificada por otro usuario. Recarga antes de guardar.',
      }));
      Object.defineProperty(window, 'traccion', {
        configurable: true,
        value: { saveTicketRestaurantePersonRecordsIfUnchanged: saver },
      });

      const result = await saveTicketRestaurantePeopleToSqlite([
        { id: '00001', serializedValue: '{}', expectedUpdatedAt: 'token-a' },
        { id: '00002', serializedValue: '{}', expectedUpdatedAt: 'stale-token' },
      ]);

      expect(result).toEqual({
        ok: false,
        message: 'Persona de Ticket Restaurante ha sido modificada por otro usuario. Recarga antes de guardar.',
        failedRecordId: '00002',
      });
    });
  });
});
