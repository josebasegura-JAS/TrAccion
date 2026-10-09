import { useState } from 'react';
import { AlertTriangle, CheckCircle2, CircleX, FileSpreadsheet, Mail, Save, Upload } from 'lucide-react';
import { ActionButton } from '../../../components/ui/ActionButton';
import { ModalCloseButton } from '../../../components/ui/ModalCloseButton';
import { ModalFooter, ModalHeader, ModalShell, ModalTitle } from '../../../components/ui/ModalShell';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { formatDate, type Huelga } from './huelgasPageModel';
import type { HuelgaZoneResponse } from './huelgasResponseCollection';
import type { HuelgaValidationIssue, HuelgaValidationSummary } from './huelgasResponseValidation';

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

function issuePanel(issues: HuelgaValidationIssue[]) {
  if (issues.length === 0) return null;
  const errors = issues.filter((item) => item.severity === 'error');
  const warnings = issues.filter((item) => item.severity === 'warning');
  return (
    <div className="mt-3 space-y-2">
      {errors.length > 0 && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs text-red-200">
          <div className="mb-1 flex items-center gap-1.5 font-semibold"><CircleX size={14} /> Errores bloqueantes</div>
          {errors.slice(0, 5).map((item, index) => <p key={`${item.message}-${index}`}>• {item.message}</p>)}
          {errors.length > 5 && <p>• …y {errors.length - 5} error(es) más.</p>}
        </div>
      )}
      {warnings.length > 0 && (
        <div className="rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-xs text-amber-200">
          <div className="mb-1 flex items-center gap-1.5 font-semibold"><AlertTriangle size={14} /> Advertencias</div>
          {warnings.slice(0, 5).map((item, index) => <p key={`${item.message}-${index}`}>• {item.message}</p>)}
          {warnings.length > 5 && <p>• …y {warnings.length - 5} aviso(s) más.</p>}
        </div>
      )}
    </div>
  );
}

