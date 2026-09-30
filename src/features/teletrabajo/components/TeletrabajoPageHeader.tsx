import type { RefObject } from 'react';
import { Download, Plus, Upload } from 'lucide-react';
import { PageHeader } from '../../../components/ui/PageHeader';
import { DropdownMenu } from '../../../components/ui/DropdownMenu';
import { ActionButton } from '../../../components/ui/ActionButton';
import { TELETRABAJO_HELP_SECTIONS } from './teletrabajoHelpSections';

interface TeletrabajoPageHeaderProps {
  encuestaFileInputRef: RefObject<HTMLInputElement>;
  historicoFileInputRef: RefObject<HTMLInputElement>;
  onEncuestaFileSelected: (file: File) => void;
  onHistoricoFileSelected: (file: File) => void;
  onGenerateSampleEncuestaExcel: () => void;
  onGenerateSampleHistoricoExcel: () => void;
  onCreateSolicitud: () => void;
}

export function TeletrabajoPageHeader({
  encuestaFileInputRef,
  historicoFileInputRef,
  onEncuestaFileSelected,
  onHistoricoFileSelected,
  onGenerateSampleEncuestaExcel,
  onGenerateSampleHistoricoExcel,
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
          <ActionButton icon={Plus} iconOnly={false} onClick={onCreateSolicitud} size="sm" variant="add">Nueva solicitud</ActionButton>
        </>
      }
    />
  );
}
