import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LicenciaSinSueldoRecord } from '../domain/licenciaSinSueldo';
import { useLicenciasSinSueldoStore } from './useLicenciasSinSueldoStore';

const timestamp = '2026-06-17T08:00:00.000Z';

function licencia(overrides: Partial<LicenciaSinSueldoRecord> = {}): LicenciaSinSueldoRecord {
  return {
    id: 'licencia-1',
    numeroEmpleado: '1001',
    nombreCompleto: 'Ana García López',
    tipo: 'Licencia sin sueldo',
    fechaSolicitud: '2026-06-01',
    fechaInicio: '2026-07-01',
    fechaFin: '2026-08-01',
    estado: 'pendiente_aprobacion',
    observaciones: '',
    actualizaciones: [],
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null,
    ...overrides,
  };
}

function activeStatus() {
  return { ready: true, phase: 'active' as const, message: 'SQLite activo' };
}

function recordsSnapshot(licencias: LicenciaSinSueldoRecord[], updatedAt: string) {
  return {
    status: activeStatus(),
    records: licencias.map((item) => ({
      id: item.id,
      value: JSON.stringify(item),
      createdAt: timestamp,
      updatedAt,
      deletedAt: null,
    })),
  };
}

function draftFrom(record: LicenciaSinSueldoRecord) {
  return {
    numeroEmpleado: record.numeroEmpleado,
    nombreCompleto: record.nombreCompleto,
    tipo: record.tipo,
    fechaSolicitud: record.fechaSolicitud,
    fechaInicio: record.fechaInicio,
    fechaFin: record.fechaFin,
    estado: record.estado,
    observaciones: record.observaciones,
    actualizaciones: record.actualizaciones,
  };
}

