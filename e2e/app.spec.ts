import { expect, test } from '@playwright/test';

test('muestra Inicio y permite consultar Plantilla sin SQLite compartida', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Dashboard RRLL' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Inicio', exact: true })).toHaveAttribute('aria-current', 'page');
  await page.getByRole('button', { name: 'Personas', exact: true }).click();
  await page.getByRole('navigation', { name: 'Opciones de Personas' })
    .getByRole('button', { name: 'Plantilla', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Plantilla', exact: true })).toBeVisible();
  await expect(page.getByText('Personas en plantilla', { exact: true }).first()).toBeVisible();
  expect(errors).toEqual([]);
});
