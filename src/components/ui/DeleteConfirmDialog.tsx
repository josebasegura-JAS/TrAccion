export function DeleteConfirmDialog({
  label,
  onCancel,
  onConfirm,
}: {
  label: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="rounded-xl border border-red-400/30 bg-red-950/20 p-4 shadow-lg shadow-red-950/20">
      <p className="text-sm font-semibold text-red-200">¿Eliminar {label}?</p>
      <p className="mt-1 text-xs text-red-300/70">Esta acción no se puede deshacer.</p>
      <div className="mt-3 flex gap-2">
        <button
          className="rounded-lg bg-red-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-600"
          onClick={onConfirm}
          type="button"
        >
          Eliminar
        </button>
        <button
          className="rounded-lg border border-metro-border px-3 py-1.5 text-xs font-semibold text-metro-muted hover:text-metro-text"
          onClick={onCancel}
          type="button"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
