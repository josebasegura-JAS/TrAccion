import { AlertTriangle } from 'lucide-react';
import { ModalCloseButton } from '../../../components/ui/ModalCloseButton';
import { ModalShell } from '../../../components/ui/ModalShell';
import type { PendingHistoricoImport } from '../store/useTeletrabajoStore';

export function TeletrabajoHistoricoImportModal({
  onCancel,
  onConfirm,
  pendingHistoricoImport,
}: {
  onCancel: () => void;
  onConfirm: () => void;
  pendingHistoricoImport: PendingHistoricoImport;
}) {
  return (
    <ModalShell
      labelledBy="teletrabajo-historico-import-modal-title"
      maxWidthClassName="max-w-2xl"
      onClose={onCancel}
    >
      <header className="flex items-start justify-between gap-3 border-b border-metro-border p-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-metro-red">
            Importar histórico
          </p>
          <h3
            className="text-xl font-bold text-metro-text"
            id="teletrabajo-historico-import-modal-title"
          >
            Confirmar importación del periodo {pendingHistoricoImport.periodo}
          </h3>
          <p className="mt-1 text-sm text-metro-muted">
            Revisa el resumen antes de aplicar los cambios a la base compartida.
          </p>
        </div>
        <ModalCloseButton label="Cancelar importación de histórico" onClick={onCancel} />
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <ul className="grid gap-2 text-sm text-metro-text sm:grid-cols-2">
          <li className="rounded-lg border border-metro-border bg-metro-panel px-3 py-2">
            <span className="font-semibold text-emerald-300">
              {pendingHistoricoImport.summary.imported}
            </span>{' '}
            registros nuevos
          </li>
          <li className="rounded-lg border border-metro-border bg-metro-panel px-3 py-2">
            <span className="font-semibold text-amber-300">
              {pendingHistoricoImport.summary.updated}
            </span>{' '}
            registros existentes actualizados
          </li>
          <li className="rounded-lg border border-metro-border bg-metro-panel px-3 py-2">
            <span className="font-semibold text-metro-muted">
              {pendingHistoricoImport.summary.unchanged}
            </span>{' '}
            sin cambios
          </li>
          <li className="rounded-lg border border-metro-border bg-metro-panel px-3 py-2">
            <span className="font-semibold text-red-300">
              {pendingHistoricoImport.summary.denegados}
            </span>{' '}
            denegados
          </li>
          <li className="rounded-lg border border-metro-border bg-metro-panel px-3 py-2 sm:col-span-2">
            <span className="font-semibold text-metro-muted">
              {pendingHistoricoImport.summary.ignored}
            </span>{' '}
            filas ignoradas (sin empleado o auxiliares)
          </li>
        </ul>
        {pendingHistoricoImport.summary.updated > 0 && (
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-sm font-semibold text-amber-100">
            <AlertTriangle size={18} className="mt-0.5 shrink-0" />
            <span>
              {pendingHistoricoImport.summary.updated} solicitud
              {pendingHistoricoImport.summary.updated === 1 ? '' : 'es'} ya existente
              {pendingHistoricoImport.summary.updated === 1 ? '' : 's'} se actualizará
              {pendingHistoricoImport.summary.updated === 1 ? '' : 'n'} con los datos del fichero
              (estado, días, observaciones...). Las validaciones de seguridad, prevención y jefatura
              ya realizadas en la app se conservan.
            </span>
          </div>
        )}
      </div>
      <footer className="flex flex-wrap justify-end gap-2 border-t border-metro-border p-4">
        <button
          className="rounded-xl border border-metro-border bg-metro-panel px-3 py-2 text-sm font-semibold text-metro-text hover:border-metro-red"
          onClick={onCancel}
          type="button"
        >
          Cancelar
        </button>
        <button
          className="rounded-xl bg-metro-red px-3 py-2 text-sm font-semibold text-white hover:bg-metro-dark"
          onClick={onConfirm}
          type="button"
        >
          Confirmar e importar
        </button>
      </footer>
    </ModalShell>
  );
}
