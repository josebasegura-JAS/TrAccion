import { Euro } from 'lucide-react';
import { ActionButton } from '../../../components/ui/ActionButton';
import { SubviewButton } from './TicketRestauranteCalendarPanels';

export type TicketRestauranteSubview =
  | 'calendarios'
  | 'personas'
  | 'computoMensual'
  | 'computoCotizacion'
  | 'ausencias'
  | 'manutenciones'
  | 'deudaManual'
  | 'balanceAnual';

const SUBVIEWS: Array<{ id: TicketRestauranteSubview; label: string }> = [
  { id: 'calendarios', label: 'Calendarios' },
  { id: 'personas', label: 'Personas' },
  { id: 'computoMensual', label: 'Cómputo mensual' },
  { id: 'computoCotizacion', label: 'Cómputo cotización' },
  { id: 'ausencias', label: 'Ausencias' },
  { id: 'manutenciones', label: 'Manutenciones' },
  { id: 'deudaManual', label: 'Deudas' },
  { id: 'balanceAnual', label: 'Balance anual' },
];

export function TicketRestauranteSubviewNav({
  activeSubview,
  onChange,
  onOpenPrice,
}: {
  activeSubview: TicketRestauranteSubview;
  onChange: (subview: TicketRestauranteSubview | null) => void;
  onOpenPrice: () => void;
}) {
  return (
    <div className="mb-3 flex flex-col gap-2 rounded-xl border border-metro-border bg-metro-panel p-2 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex flex-wrap gap-2">
        <SubviewButton active={false} label="← Inicio" onClick={() => onChange(null)} />
        {SUBVIEWS.map((subview) => (
          <SubviewButton
            active={activeSubview === subview.id}
            key={subview.id}
            label={subview.label}
            onClick={() => onChange(subview.id)}
          />
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2 lg:justify-end">
        <ActionButton icon={Euro} iconOnly={false} onClick={onOpenPrice} size="sm" variant="secondary">
          Precio ticket
        </ActionButton>
      </div>
    </div>
  );
}
