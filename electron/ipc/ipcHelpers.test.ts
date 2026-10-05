import { describe, expect, it, vi } from 'vitest';

vi.mock('../sqlitePersistence.js', () => ({
  getSqliteStatus: () => ({ available: false }),
}));

import {
  validateConditionalJsonRecord,
  validateConditionalJsonRecordBatch,
  validateJsonRecordPayload,
} from './ipcHelpers.js';

const validRecord = {
  id: 'record-1',
  value: '{"enabled":true}',
  expectedUpdatedAt: '2026-10-05T12:00:00.000Z',
};

describe('conditional JSON IPC payload validation', () => {
  it('accepts a valid conditional record without changing its values', () => {
    expect(validateConditionalJsonRecord(validRecord, 'invalid')).toEqual({
      ok: true,
      ...validRecord,
    });
  });

  it('accepts null expectedUpdatedAt for a new record', () => {
    const result = validateConditionalJsonRecord(
      { id: 'new-record', value: '{}', expectedUpdatedAt: null },
      'invalid',
    );

    expect(result).toEqual({
      ok: true,
      id: 'new-record',
      value: '{}',
      expectedUpdatedAt: null,
    });
  });

  it.each([
    null,
    {},
    { id: 1, value: '{}', expectedUpdatedAt: null },
    { id: 'x', value: 1, expectedUpdatedAt: null },
    { id: 'x', value: '{}', expectedUpdatedAt: undefined },
  ])('rejects an invalid individual payload: %o', (payload) => {
    const result = validateConditionalJsonRecord(payload, 'invalid individual');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.result).toMatchObject({
        ok: false,
        currentUpdatedAt: null,
        message: 'invalid individual',
      });
    }
  });

  it('accepts a valid batch and preserves record order', () => {
    const second = { id: 'record-2', value: '{}', expectedUpdatedAt: null };
    const result = validateConditionalJsonRecordBatch(
      { records: [validRecord, second] },
      'invalid batch',
    );

    expect(result).toEqual({
      ok: true,
      records: [validRecord, second],
    });
  });

  it.each([
    null,
    {},
    { records: 'not-an-array' },
    { records: [validRecord, null] },
    { records: [validRecord, { id: 'bad', value: 1, expectedUpdatedAt: null }] },
  ])('rejects an invalid batch payload: %o', (payload) => {
    const result = validateConditionalJsonRecordBatch(payload, 'invalid batch');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.result).toMatchObject({
        ok: false,
        results: [],
        message: 'invalid batch',
      });
    }
  });

  it('keeps validateJsonRecordPayload as a compatibility alias', () => {
    expect(validateJsonRecordPayload(validRecord, 'invalid')).toEqual(
      validateConditionalJsonRecord(validRecord, 'invalid'),
    );
  });
});
