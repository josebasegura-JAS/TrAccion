import { expect, test } from '@playwright/test';
import { launchTraccionElectron, navigateToModule } from './electronTestUtils';

test('arranca en Inicio y muestra estructura principal sin error de render', async () => {
  const { page, close } = await launchTraccionElectron();

  try {
    await expect(page).toHaveTitle(/TrAccion/);
    await expect(page.getByRole('heading', { name: 'Inicio' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Inicio' })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('button', { name: /Estado de base de datos:/ })).toBeVisible();
    await expect(page.getByText('No se ha podido mostrar TrAccion')).toHaveCount(0);
  } finally {
    await close();
  }
});

test('permite navegar por los módulos principales desde el menú lateral', async () => {
  const { page, close } = await launchTraccionElectron();

  try {
    const modules = [
      ['Operativa diaria', 'Tareas'],
      ['Operativa diaria', 'Comité de Empresa'],
      ['Operativa diaria', 'Actas'],
      ['Operativa diaria', 'Comisión Paritaria'],
      ['Personas', 'Plantilla'],
      ['Personas', 'Teletrabajo'],
      ['Personas', 'Licencias sin sueldo'],
      ['Personas', 'Vinculograma'],
      ['Herramientas', 'Ticket Restaurante'],
      ['Herramientas', 'Presupuestos'],
      ['Herramientas', 'Criterios RRLL'],
      ['Herramientas', 'Sorteos'],
      ['Herramientas', 'Especiales'],
    ] as const;

    for (const [groupLabel, moduleLabel] of modules) {
      await navigateToModule(page, groupLabel, moduleLabel);
    }

    await page.getByRole('button', { name: 'Ajustes' }).click();
    await expect(page.getByRole('heading', { name: 'Ajustes' })).toBeVisible();
  } finally {
    await close();
  }
});

test('abre modales críticos de Tareas y Actas', async () => {
  const { page, close } = await launchTraccionElectron();

  try {
    await navigateToModule(page, 'Operativa diaria', 'Tareas');
    await page.getByRole('button', { name: /Nueva tarea/ }).click();
    const taskDialog = page.getByRole('dialog', { name: /Nueva tarea|Editar tarea/ });
    await expect(taskDialog).toBeVisible();
    await expect(taskDialog).toContainText(/Nueva tarea|Editar tarea/);
    await taskDialog.getByRole('button', { name: 'Cerrar editor' }).click();

    await page.getByRole('button', { name: 'Orígenes' }).click();
    await expect(page.getByRole('dialog')).toContainText('Orígenes de tareas');
    await page.getByRole('button', { name: 'Cerrar mantenimiento de orígenes' }).click();

    await navigateToModule(page, 'Operativa diaria', 'Actas');
    await page.getByRole('button', { name: 'Nueva acta' }).click();
    await expect(page.getByRole('dialog', { name: /Nueva acta|Editar acta/ })).toBeVisible();
  } finally {
    await close();
  }
});

// Este test no sustituye a la prueba manual de Outlook/Excel/SMB real.
// Su objetivo es bloquear regresiones gruesas de render, navegación y modales.
