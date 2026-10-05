import { ActionButton } from '../../components/ui/ActionButton';
import { ModalCloseButton } from '../../components/ui/ModalCloseButton';
import { ModalFooter, ModalHeader, ModalShell, ModalTitle } from '../../components/ui/ModalShell';

interface PrintPreviewModalProps {
  html: string;
  title: string;
  onClose: () => void;
}

export function PrintPreviewModal({ html, title, onClose }: PrintPreviewModalProps) {
  const handlePrint = () => {
    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.style.opacity = '0';

    const removeFrame = () => {
      window.setTimeout(() => iframe.remove(), 500);
    };

    iframe.onload = () => {
      const printWindow = iframe.contentWindow;
      if (!printWindow) {
        removeFrame();
        return;
      }

      printWindow.focus();
      printWindow.addEventListener('afterprint', removeFrame, { once: true });
      window.setTimeout(() => {
        printWindow.print();
        window.setTimeout(removeFrame, 2000);
      }, 50);
    };

    document.body.appendChild(iframe);
    const printDocument = iframe.contentDocument;
    if (!printDocument) {
      removeFrame();
      return;
    }

    printDocument.open();
    printDocument.write(
      `<!doctype html><html><head><meta charset="utf-8" /><title>${title}</title>${printStyles}</head><body>${html}</body></html>`,
    );
    printDocument.close();
  };

  return (
    <ModalShell labelledBy="print-preview-title" onClose={onClose} size="xl" stacked>
      <ModalHeader>
        <ModalTitle id="print-preview-title" subtitle="Vista previa antes de imprimir">
          {title}
        </ModalTitle>
        <ModalCloseButton label="Cerrar vista previa" onClick={onClose} />
      </ModalHeader>

      <div className="min-h-0 flex-1 overflow-auto bg-slate-200 p-5 text-slate-950">
        <div
          className="print-preview-content"
          dangerouslySetInnerHTML={{ __html: `${printStyles}${html}` }}
        />
      </div>

      <ModalFooter>
        <ActionButton variant="secondary" iconOnly={false} onClick={onClose}>Cancelar</ActionButton>
        <ActionButton variant="print" iconOnly={false} onClick={handlePrint}>Imprimir</ActionButton>
      </ModalFooter>
    </ModalShell>
  );
}

