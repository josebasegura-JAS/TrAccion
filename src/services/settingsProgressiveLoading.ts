type SettingsQueryState = {
  activeQueries: number;
};

const SETTINGS_QUERY_EVENT = 'traccion:settings-query-state';
const DATABASE_SETTINGS_DETAILS_ID = 'ajustes-base-datos';

let installed = false;
let activeQueries = 0;

function publishState(): void {
  window.dispatchEvent(
    new CustomEvent<SettingsQueryState>(SETTINGS_QUERY_EVENT, {
      detail: { activeQueries },
    }),
  );
}

function beginTrackedQuery(): () => void {
  activeQueries += 1;
  publishState();

  let finished = false;
  return () => {
    if (finished) return;
    finished = true;
    activeQueries = Math.max(0, activeQueries - 1);
    publishState();
  };
}

function isSettingsPageVisible(): boolean {
  return document.getElementById(DATABASE_SETTINGS_DETAILS_ID) !== null;
}

function waitUntilDatabaseSettingsOpen(): Promise<void> {
  const details = document.getElementById(DATABASE_SETTINGS_DETAILS_ID);
  if (!(details instanceof HTMLDetailsElement) || details.open) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const handleToggle = () => {
      if (!details.open) return;
      details.removeEventListener('toggle', handleToggle);
      resolve();
    };

    details.addEventListener('toggle', handleToggle);
  });
}

async function runTracked<T>(operation: () => Promise<T>): Promise<T> {
  const finish = beginTrackedQuery();
  try {
    return await operation();
  } finally {
    finish();
  }
}

export function getSettingsQueryState(): SettingsQueryState {
  return { activeQueries };
}

export function subscribeSettingsQueryState(
  listener: (state: SettingsQueryState) => void,
): () => void {
  const handleEvent = (event: Event) => {
    const customEvent = event as CustomEvent<SettingsQueryState>;
    listener(customEvent.detail);
  };

  window.addEventListener(SETTINGS_QUERY_EVENT, handleEvent);
  return () => window.removeEventListener(SETTINGS_QUERY_EVENT, handleEvent);
}

/**
 * Ajustes hace varias consultas IPC al montarse. Dos de ellas son claramente
 * pesadas sobre SMB (copias locales y VACUUM) y no hacen falta mientras el
 * bloque avanzado está cerrado.
 *
 * Se envuelven aquí antes de montar React para que:
 *  - las consultas ligeras sigan ejecutándose inmediatamente;
 *  - listLocalBackups/getVacuumStatus no toquen disco/red hasta abrir
 *    "Base de datos, copias y actualizaciones";
 *  - el indicador visual pueda conocer cuándo hay consultas activas.
 */
export function installProgressiveSettingsQueries(): void {
  if (installed) return;
  installed = true;

  const api = window.traccion;
  if (!api) return;

  const originalGetSecondaryBackupDirectory = api.getSecondaryBackupDirectory?.bind(api);
  if (originalGetSecondaryBackupDirectory) {
    api.getSecondaryBackupDirectory = async () => {
      if (!isSettingsPageVisible()) {
        return originalGetSecondaryBackupDirectory();
      }
      return runTracked(originalGetSecondaryBackupDirectory);
    };
  }

  const originalGetUpdatesDirectory = api.getUpdatesDirectory?.bind(api);
  if (originalGetUpdatesDirectory) {
    api.getUpdatesDirectory = async () => {
      if (!isSettingsPageVisible()) {
        return originalGetUpdatesDirectory();
      }
      return runTracked(originalGetUpdatesDirectory);
    };
  }

  const originalGetDailyLocalBackupSettings = api.getDailyLocalBackupSettings?.bind(api);
  if (originalGetDailyLocalBackupSettings) {
    api.getDailyLocalBackupSettings = async () => {
      if (!isSettingsPageVisible()) {
        return originalGetDailyLocalBackupSettings();
      }
      return runTracked(originalGetDailyLocalBackupSettings);
    };
  }

  const originalGetCurrentDatabaseLock = api.getCurrentDatabaseLock?.bind(api);
  if (originalGetCurrentDatabaseLock) {
    api.getCurrentDatabaseLock = async () => {
      if (!isSettingsPageVisible()) {
        return originalGetCurrentDatabaseLock();
      }
      return runTracked(originalGetCurrentDatabaseLock);
    };
  }

  const originalListLocalBackups = api.listLocalBackups?.bind(api);
  if (originalListLocalBackups) {
    api.listLocalBackups = async () => {
      if (!isSettingsPageVisible()) {
        return originalListLocalBackups();
      }

      await waitUntilDatabaseSettingsOpen();
      return runTracked(originalListLocalBackups);
    };
  }

  const originalGetVacuumStatus = api.getVacuumStatus?.bind(api);
  if (originalGetVacuumStatus) {
    api.getVacuumStatus = async () => {
      if (!isSettingsPageVisible()) {
        return originalGetVacuumStatus();
      }

      await waitUntilDatabaseSettingsOpen();
      return runTracked(originalGetVacuumStatus);
    };
  }
}
