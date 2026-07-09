import { Loader2 } from 'lucide-react';

interface TeletrabajoStatusMessagesProps {
  isEmployeesLoading: boolean;
  importSummary: string;
  wordStatus: string;
}

export function TeletrabajoStatusMessages({
  isEmployeesLoading,
  importSummary,
  wordStatus,
}: TeletrabajoStatusMessagesProps) {
  return (
    <>
      {isEmployeesLoading && (
        <div
          className="mb-3 flex items-center gap-2 rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-sm font-semibold text-amber-100"
          role="status"
          aria-live="polite"
        >
          <Loader2 size={16} className="animate-spin" />
          Cargando datos de Plantilla…
        </div>
      )}

      {importSummary && (
        <div className="mb-3 rounded-xl border border-metro-border bg-metro-surface px-3 py-2 text-sm font-semibold text-metro-text">
          {importSummary}
        </div>
      )}

      {wordStatus && (
        <div className="mb-3 rounded-xl border border-metro-border bg-metro-surface px-3 py-2 text-sm font-semibold text-metro-text">
          {wordStatus}
        </div>
      )}
    </>
  );
}
