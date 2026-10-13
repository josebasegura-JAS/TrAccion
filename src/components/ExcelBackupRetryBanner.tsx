import { useEffect, useState } from 'react';
import { EXCEL_BACKUP_FAILURE_EVENT, type ExcelBackupFailure } from '../shared/export/saveExcelBackupWithRetry';

export function ExcelBackupRetryBanner() {
  const [failure, setFailure] = useState<ExcelBackupFailure | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const onFailure = (event: Event) => {
      setFailure((event as CustomEvent<ExcelBackupFailure>).detail);
      setError('');
    };
    window.addEventListener(EXCEL_BACKUP_FAILURE_EVENT, onFailure);
    return () => window.removeEventListener(EXCEL_BACKUP_FAILURE_EVENT, onFailure);
  }, []);

  if (!failure) return null;

  const retry = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await failure.retry();
      setFailure(null);
    } catch {
      setError('El respaldo sigue sin poder guardarse. Comprueba el Excel y la conexión antes de reintentar.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div role="alert" className="fixed bottom-5 right-5 z-[120] w-[min(30rem,calc(100vw-2rem))] rounded-xl border border-red-400/50 bg-red-950 p-4 text-sm text-red-50 shadow-2xl">
      <p className="font-bold">Respaldo Excel pendiente</p>
      <p className="mt-1">{failure.message}</p>
      <p className="mt-1 text-xs text-red-100/80">Los datos de TrAcción se han guardado; solo ha fallado el Excel de respaldo.</p>
      {error && <p className="mt-2 text-xs font-semibold">{error}</p>}
      <div className="mt-3 flex justify-end gap-2">
        <button className="rounded-lg border border-red-200/40 px-3 py-1.5" onClick={() => setFailure(null)} type="button">Cerrar</button>
        <button className="rounded-lg bg-red-100 px-3 py-1.5 font-bold text-red-950 disabled:opacity-50" disabled={busy} onClick={() => void retry()} type="button">
          {busy ? 'Reintentando…' : 'Reintentar'}
        </button>
      </div>
    </div>
  );
}