describe('useLicenciasSinSueldoStore concurrencia multiusuario', () => {
  beforeEach(() => {
    window.localStorage.clear();
    Object.defineProperty(window, 'traccion', { configurable: true, value: undefined });
    useLicenciasSinSueldoStore.setState({ records: [] });
  });

  it('rechaza el guardado cuando otro usuario ha modificado la licencia entre tanto (expectedUpdatedAt obsoleto)', async () => {
    const existingLicencia = licencia();
    // El loader simula que otro usuario ya modificó la licencia: la lista
    // que devuelve SQLite tiene un updatedAt más reciente que el que este
    // cliente todavía conoce (expectedUpdatedAt, basado en una lectura
    // anterior y ya obsoleta).
    const loader = vi.fn(async () => recordsSnapshot([existingLicencia], '2026-06-17T08:05:00.000Z'));
    const saver = vi.fn();

    Object.defineProperty(window, 'traccion', {
      configurable: true,
      value: { loadLicenciaSinSueldoRecords: loader, saveLicenciaSinSueldoRecordIfUnchanged: saver },
    });

    const result = await useLicenciasSinSueldoStore.getState().updateWithConcurrencyCheck(
      existingLicencia.id,
      { ...draftFrom(existingLicencia), observaciones: 'Cambio local que no debería aplicarse' },
      timestamp,
    );

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/modificad[oa] por otro usuario/i);
    // El conflicto se detecta comparando la lista ya cargada: el saver no
    // debe llegar a invocarse en absoluto.
    expect(saver).not.toHaveBeenCalled();
  });

  it('permite el guardado cuando expectedUpdatedAt coincide con el valor vigente en SQLite', async () => {
    const existingLicencia = licencia();
    const loader = vi.fn(async () => recordsSnapshot([existingLicencia], timestamp));
    const saver = vi.fn(async () => ({
      ok: true,
      status: activeStatus(),
      currentUpdatedAt: '2026-06-17T08:10:00.000Z',
      message: 'Licencia sin sueldo guardada en SQLite.',
    }));

    Object.defineProperty(window, 'traccion', {
      configurable: true,
      value: { loadLicenciaSinSueldoRecords: loader, saveLicenciaSinSueldoRecordIfUnchanged: saver },
    });

    const result = await useLicenciasSinSueldoStore.getState().updateWithConcurrencyCheck(
      existingLicencia.id,
      { ...draftFrom(existingLicencia), observaciones: 'Actualizado correctamente' },
      timestamp,
    );

    expect(result.ok).toBe(true);
    expect(saver).toHaveBeenCalledTimes(1);
    expect(useLicenciasSinSueldoStore.getState().records[0].observaciones).toBe(
      'Actualizado correctamente',
    );
  });

  it('rechaza removeWithConcurrencyCheck cuando otro usuario ha modificado la licencia entre tanto', async () => {
    const existingLicencia = licencia();
    const loader = vi.fn(async () => recordsSnapshot([existingLicencia], '2026-06-17T08:05:00.000Z'));
    const saver = vi.fn();

    Object.defineProperty(window, 'traccion', {
      configurable: true,
      value: { loadLicenciaSinSueldoRecords: loader, saveLicenciaSinSueldoRecordIfUnchanged: saver },
    });

    const result = await useLicenciasSinSueldoStore
      .getState()
      .removeWithConcurrencyCheck(existingLicencia.id, timestamp);

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/modificad[oa] por otro usuario/i);
    expect(saver).not.toHaveBeenCalled();
  });

  it('reloadFromStorage refleja el contenido vigente en SQLite (no tiene optimización de reuso de array)', async () => {
    // A diferencia de useVinculogramaStore, este store no implementa
    // reuseArrayIfUnchanged: reloadFromStorage llama a load() sin más, así
    // que siempre crea un array nuevo aunque el contenido sea idéntico.
    // Esto no es incorrecto (los datos siguen siendo correctos), pero es
    // una discrepancia real frente al patrón que sí tienen otros módulos
    // migrados en la misma tanda (menos estabilidad de referencia para
    // React, más re-renders de los esperables).
    const existingLicencia = licencia();
    const loader = vi.fn(async () => recordsSnapshot([existingLicencia], timestamp));

    Object.defineProperty(window, 'traccion', {
      configurable: true,
      value: { loadLicenciaSinSueldoRecords: loader, saveLicenciaSinSueldoRecordIfUnchanged: vi.fn() },
    });

    await useLicenciasSinSueldoStore.getState().load();
    expect(useLicenciasSinSueldoStore.getState().records).toHaveLength(1);

    await useLicenciasSinSueldoStore.getState().reloadFromStorage();

    expect(useLicenciasSinSueldoStore.getState().records).toHaveLength(1);
    expect(useLicenciasSinSueldoStore.getState().records[0].id).toBe(existingLicencia.id);
  });

  it('reloadFromStorage sí actualiza el estado cuando otro usuario añade una licencia nueva', async () => {
    const existingLicencia = licencia();
    const loader = vi
      .fn()
      .mockResolvedValueOnce(recordsSnapshot([existingLicencia], timestamp))
      .mockResolvedValueOnce(
        recordsSnapshot(
          [existingLicencia, licencia({ id: 'licencia-2', numeroEmpleado: '1002', nombreCompleto: 'Bea Ruiz' })],
          '2026-06-17T09:00:00.000Z',
        ),
      );

    Object.defineProperty(window, 'traccion', {
      configurable: true,
      value: { loadLicenciaSinSueldoRecords: loader, saveLicenciaSinSueldoRecordIfUnchanged: vi.fn() },
    });

    await useLicenciasSinSueldoStore.getState().load();
    expect(useLicenciasSinSueldoStore.getState().records).toHaveLength(1);

    await useLicenciasSinSueldoStore.getState().reloadFromStorage();

    expect(useLicenciasSinSueldoStore.getState().records).toHaveLength(2);
    expect(useLicenciasSinSueldoStore.getState().records.map((item) => item.id).sort()).toEqual([
      'licencia-1',
      'licencia-2',
    ]);
  });

  it('reloadFromStorage no provoca un nuevo render (mantiene la misma referencia de records) cuando no hay cambios reales', async () => {
    const existingLicencia = licencia();
    const loader = vi
      .fn()
      .mockResolvedValueOnce(recordsSnapshot([existingLicencia], timestamp))
      // Segunda lectura: mismo contenido normalizado, pero con un updatedAt
      // distinto — simula el caso real de un poll que detecta una escritura
      // (p.ej. un guardado de otro usuario en un registro distinto, o un
      // touch sin cambios efectivos) sin que el contenido de esta lista haya
      // cambiado de verdad.
      .mockResolvedValueOnce(recordsSnapshot([existingLicencia], '2026-06-17T09:00:00.000Z'));

    Object.defineProperty(window, 'traccion', {
      configurable: true,
      value: { loadLicenciaSinSueldoRecords: loader, saveLicenciaSinSueldoRecordIfUnchanged: vi.fn() },
    });

    await useLicenciasSinSueldoStore.getState().load();
    const recordsBeforeReload = useLicenciasSinSueldoStore.getState().records;

    await useLicenciasSinSueldoStore.getState().reloadFromStorage();

    expect(useLicenciasSinSueldoStore.getState().records).toBe(recordsBeforeReload);
  });
});