export const printStyles = `<style>
:root{
  --print-ink:#171717;
  --print-muted:#666b73;
  --print-line:#d9dde2;
  --print-soft:#f5f6f7;
  --print-header:#202124;
  --print-red:#c8102e;
  --print-red-dark:#98152a;
  --print-red-soft:#faecef;
  --print-gray:#4b5057;
}
*{box-sizing:border-box}
body{margin:0;background:#eef0f2;color:var(--print-ink);font-family:Inter,Segoe UI,Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact;counter-reset:print-page}
.print-document{max-width:1180px;margin:0 auto;background:#fff;box-shadow:0 18px 45px rgba(0,0,0,.12);min-height:100vh;position:relative;overflow:hidden}
.print-report-header{display:flex;align-items:center;justify-content:space-between;gap:24px;padding:28px 34px 24px;background:linear-gradient(135deg,#17181a,#2d3034 68%,#1d1f22);border-bottom:5px solid var(--print-red);color:#fff}
.print-report-header h1{margin:0;font-size:30px;line-height:1.08;text-transform:uppercase;letter-spacing:.02em}
.print-eyebrow{margin:0 0 8px;color:#f0b8c2;font-size:12px;font-weight:800;letter-spacing:.18em;text-transform:uppercase}
.print-header-pill{border:1px solid rgba(255,255,255,.22);border-radius:999px;background:rgba(200,16,46,.24);padding:9px 14px;color:#fff;font-size:12px;font-weight:800;white-space:nowrap}
.print-summary-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;padding:24px 34px 16px}
.print-summary-card{min-height:72px;border:1px solid var(--print-line);border-radius:16px;background:linear-gradient(180deg,#fff,#f7f7f8);padding:14px 16px;box-shadow:0 8px 22px rgba(0,0,0,.045)}
.print-summary-card span{display:block;color:var(--print-muted);font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;margin-bottom:7px}
.print-summary-card strong{display:block;color:var(--print-ink);font-size:15px;line-height:1.25;white-space:pre-wrap}
.print-table-section{padding:8px 34px 28px}
.print-section-title{display:flex;align-items:center;gap:10px;margin:8px 0 12px;border-bottom:2px solid var(--print-red);padding-bottom:8px}
.print-section-title h2{margin:0;font-size:18px;text-transform:uppercase;letter-spacing:.01em}
.print-section-icon{display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,var(--print-red-dark),var(--print-red));color:#fff;font-weight:900}
.print-table{width:100%;border-collapse:separate;border-spacing:0;font-size:11px;line-height:1.35;border:1px solid var(--print-line);border-radius:14px;overflow:hidden}
.print-table thead th{background:#e9eaec;color:#171717;border-bottom:1px solid #cfd2d6;font-size:10px;font-weight:900;text-align:left;text-transform:uppercase;letter-spacing:.05em;padding:10px 12px;vertical-align:bottom}
.print-table tbody td{border-bottom:1px solid var(--print-line);padding:10px 12px;text-align:left;vertical-align:top;white-space:pre-wrap;background:#fff}
.print-table tbody tr:nth-child(even) td{background:#f8f8f9}
.print-table tbody tr:last-child td{border-bottom:0}
.print-row-number,.print-row-number-heading{width:46px;text-align:center!important}
.print-row-number{font-weight:900;color:var(--print-red-dark);background:#fbf0f2!important}
.print-badge{display:inline-flex;align-items:center;justify-content:center;min-width:82px;border-radius:999px;padding:5px 9px;font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:.02em;border:1px solid transparent;white-space:nowrap}
.print-badge--success{color:#34373b;background:#eceeef;border-color:#cfd2d6}
.print-badge--info{color:#34373b;background:#eceeef;border-color:#cfd2d6}
.print-badge--warning{color:#7c1728;background:#faecef;border-color:#e6b7c0}
.print-badge--orange{color:#7c1728;background:#faecef;border-color:#e6b7c0}
.print-badge--danger{color:#8d1228;background:#f8e1e6;border-color:#e4aab5}
.print-badge--muted{color:#4b5057;background:#eef0f2;border-color:#d4d7db}
.print-empty{padding:22px!important;text-align:center!important;color:var(--print-muted)}
.print-header-subtitle{margin:8px 0 0;color:#d9dadd;font-size:14px;font-weight:700}
.print-header-pill--success{background:rgba(255,255,255,.12);border-color:rgba(255,255,255,.25)}
.print-header-pill--warning{background:rgba(200,16,46,.28);border-color:rgba(240,184,194,.45)}
.print-session-summary-grid{grid-template-columns:repeat(6,minmax(0,1fr))}
.print-summary-card--compact{min-height:62px}
.print-session-notes{margin:0 34px 8px;border:1px solid var(--print-line);border-radius:16px;background:linear-gradient(180deg,#fff,#f7f7f8);padding:14px 16px}
.print-session-notes span,.print-session-observations span{display:block;margin-bottom:7px;color:var(--print-red-dark);font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.05em}
.print-session-notes p,.print-session-observations p{margin:0;color:#2b2d30;font-size:12px;line-height:1.45}
.print-point-title{display:block;color:#171717;font-size:11px;line-height:1.3}
.print-point-meta{display:block;margin-top:4px;color:#6a6e74;font-size:9px;line-height:1.25}
.print-session-table th:nth-child(2){width:24%}.print-session-table th:nth-child(3){width:34%}.print-session-table th:nth-child(4){width:12%}.print-session-table th:nth-child(5){width:10%}.print-session-table th:nth-child(6){width:13%}
.print-session-observations{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:0 34px 28px}
.print-session-observations>div{border:1px solid var(--print-line);border-radius:16px;background:linear-gradient(180deg,#fff,#f7f7f8);padding:14px 16px}
.print-footer{display:flex;justify-content:space-between;gap:20px;padding:14px 34px;border-top:3px solid var(--print-red);background:#f3f3f4;color:#555a60;font-size:10px;counter-increment:print-page}
.print-page-number:after{content:counter(print-page)}
@media screen{.print-preview-content .print-document{border-radius:18px;overflow:hidden}.print-preview-content{padding:0}}
@media print{
  @page{size:A4 portrait;margin:8mm}
  body{background:#fff}.print-document{max-width:none;min-height:auto;box-shadow:none}.print-report-header{padding:18px 24px 16px}.print-report-header h1{font-size:24px}.print-summary-grid{padding:16px 24px 10px;gap:8px}.print-session-summary-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.print-session-notes{margin:0 24px 6px;padding:10px 12px}.print-session-observations{grid-template-columns:1fr 1fr;margin:0 24px 16px;gap:8px}.print-session-observations>div{padding:10px 12px}.print-summary-card{min-height:54px;padding:10px 12px;box-shadow:none}.print-summary-card strong{font-size:12px}.print-table-section{padding:6px 24px 16px}.print-table{font-size:9px}.print-table thead th,.print-table tbody td{padding:6px 7px}.print-badge{min-width:68px;padding:4px 6px;font-size:8px}.print-footer{position:fixed;left:0;right:0;bottom:0;padding:8px 24px}
}
</style>`;
