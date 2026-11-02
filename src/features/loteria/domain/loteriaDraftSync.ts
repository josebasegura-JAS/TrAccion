/** Evita que un refresco remoto descarte un borrador local. */
export function hasLotteryRemoteConflict<T>(draft: T, previousSaved: T, latestSaved: T): boolean {
  const initial = JSON.stringify(previousSaved);
  const current = JSON.stringify(draft);
  const latest = JSON.stringify(latestSaved);
  return initial !== latest && current !== initial && current !== latest;
}

export function reconcileLotteryDraft<T>(draft: T, previousSaved: T, latestSaved: T): T {
  return JSON.stringify(draft) === JSON.stringify(previousSaved) ? latestSaved : draft;
}
