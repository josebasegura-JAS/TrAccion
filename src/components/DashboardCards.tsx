import { CalendarCheck, FileSpreadsheet, ShieldCheck, UsersRound } from 'lucide-react';

const cards = [
  { label: 'Personas en plantilla', value: '4', icon: UsersRound, tone: 'text-metro-red' },
  { label: 'Registros listos', value: '28', icon: FileSpreadsheet, tone: 'text-emerald-600' },
  { label: 'Teletrabajo preparado', value: '100%', icon: ShieldCheck, tone: 'text-blue-600' },
  { label: 'Próxima revisión', value: 'Junio', icon: CalendarCheck, tone: 'text-amber-600' },
];

export function DashboardCards() {
  return (
    <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <article className="rounded-2xl border border-metro-border bg-white p-4 shadow-card" key={card.label}>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-metro-muted">{card.label}</p>
                <p className="mt-2 text-2xl font-bold text-metro-text">{card.value}</p>
              </div>
              <div className={`rounded-xl bg-metro-surface p-2 ${card.tone}`}>
                <Icon size={21} />
              </div>
            </div>
          </article>
        );
      })}
    </section>
  );
}
