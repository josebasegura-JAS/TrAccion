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

      await expect(dialog).not.toBeVisible({ timeout: 10_000 });
      await expect(page.getByText(taskTitle, { exact: true }).first()).toBeVisible({ timeout: 10_000 });
    });
  } finally {
    await close();
  }
});

test('persistencia crítica: una tarea sigue disponible después de cerrar y reabrir la app', async () => {
  const firstLaunch = await launchTraccionElectron({ removeUserDataOnClose: false });
  const taskTitle = `E2E persistencia ${Date.now()}`;

  try {
    await navigateToModule(firstLaunch.page, 'Operativa diaria', 'Tareas');
    await firstLaunch.page.getByRole('button', { name: /Nueva tarea/ }).click();

    const dialog = firstLaunch.page.getByRole('dialog', { name: 'Nueva tarea' });
    await dialog.getByLabel('Título').fill(taskTitle);
    await dialog.getByLabel('Responsable').fill('RRLL');
    await dialog.getByRole('button', { name: 'Guardar' }).click();
    await expect(firstLaunch.page.getByText(taskTitle, { exact: true }).first()).toBeVisible();

    await firstLaunch.app.close();

    const secondLaunch = await launchTraccionElectron({
      userDataDir: firstLaunch.userDataDir,
      removeUserDataOnClose: true,
    });

    try {
      await navigateToModule(secondLaunch.page, 'Operativa diaria', 'Tareas');
      await expect(secondLaunch.page.getByText(taskTitle, { exact: true }).first()).toBeVisible({
        timeout: 10_000,
      });
    } finally {
      await secondLaunch.close();
    }
  } catch (error) {
    await firstLaunch.app.close().catch(() => undefined);
    await firstLaunch.cleanup();
    throw error;
  }
});
