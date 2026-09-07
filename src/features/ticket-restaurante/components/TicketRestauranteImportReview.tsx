import { AlertTriangle, CheckCircle2, FileSpreadsheet, Search, Upload } from 'lucide-react';

export function ImportReviewSummary({
  fileName,
  total,
  ready,
  errors = 0,
  ignored = 0,
  detail,
}: {
  fileName?: string;
  total: number;
  ready: number;
  errors?: number;
  ignored?: number;
  detail?: string;
}) {
  const steps = [
    { label: 'Archivo', icon: FileSpreadsheet },
    { label: 'Analizar', icon: Search },
    { label: 'Revisar', icon: AlertTriangle },
    { label: 'Confirmar', icon: CheckCircle2 },
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-1.5">
        {steps.map((step, index) => {
          const Icon = step.icon;
          const active = index <= 2;
          return (
            <div
              className={`rounded-lg border px-2 py-2 text-center ${
                active
                  ? 'border-metro-red/40 bg-metro-red/5 text-metro-text'
                  : 'border-metro-border bg-metro-surface text-metro-muted'
              }`}
              key={step.label}
            >
              <Icon className="mx-auto mb-1 h-3.5 w-3.5" />
              <div className="text-[11px] font-semibold">{index + 1}. {step.label}</div>
            </div>
          );
        })}
      </div>

      {fileName ? (
        <div className="flex items-center gap-2 rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-xs text-metro-muted">
          <Upload className="h-3.5 w-3.5 shrink-0 text-metro-red" />
          <span className="truncate"><strong className="text-metro-text">Archivo:</strong> {fileName}</span>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Metric label="Detectadas" value={total} />
        <Metric label="Preparadas" value={ready} emphasis />
        <Metric label="Con incidencias" value={errors} warning={errors > 0} />
        <Metric label="Ignoradas" value={ignored} />
      </div>

      {detail ? <p className="text-xs leading-relaxed text-metro-muted">{detail}</p> : null}
    </div>
  );
}

function Metric({
  label,
  value,
  emphasis = false,
  warning = false,
}: {
  label: string;
  value: number;
  emphasis?: boolean;
  warning?: boolean;
}) {
  return (
    <div className="rounded-lg border border-metro-border bg-metro-surface px-3 py-2">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-metro-muted">{label}</div>
      <div className={`mt-0.5 text-lg font-bold ${warning ? 'text-amber-300' : emphasis ? 'text-metro-red' : 'text-metro-text'}`}>
        {value}
      </div>
    </div>
  );
}
