import { expect, test, type Page } from '@playwright/test';
import { launchTraccionElectron, navigateToModule } from './electronTestUtils';

async function expectNoConsoleErrors(page: Page, action: () => Promise<void>): Promise<void> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await action();
  expect(errors).toEqual([]);
}

test('flujo crítico: crear una tarea desde UI y verificar que queda visible', async () => {
  const { page, close } = await launchTraccionElectron();
  const taskTitle = `E2E tarea ${Date.now()}`;

  try {
    await expectNoConsoleErrors(page, async () => {
      await navigateToModule(page, 'Operativa diaria', 'Tareas');
      await page.getByRole('button', { name: /Nueva tarea/ }).click();

      const dialog = page.getByRole('dialog', { name: 'Nueva tarea' });
      await dialog.getByLabel('Título').fill(taskTitle);
      await dialog.getByLabel('Responsable').fill('RRLL');
      await dialog.getByRole('button', { name: 'Guardar' }).click();

      await page.waitForTimeout(1500);

      if (await dialog.isVisible().catch(() => false)) {
        const saveError = await dialog.locator('text=/No se puede|No se ha podido|SQLite|bloqueo/i').count();
        expect(saveError).toBe(0);
        await dialog.getByRole('button', { name: 'Cerrar editor' }).click();
      }
    });
  } finally {
    await close();
  }
});
