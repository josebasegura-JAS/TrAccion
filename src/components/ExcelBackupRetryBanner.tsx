import { useEffect, useState } from 'react';
import {
  EXCEL_BACKUP_FAILURE_EVENT,
  EXCEL_BACKUP_SUCCESS_EVENT,
  clearPersistedExcelBackupFailure,
  loadPersistedExcelBackupFailures,
  persistExcelBackupFailure,
  upsertExcelBackupFailure,
  type ExcelBackupFailure,
} from '../shared/export/saveExcelBackupWithRetry';

const TASKS_EXCEL_FAILURE_ID = 'tareas-abiertas';
const TASKS_EXCEL_MESSAGE =
  'No se ha podido actualizar el Excel de tareas abiertas. Comprueba que esté cerrado y que la red esté disponible.';

type TaskWordBridge = {
  refresh: () => Promise<{ ok: boolean; message: string }>;
  onBackupFailure?: (listener: (message: string) => void) => () => void;
};

function persistedFailuresForBanner(): ExcelBackupFailure[] {
  return loadPersistedExcelBackupFailures().map((failure) => ({
    id: failure.id,
    message: failure.message,
  }));
}

function taskFailure(bridge: TaskWordBridge): ExcelBackupFailure {
  return {
    id: TASKS_EXCEL_FAILURE_ID,
    message: TASKS_EXCEL_MESSAGE,
    retry: async () => {
      const result = await bridge.refresh();
      if (!result.ok) throw new Error(result.message);
      clearPersistedExcelBackupFailure(TASKS_EXCEL_FAILURE_ID);
      return true;
    },
  };
}

export function ExcelBackupRetryBanner() {
  const [failures, setFailures] = useState<ExcelBackupFailure[]>(persistedFailuresForBanner);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const bridge = (window as unknown as { traccionTaskWord?: TaskWordBridge }).traccionTaskWord;
    if (!bridge) return undefined;

    setFailures((current) => {
      if (!current.some((failure) => failure.id === TASKS_EXCEL_FAILURE_ID)) return current;
      return upsertExcelBackupFailure(current, taskFailure(bridge));
    });

    const unsubscribe = bridge.onBackupFailure?.(() => {
      const failure = taskFailure(bridge);
      persistExcelBackupFailure(failure);
      setFailures((current) => upsertExcelBackupFailure(current, failure));
      setErrors((current) => {
        const next = { ...current };
        delete next[TASKS_EXCEL_FAILURE_ID];
        return next;
      });
    });
    return () => unsubscribe?.();
  }, []);

  useEffect(() => {
    const onFailure = (event: Event) => {
      const failure = (event as CustomEvent<ExcelBackupFailure>).detail;
      setFailures((current) => upsertExcelBackupFailure(current, failure));
      setErrors((current) => {
        const next = { ...current };
        delete next[failure.id];
        return next;
      });
    };
    const onSuccess = (event: Event) => {
      const id = (event as CustomEvent<string>).detail;
      setFailures((current) => current.filter((failure) => failure.id !== id));
      setErrors((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
    };
    window.addEventListener(EXCEL_BACKUP_FAILURE_EVENT, onFailure);
    window.addEventListener(EXCEL_BACKUP_SUCCESS_EVENT, onSuccess);
    return () => {
      window.removeEventListener(EXCEL_BACKUP_FAILURE_EVENT, onFailure);
      window.removeEventListener(EXCEL_BACKUP_SUCCESS_EVENT, onSuccess);
    };
  }, []);

  if (failures.length === 0) return null;

  const retry = async (failure: ExcelBackupFailure) => {
    if (busyId || !failure.retry) return;
    setBusyId(failure.id);
    setErrors((current) => {
      const next = { ...current };
      delete next[failure.id];
      return next;
    });
    try {
      await failure.retry();
      clearPersistedExcelBackupFailure(failure.id);
      setFailures((current) => current.filter((item) => item.id !== failure.id));
    } catch {
      setErrors((current) => ({
        ...current,
        [failure.id]: 'El respaldo sigue sin poder guardarse. Comprueba el Excel y la conexión antes de reintentar.',
      }));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div
      role="alert"
      className="fixed bottom-5 right-5 z-[120] max-h-[min(32rem,calc(100vh-2rem))] w-[min(32rem,calc(100vw-2rem))] overflow-y-auto rounded-xl border border-red-400/50 bg-red-950 p-4 text-sm text-red-50 shadow-2xl"
    >
      <p className="font-bold">
        {failures.length === 1 ? 'Respaldo Excel pendiente' : `${failures.length} respaldos Excel pendientes`}
      </p>
      <p className="mt-1 text-xs text-red-100/80">
        Los datos de TrAcción están guardados. Estos avisos permanecen aunque reinicies la aplicación y desaparecen cuando cada Excel vuelve a generarse correctamente.
      </p>

      <div className="mt-3 space-y-3">
        {failures.map((failure) => (
          <div className="rounded-lg border border-red-200/20 bg-black/10 p-3" key={failure.id}>
            <p>{failure.message}</p>
            {!failure.retry && (
              <p className="mt-2 text-xs text-red-100/80">
                Pendiente de regenerar. Abre el módulo correspondiente y vuelve a guardar o generar el respaldo.
              </p>
            )}
            {errors[failure.id] && (
              <p className="mt-2 text-xs font-semibold">{errors[failure.id]}</p>
            )}
            {failure.retry && (
              <div className="mt-2 flex justify-end">
                <button
                  className="rounded-lg bg-red-100 px-3 py-1.5 font-bold text-red-950 disabled:opacity-50"
                  disabled={busyId !== null}
                  onClick={() => void retry(failure)}
                  type="button"
                >
                  {busyId === failure.id ? 'Reintentando…' : 'Reintentar'}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
