type BackupPayload = {
  directory: string;
  fileName: string;
  cleanupPrefix: string;
  buffer: ArrayBuffer;
};

export type ExcelBackupFailure = {
  id: string;
  message: string;
  retry: () => Promise<boolean>;
};

export const EXCEL_BACKUP_FAILURE_EVENT = 'traccion:excel-backup-failure';

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

export async function saveExcelBackupWithRetry(payload: BackupPayload): Promise<string | null> {
  const save = window.traccion?.saveOperationalExcelBackup;
  if (!save) return 'El respaldo Excel no está disponible.';
  const attempt = async () => {
    try {
      const result = await save(payload);
      return result.ok ? null : result.message;
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  };
  const failure = await attempt();
  if (!failure) return null;

  const message = /EBUSY|EPERM|EACCES|abierto|bloqueado/i.test(failure)
    ? 'No se ha podido actualizar el respaldo Excel. Comprueba que el archivo esté cerrado.'
    : 'No se ha podido actualizar el respaldo Excel. Comprueba la conexión de red y la carpeta de destino.';

  window.dispatchEvent(new CustomEvent<ExcelBackupFailure>(EXCEL_BACKUP_FAILURE_EVENT, {
    detail: {
      id: excelBackupFailureId(payload),
      message,
      retry: async () => {
        const error = await attempt();
        if (error) throw new Error(error);
        return true;
      },
    },
  }));
  return message;
}
