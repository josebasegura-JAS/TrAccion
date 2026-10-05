import path from 'node:path';
import { getSqliteStatus } from '../sqlitePersistence.js';

export type ConditionalJsonRecord = {
  id: string;
  value: string;
  expectedUpdatedAt: string | null;
};

type InvalidConditionalJsonRecordResult = {
  ok: false;
  status: ReturnType<typeof getSqliteStatus>;
  currentUpdatedAt: null;
  message: string;
};

type InvalidConditionalJsonRecordBatchResult = {
  ok: false;
  status: ReturnType<typeof getSqliteStatus>;
  results: [];
  message: string;
};

function isConditionalJsonRecord(value: unknown): value is ConditionalJsonRecord {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as { id?: unknown; value?: unknown; expectedUpdatedAt?: unknown };
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.value === 'string' &&
    (typeof candidate.expectedUpdatedAt === 'string' || candidate.expectedUpdatedAt === null)
  );
}

export function validateConditionalJsonRecord(
  payload: unknown,
  invalidMessage: string,
):
  | ({ ok: true } & ConditionalJsonRecord)
  | { ok: false; result: InvalidConditionalJsonRecordResult } {
  if (!isConditionalJsonRecord(payload)) {
    return {
      ok: false,
      result: {
        ok: false,
        status: getSqliteStatus(),
        currentUpdatedAt: null,
        message: invalidMessage,
      },
    };
  }

  return {
    ok: true,
    id: payload.id,
    value: payload.value,
    expectedUpdatedAt: payload.expectedUpdatedAt,
  };
}

export function validateConditionalJsonRecordBatch(
  payload: unknown,
  invalidMessage: string,
):
  | { ok: true; records: ConditionalJsonRecord[] }
  | { ok: false; result: InvalidConditionalJsonRecordBatchResult } {
  const invalidResult = (): { ok: false; result: InvalidConditionalJsonRecordBatchResult } => ({
    ok: false,
    result: {
      ok: false,
      status: getSqliteStatus(),
      results: [],
      message: invalidMessage,
    },
  });

  if (!payload || typeof payload !== 'object') {
    return invalidResult();
  }

  const candidate = payload as { records?: unknown };
  if (!Array.isArray(candidate.records) || !candidate.records.every(isConditionalJsonRecord)) {
    return invalidResult();
  }

  return {
    ok: true,
    records: candidate.records.map((record) => ({
      id: record.id,
      value: record.value,
      expectedUpdatedAt: record.expectedUpdatedAt,
    })),
  };
}

/**
 * Compatibilidad con los handlers existentes de Teletrabajo y Plantilla.
 * Los nuevos consumidores deben usar validateConditionalJsonRecord.
 */
export function validateJsonRecordPayload(
  payload: unknown,
  invalidMessage: string,
): ReturnType<typeof validateConditionalJsonRecord> {
  return validateConditionalJsonRecord(payload, invalidMessage);
}

/**
 * Valida que la ruta seleccionada por el usuario para una plantilla Word
 * apunte realmente a un .docx. Usado por los handlers `*:read-template` de
 * Teletrabajo, Vinculograma y Licencias sin sueldo (los tres siguen el mismo
 * patrón: seleccionar plantilla + leerla).
 */
export function assertDocxPath(filePath: string): void {
  if (path.extname(filePath).toLowerCase() !== '.docx') {
    throw new Error('La ruta configurada debe apuntar a un archivo DOCX.');
  }
}
