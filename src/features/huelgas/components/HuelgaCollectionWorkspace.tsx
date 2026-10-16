import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Filter, Save, Upload } from 'lucide-react';
import { ActionButton } from '../../../components/ui/ActionButton';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { HuelgaIssuesPanel } from './HuelgaIssuesPanel';
import { resolveHuelgaIssueNavigation } from './huelgaIssueNavigation';
import type { HuelgaZoneResponse } from './huelgasResponseCollection';
import type { HuelgaValidationIssue, HuelgaValidationSummary } from './huelgasResponseValidation';

type FilterId = 'all' | 'pending' | 'errors' | 'warnings' | 'validated';

type Props = {
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
  onImport: (zoneId: string, file: File) => void;
  onImportMessage: (file: File | File[]) => void;
  onChange: (zoneId: string, field: keyof HuelgaZoneResponse, value: HuelgaZoneResponse[keyof HuelgaZoneResponse]) => void;
  onReview: (zoneId: string) => void;
  onSave: () => void;
  onExport: () => void;
  onOpenFullEditor: () => void;
};

function hasData(response: HuelgaZoneResponse): boolean {
  return Boolean(response.importedAt || response.sourceFileName) || [response.personasTurno, response.serviciosMinimos, response.personasTrabajan, response.personasHuelga].some((value) => value !== null);
}

function issueCounts(issues: HuelgaValidationIssue[]) {
  return {
    errors: issues.filter((issue) => issue.severity === 'error').length,
    warnings: issues.filter((issue) => issue.severity === 'warning').length,
  };
}

function responseStatus(response: HuelgaZoneResponse, issues: HuelgaValidationIssue[]) {
  if (!hasData(response)) return { label: 'Pendiente', tone: 'muted' as const };
  const counts = issueCounts(issues);
  if (counts.errors > 0) return { label: 'Error', tone: 'error' as const };
  if (counts.warnings > 0) return { label: 'Aviso', tone: 'warning' as const };
  if (response.reviewed) return { label: 'Validado', tone: 'success' as const };
  return { label: 'Por revisar', tone: 'warning' as const };
}

function pct(response: HuelgaZoneResponse): string {
  if (!response.personasTurno || response.personasTurno <= 0 || response.personasHuelga === null) return '—';
  return `${((response.personasHuelga / response.personasTurno) * 100).toFixed(1)}%`;
}

function NumberField({
  id,
  label,
  value,
  highlighted,
  onChange,
}: {
  id: string;
  label: string;
  value: number | null;
  highlighted?: boolean;
  onChange: (value: number | null) => void;
}) {
  return (
    <label className={`space-y-1 rounded-lg text-[11px] font-medium text-metro-muted ${highlighted ? 'ring-2 ring-amber-400/60 ring-offset-2 ring-offset-transparent' : ''}`}>
      <span>{label}</span>
      <input
        id={id}
        className="w-full rounded-lg border border-metro-border bg-metro-panel px-2.5 py-2 text-right text-sm font-semibold tabular-nums text-metro-text outline-none focus:border-metro-red focus:ring-2 focus:ring-metro-red/20"
        min={0}
        step={1}
        type="number"
        value={value ?? ''}
        onChange={(event) => {
          const raw = event.target.value.trim();
          onChange(raw === '' ? null : Math.max(0, Number.parseInt(raw, 10) || 0));
        }}
      />
    </label>
  );
}

