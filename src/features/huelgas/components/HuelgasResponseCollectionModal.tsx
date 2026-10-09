import { CheckCircle2, FileSpreadsheet, Save, Upload } from 'lucide-react';
import { ActionButton } from '../../../components/ui/ActionButton';
import { ModalCloseButton } from '../../../components/ui/ModalCloseButton';
import { ModalFooter, ModalHeader, ModalShell, ModalTitle } from '../../../components/ui/ModalShell';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { formatDate, type Huelga } from './huelgasPageModel';
import type { HuelgaZoneResponse } from './huelgasResponseCollection';

function numberValue(value: number | null): string {
  return value === null ? '' : String(value);
}

function metricInput(
  response: HuelgaZoneResponse,
  field: 'personasTurno' | 'serviciosMinimos' | 'personasTrabajan' | 'personasHuelga',
  label: string,
  onChange: (zoneId: string, field: keyof HuelgaZoneResponse, value: HuelgaZoneResponse[keyof HuelgaZoneResponse]) => void,
) {
  return (
    <label className="space-y-1 text-xs font-medium text-metro-muted">
      <span>{label}</span>
      <input
        className="w-full rounded-lg border border-metro-border bg-metro-panel px-2.5 py-2 text-sm font-semibold text-metro-text outline-none focus:border-metro-red"
        min={0}
        step={1}
        type="number"
        value={numberValue(response[field])}
        onChange={(event) => {
          const raw = event.target.value.trim();
          onChange(response.zonaId, field, raw === '' ? null : Math.max(0, Number.parseInt(raw, 10) || 0));
        }}
      />
    </label>
  );
}

type Props = {
  target: Huelga | null;
  responses: HuelgaZoneResponse[];
  totals: { personasTurno: number; serviciosMinimos: number; personasTrabajan: number; personasHuelga: number };
  receivedCount: number;
  reviewedCount: number;
  dirty: boolean;
  saving: boolean;
  importingZoneId: string | null;
  exporting: boolean;
  onClose: () => void;
  onImport: (zoneId: string, file: File) => void;
  onChange: (zoneId: string, field: keyof HuelgaZoneResponse, value: HuelgaZoneResponse[keyof HuelgaZoneResponse]) => void;
  onReview: (zoneId: string) => void;
  onSave: () => void;
  onExport: () => void;
};

