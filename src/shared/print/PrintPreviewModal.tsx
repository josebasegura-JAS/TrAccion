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
        <div className="overflow-auto bg-slate-200 p-5 text-slate-950">
          <div
            className="print-preview-content"
            dangerouslySetInnerHTML={{ __html: `${printStyles}${html}` }}
          />
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

export const printStyles = `<style>
:root{
  --print-ink:#0f172a;
  --print-muted:#64748b;
  --print-line:#dbe3ef;
  --print-soft:#f5f7fb;
  --print-header:#0b1422;
  --print-green:#16935f;
  --print-blue:#256fb8;
  --print-yellow:#c98a05;
  --print-orange:#f07a18;
  --print-red:#d04444;
  --print-violet:#7456c8;
}
*{box-sizing:border-box}
body{margin:0;background:#eef2f7;color:var(--print-ink);font-family:Inter,Segoe UI,Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.print-document{max-width:1180px;margin:0 auto;background:#fff;box-shadow:0 18px 45px rgba(15,23,42,.16);min-height:100vh;position:relative;overflow:hidden}
.print-report-header{display:flex;align-items:center;justify-content:space-between;gap:24px;padding:28px 34px 24px;background:radial-gradient(circle at 82% 10%,rgba(22,147,95,.28),transparent 28%),linear-gradient(135deg,#08111f,#13233a 62%,#0b1422);border-bottom:5px solid var(--print-green);color:#fff}
.print-report-header h1{margin:0;font-size:30px;line-height:1.08;text-transform:uppercase;letter-spacing:.02em}
.print-eyebrow{margin:0 0 8px;color:#40d38b;font-size:12px;font-weight:800;letter-spacing:.18em;text-transform:uppercase}
.print-header-pill{border:1px solid rgba(255,255,255,.18);border-radius:999px;background:rgba(22,147,95,.18);padding:9px 14px;color:#e9fff5;font-size:12px;font-weight:800;white-space:nowrap}
.print-summary-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;padding:24px 34px 16px}
.print-summary-card{min-height:72px;border:1px solid var(--print-line);border-radius:16px;background:linear-gradient(180deg,#fff,#f8fafc);padding:14px 16px;box-shadow:0 8px 22px rgba(15,23,42,.05)}
.print-summary-card span{display:block;color:var(--print-muted);font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;margin-bottom:7px}
.print-summary-card strong{display:block;color:var(--print-ink);font-size:15px;line-height:1.25;white-space:pre-wrap}
.print-table-section{padding:8px 34px 28px}
.print-section-title{display:flex;align-items:center;gap:10px;margin:8px 0 12px}
.print-section-title h2{margin:0;font-size:18px;text-transform:uppercase;letter-spacing:.01em}
.print-section-icon{display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#168c5c,#31b878);color:#fff;font-weight:900}
.print-table{width:100%;border-collapse:separate;border-spacing:0;font-size:11px;line-height:1.35;border:1px solid var(--print-line);border-radius:14px;overflow:hidden}
.print-table thead th{background:#f3f6fa;color:#0f172a;border-bottom:1px solid var(--print-line);font-size:10px;font-weight:900;text-align:left;text-transform:uppercase;letter-spacing:.05em;padding:10px 12px;vertical-align:bottom}
.print-table tbody td{border-bottom:1px solid var(--print-line);padding:10px 12px;text-align:left;vertical-align:top;white-space:pre-wrap;background:#fff}
.print-table tbody tr:nth-child(even) td{background:#fbfcfe}
.print-table tbody tr:last-child td{border-bottom:0}
.print-row-number,.print-row-number-heading{width:46px;text-align:center!important}
.print-row-number{font-weight:900;color:#126b49;background:#eefaf4!important}
.print-badge{display:inline-flex;align-items:center;justify-content:center;min-width:82px;border-radius:999px;padding:5px 9px;font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:.02em;border:1px solid transparent;white-space:nowrap}
.print-badge--success{color:#10724b;background:#e7f6ee;border-color:#b8e4cb}
.print-badge--info{color:#185f9f;background:#e7f1fb;border-color:#bfdbf5}
.print-badge--warning{color:#8a5d00;background:#fff5d8;border-color:#f2d98a}
.print-badge--orange{color:#9b4b00;background:#fff0df;border-color:#ffc482}
.print-badge--danger{color:#a52f2f;background:#fdeaea;border-color:#f6b7b7}
.print-badge--muted{color:#475569;background:#eef2f7;border-color:#d7dee8}
.print-empty{padding:22px!important;text-align:center!important;color:var(--print-muted)}

.print-header-subtitle{margin:8px 0 0;color:#dbeafe;font-size:14px;font-weight:700}
.print-header-pill--success{background:rgba(22,147,95,.28);border-color:rgba(64,211,139,.38)}
.print-header-pill--warning{background:rgba(201,138,5,.25);border-color:rgba(255,213,112,.4)}
.print-session-summary-grid{grid-template-columns:repeat(6,minmax(0,1fr))}
.print-summary-card--compact{min-height:62px}
.print-session-notes{margin:0 34px 8px;border:1px solid var(--print-line);border-radius:16px;background:linear-gradient(180deg,#fff,#f8fafc);padding:14px 16px}
.print-session-notes span,.print-session-observations span{display:block;margin-bottom:7px;color:#126b49;font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.05em}
.print-session-notes p,.print-session-observations p{margin:0;color:#1f2937;font-size:12px;line-height:1.45}
.print-point-title{display:block;color:#0f172a;font-size:11px;line-height:1.3}
.print-point-meta{display:block;margin-top:4px;color:#64748b;font-size:9px;line-height:1.25}
.print-session-table th:nth-child(2){width:24%}
.print-session-table th:nth-child(3){width:34%}
.print-session-table th:nth-child(4){width:12%}
.print-session-table th:nth-child(5){width:10%}
.print-session-table th:nth-child(6){width:13%}
.print-session-observations{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:0 34px 28px}
.print-session-observations>div{border:1px solid var(--print-line);border-radius:16px;background:linear-gradient(180deg,#fff,#f8fafc);padding:14px 16px}
.print-footer{display:flex;justify-content:space-between;gap:20px;padding:14px 34px;border-top:1px solid var(--print-line);background:#0b1422;color:#dbeafe;font-size:10px}
.print-page-number:after{content:counter(page)}
@media screen{.print-preview-content .print-document{border-radius:18px;overflow:hidden}.print-preview-content{padding:0}}
@media print{
  @page{size:A4 portrait;margin:8mm}
  body{background:#fff}
  .print-document{max-width:none;min-height:auto;box-shadow:none}
  .print-report-header{padding:18px 24px 16px}
  .print-report-header h1{font-size:24px}
  .print-summary-grid{padding:16px 24px 10px;gap:8px}
  .print-session-summary-grid{grid-template-columns:repeat(3,minmax(0,1fr))}
  .print-session-notes{margin:0 24px 6px;padding:10px 12px}
  .print-session-observations{grid-template-columns:1fr 1fr;margin:0 24px 16px;gap:8px}
  .print-session-observations>div{padding:10px 12px}
  .print-summary-card{min-height:54px;padding:10px 12px;box-shadow:none}
  .print-summary-card strong{font-size:12px}
  .print-table-section{padding:6px 24px 16px}
  .print-table{font-size:9px}
  .print-table thead th,.print-table tbody td{padding:6px 7px}
  .print-badge{min-width:68px;padding:4px 6px;font-size:8px}
  .print-footer{position:fixed;left:0;right:0;bottom:0;padding:8px 24px}
}
</style>`;
