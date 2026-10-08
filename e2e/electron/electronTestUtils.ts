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
  cleanup: () => Promise<void>;
};

export type LaunchTraccionElectronOptions = {
  userDataDir?: string;
  removeUserDataOnClose?: boolean;
  sharedDatabaseDirectory?: string;
};

const DATABASE_PREFERENCES_FILE_NAME = 'sqlite-preferences.json';

export async function createSharedDatabaseDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'traccion-e2e-shared-db-'));
  const databasePath = path.join(directory, 'traccion.sqlite');
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(databasePath);
  try {
    db.exec(`
      CREATE TABLE schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      );
      CREATE TABLE persisted_records (
        key TEXT PRIMARY KEY,
        value_json TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'sqlite-primary',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE local_storage_backups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at TEXT NOT NULL,
        payload_json TEXT NOT NULL
      );
      CREATE TABLE app_metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)')
      .run(1, new Date().toISOString());
  } finally {
    db.close();
  }
  return directory;
}

async function waitForMainWindow(app: ElectronApplication): Promise<Page> {
  const deadline = Date.now() + 30_000;

  while (Date.now() < deadline) {
    for (const candidate of app.windows()) {
      if (!candidate.url().startsWith('http://127.0.0.1:5173')) continue;
      const dashboardHeading = candidate.getByRole('heading', { name: 'Dashboard RRLL' });
      if (await dashboardHeading.isVisible().catch(() => false)) return candidate;
    }

    const remaining = Math.max(250, Math.min(2_000, deadline - Date.now()));
    await app.waitForEvent('window', { timeout: remaining }).catch(() => undefined);
  }

  const windowDiagnostics = await Promise.all(
    app.windows().map(async (candidate) => ({
      title: await candidate.title().catch(() => '<sin título>'),
      url: candidate.url(),
    })),
  );

  throw new Error(
    `No se ha encontrado la ventana principal de TrAccion durante el arranque E2E. Ventanas detectadas: ${JSON.stringify(windowDiagnostics)}`,
  );
}

export async function closeTraccionElectron(app: ElectronApplication): Promise<void> {
  // Los formularios con draft instalan beforeunload en el renderer. En teardown E2E
  // destruimos primero las BrowserWindow para no hacer que Playwright compita con
  // ese diálogo nativo al cerrar el proceso de pruebas.
  await app.evaluate(({ BrowserWindow }) => {
    for (const window of BrowserWindow.getAllWindows()) window.destroy();
  }).catch(() => undefined);
  await app.close().catch(() => undefined);
}

export async function launchTraccionElectron(
  options: LaunchTraccionElectronOptions = {},
): Promise<ElectronTestApp> {
  const userDataDir = options.userDataDir ?? await mkdtemp(path.join(tmpdir(), 'traccion-e2e-'));
  const removeUserDataOnClose = options.removeUserDataOnClose ?? true;

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
  await expect(page.getByRole('heading', { name: 'Dashboard RRLL' })).toBeVisible();
  if (options.sharedDatabaseDirectory) {
    await expect(
      page.getByRole('button', { name: 'Estado de base de datos: SQLite activa en ruta compartida/personalizada' }).first(),
    ).toBeVisible({ timeout: 20_000 });
  }

  return {
    app,
    page,
    userDataDir,
    close: async () => {
      await closeTraccionElectron(app);
      if (removeUserDataOnClose) {
        await rm(userDataDir, { recursive: true, force: true }).catch(() => undefined);
      }
    },
    cleanup: async () => {
      await rm(userDataDir, { recursive: true, force: true }).catch(() => undefined);
    },
  };
}

export async function launchTraccionElectronWithIsolatedSharedDatabase(
  options: Omit<LaunchTraccionElectronOptions, 'sharedDatabaseDirectory'> = {},
): Promise<ElectronTestApp> {
  const sharedDatabaseDirectory = await createSharedDatabaseDirectory();
  try {
    const launched = await launchTraccionElectron({
      ...options,
      sharedDatabaseDirectory,
    });

    const originalClose = launched.close;
    const originalCleanup = launched.cleanup;
    return {
      ...launched,
      close: async () => {
        await originalClose();
        await rm(sharedDatabaseDirectory, { recursive: true, force: true }).catch(() => undefined);
      },
      cleanup: async () => {
        await originalCleanup();
        await rm(sharedDatabaseDirectory, { recursive: true, force: true }).catch(() => undefined);
      },
    };
  } catch (error) {
    await rm(sharedDatabaseDirectory, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
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
