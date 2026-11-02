import { describe, expect, it } from 'vitest';
import { reconcileLotteryDraft } from './loteriaDraftSync';
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
