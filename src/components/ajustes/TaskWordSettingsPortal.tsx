import { FileText, FolderOpen, RefreshCw, RotateCcw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

interface TaskWordBridge {
  getDirectory: () => Promise<string | null>;
  selectDirectory: () => Promise<{ ok: boolean; path: string | null; message: string }>;
  clearDirectory: () => Promise<{ ok: boolean; path: null; message: string }>;
  refresh: () => Promise<{
    ok: boolean;
    skipped?: boolean;
    path: string | null;
    count: number;
    message: string;
  }>;
}

function getBridge(): TaskWordBridge | null {
  return (window as unknown as { traccionTaskWord?: TaskWordBridge }).traccionTaskWord ?? null;
}

function Card() {
  const [directoryPath, setDirectoryPath] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const bridge = getBridge();
    if (!bridge) {
      setStatus('La configuración del Word automático solo está disponible en escritorio.');
      return;
    }
    void bridge.getDirectory().then(setDirectoryPath).catch(() => {
      setStatus('No se ha podido leer la carpeta configurada.');
    });
  }, []);

  const selectDirectory = async () => {
    const bridge = getBridge();
    if (!bridge) return;
    setBusy(true);
    setStatus('');
    try {
      const result = await bridge.selectDirectory();
      setDirectoryPath(result.path);
      setStatus(result.message);
    } finally {
      setBusy(false);
    }
  };

  const clearDirectory = async () => {
    const bridge = getBridge();
    if (!bridge) return;
    setBusy(true);
    try {
      const result = await bridge.clearDirectory();
      setDirectoryPath(null);
      setStatus(result.message);
    } finally {
      setBusy(false);
    }
  };

  const refreshNow = async () => {
    const bridge = getBridge();
    if (!bridge) return;
    setBusy(true);
    setStatus('Generando Tareas abiertas.doc…');
    try {
      const result = await bridge.refresh();
      setStatus(result.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-4 rounded-xl border border-sky-400/20 bg-metro-surface p-3">
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-sky-400/20 bg-sky-500/10 text-sky-200">
          <FileText size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-metro-muted">Word automático de tareas abiertas</p>
          <p className="mt-1 text-xs leading-relaxed text-metro-muted">
            Después de cada guardado correcto de una tarea, TrAccion actualiza automáticamente
            <strong className="text-metro-text"> Tareas abiertas.doc</strong>. El documento contiene
            únicamente tareas abiertas y mantiene el formato tabular del listado.
          </p>
        </div>
      </div>

      {directoryPath ? (
        <p className="mt-3 break-all rounded-lg border border-metro-border bg-metro-panel px-3 py-2 text-xs font-medium text-metro-text">
          {directoryPath}
        </p>
      ) : (
        <p className="mt-3 text-xs text-metro-muted">Sin carpeta configurada. El Word automático está desactivado.</p>
      )}

      {status && (
        <p className={`mt-2 text-xs font-semibold ${/no se ha podido|error/i.test(status) ? 'text-amber-300' : 'text-metro-success'}`}>
          {status}
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          className="inline-flex items-center gap-2 rounded-lg bg-metro-red px-3 py-2 text-xs font-semibold text-white hover:bg-metro-dark disabled:opacity-50"
          disabled={busy}
          onClick={() => void selectDirectory()}
          type="button"
        >
          <FolderOpen size={14} />
          {directoryPath ? 'Cambiar carpeta' : 'Seleccionar carpeta'}
        </button>

        {directoryPath && (
          <>
            <button
              className="inline-flex items-center gap-2 rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-xs font-semibold text-metro-text hover:border-metro-red disabled:opacity-50"
              disabled={busy}
              onClick={() => void refreshNow()}
              type="button"
            >
              <RefreshCw size={14} />
              Generar ahora
            </button>
            <button
              className="inline-flex items-center gap-2 rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-xs font-semibold text-metro-text hover:border-metro-red disabled:opacity-50"
              disabled={busy}
              onClick={() => void clearDirectory()}
              type="button"
            >
              <RotateCcw size={14} />
              Quitar carpeta
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export function TaskWordSettingsPortal() {
  const [target, setTarget] = useState<HTMLElement | null>(() =>
    document.getElementById('base-de-datos'),
  );

  useEffect(() => {
    const findTarget = () => {
      setTarget(document.getElementById('base-de-datos'));
    };

    findTarget();
    const observer = new MutationObserver(findTarget);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return target ? createPortal(<Card />, target) : null;
}