type Props = {
  target: Huelga | null;
  responses: HuelgaZoneResponse[];
  totals: { personasTurno: number; serviciosMinimos: number; personasTrabajan: number; personasHuelga: number };
  receivedCount: number;
  reviewedCount: number;
  validationByZone: Record<string, HuelgaValidationIssue[]>;
  validationSummary: HuelgaValidationSummary;
  globalIssues: HuelgaValidationIssue[];
  dirty: boolean;
  saving: boolean;
  importingZoneId: string | null;
  importingMessage: boolean;
  exporting: boolean;
  onClose: () => void;
  onImport: (zoneId: string, file: File) => void;
  onImportMessage: (file: File) => void;
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
  validationByZone,
  validationSummary,
  globalIssues,
  dirty,
  saving,
  importingZoneId,
  importingMessage,
  exporting,
  onClose,
  onImport,
  onImportMessage,
  onChange,
  onReview,
  onSave,
  onExport,
}: Props) {
  const [dropActive, setDropActive] = useState(false);
  if (!target) return null;

  return (
    <ModalShell labelledBy="huelga-response-title" onClose={onClose} size="xl">
      <ModalHeader>
        <ModalTitle
          id="huelga-response-title"
          subtitle="Arrastra el correo recibido de Outlook o directamente su Excel; TrAcción identifica el circuito y valida los datos. La importación manual por circuito sigue disponible."
        >
          Recogida de datos · {formatDate(target.fecha)}
        </ModalTitle>
        <ModalCloseButton onClick={onClose} />
      </ModalHeader>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <section className="mb-4 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <div className="rounded-xl border border-metro-border bg-metro-panel/45 p-3"><p className="text-[11px] uppercase text-metro-muted">Recibidos</p><p className="mt-1 text-xl font-bold text-emerald-300">{receivedCount}/{responses.length}</p></div>
          <div className="rounded-xl border border-metro-border bg-metro-panel/45 p-3"><p className="text-[11px] uppercase text-metro-muted">Pendientes</p><p className="mt-1 text-xl font-bold text-amber-300">{Math.max(0, responses.length - receivedCount)}</p></div>
          <div className="rounded-xl border border-metro-border bg-metro-panel/45 p-3"><p className="text-[11px] uppercase text-metro-muted">Con turno</p><p className="mt-1 text-xl font-bold text-metro-text">{totals.personasTurno}</p></div>
          <div className="rounded-xl border border-metro-border bg-metro-panel/45 p-3"><p className="text-[11px] uppercase text-metro-muted">SS.MM.</p><p className="mt-1 text-xl font-bold text-metro-text">{totals.serviciosMinimos}</p></div>
          <div className="rounded-xl border border-metro-border bg-metro-panel/45 p-3"><p className="text-[11px] uppercase text-metro-muted">Trabajan</p><p className="mt-1 text-xl font-bold text-metro-text">{totals.personasTrabajan}</p></div>
          <div className="rounded-xl border border-metro-border bg-metro-panel/45 p-3"><p className="text-[11px] uppercase text-metro-muted">Huelga</p><p className="mt-1 text-xl font-bold text-metro-text">{totals.personasHuelga}</p></div>
        </section>

        <label
          className={`mb-4 flex min-h-28 cursor-pointer items-center justify-center rounded-xl border-2 border-dashed px-5 py-4 text-center transition ${
            dropActive
              ? 'border-sky-400 bg-sky-500/10'
              : 'border-metro-border bg-metro-panel/25 hover:border-sky-400/60 hover:bg-sky-500/5'
          } ${importingMessage ? 'pointer-events-none opacity-70' : ''}`}
          onDragEnter={(event) => { event.preventDefault(); setDropActive(true); }}
          onDragOver={(event) => { event.preventDefault(); setDropActive(true); }}
          onDragLeave={(event) => {
            event.preventDefault();
            if (event.currentTarget === event.target) setDropActive(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            setDropActive(false);
            const file = event.dataTransfer.files?.[0];
            if (file) onImportMessage(file);
          }}
        >
          <input
            accept=".msg,.xlsx,.xlsm"
            className="hidden"
            disabled={importingMessage}
            type="file"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onImportMessage(file);
              event.target.value = '';
            }}
          />
          <div>
            <div className="mx-auto mb-2 flex w-fit items-center gap-2 text-sky-300">
              <Mail size={24} />
              <FileSpreadsheet size={24} />
            </div>
            <p className="text-sm font-semibold text-metro-text">
              {importingMessage ? 'Procesando respuesta…' : 'Arrastra aquí el correo de Outlook o el Excel recibido'}
            </p>
            <p className="mt-1 text-xs text-metro-muted">Formatos .msg, .xlsx o .xlsm · también puedes hacer clic para seleccionarlo</p>
          </div>
        </label>

        <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-metro-muted">
          <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 font-semibold text-emerald-300">Verde · recibido</span>
          <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 font-semibold text-amber-300">Amarillo · pendiente</span>
          <span>Los errores de contenido se muestran aparte y deben corregirse antes de validar.</span>
        </div>

        {globalIssues.length > 0 && (
          <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/5 p-3 text-xs text-red-200">
            <div className="mb-1 flex items-center gap-2 font-semibold"><CircleX size={15} /> Inconsistencias entre circuitos</div>
            {globalIssues.map((item, index) => <p key={`${item.message}-${index}`}>• {item.message}</p>)}
          </div>
        )}

        <div className="space-y-3">
          {responses.map((response) => {
            const received = Boolean(response.sourceFileName || response.importedAt);
            const zoneIssues = validationByZone[response.zonaId] ?? [];
            const errorCount = zoneIssues.filter((item) => item.severity === 'error').length;
            const warningCount = zoneIssues.filter((item) => item.severity === 'warning').length;
            return (
              <section
                key={response.zonaId}
                className={`rounded-xl border p-3.5 ${
                  received
                    ? 'border-emerald-500/35 bg-emerald-500/[0.06]'
                    : 'border-amber-500/35 bg-amber-500/[0.06]'
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-metro-text">{response.zonaNombre}</h3>
                      <StatusBadge tone={received ? 'success' : 'warning'} size="xs">
                        {received ? 'Recibido' : 'Pendiente'}
                      </StatusBadge>
                      {response.reviewed && <StatusBadge tone="success" size="xs">Revisado</StatusBadge>}
                      {errorCount > 0 && <StatusBadge tone="error" size="xs">{errorCount} error{errorCount === 1 ? '' : 'es'}</StatusBadge>}
                      {errorCount === 0 && warningCount > 0 && <StatusBadge tone="warning" size="xs">{warningCount} aviso{warningCount === 1 ? '' : 's'}</StatusBadge>}
                    </div>
                    <p className="mt-1 truncate text-xs text-metro-muted">{response.sourceFileName || 'Esperando respuesta'}</p>
                  </div>
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-xs font-semibold text-metro-text hover:bg-metro-raised/50">
                    <Upload size={15} />
                    {importingZoneId === response.zonaId ? 'Importando…' : received ? 'Sustituir Excel' : 'Importar Excel'}
                    <input
                      accept=".xlsx,.xlsm"
                      className="hidden"
                      disabled={Boolean(importingZoneId) || importingMessage}
                      type="file"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) onImport(response.zonaId, file);
                        event.target.value = '';
                      }}
                    />
                  </label>
                </div>

                {issuePanel(zoneIssues)}

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
                      disabled={response.reviewed || !received}
                      onClick={() => onReview(response.zonaId)}
                    >
                      {response.reviewed ? 'Datos revisados' : 'Validar circuito'}
                    </ActionButton>
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      </div>

      <ModalFooter className="justify-between">
        <div className="self-center text-xs">
          <p className="text-metro-muted">{dirty ? 'Hay cambios sin guardar.' : 'Cambios guardados.'} · Revisados {reviewedCount}/{responses.length}</p>
          {validationSummary.errors > 0 ? (
            <p className="mt-0.5 text-red-300">{validationSummary.errors} bloqueo{validationSummary.errors === 1 ? '' : 's'} · la Excel maestra no se puede generar todavía.</p>
          ) : validationSummary.warnings > 0 ? (
            <p className="mt-0.5 text-amber-300">{validationSummary.warnings} advertencia{validationSummary.warnings === 1 ? '' : 's'} revisada{validationSummary.warnings === 1 ? '' : 's'}; no bloquean la exportación.</p>
          ) : (
            <p className="mt-0.5 text-emerald-300">Validación completa: datos preparados para consolidar.</p>
          )}
        </div>
        <div className="flex gap-2">
          <ActionButton variant="secondary" iconOnly={false} onClick={onClose}>Cerrar</ActionButton>
          <ActionButton
            variant="secondary"
            icon={FileSpreadsheet}
            iconOnly={false}
            loading={exporting}
            disabled={validationSummary.errors > 0}
            onClick={onExport}
          >
            Generar Excel maestra
          </ActionButton>
          <ActionButton variant="primary" icon={Save} iconOnly={false} loading={saving} disabled={!dirty} onClick={onSave}>Guardar</ActionButton>
        </div>
      </ModalFooter>
    </ModalShell>
  );
}
