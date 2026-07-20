import { expect, test, type Page } from '@playwright/test';
import {
  createSharedDatabaseDirectory,
  launchTraccionElectron,
  navigateToModule,
} from './electronTestUtils';

const TICKET_RESTAURANTE_GROUP = 'Herramientas';
const TICKET_RESTAURANTE_MODULE = 'Ticket Restaurante';

async function expectNoConsoleErrors(page: Page, action: () => Promise<void>): Promise<void> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await action();
  expect(errors).toEqual([]);
}

test('flujo crítico: crear un calendario de Ticket Restaurante desde UI y verificar que queda visible', async () => {
  const { page, close } = await launchTraccionElectron();
  const calendarName = `E2E calendario ${Date.now()}`;

  try {
    await expectNoConsoleErrors(page, async () => {
      await navigateToModule(page, TICKET_RESTAURANTE_GROUP, TICKET_RESTAURANTE_MODULE);
      await page.getByRole('button', { name: 'Calendarios' }).click();

      await page.getByLabel('Nombre calendario').fill(calendarName);
      await page.getByRole('button', { name: 'Guardar' }).click();

      // El guardado es async contra SQLite; esperamos a que el nuevo
      // calendario aparezca seleccionado en el desplegable, y a que no
      // haya quedado ningún aviso de error visible en pantalla.
      await expect(page.getByLabel('Selector calendario')).toContainText(calendarName, {
        timeout: 10_000,
      });
      await expect(page.getByRole('dialog')).toHaveCount(0);
    });
  } finally {
    await close();
  }
});

test('flujo crítico: dos usuarios sobre el mismo traccion.sqlite detectan el conflicto de edición simultánea', async () => {
  // Simula el escenario real de producción: 2-3 personas del equipo RRLL
  // abriendo TrAccion.exe contra el mismo traccion.sqlite en la unidad de
  // red (SMB). Aquí, en vez de una unidad de red, usamos una carpeta local
  // compartida entre dos instancias de Electron, preconfigurada vía
  // sqlite-preferences.json (el mismo mecanismo que usa "Cambiar ubicación
  // de base de datos" en Ajustes).
  const sharedDatabaseDirectory = await createSharedDatabaseDirectory();
  const calendarName = `E2E concurrencia ${Date.now()}`;

  const userA = await launchTraccionElectron({ sharedDatabaseDirectory });
  try {
    // Usuaria A crea el calendario que después se disputarán las dos.
    await navigateToModule(userA.page, TICKET_RESTAURANTE_GROUP, TICKET_RESTAURANTE_MODULE);
    await userA.page.getByRole('button', { name: 'Calendarios' }).click();
    await userA.page.getByLabel('Nombre calendario').fill(calendarName);
    await userA.page.getByRole('button', { name: 'Guardar' }).click();
    await expect(userA.page.getByLabel('Selector calendario')).toContainText(calendarName, {
      timeout: 10_000,
    });

    // Usuaria B abre TrAccion después de que el calendario ya existe en el
    // traccion.sqlite compartido, así que lo carga con su updatedAt actual.
    const userB = await launchTraccionElectron({ sharedDatabaseDirectory });
    try {
      await navigateToModule(userB.page, TICKET_RESTAURANTE_GROUP, TICKET_RESTAURANTE_MODULE);
      await userB.page.getByRole('button', { name: 'Calendarios' }).click();
      await expect(userB.page.getByLabel('Selector calendario')).toContainText(calendarName, {
        timeout: 10_000,
      });

      // B entra en modo edición del calendario, fijando en memoria el
      // updatedAt que tenía el registro justo antes de que A lo modifique.
      await userB.page.getByRole('button', { name: 'Editar' }).click();
      await expect(userB.page.getByText('Editar calendario')).toBeVisible();

      // A modifica y guarda el mismo calendario primero (activa/desactiva).
      // El botón cambia de etiqueta ("Activar" <-> "Desactivar") una vez que
      // el toggle se ha aplicado, así que usamos ese cambio como señal de
      // que la escritura en SQLite ya se ha completado.
      const toggleButton = userA.page.getByRole('button', { name: /^(Desactivar|Activar)$/ });
      const labelBeforeToggle = await toggleButton.innerText();
      await toggleButton.click();
      await expect(toggleButton).not.toHaveText(labelBeforeToggle, { timeout: 10_000 });

      // B, sin haber recargado, intenta guardar sobre el mismo calendario.
      // Esto debe fallar con el conflicto de concurrencia (OCC) en vez de
      // sobrescribir en silencio el cambio de A. El polling de refresco de
      // TrAccion es de 12s (POLLING_INTERVAL_MS en externalDataSync.ts), así
      // que todo este bloque debe completarse claramente por debajo de ese
      // margen para que B no haya refrescado su expectedUpdatedAt antes de
      // guardar.
      const editedName = `${calendarName} (editado por B)`;
      await userB.page.getByLabel('Nombre calendario').fill(editedName);
      await userB.page.getByRole('button', { name: 'Guardar' }).click();

      // AppDialog (el componente que renderiza este aviso) no enlaza su
      // título con aria-labelledby, así que su nombre accesible queda vacío:
      // hay que localizarlo por role a secas y comprobar el texto dentro.
      const conflictDialog = userB.page.getByRole('dialog');
      await expect(conflictDialog).toBeVisible({ timeout: 10_000 });
      await expect(conflictDialog).toContainText('Aviso');
      await expect(conflictDialog).toContainText('modificado por otro usuario');
      await conflictDialog.getByRole('button', { name: 'OK' }).click();
    } finally {
      await userB.close();
    }
  } finally {
    await userA.close();
  }
});
