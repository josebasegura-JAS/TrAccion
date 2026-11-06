import { useState } from 'react';
import { ActionButton } from '../../components/ui/ActionButton';
import { useToast } from '../../components/ui/useToast';
import { exportTableToExcel } from '../export/tableExport';
import type { ExportTablePayload } from '../export/types';
import { buildPrintableTableHtml } from './buildPrintableTableHtml';
import { PrintPreviewModal } from './PrintPreviewModal';

interface ExportPrintButtonsProps<T> {
  payload: ExportTablePayload<T>;
  htmlBuilder?: () => string;
  /** Tamaño de las acciones. Por defecto 'sm' para mantener compactas las cabeceras de módulo. */
  size?: 'sm' | 'md';
  /** Acciones solo con icono, para barras densas; conservan nombre accesible. */
  compactIcons?: boolean;
}

export function ExportPrintButtons<T>({
  payload,
  htmlBuilder,
  size = 'sm',
  compactIcons = false,
}: ExportPrintButtonsProps<T>) {
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const toast = useToast();
  return (
    <>
      <ActionButton
        disabled={payload.rows.length === 0}
        onClick={() =>
          exportTableToExcel({ ...payload, generatedAt: new Date() }, (message) => {
            toast.error(message, { title: 'No se ha podido exportar' });
          })
        }
        iconOnly={compactIcons}
        size={size}
        variant="excel"
      >
        Exportar Excel
      </ActionButton>
      <ActionButton
        disabled={payload.rows.length === 0}
        onClick={() =>
          setPreviewHtml(
            htmlBuilder
              ? htmlBuilder()
              : buildPrintableTableHtml({ ...payload, generatedAt: new Date() }),
          )
        }
        iconOnly={compactIcons}
        size={size}
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
