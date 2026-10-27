import { expect, test, type Page } from '@playwright/test';
import {
  createSharedDatabaseDirectory,
  launchTraccionElectron,
  launchTraccionElectronWithIsolatedSharedDatabase,
  navigateToModule,
} from './electronTestUtils';

const TICKET_RESTAURANTE_GROUP = 'Herramientas';
const TICKET_RESTAURANTE_MODULE = 'Ticket Restaurante';

async function openCalendars(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^Calendarios\s+Configurar días$/ }).click();
  await expect(page.getByLabel('Nombre calendario')).toBeVisible();
}

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
  const { page, close } = await launchTraccionElectronWithIsolatedSharedDatabase();
  const calendarName = `E2E calendario ${Date.now()}`;

  try {
    await expectNoConsoleErrors(page, async () => {
      await navigateToModule(page, TICKET_RESTAURANTE_GROUP, TICKET_RESTAURANTE_MODULE);
      await openCalendars(page);

      await page.getByLabel('Nombre calendario').fill(calendarName);
      await page.getByRole('button', { name: 'Guardar', exact: true }).click();

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
    await openCalendars(userA.page);
    await userA.page.getByLabel('Nombre calendario').fill(calendarName);
    await userA.page.getByRole('button', { name: 'Guardar', exact: true }).click();
    await expect(userA.page.getByLabel('Selector calendario')).toContainText(calendarName, {
      timeout: 10_000,
    });

    await expect(userA.page.getByLabel('Selector calendario').locator('option:checked')).toHaveText(calendarName);
    const calendarId = await userA.page.getByLabel('Selector calendario').inputValue();

    // Usuaria B abre TrAccion después de que el calendario ya existe en el
    // traccion.sqlite compartido, así que lo carga con su updatedAt actual.
    const userB = await launchTraccionElectron({ sharedDatabaseDirectory });
    try {
      await navigateToModule(userB.page, TICKET_RESTAURANTE_GROUP, TICKET_RESTAURANTE_MODULE);
      await openCalendars(userB.page);
      // El reloj del renderer B detiene el polling: el conflicto no depende
      // de que la máquina termine la prueba antes de 12 segundos.
      await userB.page.clock.install();
      await userB.page.clock.pauseAt(new Date(Date.now() + 1000));
      await expect(userB.page.getByLabel('Selector calendario')).toContainText(calendarName, {
        timeout: 10_000,
      });

      await expect(userB.page.getByLabel('Selector calendario')).toHaveValue(calendarId);

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

      const committedByA = await userA.page.evaluate(async (id) => {
        const snapshot = await window.traccion!.loadTicketRestauranteCalendarRecords!();
        return snapshot.records.find(record => record.id === id);
      }, calendarId);
      expect(committedByA).toBeDefined();
      expect(JSON.parse(committedByA!.value)).toMatchObject({
        nombre: calendarName, activo: labelBeforeToggle === 'Activar',
      });

      // B conserva de forma controlada la revisión anterior al guardado de A.
      const editedName = `${calendarName} (editado por B)`;
      await userB.page.getByLabel('Nombre calendario').fill(editedName);
      await userB.page.getByRole('button', { name: 'Guardar', exact: true }).click();

      // El guardado espera dos requestAnimationFrame antes del IPC. Con el
      // reloj pausado hay que ejecutar esos frames, sin alcanzar el polling
      // de 12 s ni sustituir el resultado real de SQLite.
      await userB.page.clock.runFor(100);

      const conflictDialog = userB.page.getByRole('dialog', { name: 'Información', exact: true });
      await expect(conflictDialog).toBeVisible({ timeout: 10_000 });
      await expect(conflictDialog).toContainText('Información');
      await expect(conflictDialog).toContainText('modificado por otro usuario');
      await conflictDialog.getByRole('button', { name: 'Cerrar', exact: true }).click();
      await expect(conflictDialog).not.toBeVisible();

      const afterConflict = await userA.page.evaluate(async (id) => {
        const snapshot = await window.traccion!.loadTicketRestauranteCalendarRecords!();
        return snapshot.records.find(record => record.id === id);
      }, calendarId);
      // No basta con un aviso: la escritura rechazada no debe cambiar los
      // datos ni el token que confirmó el primer usuario.
      expect(afterConflict?.value).toBe(committedByA!.value);
      expect(afterConflict?.updatedAt).toBe(committedByA!.updatedAt);
      expect(afterConflict?.value).not.toContain(editedName);
    } finally {
      await userB.close();
    }
  } finally {
    await userA.close();
    const { rm } = await import('node:fs/promises');
    await rm(sharedDatabaseDirectory, { recursive: true, force: true });
  }
});
