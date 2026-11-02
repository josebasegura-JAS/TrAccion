import { useState } from 'react';
import { buildLotteryHistoricalSummaries, type LotteryHistoricalSummary } from '../domain/loteriaHistory';

export function LoteriaHistoricalPanel() {
  const [rows, setRows] = useState<LotteryHistoricalSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [year, setYear] = useState<number | null>(null);
  const consult = async () => {
    const loader = window.traccion?.loadLoteriaRecords;
    if (!loader) { setError('El histórico compartido requiere TrAcción de escritorio con SQLite.'); return; }
    setLoading(true);
    setError('');
    try {
      const snapshot = await loader();
      if (!snapshot.status.ready || snapshot.status.phase !== 'active') throw new Error('SQLite no está disponible.');
      const next = buildLotteryHistoricalSummaries(snapshot.campaigns, snapshot.requests, new Date().getFullYear());
      setRows(next);
      setYear(next[0]?.year ?? null);
      setLoaded(true);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'No se ha podido leer el histórico.');
    } finally { setLoading(false); }
  };
  const chosen = rows.find((row) => row.year === year);
  return (
    <section className="rounded-xl border border-metro-border bg-metro-panel p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><h3 className="text-sm font-extrabold text-metro-text">Histórico de campañas</h3><p className="text-xs text-metro-muted">Consulta de ejercicios anteriores registrados en SQLite, sin posibilidad de editar ni sobrescribir la campaña vigente.</p></div>
        <button type="button" className="rounded-lg border border-metro-border px-3 py-2 text-xs font-bold" onClick={() => void consult()} disabled={loading}>{loading ? 'Consultando…' : 'Consultar histórico'}</button>
      </div>
      {error ? <p role="alert" className="mt-2 text-xs text-red-300">{error}</p> : null}
      {loaded && rows.length === 0 ? <p className="mt-2 text-xs text-metro-muted">No hay campañas anteriores registradas en la base compartida.</p> : null}
      {rows.length > 0 && <div className="mt-3 space-y-3">
        <label className="flex items-center gap-2 text-xs font-semibold">Ejercicio
          <select className="rounded-md border border-metro-border bg-metro-surface p-2" value={year ?? ''} onChange={(event) => setYear(Number(event.target.value))}>
            {rows.map((row) => <option key={row.year} value={row.year}>{row.year}</option>)}
          </select>
        </label>
        {chosen && <div className="grid gap-2 text-xs sm:grid-cols-3">
          <p>Números: {chosen.numero1} · {chosen.numero2}</p>
          <p>Participantes: {chosen.participants}</p>
          <p>Décimos solicitados: {chosen.requested}</p>
          <p>Cobrado: {chosen.paid.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</p>
          <p>Pendiente: {chosen.pending.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</p>
          <p>Estado: {chosen.closed ? 'Cerrada' : 'Sin cierre registrado'}</p>
        </div>}
      </div>}
    </section>
  );
}
