import { _electron as electron, type ElectronApplication, type Page } from 'playwright';
import { expect } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

export type ElectronTestApp = {
  app: ElectronApplication;
  page: Page;
  userDataDir: string;
  close: () => Promise<void>;
};

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

export async function launchTraccionElectron(): Promise<ElectronTestApp> {
  const userDataDir = await mkdtemp(path.join(tmpdir(), 'traccion-e2e-'));

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
  await page.getByRole('heading', { name: moduleLabel }).waitFor({ state: 'visible' });
  await expectNoAppShellError(page);
}
