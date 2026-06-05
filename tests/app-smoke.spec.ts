import { expect, test } from '@playwright/test';

test('muestra la base TrAccion V1', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveTitle(/TrAccion V1/);
  await expect(page.getByRole('heading', { name: 'Inicio' })).toBeVisible();
  await expect(page.getByText('Panel RRLL preparado para crecer')).toBeVisible();
});
