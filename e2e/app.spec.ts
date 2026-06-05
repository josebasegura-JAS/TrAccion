import { expect, test } from '@playwright/test';

test('muestra navegación, módulo plantilla y métricas principales', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByText('RRLL PRO')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Plantilla' })).toBeVisible();
  await expect(page.getByText('Personas en plantilla').first()).toBeVisible();
});
