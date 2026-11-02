/** Registra localmente el trabajo de exportación, sin duplicar datos económicos. */
export const pendingLotteryExcelKey = (year: number): string => `traccion.v1.loteria.excel-pending.${year}`;
export interface LotteryExportPendingStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
export function isLotteryExcelPending(storage: LotteryExportPendingStorage, year: number): boolean {
  try { return storage.getItem(pendingLotteryExcelKey(year)) === '1'; } catch { return false; }
}
export async function exportSavedLotteryCampaign(
  year: number,
  storage: LotteryExportPendingStorage,
  exportFile: () => Promise<{ ok: boolean; message: string }>,
): Promise<{ ok: boolean; message: string }> {
  try { storage.setItem(pendingLotteryExcelKey(year), '1'); }
  catch { return { ok: false, message: 'No se puede registrar la exportación pendiente en este equipo.' }; }
  try {
    const result = await exportFile();
    if (result.ok) storage.removeItem(pendingLotteryExcelKey(year));
    return result;
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}
