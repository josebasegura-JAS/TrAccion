import { Download, Printer } from 'lucide-react';
import { useState } from 'react';
import { exportTableToExcel } from '../export/tableExport';
import type { ExportTablePayload } from '../export/types';
import { buildPrintableTableHtml } from './buildPrintableTableHtml';
import { PrintPreviewModal } from './PrintPreviewModal';

interface ExportPrintButtonsProps<T> {
  payload: ExportTablePayload<T>;
}

export function ExportPrintButtons<T>({ payload }: ExportPrintButtonsProps<T>) {
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  return (
    <>
      <button
        className="inline-flex items-center gap-2 rounded-xl border border-metro-border bg-metro-surface px-3 py-2 text-sm font-semibold text-metro-text hover:border-metro-red disabled:cursor-not-allowed disabled:opacity-50"
        disabled={payload.rows.length === 0}
        onClick={() => exportTableToExcel({ ...payload, generatedAt: new Date() })}
        type="button"
      >
        <Download size={16} /> Exportar Excel
      </button>
      <button
        className="inline-flex items-center gap-2 rounded-xl border border-metro-border bg-metro-surface px-3 py-2 text-sm font-semibold text-metro-text hover:border-metro-red disabled:cursor-not-allowed disabled:opacity-50"
        disabled={payload.rows.length === 0}
        onClick={() =>
          setPreviewHtml(buildPrintableTableHtml({ ...payload, generatedAt: new Date() }))
        }
        type="button"
      >
        <Printer size={16} /> Imprimir
      </button>
      {previewHtml && (
        <PrintPreviewModal
          html={previewHtml}
          onClose={() => setPreviewHtml(null)}
          title={payload.title}
        />
      )}
    </>
  );
}
