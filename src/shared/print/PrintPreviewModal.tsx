import { X } from 'lucide-react';

interface PrintPreviewModalProps {
  html: string;
  title: string;
  onClose: () => void;
}

export function PrintPreviewModal({ html, title, onClose }: PrintPreviewModalProps) {
  const handlePrint = () => {
    const printWindow = window.open('', '_blank', 'width=1100,height=800');

    if (!printWindow) {
      return;
    }

    printWindow.document.write(
      `<!doctype html><html><head><meta charset="utf-8" /><title>${title}</title>${printStyles}</head><body>${html}</body></html>`,
    );
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={`Vista previa de impresión: ${title}`}
    >
      <div className="flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-metro-border bg-metro-surface shadow-card">
        <div className="flex items-center justify-between border-b border-metro-border px-4 py-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-metro-red">
              Vista previa
            </p>
            <h3 className="text-lg font-bold text-metro-text">{title}</h3>
          </div>
          <button
            className="rounded-lg border border-metro-border p-2 text-metro-muted hover:border-metro-red hover:text-metro-text"
            onClick={onClose}
            type="button"
            aria-label="Cerrar vista previa"
          >
            <X size={18} />
          </button>
        </div>
        <div className="overflow-auto bg-white p-5 text-slate-950">
          <div className="print-preview-content" dangerouslySetInnerHTML={{ __html: html }} />
        </div>
        <div className="flex justify-end gap-2 border-t border-metro-border px-4 py-3">
          <button
            className="rounded-xl border border-metro-border bg-metro-surface px-3 py-2 text-sm font-semibold text-metro-text hover:border-metro-red"
            onClick={onClose}
            type="button"
          >
            Cancelar
          </button>
          <button
            className="rounded-xl bg-metro-red px-3 py-2 text-sm font-semibold text-white hover:bg-metro-dark"
            onClick={handlePrint}
            type="button"
          >
            Imprimir
          </button>
        </div>
      </div>
    </div>
  );
}

const printStyles = `<style>body{font-family:Arial,sans-serif;margin:24px;color:#111}.print-header{margin-bottom:18px}.print-header h1{font-size:22px;margin:0 0 8px}.print-header p{font-size:12px;margin:2px 0;color:#444}table{border-collapse:collapse;width:100%;font-size:11px}th,td{border:1px solid #999;padding:5px;text-align:left;vertical-align:top;white-space:pre-wrap}th{background:#eee;font-weight:700}@media print{body{margin:12mm}}</style>`;
