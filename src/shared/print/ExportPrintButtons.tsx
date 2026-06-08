import { useState } from 'react';
import { ActionButton } from '../../components/ui/ActionButton';
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
      <ActionButton
        disabled={payload.rows.length === 0}
        onClick={() => exportTableToExcel({ ...payload, generatedAt: new Date() })}
        variant="excel"
      >
        Exportar Excel
      </ActionButton>
      <ActionButton
        disabled={payload.rows.length === 0}
        onClick={() =>
          setPreviewHtml(buildPrintableTableHtml({ ...payload, generatedAt: new Date() }))
        }
        variant="print"
      >
        Imprimir
      </ActionButton>
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
