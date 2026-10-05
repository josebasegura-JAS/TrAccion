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
  | 'balanceAnual'
  | 'tiposAusencia';

type SubviewItem = { id: TicketRestauranteSubview; label: string };

const OPERATIVA: SubviewItem[] = [
  { id: 'computoMensual', label: 'Pedido mensual' },
  { id: 'ausencias', label: 'Ausencias' },
  { id: 'manutenciones', label: 'Manutenciones' },
  { id: 'deudaManual', label: 'Deudas' },
];

const DATOS_BASE: SubviewItem[] = [
  { id: 'personas', label: 'Personas' },
  { id: 'calendarios', label: 'Calendarios' },
  { id: 'tiposAusencia', label: 'Tipos ausencia' },
];

const CONSULTA: SubviewItem[] = [
  { id: 'computoCotizacion', label: 'Cotización' },
  { id: 'balanceAnual', label: 'Balance anual' },
];

function SubviewGroup({
  activeSubview,
  label,
  items,
  onChange,
}: {
  activeSubview: TicketRestauranteSubview;
  label: string;
  items: SubviewItem[];
  onChange: (subview: TicketRestauranteSubview | null) => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <span className="hidden whitespace-nowrap px-1 text-[10px] font-bold uppercase tracking-wide text-metro-muted 2xl:inline">
        {label}
      </span>
      <div className="flex flex-nowrap gap-1">
        {items.map((subview) => (
          <SubviewButton
            active={activeSubview === subview.id}
            key={subview.id}
            label={subview.label}
            onClick={() => onChange(subview.id)}
          />
        ))}
      </div>
    </div>
  );
}

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
    <nav
      aria-label="Secciones de Ticket Restaurante"
      className="mb-3 flex min-w-0 items-center gap-2 rounded-xl border border-metro-border bg-metro-panel/70 p-2"
    >
      <div className="flex shrink-0 items-center border-r border-metro-border/70 pr-2">
        <SubviewButton active={false} label="← Inicio" onClick={() => onChange(null)} />
      </div>

      <div
        className="min-w-0 flex-1 overflow-x-auto overscroll-x-contain"
        tabIndex={0}
        aria-label="Navegación de secciones"
      >
        <div className="flex min-w-max flex-nowrap items-center gap-x-3 pr-1">
          <SubviewGroup
            activeSubview={activeSubview}
            items={OPERATIVA}
            label="Operativa"
            onChange={onChange}
          />
          <SubviewGroup
            activeSubview={activeSubview}
            items={DATOS_BASE}
            label="Datos base"
            onChange={onChange}
          />
          <SubviewGroup
            activeSubview={activeSubview}
            items={CONSULTA}
            label="Consulta"
            onChange={onChange}
          />
        </div>
      </div>

      <div className="flex shrink-0 items-center border-l border-metro-border/70 pl-2">
        <ActionButton
          icon={Euro}
          iconOnly={false}
          onClick={onOpenPrice}
          size="sm"
          variant="secondary"
        >
          <span className="hidden xl:inline">Precio ticket</span>
          <span className="xl:hidden">Precio</span>
        </ActionButton>
      </div>
    </nav>
  );
}
