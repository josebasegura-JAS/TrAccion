import { _electron as electron, type ElectronApplication, type Page } from 'playwright';
import { expect } from '@playwright/test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

export type ElectronTestApp = {
  app: ElectronApplication;
  page: Page;
  userDataDir: string;
  close: () => Promise<void>;
};

export type LaunchTraccionElectronOptions = {
  /**
   * Carpeta compartida donde debe vivir traccion.sqlite. Si se indica, se
   * preconfigura la instancia (vía sqlite-preferences.json, el mismo fichero
   * que escribe la UI de Ajustes al "Cambiar ubicación de base de datos")
   * para que arranque apuntando ahí en vez de a su carpeta de datos por
   * defecto. Sirve para simular, en un test E2E, a dos usuarios reales
   * abriendo TrAccion sobre el mismo traccion.sqlite en la unidad de red.
   */
  sharedDatabaseDirectory?: string;
};

/**
 * Nombre del fichero de preferencias de base de datos. Debe coincidir con
 * DATABASE_PREFERENCES_FILE_NAME en electron/persistence/databasePreferences.ts.
 * No se importa directamente porque ese módulo depende de `electron` (proceso
 * principal) y este helper corre en el proceso de test de Playwright.
 */
const DATABASE_PREFERENCES_FILE_NAME = 'sqlite-preferences.json';

/** Crea una carpeta temporal aislada para usar como "unidad de red" compartida en tests. */
export async function createSharedDatabaseDirectory(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), 'traccion-e2e-shared-db-'));
}

async function waitForMainWindow(app: ElectronApplication): Promise<Page> {
  const deadline = Date.now() + 30_000;

  while (Date.now() < deadline) {
    for (const candidate of app.windows()) {
      const heading = candidate.getByRole('heading', { name: 'Inicio' });
      if (await heading.isVisible().catch(() => false)) {
        return candidate;
      }
    }

    const remaining = Math.max(250, Math.min(2_000, deadline - Date.now()));
    await app.waitForEvent('window', { timeout: remaining }).catch(() => undefined);
  }

  throw new Error('No se ha encontrado la ventana principal de TrAccion durante el arranque E2E.');
}

export async function launchTraccionElectron(
  options: LaunchTraccionElectronOptions = {},
): Promise<ElectronTestApp> {
  const userDataDir = await mkdtemp(path.join(tmpdir(), 'traccion-e2e-'));

  if (options.sharedDatabaseDirectory) {
    await mkdir(userDataDir, { recursive: true });
    await writeFile(
      path.join(userDataDir, DATABASE_PREFERENCES_FILE_NAME),
      JSON.stringify({ customDirectoryPath: options.sharedDatabaseDirectory }),
      'utf8',
    );
  }

  const app = await electron.launch({
    args: ['dist-electron/main.js', `--user-data-dir=${userDataDir}`],
    env: {
      ...process.env,
      VITE_DEV_SERVER_URL: 'http://127.0.0.1:5173',
      NODE_ENV: 'development',
      TRACCION_E2E: '1',
    },
  });

  const page = await waitForMainWindow(app);
  await page.waitForLoadState('domcontentloaded');
  await expect(page.getByRole('heading', { name: 'Inicio' })).toBeVisible();

  return {
    app,
    page,
    userDataDir,
    close: async () => {
      await app.close().catch(() => undefined);
      await rm(userDataDir, { recursive: true, force: true }).catch(() => undefined);
    },
  };
}

export async function expectNoAppShellError(page: Page): Promise<void> {
  await expect(page.getByText('No se ha podido mostrar TrAccion')).toHaveCount(0);
}

export async function openNavigationGroup(page: Page, groupLabel: string): Promise<void> {
  await page.getByRole('button', { name: groupLabel }).click();
  await page.getByRole('navigation', { name: `Opciones de ${groupLabel}` }).waitFor({ state: 'visible' });
}

export async function navigateToModule(page: Page, groupLabel: string, moduleLabel: string): Promise<void> {
  await openNavigationGroup(page, groupLabel);
  await page.getByRole('navigation', { name: `Opciones de ${groupLabel}` }).getByRole('button', { name: moduleLabel }).click();
  await page.getByRole('heading', { name: moduleLabel }).first().waitFor({ state: 'visible' });
  await expectNoAppShellError(page);
}
