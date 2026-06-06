import { FileSpreadsheet, Filter, PenLine, UsersRound } from 'lucide-react';

const cards = [
  { label: 'Personas en plantilla', value: '4', icon: UsersRound, tone: 'text-metro-red' },
  { label: 'Columnas importadas', value: '14', icon: FileSpreadsheet, tone: 'text-metro-success' },
  { label: 'Filtros básicos', value: '2', icon: Filter, tone: 'text-metro-info' },
  { label: 'Alta y edición', value: 'Activas', icon: PenLine, tone: 'text-metro-warning' },
];

export function DashboardCards() {
  return (
    <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <article
            className="rounded-2xl border border-metro-border bg-metro-surface/95 p-4 shadow-card transition hover:border-slate-400/30 hover:bg-metro-raised"
            key={card.label}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-metro-muted">
                  {card.label}
                </p>
                <p className="mt-2 text-2xl font-bold text-metro-text">{card.value}</p>
              </div>
              <div className={`rounded-xl bg-metro-panel p-2 ring-1 ring-white/5 ${card.tone}`}>
                <Icon size={21} />
              </div>
            </div>
          </article>
        );
      })}
    </section>
  );
}
