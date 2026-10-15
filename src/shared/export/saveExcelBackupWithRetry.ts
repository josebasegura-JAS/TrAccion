type BackupPayload = {
  directory: string;
  fileName: string;
  cleanupPrefix: string;
  buffer: ArrayBuffer;
};

export type ExcelBackupFailure = {
  id: string;
  message: string;
  retry?: () => Promise<boolean>;
};

export type PersistedExcelBackupFailure = {
  id: string;
  message: string;
  failedAt: string;
};

export const EXCEL_BACKUP_FAILURE_EVENT = 'traccion:excel-backup-failure';
export const EXCEL_BACKUP_SUCCESS_EVENT = 'traccion:excel-backup-success';
const EXCEL_BACKUP_PENDING_STORAGE_KEY = 'traccion.ui.excel-backup-pending';

export function excelBackupFailureId(payload: Pick<BackupPayload, 'directory' | 'fileName'>): string {
  const directory = payload.directory.trim().replace(/[\\/]+$/, '');
  return `${directory}::${payload.fileName.trim()}`;
}

export function upsertExcelBackupFailure(
  failures: ExcelBackupFailure[],
  nextFailure: ExcelBackupFailure,
): ExcelBackupFailure[] {
  const existingIndex = failures.findIndex((failure) => failure.id === nextFailure.id);
  if (existingIndex < 0) return [...failures, nextFailure];

  const next = [...failures];
  next[existingIndex] = nextFailure;
  return next;
}

function isPersistedExcelBackupFailure(value: unknown): value is PersistedExcelBackupFailure {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<PersistedExcelBackupFailure>;
  return (
    typeof candidate.id === 'string' &&
    candidate.id.trim().length > 0 &&
    typeof candidate.message === 'string' &&
    typeof candidate.failedAt === 'string'
  );
}

export function loadPersistedExcelBackupFailures(): PersistedExcelBackupFailure[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = window.localStorage.getItem(EXCEL_BACKUP_PENDING_STORAGE_KEY);
    if (!stored) return [];
    const parsed: unknown = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed.filter(isPersistedExcelBackupFailure) : [];
  } catch {
    return [];
  }
}

function writePersistedExcelBackupFailures(failures: PersistedExcelBackupFailure[]): void {
  if (typeof window === 'undefined') return;
  try {
    if (failures.length === 0) {
      window.localStorage.removeItem(EXCEL_BACKUP_PENDING_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(EXCEL_BACKUP_PENDING_STORAGE_KEY, JSON.stringify(failures));
  } catch {
    // El aviso en memoria sigue funcionando aunque el almacenamiento local no esté disponible.
  }
}

export function persistExcelBackupFailure(
  failure: Pick<ExcelBackupFailure, 'id' | 'message'>,
  failedAt = new Date().toISOString(),
): void {
  const current = loadPersistedExcelBackupFailures();
  const next: PersistedExcelBackupFailure = {
    id: failure.id,
    message: failure.message,
    failedAt,
  };
  const existingIndex = current.findIndex((item) => item.id === next.id);
  if (existingIndex < 0) {
    writePersistedExcelBackupFailures([...current, next]);
    return;
  }
  const updated = [...current];
  updated[existingIndex] = next;
  writePersistedExcelBackupFailures(updated);
}

export function clearPersistedExcelBackupFailure(id: string): void {
  writePersistedExcelBackupFailures(
    loadPersistedExcelBackupFailures().filter((failure) => failure.id !== id),
  );
}

function publishExcelBackupSuccess(id: string): void {
  clearPersistedExcelBackupFailure(id);
  window.dispatchEvent(new CustomEvent<string>(EXCEL_BACKUP_SUCCESS_EVENT, { detail: id }));
}

export async function saveExcelBackupWithRetry(payload: BackupPayload): Promise<string | null> {
  const save = window.traccion?.saveOperationalExcelBackup;
  if (!save) return 'El respaldo Excel no está disponible.';
  const id = excelBackupFailureId(payload);
  const attempt = async () => {
    try {
      const result = await save(payload);
      return result.ok ? null : result.message;
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  };
  const failure = await attempt();
  if (!failure) {
    publishExcelBackupSuccess(id);
    return null;
  }

  const message = /EBUSY|EPERM|EACCES|abierto|bloqueado/i.test(failure)
    ? 'No se ha podido actualizar el respaldo Excel. Comprueba que el archivo esté cerrado.'
    : 'No se ha podido actualizar el respaldo Excel. Comprueba la conexión de red y la carpeta de destino.';

  persistExcelBackupFailure({ id, message });
  window.dispatchEvent(new CustomEvent<ExcelBackupFailure>(EXCEL_BACKUP_FAILURE_EVENT, {
    detail: {
      id,
      message,
      retry: async () => {
        const error = await attempt();
        if (error) throw new Error(error);
        publishExcelBackupSuccess(id);
        return true;
      },
    },
  }));
  return message;
}
