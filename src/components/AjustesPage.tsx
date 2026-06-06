import { FolderOpen } from 'lucide-react';
import { useEffect, useState } from 'react';
import { isDocxPath } from '../features/configuracion/domain/teletrabajoTemplate';
import { useConfiguracionStore } from '../features/configuracion/store/useConfiguracionStore';

export function AjustesPage() {
  const rutaPlantillaTeletrabajo = useConfiguracionStore((state) => state.rutaPlantillaTeletrabajo);
  const load = useConfiguracionStore((state) => state.load);
  const setRutaPlantillaTeletrabajo = useConfiguracionStore(
    (state) => state.setRutaPlantillaTeletrabajo,
  );
  const [status, setStatus] = useState('');

  useEffect(() => {
    load();
  }, [load]);

  const handleSelectTemplate = async () => {
    setStatus('');

    if (!window.traccion?.selectTeletrabajoTemplate) {
      setStatus('El selector de plantillas solo está disponible en la aplicación de escritorio.');
      return;
    }

    const selectedPath = await window.traccion.selectTeletrabajoTemplate();
    if (!selectedPath) {
      return;
    }

    if (!isDocxPath(selectedPath)) {
      setStatus('La ruta seleccionada debe apuntar a un archivo DOCX.');
      return;
    }

    setRutaPlantillaTeletrabajo(selectedPath);
    setStatus('Ruta de plantilla guardada.');
  };

  return (
    <section className="rounded-3xl border border-metro-border bg-metro-surface p-5 shadow-card">
      <div className="mb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-metro-red">Ajustes</p>
        <h2 className="mt-1 text-2xl font-bold text-metro-text">Configuración</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-metro-muted">
          Configura rutas externas necesarias para generar documentos sin almacenar plantillas
          dentro de TrAccion.
        </p>
      </div>

      <div className="rounded-2xl border border-metro-border bg-metro-panel p-4">
        <div className="mb-4">
          <h3 className="text-base font-bold text-metro-text">Plantilla Teletrabajo</h3>
          <p className="mt-1 text-sm text-metro-muted">
            Guarda únicamente la ruta local, UNC o de unidad mapeada del DOCX externo.
          </p>
        </div>

        <label className="block text-xs font-semibold text-metro-muted">
          Ruta plantilla DOCX
          <input
            className="mt-1 w-full rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-sm font-medium text-metro-text outline-none focus:border-metro-red"
            onChange={(event) => setRutaPlantillaTeletrabajo(event.target.value)}
            placeholder="C:\\RRLL\\Plantillas\\Acuerdo Teletrabajo.docx"
            type="text"
            value={rutaPlantillaTeletrabajo}
          />
        </label>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            className="inline-flex items-center gap-2 rounded-lg bg-metro-red px-3 py-2 text-sm font-semibold text-white hover:bg-metro-dark"
            onClick={handleSelectTemplate}
            type="button"
          >
            <FolderOpen size={16} />
            Seleccionar plantilla
          </button>
          {status && <p className="text-xs font-semibold text-metro-muted">{status}</p>}
        </div>
      </div>
    </section>
  );
}
