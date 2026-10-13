import { ChevronDown, ChevronRight } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import type { CoordinationMeeting } from '../domain/coordinacion';

const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
// Mantener los desplegables al entrar en una reunión y regresar al listado.
const expandedByScope = new Map<string, Record<string, boolean>>();

function initialExpanded(meetings: CoordinationMeeting[]): Record<string, boolean> {
  const now = new Date();
  const current = now.getFullYear() * 12 + now.getMonth();
  const result: Record<string, boolean> = {};
  for (const meeting of meetings) {
    const year = Number(meeting.date.slice(0, 4));
    const month = Number(meeting.date.slice(5, 7)) - 1;
    if (year * 12 + month >= current - 1 && year * 12 + month <= current) {
      result[String(year)] = true;
      result[`${year}-${String(month + 1).padStart(2, '0')}`] = true;
    }
  }
  return result;
}

export function CoordinationMeetingArchive({
  meetings, scope, renderMeeting,
}: {
  meetings: CoordinationMeeting[];
  scope: string;
  renderMeeting: (meeting: CoordinationMeeting) => ReactNode;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>(
    () => expandedByScope.get(scope) ?? initialExpanded(meetings),
  );
  const [onlyOpen, setOnlyOpen] = useState(false);
  const toggle = (key: string) => {
    setExpanded((current) => {
      const next = { ...current, [key]: !current[key] };
      expandedByScope.set(scope, next);
      return next;
    });
  };
  const filtered = onlyOpen ? meetings.filter((meeting) => meeting.status === 'open') : meetings;
  const years = new Map<string, Map<string, CoordinationMeeting[]>>();
  for (const meeting of filtered) {
    const year = meeting.date.slice(0, 4);
    const month = meeting.date.slice(0, 7);
    if (!years.has(year)) years.set(year, new Map());
    const months = years.get(year)!;
    if (!months.has(month)) months.set(month, []);
    months.get(month)!.push(meeting);
  }
  const sortedYears = [...years.entries()].sort(([a], [b]) => b.localeCompare(a));
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  return <div className="space-y-2">
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-metro-muted">{filtered.length} reuniones · {onlyOpen ? 'solo abiertas' : 'histórico completo'}</span>
      <label className="flex cursor-pointer items-center gap-2 text-xs text-metro-muted">
        <input type="checkbox" checked={onlyOpen} onChange={(event) => setOnlyOpen(event.target.checked)} className="accent-red-600"/>
        Solo abiertas
      </label>
    </div>
    {sortedYears.map(([year, months]) => {
      const yearCount = [...months.values()].reduce((count, items) => count + items.length, 0);
      const yearOpen = onlyOpen || (expanded[year] ?? false);
      return <div key={year} className="overflow-hidden rounded-lg border border-metro-border">
        <button type="button" aria-expanded={yearOpen} onClick={() => toggle(year)} className="flex w-full items-center gap-2 bg-metro-panel px-3 py-2 text-left text-sm font-bold text-metro-text hover:text-metro-red">
          {yearOpen ? <ChevronDown size={15}/> : <ChevronRight size={15}/>}
          <span>{year}</span><span className="ml-auto text-xs font-normal text-metro-muted">{yearCount} reuniones</span>
        </button>
        {yearOpen && [...months.entries()].sort(([a], [b]) => b.localeCompare(a)).map(([month, items]) => {
          const monthOpen = onlyOpen || (expanded[month] ?? false);
          return <div key={month} className="border-t border-metro-border">
            <button type="button" aria-expanded={monthOpen} onClick={() => toggle(month)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-metro-text hover:bg-metro-panel">
              {monthOpen ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}
              <span>{monthNames[Number(month.slice(5)) - 1]} {year}</span>
              {month === currentMonth && <span className="rounded bg-metro-panel px-1.5 py-0.5 text-[10px] text-metro-red">Mes actual</span>}
              <span className="ml-auto font-normal text-metro-muted">{items.length} reuniones</span>
            </button>
            {monthOpen && <div className="space-y-1 border-t border-metro-border p-2">
              {items.map((meeting) => <div key={meeting.id}>{renderMeeting(meeting)}</div>)}
            </div>}
          </div>;
        })}
      </div>;
    })}
    {filtered.length === 0 && <p className="rounded-xl border border-dashed border-metro-border p-5 text-center text-sm text-metro-muted">{onlyOpen ? 'No hay reuniones abiertas.' : 'Todavía no hay reuniones registradas.'}</p>}
  </div>;
}
