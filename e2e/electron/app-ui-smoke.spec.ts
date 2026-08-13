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
      ['Operativa diaria', 'Comité / Paritaria'],
      ['Operativa diaria', 'Actas'],
      ['Personas', 'Plantilla'],
      ['Personas', 'Teletrabajo'],
      ['Personas', 'Licencias sin sueldo'],
      ['Personas', 'Vinculograma'],
      ['Herramientas', 'Ticket Restaurante'],
      ['Herramientas', 'Presupuestos'],
      ['Herramientas', 'Criterios RRLL'],
      ['Herramientas', 'Sorteos'],
      ['Herramientas', 'Lotería'],
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

test('las ayudas de todos los módulos abren como diálogo y no desbordan horizontalmente', async () => {
  const { page, close } = await launchTraccionElectron();

  try {
    const modules = [
      ['Operativa diaria', 'Tareas'],
      ['Operativa diaria', 'Comité / Paritaria'],
      ['Operativa diaria', 'Actas'],
      ['Personas', 'Plantilla'],
      ['Personas', 'Teletrabajo'],
      ['Personas', 'Licencias sin sueldo'],
      ['Personas', 'Vinculograma'],
      ['Herramientas', 'Ticket Restaurante'],
      ['Herramientas', 'Presupuestos'],
      ['Herramientas', 'Criterios RRLL'],
      ['Herramientas', 'Sorteos'],
      ['Herramientas', 'Lotería'],
      ['Herramientas', 'Especiales'],
    ] as const;

    for (const [groupLabel, moduleLabel] of modules) {
      await navigateToModule(page, groupLabel, moduleLabel);
      const helpButton = page.getByRole('button', { name: /Abrir ayuda de/i }).first();
      await expect(helpButton).toBeVisible();
      await helpButton.click();

      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      const helpBody = dialog.getByTestId('module-help-body');
      const hasHorizontalOverflow = await helpBody.evaluate(
        (element) => element.scrollWidth > element.clientWidth + 1,
      );
      expect(hasHorizontalOverflow, `La ayuda de ${moduleLabel} tiene overflow horizontal`).toBe(false);

      await page.keyboard.press('Escape');
      await expect(dialog).not.toBeVisible();
      await expect(helpButton).toBeFocused();
    }

    await page.getByRole('button', { name: 'Ajustes' }).click();
    const settingsHelp = page.getByRole('button', { name: /Abrir ayuda de/i }).first();
    await settingsHelp.click();
    const settingsDialog = page.getByRole('dialog');
    await expect(settingsDialog).toBeVisible();
    const settingsOverflow = await settingsDialog.getByTestId('module-help-body').evaluate(
      (element) => element.scrollWidth > element.clientWidth + 1,
    );
    expect(settingsOverflow, 'La ayuda de Ajustes tiene overflow horizontal').toBe(false);
    await page.keyboard.press('Escape');
    await expect(settingsHelp).toBeFocused();
  } finally {
    await close();
  }
});
