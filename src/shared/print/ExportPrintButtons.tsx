import { useState } from 'react';
import { ActionButton } from '../../components/ui/ActionButton';
import { useAppDialog } from '../../hooks/useAppDialog';
import { exportTableToExcel } from '../export/tableExport';
import type { ExportTablePayload } from '../export/types';
import { buildPrintableTableHtml } from './buildPrintableTableHtml';
import { PrintPreviewModal } from './PrintPreviewModal';

interface ExportPrintButtonsProps<T> {
  payload: ExportTablePayload<T>;
  htmlBuilder?: () => string;
}

export function ExportPrintButtons<T>({ payload, htmlBuilder }: ExportPrintButtonsProps<T>) {
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const { alert, dialogNode } = useAppDialog();
  return (
    <>
      <ActionButton
        disabled={payload.rows.length === 0}
        onClick={() => exportTableToExcel({ ...payload, generatedAt: new Date() }, (message) => { void alert(message, { type: 'error' }); })}
        variant="excel"
      >
        Exportar Excel
      </ActionButton>
      <ActionButton
        disabled={payload.rows.length === 0}
        onClick={() =>
          setPreviewHtml(htmlBuilder ? htmlBuilder() : buildPrintableTableHtml({ ...payload, generatedAt: new Date() }))
        }
        variant="print"
      >
        Imprimir
      </ActionButton>
      {dialogNode}
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
