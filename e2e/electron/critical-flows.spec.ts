import { expect, test, type Page } from '@playwright/test';
import { launchTraccionElectron, navigateToModule } from './electronTestUtils';

async function expectNoConsoleErrors(page: Page, action: () => Promise<void>): Promise<void> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  });

  await action();

  expect(errors, `Errores de consola detectados: ${errors.join('\n')}`).toEqual([]);
}

test('flujo crítico: crear una tarea desde UI y verificar que queda visible', async () => {
  const { page, close } = await launchTraccionElectron();

  try {
    await expectNoConsoleErrors(page, async () => {
      await navigateToModule(page, 'Operativa diaria', 'Tareas');
      await page.getByRole('button', { name: /Nueva tarea/ }).click();

      const dialog = page.getByRole('dialog');
      await expect(dialog.getByRole('heading', { name: 'Nueva tarea' })).toBeVisible();
      await expect(dialog.getByRole('button', { name: /Estado de base de datos:/ })).toBeVisible();

      await dialog.getByLabel('Título').fill('E2E tarea crítica guardado');
      await dialog.getByLabel('Responsable').fill('RRLL');
      await dialog.getByLabel('Fecha límite').fill('2026-06-30');
      await dialog.getByLabel('Descripción').fill('Prueba E2E de creación sin generar EXE.');
      await dialog.getByLabel('Añadir seguimiento').fill('Alta inicial desde test UI crítico.');
      await dialog.getByRole('button', { name: 'Guardar' }).click();

      await expect(dialog).toHaveCount(0);
      await expect(page.getByText('E2E tarea crítica guardado')).toBeVisible();
    });
  } finally {
    await close();
  }
});

test('flujo crítico: abrir modales con semáforo BBDD en módulos sensibles', async () => {
  const { page, close } = await launchTraccionElectron();

  try {
    await navigateToModule(page, 'Operativa diaria', 'Actas');
    await page.getByRole('button', { name: 'Nueva acta' }).click();
    await expect(page.getByRole('dialog').getByRole('heading', { name: /Nueva acta|Editar acta/ })).toBeVisible();
    await expect(page.getByRole('dialog').getByRole('button', { name: /Estado de base de datos:/ })).toBeVisible();
    await page.locator('button[title="Cerrar"]').last().click();

    await navigateToModule(page, 'Personas', 'Licencias sin sueldo');
    await page.getByRole('button', { name: /Nueva solicitud/ }).click();
    await expect(page.getByText(/Nueva licencia o permiso|Ficha de licencia o permiso/)).toBeVisible();
    await expect(page.getByRole('button', { name: /Estado de base de datos:/ }).last()).toBeVisible();
    await page.getByRole('button', { name: 'Cancelar' }).click();

    await navigateToModule(page, 'Personas', 'Vinculograma');
    await page.getByRole('button', { name: /Nuevo vínculo/ }).click();
    await expect(page.getByText(/Nuevo vínculo|Editar vínculo/)).toBeVisible();
    await expect(page.getByRole('button', { name: /Estado de base de datos:/ }).last()).toBeVisible();
  } finally {
    await close();
  }
});

test('flujo crítico: navegación a módulos de importación/cálculo sin error de render', async () => {
  const { page, close } = await launchTraccionElectron();

  try {
    await navigateToModule(page, 'Herramientas', 'Ticket Restaurante');
    await expect(page.getByRole('heading', { name: 'Ticket Restaurante' })).toBeVisible();
    await expect(page.getByText(/Guardar importación|Cálculo|Personas Ticket/i).first()).toBeVisible();

    await navigateToModule(page, 'Herramientas', 'Sorteos');
    await expect(page.getByRole('heading', { name: 'Sorteos' })).toBeVisible();
    await expect(page.getByText(/Excluidos|Histórico|Sorteo/i).first()).toBeVisible();

    await navigateToModule(page, 'Personas', 'Teletrabajo');
    await expect(page.getByRole('heading', { name: 'Teletrabajo' })).toBeVisible();
    await expect(page.getByText(/Revisado|Solicitud|Histórico/i).first()).toBeVisible();
  } finally {
    await close();
  }
});
