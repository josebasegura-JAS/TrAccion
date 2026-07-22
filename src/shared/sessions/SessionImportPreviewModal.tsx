import type { SessionImportPreview } from './sessionImport';
import { ImportMetric } from './SessionManagementPageCards';
import type { SessionModuleConfig } from './session';
import { CompactTable, CompactTableBody, CompactTableHead } from '../table/CompactTable';

export function SessionImportPreviewModal({
  config,
  ignoredLineCount,
  onCancel,
  onConfirm,
  relevantImportSessions,
  relevantImportTaskCount,
}: {
  config: SessionModuleConfig;
  ignoredLineCount: number;
  onCancel: () => void;
  onConfirm: () => void;
  relevantImportSessions: SessionImportPreview['sessions'];
  relevantImportTaskCount: number;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
      <div className="max-h-[86vh] w-full max-w-4xl overflow-auto rounded-2xl border border-metro-border bg-metro-surface p-4 shadow-2xl">
        <h3 className="text-lg font-bold text-metro-text">
          Previsualización de importación · {config.title}
        </h3>
        <p className="mt-1 text-sm text-metro-muted">
          Se importarán solo las sesiones compatibles con este módulo. Las sesiones con el mismo
          código y fecha se omiten.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <ImportMetric label="Sesiones detectadas" value={relevantImportSessions.length} />
          <ImportMetric label="Puntos detectados" value={relevantImportTaskCount} />
          <ImportMetric label="Líneas ignoradas" value={ignoredLineCount} />
        </div>
        <div className="mt-3 max-h-[380px] overflow-auto rounded-xl border border-metro-border">
          <CompactTable>
            <CompactTableHead>
              <tr>
                <th className="w-[130px] px-3 py-2">Fecha</th>
                <th className="w-[160px] px-3 py-2">Código</th>
                <th className="px-3 py-2">Título</th>
                <th className="w-[90px] px-3 py-2 text-right">Puntos</th>
              </tr>
            </CompactTableHead>
            <CompactTableBody>
              {relevantImportSessions.map((session) => (
                <tr key={session.externalKey}>
                  <td className="px-3 py-2 text-metro-muted">{session.draft.date || '—'}</td>
                  <td className="px-3 py-2 font-semibold text-metro-text">{session.draft.code}</td>
                  <td className="truncate px-3 py-2 text-metro-muted" title={session.draft.title}>
                    {session.draft.title}
                  </td>
                  <td className="px-3 py-2 text-right font-bold text-metro-text">
                    {session.taskExternalKeys.length}
                  </td>
                </tr>
              ))}
            </CompactTableBody>
          </CompactTable>
        </div>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button
            className="rounded-xl border border-metro-border px-3 py-2 text-sm font-semibold text-metro-muted hover:border-metro-red hover:text-metro-text"
            onClick={onCancel}
            type="button"
          >
            Cancelar
          </button>
          <button
            className="rounded-xl bg-metro-red px-3 py-2 text-sm font-semibold text-white hover:bg-metro-dark disabled:cursor-not-allowed disabled:opacity-60"
            disabled={relevantImportSessions.length === 0}
            onClick={onConfirm}
            type="button"
          >
            Confirmar importación
          </button>
        </div>
      </div>
    </div>
  );
}
