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
  // El objetivo de este E2E es probar OCC entre DOS procesos Electron y una
  // SQLite física compartida. No congelar el polling del renderer: hacerlo
  // disparaba el recovery overlay, que por diseño intercepta interacciones
  // mientras la sesión se recupera. Se conserva el flujo UI para el alta.
  test.setTimeout(90_000);
  const sharedDatabaseDirectory = await createSharedDatabaseDirectory();
  const calendarName = `E2E concurrencia ${Date.now()}`;
  const userA = await launchTraccionElectron({ sharedDatabaseDirectory });
  try {
    await navigateToModule(userA.page, TICKET_RESTAURANTE_GROUP, TICKET_RESTAURANTE_MODULE);
    await openCalendars(userA.page);
    await userA.page.getByLabel('Nombre calendario').fill(calendarName);
    await userA.page.getByRole('button', { name: 'Guardar', exact: true }).click();
    await expect(userA.page.getByLabel('Selector calendario')).toContainText(calendarName, {
      timeout: 10_000,
    });
    const calendarId = await userA.page.getByLabel('Selector calendario').inputValue();

    const userB = await launchTraccionElectron({ sharedDatabaseDirectory });
    try {
      // B lee la revisión anterior del mismo fichero físico SQLite,
      // sin forzar estados de recuperación ni manipular el polling.
      const before = await userB.page.evaluate(async (id) => {
        const snapshot = await window.traccion!.loadTicketRestauranteCalendarRecords!();
        if (!snapshot.status.ready) throw new Error('Usuario B no tiene SQLite activa.');
        const record = snapshot.records.find(item => item.id === id);
        if (!record) throw new Error('El calendario de A no existe en la sesión B.');
        return record;
      }, calendarId);

      const committedByA = await userA.page.evaluate(async ({ id, original }) => {
        const saver = window.traccion!.saveTicketRestauranteCalendarRecordIfUnchanged!;
        const parsed = JSON.parse(original.value);
        const updatedAt = new Date(Math.max(Date.now(), Date.parse(original.updatedAt) + 1_000)).toISOString();
        const changed = { ...parsed, activo: !parsed.activo, updatedAt };
        const value = JSON.stringify(changed);
        const result = await saver({ id, value, expectedUpdatedAt: original.updatedAt });
        if (!result.ok) throw new Error(`El guardado de A falló: ${result.message}`);
        return { value, updatedAt: result.currentUpdatedAt };
      }, { id: calendarId, original: before });
      expect(committedByA.updatedAt).toBeTruthy();
      expect(committedByA.updatedAt).not.toBe(before.updatedAt);

      // B envía su modificación con el updatedAt ANTIGUO por su propio IPC.
      // La transacción SQLite debe rechazarla sin sobrescribir A.
      const staleAttempt = await userB.page.evaluate(async ({ id, original }) => {
        const parsed = JSON.parse(original.value);
        const value = JSON.stringify({
          ...parsed,
          nombre: `${parsed.nombre} (editado por B)`,
          updatedAt: new Date(Math.max(Date.now(), Date.parse(original.updatedAt) + 2_000)).toISOString(),
        });
        return window.traccion!.saveTicketRestauranteCalendarRecordIfUnchanged!({
          id, value, expectedUpdatedAt: original.updatedAt,
        });
      }, { id: calendarId, original: before });
      expect(staleAttempt.ok).toBe(false);
      expect(staleAttempt.message).toContain('modificado por otro usuario');
      expect(staleAttempt.currentUpdatedAt).toBe(committedByA.updatedAt);

      const persisted = await userA.page.evaluate(async (id) => {
        const snapshot = await window.traccion!.loadTicketRestauranteCalendarRecords!();
        return snapshot.records.find(item => item.id === id);
      }, calendarId);
      expect(persisted).toBeDefined();
      expect(persisted!.value).toBe(committedByA.value);
      expect(persisted!.updatedAt).toBe(committedByA.updatedAt);
      expect(persisted!.value).not.toContain('(editado por B)');
    } finally {
      await userB.close();
    }
  } finally {
    await userA.close();
    const { rm } = await import('node:fs/promises');
    await rm(sharedDatabaseDirectory, { recursive: true, force: true });
  }
});