export function HuelgasResponseCollectionModal({
  target,
  responses,
  totals,
  receivedCount,
  reviewedCount,
  dirty,
  saving,
  importingZoneId,
  exporting,
  onClose,
  onImport,
  onChange,
  onReview,
  onSave,
  onExport,
}: Props) {
  if (!target) return null;

  return (
    <ModalShell labelledBy="huelga-response-title" onClose={onClose} size="xl">
      <ModalHeader>
        <ModalTitle
          id="huelga-response-title"
          subtitle="Importa los Excel recibidos, revisa los totales por circuito y genera el seguimiento consolidado."
        >
          Recogida de datos · {formatDate(target.fecha)}
        </ModalTitle>
        <ModalCloseButton onClick={onClose} />
      </ModalHeader>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <section className="mb-4 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <div className="rounded-xl border border-metro-border bg-metro-panel/45 p-3"><p className="text-[11px] uppercase text-metro-muted">Recibidos</p><p className="mt-1 text-xl font-bold text-metro-text">{receivedCount}/{responses.length}</p></div>
          <div className="rounded-xl border border-metro-border bg-metro-panel/45 p-3"><p className="text-[11px] uppercase text-metro-muted">Revisados</p><p className="mt-1 text-xl font-bold text-metro-text">{reviewedCount}/{responses.length}</p></div>
          <div className="rounded-xl border border-metro-border bg-metro-panel/45 p-3"><p className="text-[11px] uppercase text-metro-muted">Con turno</p><p className="mt-1 text-xl font-bold text-metro-text">{totals.personasTurno}</p></div>
          <div className="rounded-xl border border-metro-border bg-metro-panel/45 p-3"><p className="text-[11px] uppercase text-metro-muted">SS.MM.</p><p className="mt-1 text-xl font-bold text-metro-text">{totals.serviciosMinimos}</p></div>
          <div className="rounded-xl border border-metro-border bg-metro-panel/45 p-3"><p className="text-[11px] uppercase text-metro-muted">Trabajan</p><p className="mt-1 text-xl font-bold text-metro-text">{totals.personasTrabajan}</p></div>
          <div className="rounded-xl border border-metro-border bg-metro-panel/45 p-3"><p className="text-[11px] uppercase text-metro-muted">Huelga</p><p className="mt-1 text-xl font-bold text-metro-text">{totals.personasHuelga}</p></div>
        </section>

        <div className="space-y-3">
          {responses.map((response) => {
            const received = Boolean(response.sourceFileName || response.importedAt);
            return (
              <section key={response.zonaId} className="rounded-xl border border-metro-border bg-metro-panel/35 p-3.5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-metro-text">{response.zonaNombre}</h3>
                      <StatusBadge tone={response.reviewed ? 'success' : received ? 'warning' : 'muted'} size="xs">
                        {response.reviewed ? 'Revisado' : received ? 'Recibido' : 'Pendiente'}
                      </StatusBadge>
                    </div>
                    <p className="mt-1 truncate text-xs text-metro-muted">{response.sourceFileName || 'Sin fichero importado'}</p>
                  </div>
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-xs font-semibold text-metro-text hover:bg-metro-raised/50">
                    <Upload size={15} />
                    {importingZoneId === response.zonaId ? 'Importando…' : received ? 'Sustituir Excel' : 'Importar Excel'}
                    <input
                      accept=".xlsx,.xlsm"
                      className="hidden"
                      disabled={Boolean(importingZoneId)}
                      type="file"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) onImport(response.zonaId, file);
                        event.target.value = '';
                      }}
                    />
                  </label>
                </div>

                {response.warnings.length > 0 && (
                  <div className="mt-3 rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-xs text-amber-200">
                    {response.warnings.join(' · ')}
                  </div>
                )}

                <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  {metricInput(response, 'personasTurno', 'Personas con turno', onChange)}
                  {metricInput(response, 'serviciosMinimos', 'Servicios mínimos', onChange)}
                  {metricInput(response, 'personasTrabajan', 'Personas que trabajan', onChange)}
                  {metricInput(response, 'personasHuelga', 'Personas en huelga', onChange)}
                </div>

                <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_auto]">
                  <label className="space-y-1 text-xs font-medium text-metro-muted">
                    <span>Observaciones</span>
                    <textarea
                      className="min-h-16 w-full resize-y rounded-lg border border-metro-border bg-metro-panel px-3 py-2 text-sm text-metro-text outline-none focus:border-metro-red"
                      value={response.observaciones}
                      onChange={(event) => onChange(response.zonaId, 'observaciones', event.target.value)}
                    />
                  </label>
                  <div className="flex min-w-40 flex-col justify-end gap-2">
                    {response.huelguistas.length > 0 && (
                      <div className="flex items-center gap-2 text-xs text-metro-muted"><FileSpreadsheet size={14} />{response.huelguistas.length} huelguista{response.huelguistas.length === 1 ? '' : 's'} identificado{response.huelguistas.length === 1 ? '' : 's'}</div>
                    )}
                    <ActionButton
                      variant={response.reviewed ? 'secondary' : 'primary'}
                      icon={CheckCircle2}
                      iconOnly={false}
                      disabled={response.reviewed}
                      onClick={() => onReview(response.zonaId)}
                    >
                      {response.reviewed ? 'Datos revisados' : 'Marcar revisado'}
                    </ActionButton>
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      </div>

      <ModalFooter className="justify-between">
        <p className="self-center text-xs text-metro-muted">{dirty ? 'Hay cambios sin guardar.' : 'Cambios guardados.'}</p>
        <div className="flex gap-2">
          <ActionButton variant="secondary" iconOnly={false} onClick={onClose}>Cerrar</ActionButton>
          <ActionButton variant="secondary" icon={FileSpreadsheet} iconOnly={false} loading={exporting} onClick={onExport}>Exportar seguimiento</ActionButton>
          <ActionButton variant="primary" icon={Save} iconOnly={false} loading={saving} disabled={!dirty} onClick={onSave}>Guardar</ActionButton>
        </div>
      </ModalFooter>
    </ModalShell>
  );
}
