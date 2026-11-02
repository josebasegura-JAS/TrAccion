import { describe, expect, it } from 'vitest';
import { hasLotteryRemoteConflict, reconcileLotteryDraft } from './loteriaDraftSync';
describe('sincronización de borradores multiusuario Lotería', () => {
  it('aplica recargas cuando no hay cambios', () => {
    const prior = { payments: 1 };
    expect(reconcileLotteryDraft(prior, prior, { payments: 2 })).toEqual({ payments: 2 });
  });
  it('conserva borradores locales frente a recargas remotas', () => {
    const prior = { payments: 1 };
    const pending = { payments: 3 };
    expect(reconcileLotteryDraft(pending, prior, { payments: 2 })).toBe(pending);
  });
});

describe('detección de conflictos remotos de borradores', () => {
  it('identifica edición local y actualización remota simultáneas', () => {
    expect(hasLotteryRemoteConflict({ paid: 2 }, { paid: 1 }, { paid: 3 })).toBe(true);
  });
  it('no considera conflicto una confirmación del propio borrador', () => {
    expect(hasLotteryRemoteConflict({ paid: 2 }, { paid: 1 }, { paid: 2 })).toBe(false);
  });
  it('no bloquea recargas sin cambios locales', () => {
    expect(hasLotteryRemoteConflict({ paid: 1 }, { paid: 1 }, { paid: 3 })).toBe(false);
  });
});
