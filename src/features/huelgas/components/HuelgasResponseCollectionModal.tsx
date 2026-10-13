import { useState } from 'react';
import { AlertTriangle, CheckCircle2, CircleX, FileSpreadsheet, Mail, Save, Trash2, Upload } from 'lucide-react';
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
  const detailField = field === 'personasTrabajan' ? 'trabajan' : field === 'personasHuelga' ? 'huelga' : field;
  const mismatch = Boolean(response.generalDetail?.length) && response[field] !== null && detailSum(response.generalDetail ?? [], detailField) !== response[field];
  return (
    <label className="space-y-1 text-xs font-medium text-metro-muted">
      <span className="inline-flex items-center gap-1.5">{mismatch && <span aria-label="Total general incoherente" title="El total general no coincide con el desglose" className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-red-600 text-[10px] font-bold text-white">!</span>}{label}</span>
      <input
        className={`w-full rounded-lg border px-2.5 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-amber-400/50 ${mismatch ? 'border-amber-400 bg-amber-300/20 text-amber-100' : 'border-metro-border bg-metro-panel text-metro-text focus:border-metro-red'}`}
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


const SHIFT_LABELS = { noche: 'Noche', manana: 'Mañana', tarde: 'Tarde' } as const;

function detailSum(detail: NonNullable<HuelgaZoneResponse['generalDetail']>, metric: 'personasTurno' | 'serviciosMinimos' | 'trabajan' | 'huelga') {
  return detail.reduce((sum, row) => sum + row[metric].hombres + row[metric].mujeres, 0);
}

function importedDetailPanel(
  response: HuelgaZoneResponse,
  onChange: (zoneId: string, field: keyof HuelgaZoneResponse, value: HuelgaZoneResponse[keyof HuelgaZoneResponse]) => void,
) {
  const detail = response.generalDetail ?? [];
  const hasImport = Boolean(response.importedAt && response.sourceFileName);
  if (!hasImport && detail.length === 0) return null;
  if (detail.length === 0) {
    return (
      <div className="mt-3 rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
        <strong>Reimportación necesaria.</strong> Se conservan los totales, pero no el desglose por turno, colectivo y sexo. Sustituye el Excel para generar el seguimiento histórico.
      </div>
    );
  }
  const metrics = [
    { key: 'personasTurno', label: 'Con turno', expected: response.personasTurno },
    { key: 'serviciosMinimos', label: 'SS.MM.', expected: response.serviciosMinimos },
    { key: 'trabajan', label: 'Trabajan', expected: response.personasTrabajan },
    { key: 'huelga', label: 'Huelga', expected: response.personasHuelga },
  ] as const;
  const updateDetail = (index: number, key: 'personasTurno' | 'serviciosMinimos' | 'trabajan' | 'huelga', sex: 'hombres' | 'mujeres', value: string) => {
    const next = detail.map((item, position) => position === index
      ? { ...item, [key]: { ...item[key], [sex]: Math.max(0, Number.parseInt(value, 10) || 0) } }
      : item);
    onChange(response.zonaId, 'generalDetail', next);
  };
  const mismatches = metrics.filter(({ key, expected }) => expected !== null && detailSum(detail, key) !== expected);
  const mismatchKeys = new Set(mismatches.map(({ key }) => key));
  const rowIssues = detail.map((row) => {
    const affected = new Set<'hombres' | 'mujeres'>();
    for (const sex of ['hombres', 'mujeres'] as const) {
      const total = row.personasTurno[sex];
      const classified = row.serviciosMinimos[sex] + row.trabajan[sex] + row.huelga[sex];
      if (total !== classified || ![total, row.serviciosMinimos[sex], row.trabajan[sex], row.huelga[sex]].every((value) => Number.isInteger(value) && value >= 0)) affected.add(sex);
    }
    return affected;
  });
  const hasVisualErrors = mismatches.length > 0 || rowIssues.some((affected) => affected.size > 0);
  return (
    <details className="mt-3 rounded-lg border border-metro-border bg-metro-panel/35 p-3" open={hasVisualErrors}>
      <summary className="cursor-pointer text-xs font-semibold text-metro-text">
        Desglose importado · {detail.length} filas por colectivo y turno
        {hasVisualErrors ? ' · Errores por revisar' : ' · Ver detalle'}
      </summary>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-[11px] text-metro-text">
          <thead><tr className="border-b border-metro-border text-metro-muted">
            <th className="px-2 py-2">Turno</th><th className="px-2 py-2">Colectivo</th>
            {metrics.map(({ key, label }) => <th className="px-2 py-2 text-right" colSpan={3} key={key}>{label} (H / M / Total)</th>)}
          </tr></thead>
          <tbody>
            {detail.map((row, index) => (
              <tr className="border-b border-metro-border/50" key={`${row.turno}-${row.colectivo}-${index}`}>
                <td className="px-2 py-1.5"><span className="inline-flex items-center gap-1.5">{rowIssues[index].size > 0 && <span aria-label="Fila con errores" title="Esta fila contiene valores incoherentes" className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-red-600 text-[10px] font-bold text-white">!</span>}{SHIFT_LABELS[row.turno]}</span></td>
                <td className="px-2 py-1.5">{row.colectivo}</td>
                {metrics.map(({ key }) => (
                  <td className="px-2 py-1.5 text-right tabular-nums" colSpan={3} key={key}>
                    <div className="flex items-center justify-end gap-1">
                      {(['hombres', 'mujeres'] as const).map((sex) => (
                        <label className="flex items-center gap-1" key={sex} title={sex === 'hombres' ? 'Hombres' : 'Mujeres'}>
                          <span className="text-metro-muted">{sex === 'hombres' ? 'H' : 'M'}</span>
                          <input aria-label={`${row.colectivo} ${SHIFT_LABELS[row.turno]} ${key} ${sex}`} className={`w-12 rounded border px-1 py-1 text-right outline-none focus:ring-2 focus:ring-amber-400/50 ${rowIssues[index].has(sex) ? 'border-amber-400 bg-amber-300/20 text-amber-100' : 'border-metro-border bg-metro-panel'}`} min={0} type="number" value={row[key][sex]} onChange={(event) => updateDetail(index, key, sex, event.target.value)} />
                        </label>
                      ))}
                      <strong className={`w-7 rounded text-right ${rowIssues[index].size > 0 ? 'bg-amber-300/20 text-amber-200' : ''}`}>{row[key].hombres + row[key].mujeres}</strong>
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot><tr className="font-semibold">
            <td className="px-2 py-2" colSpan={2}>Totales del desglose</td>
            {metrics.map(({ key }) => <td className={`px-2 py-2 text-right tabular-nums ${mismatchKeys.has(key) ? 'bg-amber-300/15 text-amber-200' : ''}`} colSpan={3} key={key}>{mismatchKeys.has(key) && <span aria-label="Total incoherente" className="mr-2 inline-flex h-4 w-4 items-center justify-center rounded-full bg-red-600 text-[10px] text-white">!</span>}{detailSum(detail, key)}</td>)}
          </tr></tfoot>
        </table>
      </div>
      <p className="mt-2 text-[11px] text-metro-muted">H y M son editables. Corrige las cifras del Excel y después revisa los totales generales inferiores.</p>
      {mismatches.length > 0 && (
        <div className="mt-2 space-y-1">
          {mismatches.map(({ key, label, expected }) => (
            <p className="rounded border border-amber-400/40 bg-amber-400/10 px-2 py-1 text-xs text-amber-200" key={key}>
              {label}: desglose {detailSum(detail, key)} frente a total general {expected}. Revisa las celdas H/M o corrige el total general.
            </p>
          ))}
        </div>
      )}
      {mismatches.length > 0 && (
        <p className="mt-2 text-xs text-amber-300">
          Atención: los totales del desglose no coinciden con los totales generales en {mismatches.map((item) => item.label).join(', ')}. Comprueba el Excel antes de exportar.
        </p>
      )}
      <p className="mt-2 text-[11px] text-metro-muted">Origen: {response.sourceFileName} · Importado: {response.importedAt ? new Date(response.importedAt).toLocaleString('es-ES') : 'Sin fecha'}</p>
    </details>
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
  onImportMessage: (file: File | File[]) => void;
  onChange: (zoneId: string, field: keyof HuelgaZoneResponse, value: HuelgaZoneResponse[keyof HuelgaZoneResponse]) => void;
  onReview: (zoneId: string) => void;
  onRemove: (zoneId: string) => void;
  onSave: () => void;
  onExport: () => void;
  onExportGrouped: () => void;
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
  onRemove,
  onSave,
  onExport,
  onExportGrouped,
}: Props) {
  const [dropActive, setDropActive] = useState(false);
  if (!target) return null;

  return (
    <ModalShell labelledBy="huelga-response-title" onClose={onClose} size="xl">
      <ModalHeader>
        <ModalTitle
          id="huelga-response-title"
          subtitle="Arrastra uno o varios correos de Outlook o Excel; TrAcción identifica cada circuito y valida los datos. SSGG se recoge internamente, sin correo."
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
            const files = Array.from(event.dataTransfer.files ?? []);
            if (files.length > 0) onImportMessage(files);
          }}
        >
          <input
            accept=".msg,.xlsx,.xlsm"
            className="hidden"
            disabled={importingMessage}
            multiple
            type="file"
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              if (files.length > 0) onImportMessage(files);
              event.target.value = '';
            }}
          />
          <div>
            <div className="mx-auto mb-2 flex w-fit items-center gap-2 text-sky-300">
              <Mail size={24} />
              <FileSpreadsheet size={24} />
            </div>
            <p className="text-sm font-semibold text-metro-text">
              {importingMessage ? 'Procesando respuesta…' : 'Arrastra aquí uno o varios correos de Outlook o Excel'}
            </p>
            <p className="mt-1 text-xs text-metro-muted">Formatos .msg, .xlsx o .xlsm · admite selección múltiple</p>
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
            const received = Boolean(
              response.sourceFileName ||
              response.importedAt ||
              response.personasTurno !== null ||
              response.personasTrabajan !== null ||
              response.serviciosMinimos !== null ||
              response.personasHuelga !== null ||
              response.observaciones.trim(),
            );
            const internalSsgg = response.zonaId === 'zona-ssgg-interno';
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
                    <p className="mt-1 truncate text-xs text-metro-muted">
                      {response.sourceFileName || (internalSsgg ? 'Recogida interna RRLL · sin correo' : 'Esperando respuesta')}
                    </p>
                    {internalSsgg && (
                      <p className="mt-1 text-[11px] text-sky-300">
                        Puedes adjuntar tu Excel SSCC/SSGG o introducir los totales manualmente. SS.MM. y huelga vacíos se consideran 0.
                      </p>
                    )}
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
                {importedDetailPanel(response, onChange)}
                {response.importedAt && (
                  <div className="mt-2 flex justify-end">
                    <ActionButton variant="delete" icon={Trash2} iconOnly={false} onClick={() => onRemove(response.zonaId)}>Eliminar importación</ActionButton>
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
          <ActionButton
            variant="secondary"
            icon={FileSpreadsheet}
            iconOnly={false}
            loading={exporting}
            disabled={validationSummary.errors > 0}
            onClick={onExportGrouped}
          >
            Generar Excel agrupada
          </ActionButton>
          <ActionButton variant="primary" icon={Save} iconOnly={false} loading={saving} disabled={!dirty} onClick={onSave}>Guardar</ActionButton>
        </div>
      </ModalFooter>
    </ModalShell>
  );
}
