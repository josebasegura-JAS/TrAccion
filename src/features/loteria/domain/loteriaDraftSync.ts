/** Evita que un refresco remoto descarte un borrador local. */
export function reconcileLotteryDraft<T>(draft: T, previousSaved: T, latestSaved: T): T {
  return JSON.stringify(draft) === JSON.stringify(previousSaved) ? latestSaved : draft;
}
