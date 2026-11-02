import { describe, expect, it, vi } from 'vitest';
import { exportSavedLotteryCampaign, isLotteryExcelPending } from './loteriaExcelPending';
function storage() {
  const data = new Map<string, string>();
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); }, removeItem: (key: string) => { data.delete(key); } };
}
describe('exportación automática pendiente de Lotería', () => {
  it('reintenta un Excel fallido sin solicitar un segundo guardado SQLite', async () => {
    const memory = storage();
    const failed = vi.fn(async () => ({ ok: false, message: 'Carpeta sin permisos' }));
    expect((await exportSavedLotteryCampaign(2026, memory, failed)).ok).toBe(false);
    expect(isLotteryExcelPending(memory, 2026)).toBe(true);
    const retry = vi.fn(async () => ({ ok: true, message: 'Guardado' }));
    expect((await exportSavedLotteryCampaign(2026, memory, retry)).ok).toBe(true);
    expect(retry).toHaveBeenCalledTimes(1);
    expect(isLotteryExcelPending(memory, 2026)).toBe(false);
  });
  it('conserva pendiente ante error y no afecta otras campañas', async () => {
    const memory = storage();
    await exportSavedLotteryCampaign(2026, memory, async () => { throw Error('Disco desconectado'); });
    expect(isLotteryExcelPending(memory, 2026)).toBe(true);
    expect(isLotteryExcelPending(memory, 2027)).toBe(false);
  });
});
