import { useEffect, useState } from 'react';
import {
  EXCEL_BACKUP_FAILURE_EVENT,
  upsertExcelBackupFailure,
  type ExcelBackupFailure,
} from '../shared/export/saveExcelBackupWithRetry';

const TASKS_EXCEL_FAILURE_ID = 'tareas-abiertas';

export function ExcelBackupRetryBanner() {
  const [failures, setFailures] = useState<ExcelBackupFailure[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const bridge = (window as unknown as { traccionTaskWord?: {
      refresh: () => Promise<{ ok: boolean; message: string }>;
      onBackupFailure?: (listener: (message: string) => void) => () => void;
    } }).traccionTaskWord;
    const unsubscribe = bridge?.onBackupFailure?.(() => {
      if (!bridge) return;
      setFailures((current) => upsertExcelBackupFailure(current, {
        id: TASKS_EXCEL_FAILURE_ID,
        message: 'No se ha podido actualizar el Excel de tareas abiertas. Comprueba que esté cerrado y que la red esté disponible.',
        retry: async () => {
          const result = await bridge.refresh();
          if (!result.ok) throw new Error(result.message);
          return true;
        },
      }));
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
    window.addEventListener(EXCEL_BACKUP_FAILURE_EVENT, onFailure);
    return () => window.removeEventListener(EXCEL_BACKUP_FAILURE_EVENT, onFailure);
  }, []);

  if (failures.length === 0) return null;

  const retry = async (failure: ExcelBackupFailure) => {
    if (busyId) return;
    setBusyId(failure.id);
    setErrors((current) => {
      const next = { ...current };
      delete next[failure.id];
      return next;
    });
    try {
      await failure.retry();
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
        Los datos de TrAcción están guardados. Estos avisos permanecerán hasta que cada Excel de respaldo se actualice correctamente.
      </p>

      <div className="mt-3 space-y-3">
        {failures.map((failure) => (
          <div className="rounded-lg border border-red-200/20 bg-black/10 p-3" key={failure.id}>
            <p>{failure.message}</p>
            {errors[failure.id] && (
              <p className="mt-2 text-xs font-semibold">{errors[failure.id]}</p>
            )}
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
          </div>
        ))}
      </div>
    </div>
  );
}
