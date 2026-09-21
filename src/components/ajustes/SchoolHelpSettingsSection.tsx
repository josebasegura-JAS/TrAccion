import { FolderOpen, GraduationCap } from 'lucide-react';
import { useState } from 'react';
import { useConfiguracionStore } from '../../features/configuracion/store/useConfiguracionStore';
import { Notice } from '../ui/Notice';

export function SchoolHelpSettingsSection() {
  const rutaAyudaEscolar = useConfiguracionStore((state) => state.rutaAyudaEscolar);
  const setRutaAyudaEscolar = useConfiguracionStore((state) => state.setRutaAyudaEscolar);
  const [status, setStatus] = useState('');

  const selectFolder = async () => {
    const select = window.traccion?.selectSchoolHelpFolder;
    if (!select) {
      setStatus('El selector de carpeta no está disponible en esta instalación.');
      return;
    }
    const selected = await select();
    if (!selected) return;
    const result = await setRutaAyudaEscolar(selected);
    setStatus(result.ok ? 'Carpeta de Ayuda escolar guardada.' : result.message);
  };

  return (
    <section className="scroll-mt-4 rounded-[1.3rem] border border-metro-border/80 bg-metro-panel/45 p-4" id="ayuda-escolar-ajustes">
      <div className="mb-4 flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-sky-400/20 bg-sky-500/10 text-sky-200">
          <GraduationCap size={18} />
        </div>
        <div>
          <h3 className="text-base font-extrabold text-metro-text">Ayuda escolar</h3>
          <p className="mt-1 text-sm text-metro-muted">
            Carpeta donde se archivarán los adjuntos recibidos por Outlook.
          </p>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
        <input
          className="min-w-0 rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-sm font-medium text-metro-text outline-none focus:border-sky-400"
          onChange={(event) => { void setRutaAyudaEscolar(event.target.value); }}
          placeholder="G:\\...\\Ayuda escolar"
          type="text"
          value={rutaAyudaEscolar}
        />
        <button
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-sky-400/25 bg-sky-500/10 px-3 py-2 text-xs font-bold text-sky-100 hover:bg-sky-500/15"
          onClick={() => void selectFolder()}
          type="button"
        >
          <FolderOpen size={14} />
          Seleccionar carpeta
        </button>
      </div>

      <p className="mt-2 text-[11px] text-metro-muted">
        TrAccion no sobrescribe documentos existentes: numera automáticamente los archivos de cada persona.
      </p>
      {status ? <div className="mt-2"><Notice tone={status.includes('guardada') ? 'success' : 'warning'}>{status}</Notice></div> : null}
    </section>
  );
}
