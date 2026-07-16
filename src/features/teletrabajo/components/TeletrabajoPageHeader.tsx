import type { RefObject } from 'react';
import { BriefcaseBusiness, Download, Plus, Upload, Users } from 'lucide-react';
import { PageHeader } from '../../../components/ui/PageHeader';
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
    <PageHeader
      className="mb-3"
      helpSections={TELETRABAJO_HELP_SECTIONS}
      helpSubtitle="Guía rápida de solicitudes, validaciones, importación e histórico."
      title="Teletrabajo"
      actions={
        <>
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
            icon={<Upload size={14} />}
            size="sm"
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
            className="inline-flex items-center gap-1.5 rounded-lg border border-metro-border bg-metro-surface px-2.5 py-1.5 text-xs font-semibold text-metro-text hover:border-metro-red"
            onClick={onOpenPuestosModal}
            type="button"
          >
            <BriefcaseBusiness size={14} /> Puestos Teletrabajo
          </button>
          <button
            className="inline-flex items-center gap-1.5 rounded-lg border border-metro-border bg-metro-surface px-2.5 py-1.5 text-xs font-semibold text-metro-text hover:border-metro-red"
            onClick={onOpenGruposCoberturaModal}
            type="button"
          >
            <Users size={14} /> Grupos Cobertura
          </button>
          <button
            className="inline-flex items-center gap-1.5 rounded-lg border border-metro-border bg-metro-surface px-2.5 py-1.5 text-xs font-semibold text-metro-text hover:border-metro-red"
            onClick={onOpenPeriodoModal}
            type="button"
          >
            <Plus size={14} /> Nuevo periodo
          </button>
          <button
            className="inline-flex items-center gap-1.5 rounded-lg bg-metro-red px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-metro-dark"
            onClick={onCreateSolicitud}
            type="button"
          >
            <Plus size={14} /> Nueva solicitud
          </button>
        </>
      }
    />
  );
}