export function HuelgaCollectionWorkspace({
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
  onImport,
  onImportMessage,
  onChange,
  onReview,
  onSave,
  onExport,
  onOpenFullEditor,
}: Props) {
  const [filter, setFilter] = useState<FilterId>('all');
  const [search, setSearch] = useState('');
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(responses[0]?.zonaId ?? null);
  const [highlightedTarget, setHighlightedTarget] = useState<string | null>(null);

  const visibleDataIssues = useMemo(() => {
    const zoneIssues = responses
      .filter(hasData)
      .flatMap((response) => validationByZone[response.zonaId] ?? []);
    return [...zoneIssues, ...globalIssues];
  }, [globalIssues, responses, validationByZone]);
  const visibleIssueCounts = useMemo(() => issueCounts(visibleDataIssues), [visibleDataIssues]);
  const zoneNames = useMemo(() => Object.fromEntries(responses.map((response) => [response.zonaId, response.zonaNombre])), [responses]);

  const filtered = useMemo(() => responses.filter((response) => {
    const issues = validationByZone[response.zonaId] ?? [];
    const counts = issueCounts(issues);
    const received = hasData(response);
    const textMatch = response.zonaNombre.toLocaleLowerCase('es-ES').includes(search.trim().toLocaleLowerCase('es-ES'));
    if (!textMatch) return false;
    if (filter === 'pending') return !received;
    if (filter === 'errors') return received && counts.errors > 0;
    if (filter === 'warnings') return received && counts.warnings > 0 && counts.errors === 0;
    if (filter === 'validated') return received && response.reviewed && counts.errors === 0;
    return true;
  }), [filter, responses, search, validationByZone]);

  const selected = responses.find((response) => response.zonaId === selectedZoneId) ?? filtered[0] ?? responses[0] ?? null;
  const selectedIssues = selected && hasData(selected) ? validationByZone[selected.zonaId] ?? [] : [];
  const selectedCounts = issueCounts(selectedIssues);
  const pending = Math.max(0, responses.length - receivedCount);

  const navigateToIssue = (issue: HuelgaValidationIssue) => {
    const navigation = resolveHuelgaIssueNavigation(issue, responses);
    if (navigation.zoneId) {
      setFilter('all');
      setSearch('');
      setSelectedZoneId(navigation.zoneId);
    }
    setHighlightedTarget(navigation.target);

    window.setTimeout(() => {
      if (navigation.target === 'detail' || navigation.target === 'huelguistas') {
        onOpenFullEditor();
        return;
      }
      const zoneId = navigation.zoneId;
      if (!zoneId) return;
      const fieldId = navigation.target === 'circuit' || navigation.target === 'source'
        ? `huelga-zone-${zoneId}`
        : `huelga-field-${zoneId}-${navigation.target}`;
      const element = document.getElementById(fieldId);
      element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) element.focus();
    }, 0);
  };

  return (
    <div className="space-y-3">
      <section className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-lg border border-metro-border bg-metro-panel/45 px-3 py-2"><p className="text-[10px] uppercase text-metro-muted">Recibidos</p><strong className="text-lg tabular-nums text-metro-text">{receivedCount}/{responses.length}</strong></div>
        <div className="rounded-lg border border-metro-border bg-metro-panel/45 px-3 py-2"><p className="text-[10px] uppercase text-metro-muted">Pendientes</p><strong className="text-lg tabular-nums text-metro-text">{pending}</strong></div>
        <div className="rounded-lg border border-metro-border bg-metro-panel/45 px-3 py-2"><p className="text-[10px] uppercase text-metro-muted">Revisados</p><strong className="text-lg tabular-nums text-metro-text">{reviewedCount}/{responses.length}</strong></div>
        <div className={`rounded-lg border px-3 py-2 ${visibleIssueCounts.errors > 0 ? 'border-red-500/35 bg-red-500/5' : 'border-metro-border bg-metro-panel/45'}`}><p className="text-[10px] uppercase text-metro-muted">Errores de datos</p><strong className={visibleIssueCounts.errors > 0 ? 'text-lg tabular-nums text-red-300' : 'text-lg tabular-nums text-metro-text'}>{visibleIssueCounts.errors}</strong></div>
        <div className="rounded-lg border border-metro-border bg-metro-panel/45 px-3 py-2"><p className="text-[10px] uppercase text-metro-muted">Avisos</p><strong className="text-lg tabular-nums text-metro-text">{visibleIssueCounts.warnings}</strong></div>
      </section>

      <HuelgaIssuesPanel issues={visibleDataIssues} zoneNames={zoneNames} onNavigate={navigateToIssue} />

      <section className="rounded-xl border border-metro-border bg-metro-panel/45 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <Filter size={14} className="text-metro-muted" />
            {([
              ['all', 'Todos'],
              ['pending', 'Pendientes'],
              ['errors', 'Errores'],
              ['warnings', 'Avisos'],
              ['validated', 'Validados'],
            ] as Array<[FilterId, string]>).map(([id, label]) => (
              <button key={id} type="button" onClick={() => setFilter(id)} className={`rounded-lg px-2.5 py-1.5 text-[11px] font-semibold ${filter === id ? 'bg-metro-red text-white' : 'border border-metro-border text-metro-muted hover:bg-metro-raised hover:text-metro-text'}`}>{label}</button>
            ))}
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar circuito…" className="ml-1 h-8 w-44 rounded-lg border border-metro-border bg-metro-panel px-2.5 text-xs text-metro-text outline-none focus:border-metro-red" />
          </div>
          <div className="flex items-center gap-1.5">
            <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-metro-border bg-metro-panel/85 px-2.5 text-xs font-semibold text-metro-text hover:border-metro-red hover:bg-metro-raised">
              <Upload size={14} /> Importar archivos
              <input className="hidden" type="file" multiple accept=".msg,.xlsx,.xlsm" onChange={(event) => {
                const files = Array.from(event.target.files ?? []);
                if (files.length > 0) onImportMessage(files);
                event.currentTarget.value = '';
              }} />
            </label>
            <ActionButton variant="excel" size="sm" iconOnly={false} disabled={validationSummary.errors > 0 || reviewedCount < responses.length} loading={exporting} onClick={onExport}>Excel maestra</ActionButton>
          </div>
        </div>

        <div className="mt-3 overflow-x-auto rounded-lg border border-metro-border">
          <table className="w-full min-w-[820px] text-left text-[11px]">
            <thead className="bg-metro-panel text-metro-muted"><tr><th className="px-2.5 py-2">Estado</th><th className="px-2.5 py-2">Circuito</th><th className="px-2.5 py-2">Origen</th><th className="px-2.5 py-2 text-right">Con turno</th><th className="px-2.5 py-2 text-right">SS.MM.</th><th className="px-2.5 py-2 text-right">Trabajan</th><th className="px-2.5 py-2 text-right">Huelga</th><th className="px-2.5 py-2 text-right">Seguimiento</th></tr></thead>
            <tbody>
              {filtered.map((response) => {
                const issues = validationByZone[response.zonaId] ?? [];
                const status = responseStatus(response, issues);
                const isSelected = selected?.zonaId === response.zonaId;
                return (
                  <tr key={response.zonaId} onClick={() => { setSelectedZoneId(response.zonaId); setHighlightedTarget(null); }} className={`cursor-pointer border-t border-metro-border/60 ${isSelected ? 'bg-metro-red/8' : 'hover:bg-metro-raised/60'}`}>
                    <td className="px-2.5 py-2"><StatusBadge tone={status.tone} size="xs">{status.label}</StatusBadge></td>
                    <td className="px-2.5 py-2 font-semibold text-metro-text">{response.zonaNombre}</td>
                    <td className="max-w-[210px] truncate px-2.5 py-2 text-metro-muted" title={response.sourceFileName || 'Manual'}>{response.sourceFileName || (hasData(response) ? 'Manual' : '—')}</td>
                    <td className="px-2.5 py-2 text-right tabular-nums text-metro-text">{response.personasTurno ?? '—'}</td>
                    <td className="px-2.5 py-2 text-right tabular-nums text-metro-text">{response.serviciosMinimos ?? '—'}</td>
                    <td className="px-2.5 py-2 text-right tabular-nums text-metro-text">{response.personasTrabajan ?? '—'}</td>
                    <td className="px-2.5 py-2 text-right font-semibold tabular-nums text-metro-text">{response.personasHuelga ?? '—'}</td>
                    <td className="px-2.5 py-2 text-right font-semibold tabular-nums text-metro-text">{pct(response)}</td>
                  </tr>
                );
              })}
              {filtered.length === 0 && <tr><td colSpan={8} className="px-3 py-8 text-center text-xs text-metro-muted">No hay circuitos para este filtro.</td></tr>}
            </tbody>
            <tfoot className="border-t border-metro-border bg-metro-panel/70 font-semibold text-metro-text"><tr><td colSpan={3} className="px-2.5 py-2">Totales</td><td className="px-2.5 py-2 text-right tabular-nums">{totals.personasTurno}</td><td className="px-2.5 py-2 text-right tabular-nums">{totals.serviciosMinimos}</td><td className="px-2.5 py-2 text-right tabular-nums">{totals.personasTrabajan}</td><td className="px-2.5 py-2 text-right tabular-nums">{totals.personasHuelga}</td><td className="px-2.5 py-2 text-right tabular-nums">{totals.personasTurno > 0 ? `${((totals.personasHuelga / totals.personasTurno) * 100).toFixed(1)}%` : '—'}</td></tr></tfoot>
          </table>
        </div>
      </section>

      {selected && (
        <section id={`huelga-zone-${selected.zonaId}`} className={`rounded-xl border p-3 ${selectedCounts.errors > 0 ? 'border-red-500/35 bg-red-500/5' : 'border-metro-border bg-metro-panel/45'}`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2"><h3 className="text-sm font-semibold text-metro-text">{selected.zonaNombre}</h3>{selected.reviewed && <StatusBadge tone="success" size="xs">Revisado</StatusBadge>}</div>
              <p className="mt-1 text-[11px] text-metro-muted">{selected.sourceFileName || 'Datos manuales'}{selected.importedAt ? ` · ${new Date(selected.importedAt).toLocaleString('es-ES')}` : ''}</p>
            </div>
            <div className="flex items-center gap-1.5">
              <label className={`inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border bg-metro-panel/85 px-2.5 text-xs font-semibold text-metro-text hover:border-metro-red ${highlightedTarget === 'source' ? 'border-amber-400 ring-2 ring-amber-400/40' : 'border-metro-border'}`}><FileSpreadsheet size={14} />{hasData(selected) ? 'Reimportar' : 'Importar Excel'}<input className="hidden" type="file" accept=".xlsx,.xlsm" onChange={(event) => { const file = event.target.files?.[0]; if (file) onImport(selected.zonaId, file); event.currentTarget.value = ''; }} /></label>
              <ActionButton variant="secondary" size="sm" iconOnly={false} onClick={onOpenFullEditor}>Desglose H/M</ActionButton>
            </div>
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <NumberField id={`huelga-field-${selected.zonaId}-personasTurno`} label="Con turno" value={selected.personasTurno} highlighted={highlightedTarget === 'personasTurno'} onChange={(value) => onChange(selected.zonaId, 'personasTurno', value)} />
            <NumberField id={`huelga-field-${selected.zonaId}-serviciosMinimos`} label="Servicios mínimos" value={selected.serviciosMinimos} highlighted={highlightedTarget === 'serviciosMinimos'} onChange={(value) => onChange(selected.zonaId, 'serviciosMinimos', value)} />
            <NumberField id={`huelga-field-${selected.zonaId}-personasTrabajan`} label="Trabajan" value={selected.personasTrabajan} highlighted={highlightedTarget === 'personasTrabajan'} onChange={(value) => onChange(selected.zonaId, 'personasTrabajan', value)} />
            <NumberField id={`huelga-field-${selected.zonaId}-personasHuelga`} label="En huelga" value={selected.personasHuelga} highlighted={highlightedTarget === 'personasHuelga'} onChange={(value) => onChange(selected.zonaId, 'personasHuelga', value)} />
          </div>

          <label className="mt-3 block space-y-1 text-[11px] font-medium text-metro-muted"><span>Observaciones</span><textarea rows={2} value={selected.observaciones} onChange={(event) => onChange(selected.zonaId, 'observaciones', event.target.value)} className="w-full resize-y rounded-lg border border-metro-border bg-metro-panel px-2.5 py-2 text-xs text-metro-text outline-none focus:border-metro-red" /></label>

          {selected.generalDetail?.length ? <p className={`mt-2 rounded-lg border bg-metro-panel/50 px-3 py-2 text-[11px] text-metro-muted ${highlightedTarget === 'detail' ? 'border-amber-400 ring-2 ring-amber-400/30' : 'border-metro-border'}`}>Desglose disponible: {selected.generalDetail.length} filas por turno/colectivo. Usa <strong className="text-metro-text">Desglose H/M</strong> para editar celdas individuales.</p> : null}

          {selectedIssues.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {selectedIssues.slice(0, 8).map((issue, index) => <p key={`${issue.message}-${index}`} className={`flex items-start gap-1.5 rounded-lg border px-2.5 py-2 text-[11px] ${issue.severity === 'error' ? 'border-red-500/30 bg-red-500/5 text-red-200' : 'border-amber-500/25 bg-amber-500/5 text-amber-200'}`}><AlertTriangle size={13} className="mt-0.5 shrink-0" />{issue.message}</p>)}
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-metro-border pt-3">
            <p className="text-[11px] text-metro-muted">{selectedCounts.errors > 0 ? 'Corrige los errores antes de marcar este circuito como revisado.' : selected.reviewed ? 'Circuito revisado.' : hasData(selected) ? 'Sin errores bloqueantes. Puedes marcarlo como revisado.' : 'Pendiente de recibir datos.'}</p>
            <div className="flex items-center gap-1.5">
              {!selected.reviewed && <ActionButton variant="approve" size="sm" icon={CheckCircle2} iconOnly={false} disabled={selectedCounts.errors > 0 || !hasData(selected)} onClick={() => onReview(selected.zonaId)}>Marcar revisado</ActionButton>}
              {dirty && <ActionButton variant="save" size="sm" icon={Save} iconOnly={false} loading={saving} onClick={onSave}>Guardar cambios</ActionButton>}
            </div>
          </div>
        </section>
      )}

      {dirty && (
        <div className="sticky bottom-3 z-20 flex justify-end pointer-events-none">
          <ActionButton className="pointer-events-auto shadow-lg" variant="save" size="md" icon={Save} iconOnly={false} loading={saving} onClick={onSave}>Guardar cambios</ActionButton>
        </div>
      )}
      {(importingMessage || importingZoneId) && <p className="text-[11px] text-metro-muted">Procesando importación…</p>}
    </div>
  );
}
