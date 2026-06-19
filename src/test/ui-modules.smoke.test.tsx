import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ActasPage } from '../features/actas/components/ActasPage';
import { ComitePage } from '../features/comite/components/ComitePage';
import { LicenciasSinSueldoPage } from '../features/licencias-sin-sueldo/components/LicenciasSinSueldoPage';
import { ParitariaPage } from '../features/paritaria/components/ParitariaPage';
import { SorteosPage } from '../features/sorteos/components/SorteosPage';
import { TicketRestaurantePage } from '../features/ticket-restaurante/components/TicketRestaurantePage';
import { AjustesPage } from '../components/AjustesPage';
import { PlantillaPage } from '../components/PlantillaPage';
import { TareasPage } from '../components/TareasPage';
import { TeletrabajoPage } from '../components/TeletrabajoPage';

const databaseStatus: TraccionDatabaseStatus = {
  ready: false,
  engine: 'localStorage',
  phase: 'fallback',
  isDefaultPath: true,
  message: 'Entorno de test sin SQLite real',
};

const successfulRecordLock: TraccionRecordLockResult = {
  ok: true,
  status: 'acquired',
  lock: null,
  message: 'Bloqueo simulado adquirido',
};

function installExternalApiMocks(): void {
  window.traccion = {
    databaseStatus: vi.fn().mockResolvedValue(databaseStatus),
    getPersistedRecordsToken: vi.fn().mockResolvedValue({
      status: databaseStatus,
      refreshToken: null,
      latestUpdatedAt: null,
      taskRecordsUpdatedAt: null,
      sorteosDrawsUpdatedAt: null,
      sorteosExclusionsUpdatedAt: null,
    }),
    getPersistedRecord: vi.fn().mockResolvedValue({ status: databaseStatus, record: null }),
    loadPersistedRecords: vi.fn().mockResolvedValue({
      status: databaseStatus,
      refreshToken: null,
      latestUpdatedAt: null,
      records: [],
    }),
    loadEmployeeRecords: vi.fn().mockResolvedValue({ status: databaseStatus, records: [] }),
    loadTaskRecords: vi.fn().mockResolvedValue({ status: databaseStatus, records: [] }),
    loadSorteosRecords: vi.fn().mockResolvedValue({
      status: databaseStatus,
      draws: [],
      exclusions: [],
      drawsUpdatedAt: null,
      exclusionsUpdatedAt: null,
    }),
    acquireRecordLock: vi.fn().mockResolvedValue(successfulRecordLock),
    heartbeatRecordLock: vi.fn().mockResolvedValue(successfulRecordLock),
    releaseRecordLock: vi.fn().mockResolvedValue({
      ...successfulRecordLock,
      status: 'released',
      message: 'Bloqueo simulado liberado',
    }),
    getRecordLock: vi.fn().mockResolvedValue({ ...successfulRecordLock, status: 'idle' }),
    saveLocalStorageRecord: vi.fn().mockResolvedValue(databaseStatus),
    saveLocalStorageRecordIfUnchanged: vi.fn().mockResolvedValue({
      ok: true,
      status: databaseStatus,
      currentUpdatedAt: null,
      message: 'Guardado simulado',
    }),
    saveTaskRecordIfUnchanged: vi.fn().mockResolvedValue({
      ok: true,
      status: databaseStatus,
      currentUpdatedAt: null,
      message: 'Guardado simulado',
    }),
    selectTeletrabajoTemplate: vi.fn().mockResolvedValue(null),
    readTeletrabajoTemplate: vi.fn().mockResolvedValue(new ArrayBuffer(0)),
    createOutlookDraft: vi.fn().mockResolvedValue({ ok: true, message: 'Borrador simulado' }),
  };

  window.rrllOutlook = {
    createDraft: vi.fn().mockResolvedValue({ ok: true, message: 'Borrador simulado' }),
  };
}

describe('humo UI de módulos principales', () => {
  beforeAll(() => {
    Element.prototype.scrollTo = vi.fn();
  });

  beforeEach(() => {
    window.localStorage.clear();
    installExternalApiMocks();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it.each([
    ['Tareas', <TareasPage />, /Tareas/i],
    ['Peticiones', <TareasPage />, /orígenes/i],
    ['Actas', <ActasPage />, /Actas/i],
    ['Teletrabajo', <TeletrabajoPage />, /Teletrabajo/i],
    ['Plantilla', <PlantillaPage />, /Plantilla/i],
    ['Ticket Restaurante', <TicketRestaurantePage />, /Ticket Restaurante/i],
    ['Sorteos', <SorteosPage />, /Sorteos/i],
    ['Licencias / Excedencias', <LicenciasSinSueldoPage />, /Licencias sin sueldo/i],
    ['Comité de Empresa', <ComitePage />, /Comité de Empresa/i],
    ['Comisión Paritaria', <ParitariaPage />, /Comisión Paritaria/i],
    ['Ajustes', <AjustesPage />, /Configuración/i],
  ])('renderiza el módulo %s sin romper', async (_moduleName, ui, expectedText) => {
    render(ui);

    expect((await screen.findAllByText(expectedText))[0]).toBeInTheDocument();
  });
});
