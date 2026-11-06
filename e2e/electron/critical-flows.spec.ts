import { expect, test, type Page } from '@playwright/test';
import {
  closeTraccionElectron,
  createSharedDatabaseDirectory,
  launchTraccionElectron,
  launchTraccionElectronWithIsolatedSharedDatabase,
  navigateToModule,
} from './electronTestUtils';

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
  // El límite global de 45 s incluye el primer arranque real de Electron,
  // inicialización SQLite y cierre. Cada expectativa funcional mantiene su
  // timeout propio, y los pasos identifican dónde se atasca un CI lento.
  test.setTimeout(90_000);
  const launched = await test.step('Arrancar Electron con SQLite compartida aislada', () =>
    launchTraccionElectronWithIsolatedSharedDatabase(),
  );
  const { page, close } = launched;
  const taskTitle = `E2E tarea ${Date.now()}`;

  try {
    await expectNoConsoleErrors(page, async () => {
      await test.step('Navegar a Tareas y abrir nueva tarea', async () => {
        await navigateToModule(page, 'Operativa diaria', 'Tareas');
        await page.getByRole('button', { name: /Nueva tarea/ }).click();
      });

      const dialog = page.getByRole('dialog', { name: 'Nueva tarea' });
      await test.step('Cumplimentar y guardar la tarea', async () => {
        await dialog.getByLabel('Título').fill(taskTitle);
        await dialog.getByRole('region', { name: 'Acciones rápidas' }).getByRole('button', { name: 'Guardar' }).click();
        await expect(dialog).not.toBeVisible({ timeout: 10_000 });
      });

      await test.step('Verificar la tarea creada en el listado', async () => {
        await expect(page.getByText(taskTitle, { exact: true }).first()).toBeVisible({ timeout: 10_000 });
      });
    });
  } finally {
    await test.step('Cerrar Electron y limpiar la base de pruebas', () => close());
  }
});

test('persistencia crítica: una tarea sigue disponible después de cerrar y reabrir la app', async () => {
  const sharedDatabaseDirectory = await createSharedDatabaseDirectory();
  const firstLaunch = await launchTraccionElectron({
    removeUserDataOnClose: false,
    sharedDatabaseDirectory,
  });
  const taskTitle = `E2E persistencia ${Date.now()}`;

  try {
    await navigateToModule(firstLaunch.page, 'Operativa diaria', 'Tareas');
    await firstLaunch.page.getByRole('button', { name: /Nueva tarea/ }).click();

    const dialog = firstLaunch.page.getByRole('dialog', { name: 'Nueva tarea' });
    await dialog.getByLabel('Título').fill(taskTitle);
    await dialog.getByRole('region', { name: 'Acciones rápidas' }).getByRole('button', { name: 'Guardar' }).click();
    await expect(firstLaunch.page.getByText(taskTitle, { exact: true }).first()).toBeVisible();

    await closeTraccionElectron(firstLaunch.app);

    const secondLaunch = await launchTraccionElectron({
      userDataDir: firstLaunch.userDataDir,
      removeUserDataOnClose: true,
      sharedDatabaseDirectory,
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
    await closeTraccionElectron(firstLaunch.app).catch(() => undefined);
    await firstLaunch.cleanup();
    throw error;
  } finally {
    const { rm } = await import('node:fs/promises');
    await rm(sharedDatabaseDirectory, { recursive: true, force: true }).catch(() => undefined);
  }
});

test('módulos críticos de auditoría abren sus acciones principales con SQLite compartida', async () => {
  const { page, close } = await launchTraccionElectronWithIsolatedSharedDatabase();

  try {
    await expectNoConsoleErrors(page, async () => {
      await navigateToModule(page, 'Personas', 'Teletrabajo');
      await expect(page.getByText('Proceso de Teletrabajo', { exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Configuración y administración' }).click();
      await expect(page.getByRole('button', { name: /^Puestos teletrabajables/ })).toBeVisible();
      await expect(page.getByRole('button', { name: /^Grupos de cobertura/ })).toBeVisible();
      await page.getByRole('button').filter({ hasText: 'Solicitudes' }).first().click();
      await expect(page.getByRole('button', { name: 'Nueva solicitud' })).toBeVisible();

      await navigateToModule(page, 'Operativa diaria', 'Coordinación');
      await expect(page.getByRole('button', { name: 'Dirección' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Otras áreas' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Sindicatos' })).toBeVisible();

      await navigateToModule(page, 'Personas', 'Ayuda escolar');
      await expect(page.getByRole('button', { name: /Seleccionar \.msg/ })).toBeVisible();
    });
  } finally {
    await close();
  }
});
