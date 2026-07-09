import type { RefObject } from 'react';
import { BriefcaseBusiness, Download, Plus, Upload, Users } from 'lucide-react';
import { ModuleHelpButton } from '../../../components/ModuleHelp';
import { DropdownMenu } from '../../../components/ui/DropdownMenu';
import { TELETRABAJO_HELP_SECTIONS } from './teletrabajoHelpSections';

interface TeletrabajoPageHeaderProps {
  encuestaFileInputRef: RefObject<HTMLInputElement>;
  historicoFileInputRef: RefObject<HTMLInputElement>;
  onEncuestaFileSelected: (file: File) => void;
  onHistoricoFileSelected: (file: File) => void;
  onGenerateSampleEncuestaExcel: () => void;
  onGenerateSampleHistoricoExcel: () => void;
  onOpenPuestosModal: () => void;
  onOpenGruposCoberturaModal: () => void;
  onOpenPeriodoModal: () => void;
  onCreateSolicitud: () => void;
}

export function TeletrabajoPageHeader({
  encuestaFileInputRef,
  historicoFileInputRef,
  onEncuestaFileSelected,
  onHistoricoFileSelected,
  onGenerateSampleEncuestaExcel,
  onGenerateSampleHistoricoExcel,
  onOpenPuestosModal,
  onOpenGruposCoberturaModal,
  onOpenPeriodoModal,
  onCreateSolicitud,
}: TeletrabajoPageHeaderProps) {
  return (
    <div className="mb-3 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-metro-red">Módulo</p>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-xl font-bold text-metro-text">Teletrabajo</h2>
          <ModuleHelpButton
            title="Teletrabajo"
            subtitle="Guía rápida de solicitudes, validaciones, importación e histórico."
            sections={TELETRABAJO_HELP_SECTIONS}
          />
        </div>
        <p className="mt-0.5 text-sm text-metro-muted">
          Listado de solicitudes con alta manual, edición, borrado lógico, búsqueda y filtros.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          accept=".xlsx,.csv,.tsv"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              onEncuestaFileSelected(file);
            }
            event.target.value = '';
          }}
          ref={encuestaFileInputRef}
          type="file"
        />
        <input
          accept=".xlsx,.csv,.tsv"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              onHistoricoFileSelected(file);
            }
            event.target.value = '';
          }}
          ref={historicoFileInputRef}
          type="file"
        />
        <DropdownMenu
          icon={<Upload size={16} />}
          items={[
            {
              key: 'importar-encuesta',
              label: 'Importar encuesta',
              icon: <Upload size={14} />,
              onClick: () => encuestaFileInputRef.current?.click(),
            },
            {
              key: 'muestra-encuesta',
              label: 'Generar muestra de encuesta',
              icon: <Download size={14} />,
              onClick: onGenerateSampleEncuestaExcel,
            },
            {
              key: 'importar-historico',
              label: 'Importar histórico',
              icon: <Upload size={14} />,
              onClick: () => historicoFileInputRef.current?.click(),
            },
            {
              key: 'muestra-historico',
              label: 'Generar muestra de histórico',
              icon: <Download size={14} />,
              onClick: onGenerateSampleHistoricoExcel,
            },
          ]}
          label="Importar"
        />
        <button
          className="inline-flex items-center gap-2 rounded-xl border border-metro-border bg-metro-surface px-3 py-2 text-sm font-semibold text-metro-text hover:border-metro-red"
          onClick={onOpenPuestosModal}
          type="button"
        >
          <BriefcaseBusiness size={16} /> Puestos Teletrabajo
        </button>
        <button
          className="inline-flex items-center gap-2 rounded-xl border border-metro-border bg-metro-surface px-3 py-2 text-sm font-semibold text-metro-text hover:border-metro-red"
          onClick={onOpenGruposCoberturaModal}
          type="button"
        >
          <Users size={16} /> Grupos Cobertura
        </button>
        <button
          className="inline-flex items-center gap-2 rounded-xl border border-metro-border bg-metro-surface px-3 py-2 text-sm font-semibold text-metro-text hover:border-metro-red"
          onClick={onOpenPeriodoModal}
          type="button"
        >
          <Plus size={16} /> Nuevo periodo
        </button>
        <button
          className="inline-flex items-center gap-2 rounded-xl bg-metro-red px-3 py-2 text-sm font-semibold text-white hover:bg-metro-dark"
          onClick={onCreateSolicitud}
          type="button"
        >
          <Plus size={16} /> Nueva solicitud
        </button>
      </div>
    </div>
  );
}
