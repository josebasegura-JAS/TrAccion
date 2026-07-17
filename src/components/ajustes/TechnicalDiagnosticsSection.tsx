import { Download, FileWarning } from 'lucide-react';
import { Notice } from '../ui/Notice';

interface TechnicalDiagnosticsSectionProps {
  isExporting: boolean;
  status: string;
  onExport: () => void;
}

export function TechnicalDiagnosticsSection({
  isExporting,
  status,
  onExport,
}: TechnicalDiagnosticsSectionProps) {
  return (
    <div className="mb-4 rounded-2xl border border-metro-border bg-metro-panel p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <FileWarning aria-hidden="true" size={18} />
            <h3 className="text-base font-bold text-metro-text">Diagnóstico técnico</h3>
          </div>
          <p className="mt-1 max-w-3xl text-sm text-metro-muted">
            Exporta la versión, el estado técnico de SQLite y los últimos errores registrados. No
            incluye formularios, nombres, correos, rutas completas ni contenido de la base de datos.
          </p>
        </div>
        <button
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-metro-red px-3 py-2 text-sm font-semibold text-white hover:bg-metro-dark disabled:cursor-not-allowed disabled:opacity-50"
          disabled={isExporting}
          onClick={onExport}
          type="button"
        >
          <Download aria-hidden="true" size={16} />
          {isExporting ? 'Exportando…' : 'Exportar diagnóstico'}
        </button>
      </div>
      {status && (
        <div className="mt-3">
          <Notice tone={status.startsWith('Diagnóstico exportado') ? 'success' : 'warning'}>
            {status}
          </Notice>
        </div>
      )}
    </div>
  );
}
