import { Clock3, FileSpreadsheet } from 'lucide-react';
import { blockLabel } from './huelgasIncrementalImports';
import type { HuelgaImportDisplayBatch } from './useHuelgaIncrementalResponseCollection';

const BATCH_STYLES = [
  'border-sky-400/40 bg-sky-400/10 text-sky-200',
  'border-violet-400/40 bg-violet-400/10 text-violet-200',
  'border-emerald-400/40 bg-emerald-400/10 text-emerald-200',
  'border-amber-400/40 bg-amber-400/10 text-amber-200',
  'border-fuchsia-400/40 bg-fuchsia-400/10 text-fuchsia-200',
] as const;

function groupByZone(batches: HuelgaImportDisplayBatch[]) {
  const result = new Map<string, HuelgaImportDisplayBatch[]>();
  for (const batch of batches) {
    const list = result.get(batch.zoneId) ?? [];
    list.push(batch);
    result.set(batch.zoneId, list);
  }
  return result;
}

type Props = {
  open: boolean;
  batches: HuelgaImportDisplayBatch[];
};

export function HuelgaImportHistoryPanel({ open, batches }: Props) {
  if (!open || batches.length === 0) return null;
  const grouped = groupByZone(batches);

  return (
    <aside className="fixed right-5 top-20 z-[90] w-[370px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-metro-border bg-metro-panel/95 shadow-2xl backdrop-blur">
      <div className="border-b border-metro-border px-3 py-2.5">
        <div className="flex items-center gap-2 text-xs font-semibold text-metro-text">
          <FileSpreadsheet size={15} className="text-metro-red" /> Importaciones de esta recogida
        </div>
        <p className="mt-1 text-[10px] text-metro-muted">Cada color identifica un lote. La última importación de cada área queda marcada.</p>
      </div>
      <div className="max-h-[55vh] space-y-3 overflow-y-auto p-3">
        {[...grouped.entries()].map(([zoneId, zoneBatches]) => (
          <section key={zoneId}>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-metro-muted">{zoneBatches[0]?.zoneName}</p>
            <div className="space-y-1.5">
              {zoneBatches.map((batch, index) => {
                const latest = index === zoneBatches.length - 1;
                return (
                  <div className={`rounded-lg border px-2.5 py-2 ${BATCH_STYLES[index % BATCH_STYLES.length]} ${latest ? 'ring-1 ring-white/25' : 'opacity-80'}`} key={batch.id}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-[11px] font-semibold" title={batch.fileName}>{batch.fileName}</p>
                        <p className="mt-0.5 inline-flex items-center gap-1 text-[10px] opacity-80"><Clock3 size={10} /> {new Date(batch.importedAt).toLocaleString('es-ES')}</p>
                      </div>
                      {latest && <span className="shrink-0 rounded-full border border-current/30 px-1.5 py-0.5 text-[9px] font-bold uppercase">Última</span>}
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {batch.blocks.map((block) => {
                        const key = `${block.turno}::${block.colectivo}`;
                        const replaced = batch.replacedBlocks.includes(key);
                        return <span className="rounded bg-black/10 px-1.5 py-0.5 text-[9px]" key={key}>{blockLabel(key)}{replaced ? ' · sustituido' : ''}</span>;
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </aside>
  );
}
