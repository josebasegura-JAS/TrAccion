import { AlertTriangle, ArrowRight, CheckCircle2, CircleAlert } from 'lucide-react';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import type { HuelgaValidationIssue } from './huelgasResponseValidation';

type Props = {
  issues: HuelgaValidationIssue[];
  zoneNames: Record<string, string>;
  onNavigate: (issue: HuelgaValidationIssue) => void;
};

export function HuelgaIssuesPanel({ issues, zoneNames, onNavigate }: Props) {
  const errors = issues.filter((issue) => issue.severity === 'error');
  const warnings = issues.filter((issue) => issue.severity === 'warning');

  if (issues.length === 0) {
    return (
      <section className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 px-3 py-2.5">
        <div className="flex items-center gap-2 text-xs font-semibold text-emerald-200">
          <CheckCircle2 size={15} /> Sin incidencias de datos
        </div>
      </section>
    );
  }

  return (
    <section className={`rounded-xl border p-3 ${errors.length > 0 ? 'border-red-500/35 bg-red-500/5' : 'border-amber-500/30 bg-amber-500/5'}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {errors.length > 0 ? <CircleAlert className="text-red-300" size={17} /> : <AlertTriangle className="text-amber-300" size={17} />}
          <div>
            <p className="text-xs font-semibold text-metro-text">Estado de los datos</p>
            <p className="text-[11px] text-metro-muted">Revisa las incidencias antes de validar la recogida.</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <StatusBadge tone={errors.length > 0 ? 'error' : 'muted'} size="xs">{errors.length} error{errors.length === 1 ? '' : 'es'}</StatusBadge>
          <StatusBadge tone={warnings.length > 0 ? 'warning' : 'muted'} size="xs">{warnings.length} aviso{warnings.length === 1 ? '' : 's'}</StatusBadge>
        </div>
      </div>

      <div className="mt-2 max-h-52 space-y-1.5 overflow-y-auto pr-1">
        {issues.map((issue, index) => {
          const zoneLabel = issue.zonaId ? zoneNames[issue.zonaId] ?? issue.zonaId : 'Incidencia global';
          return (
            <div
              key={`${issue.severity}-${issue.zonaId ?? 'global'}-${issue.message}-${index}`}
              className={`flex items-start justify-between gap-3 rounded-lg border px-2.5 py-2 ${issue.severity === 'error' ? 'border-red-500/25 bg-red-500/5' : 'border-amber-500/20 bg-amber-500/5'}`}
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <StatusBadge tone={issue.severity === 'error' ? 'error' : 'warning'} size="xs">{issue.severity === 'error' ? 'Error' : 'Aviso'}</StatusBadge>
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-metro-muted">{zoneLabel}</span>
                </div>
                <p className={`mt-1 text-[11px] ${issue.severity === 'error' ? 'text-red-100' : 'text-amber-100'}`}>{issue.message}</p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate(issue)}
                className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-metro-border bg-metro-panel/80 px-2 py-1.5 text-[11px] font-semibold text-metro-text hover:border-metro-red hover:bg-metro-raised"
              >
                Ir al dato <ArrowRight size={12} />
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
