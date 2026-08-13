import { describe, expect, it } from 'vitest';
import { addCalendarDays, toLocalIsoDate } from './dateOnly';

describe('dateOnly', () => {
  it('formats a calendar date from local components', () => {
    expect(toLocalIsoDate(new Date(2026, 7, 13, 0, 5))).toBe('2026-08-13');
  });

  it('adds calendar days without timezone shifts', () => {
    expect(addCalendarDays('2026-08-13', 7)).toBe('2026-08-20');
    expect(addCalendarDays('2026-08-13', 21)).toBe('2026-09-03');
    expect(addCalendarDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addCalendarDays('2028-02-28', 1)).toBe('2028-02-29');
  });

  it('leaves invalid calendar values unchanged', () => {
    expect(addCalendarDays('2026-02-30', 1)).toBe('2026-02-30');
    expect(addCalendarDays('not-a-date', 1)).toBe('not-a-date');
  });
});
