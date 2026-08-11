import { ChevronDown, ChevronUp, Pencil, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { ActionButton } from '../../../components/ui/ActionButton';
import { Field, Input } from '../../../components/ui/Field';
import type { Employee } from '../../plantilla/domain/employee';
import type { TicketManualPerson, TicketPerson, TicketRestaurantConfig } from '../domain/ticketRestaurante';
import { normalizeTicketEmployeeNumber } from '../domain/ticketRestaurante';

const MONTH_LABELS = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
] as const;

function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function normalizeSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es')
    .trim();
}

type TableDraft = {
  tickets: string;
  includeContribution: boolean;
};

export function TicketRestauranteManualPeoplePanel({
  config,
  employees,
  month,
  onUpdateConfig,
  regularPeople,
  year,
}: {
  config: TicketRestaurantConfig;
  employees: Employee[];
  month: number;
  onUpdateConfig: (config: TicketRestaurantConfig) => Promise<{ ok: boolean; message?: string }>;
  regularPeople: TicketPerson[];
  year: number;
}) {
  const [empleado, setEmpleado] = useState('');
  const [nombreApellidos, setNombreApellidos] = useState('');
  const [dni, setDni] = useState('');
  const [includeContribution, setIncludeContribution] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [suggestionField, setSuggestionField] = useState<'empleado' | 'nombre' | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [tableDrafts, setTableDrafts] = useState<Record<string, TableDraft>>({});
  const key = monthKey(year, month);
  const monthLabel = `${MONTH_LABELS[month - 1] ?? month} ${year}`;

  const allManualPeople = useMemo<TicketManualPerson[]>(() => config.manualPeople ?? [], [config.manualPeople]);
  const people = useMemo<TicketManualPerson[]>(
    () => [...allManualPeople]
      .filter((person) => person.activo && (!person.inactiveFromMonth || key < person.inactiveFromMonth))
      .sort((a, b) => a.empleado.localeCompare(b.empleado, 'es', { numeric: true, sensitivity: 'base' })),
    [allManualPeople, key],
  );

  useEffect(() => {
    const nextDrafts: Record<string, TableDraft> = {};
    people.forEach((person) => {
      nextDrafts[person.id] = {
        tickets: String(person.monthlyTickets[key] ?? 0),
        includeContribution: person.includeContribution,
      };
    });
    setTableDrafts(nextDrafts);
  }, [people, key]);

  const suggestions = useMemo(() => {
    const query = normalizeSearch(suggestionField === 'empleado' ? empleado : nombreApellidos);
    if (!query) return [];
    const occupied = new Set(
      allManualPeople
        .filter((person) => person.id !== editingId && person.activo && (!person.inactiveFromMonth || key < person.inactiveFromMonth))
        .map((person) => normalizeTicketEmployeeNumber(person.empleado)),
    );
    const regular = new Set(
      regularPeople
        .filter((person) => !person.deletedAt)
        .map((person) => normalizeTicketEmployeeNumber(person.empleado)),
    );
    return employees
      .filter((employee) => !employee.deletedAt)
      .filter((employee) => {
        const normalizedEmployee = normalizeTicketEmployeeNumber(employee.empleado);
        return !occupied.has(normalizedEmployee) && !regular.has(normalizedEmployee);
      })
      .filter((employee) => {
        const number = normalizeSearch(normalizeTicketEmployeeNumber(employee.empleado));
        const name = normalizeSearch(employee.nombreApellidos);
        return number.includes(query) || name.includes(query);
      })
      .sort((a, b) => a.nombreApellidos.localeCompare(b.nombreApellidos, 'es', { sensitivity: 'base' }))
      .slice(0, 8);
  }, [allManualPeople, editingId, empleado, employees, key, nombreApellidos, regularPeople, suggestionField]);

  const reset = () => {
    setEmpleado('');
    setNombreApellidos('');
    setDni('');
    setIncludeContribution(false);
    setEditingId(null);
    setSuggestionField(null);
  };

  const closeForm = () => {
    reset();
    setIsFormOpen(false);
  };

  const applySuggestion = (employee: Employee) => {
    setEmpleado(normalizeTicketEmployeeNumber(employee.empleado));
    setNombreApellidos(employee.nombreApellidos.trim());
    setDni((employee.dni || employee.nif || '').trim());
    setSuggestionField(null);
    setMessage('');
  };

  const savePerson = async () => {
    const normalizedEmployee = normalizeTicketEmployeeNumber(empleado);
    if (!normalizedEmployee || !nombreApellidos.trim()) return;
    const collision = regularPeople.some(
      (person) => !person.deletedAt && normalizeTicketEmployeeNumber(person.empleado) === normalizedEmployee,
    );
    if (collision) {
      setMessage('Ese Nº de empleado ya existe entre las personas con calendario.');
      return;
    }
    const duplicate = people.some(
      (person) => person.id !== editingId && normalizeTicketEmployeeNumber(person.empleado) === normalizedEmployee,
    );
    if (duplicate) {
      setMessage('Ese Nº de empleado ya existe entre las personas manuales.');
      return;
    }
    const now = new Date().toISOString();
    const next: TicketManualPerson = editingId
      ? {
          ...(allManualPeople.find((person) => person.id === editingId) as TicketManualPerson),
          empleado: normalizedEmployee,
          nombreApellidos: nombreApellidos.trim(),
          dni: dni.trim(),
          includeContribution,
          updatedAt: now,
        }
      : {
          id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `ticket-manual-person-${Date.now()}`,
          empleado: normalizedEmployee,
          nombreApellidos: nombreApellidos.trim(),
          dni: dni.trim(),
          activo: true,
          includeContribution,
          monthlyTickets: {},
          createdAt: now,
          updatedAt: now,
        };
    const nextPeople = editingId
      ? allManualPeople.map((person) => (person.id === editingId ? next : person))
      : [...allManualPeople, next];
    const result = await onUpdateConfig({ ...config, manualPeople: nextPeople });
    if (!result.ok) {
      setMessage(result.message ?? 'No se ha podido guardar la persona manual.');
      return;
    }
    setMessage(editingId ? 'Persona manual actualizada.' : 'Persona manual añadida.');
    closeForm();
  };

  const hasPendingTableChanges = people.some((person) => {
    const draft = tableDrafts[person.id];
    if (!draft) return false;
    const normalizedTickets = Math.max(0, Math.trunc(Number(draft.tickets) || 0));
    return normalizedTickets !== (person.monthlyTickets[key] ?? 0) || draft.includeContribution !== person.includeContribution;
  });

  const saveMonthlyValues = async () => {
    if (!hasPendingTableChanges) {
      setMessage('No hay cambios pendientes en tickets manuales.');
      return;
    }
    const now = new Date().toISOString();
    const nextPeople = allManualPeople.map((item) => {
      const draft = tableDrafts[item.id];
      if (!draft || !people.some((person) => person.id === item.id)) {
        return item;
      }
      const tickets = Math.max(0, Math.trunc(Number(draft.tickets) || 0));
      return {
        ...item,
        includeContribution: draft.includeContribution,
        monthlyTickets: { ...item.monthlyTickets, [key]: tickets },
        updatedAt: now,
      };
    });
    const result = await onUpdateConfig({ ...config, manualPeople: nextPeople });
    if (!result.ok) {
      setMessage(result.message ?? 'No se han podido guardar los tickets del mes.');
      return;
    }
    setMessage(`Tickets manuales guardados para ${monthLabel}.`);
  };

  const removePerson = async (person: TicketManualPerson) => {
    const confirmed = window.confirm(
      `¿Quitar a ${person.nombreApellidos} de Personas manuales desde ${String(month).padStart(2, '0')}/${year}?\n\nLos meses anteriores se conservarán para no alterar el histórico.`,
    );
    if (!confirmed) return;
    const now = new Date().toISOString();
    const hasPreviousHistory = Object.keys(person.monthlyTickets).some((monthValue) => monthValue < key);
    const nextPeople = hasPreviousHistory
      ? allManualPeople.map((item) =>
          item.id === person.id ? { ...item, inactiveFromMonth: key, updatedAt: now } : item,
        )
      : allManualPeople.filter((item) => item.id !== person.id);
    const result = await onUpdateConfig({ ...config, manualPeople: nextPeople });
    if (!result.ok) {
      setMessage(result.message ?? 'No se ha podido eliminar la persona manual.');
      return;
    }
    if (editingId === person.id) closeForm();
    setMessage('Persona retirada desde el mes seleccionado. El histórico anterior se conserva.');
  };

  const editPerson = (person: TicketManualPerson) => {
    setEditingId(person.id);
    setEmpleado(person.empleado);
    setNombreApellidos(person.nombreApellidos);
    setDni(person.dni);
    setIncludeContribution(person.includeContribution);
    setSuggestionField(null);
    setMessage('');
    setIsFormOpen(true);
  };

  const suggestionDropdown = suggestions.length && suggestionField ? (
    <div className="absolute z-40 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-metro-border bg-metro-panel shadow-xl">
      {suggestions.map((employee) => (
        <button
          key={employee.empleado}
          type="button"
          className="flex w-full items-center justify-between gap-3 border-b border-metro-border px-2.5 py-2 text-left text-xs last:border-b-0 hover:bg-metro-surface"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => applySuggestion(employee)}
        >
          <span className="font-semibold text-metro-text">{employee.nombreApellidos}</span>
          <span className="shrink-0 text-metro-muted">{normalizeTicketEmployeeNumber(employee.empleado)}</span>
        </button>
      ))}
    </div>
  ) : null;

  return (
    <div className="mb-3 rounded-xl border border-metro-border bg-metro-panel p-2.5">
      <div className="mb-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-bold text-metro-text">Personas manuales</h3>
            <span className="rounded-full border border-blue-400/20 bg-blue-400/[0.08] px-2 py-0.5 text-[10px] font-semibold text-blue-300">
              {monthLabel}
            </span>
          </div>
          <p className="text-[11px] text-metro-muted">
            Personas sin calendario fijo. Añádelas una vez y, cada mes, informa aquí sus tickets y si deben cotizar.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-metro-border px-2 py-0.5 text-[10px] font-bold text-metro-muted">
            {people.length} personas
          </span>
          <ActionButton
            iconOnly={false}
            size="sm"
            variant="secondary"
            onClick={() => {
              setIsFormOpen((current) => {
                const next = !current;
                if (!next) reset();
                else setMessage('');
                return next;
              });
            }}
          >
            {isFormOpen ? 'Ocultar alta manual' : 'Añadir persona manual'}
            {isFormOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </ActionButton>
        </div>
      </div>

      {isFormOpen ? (
        <div className="mb-3 rounded-lg border border-metro-border bg-metro-surface/45 p-2.5">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div>
              <p className="text-xs font-bold text-metro-text">{editingId ? 'Editar persona manual' : 'Nueva persona manual'}</p>
              <p className="text-[11px] text-metro-muted">Busca por nº de empleado, nombre o apellidos y completa los datos si hace falta.</p>
            </div>
          </div>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-[110px_1fr_150px_180px_190px] xl:items-end">
            <Field label="Nº empleado" required>
              <div className="relative">
                <Input
                  value={empleado}
                  onChange={(e) => {
                    setEmpleado(e.target.value);
                    setSuggestionField('empleado');
                  }}
                  onFocus={() => setSuggestionField('empleado')}
                  onBlur={() => setTimeout(() => setSuggestionField(null), 120)}
                  autoComplete="off"
                />
                {suggestionField === 'empleado' ? suggestionDropdown : null}
              </div>
            </Field>
            <Field label="Nombre y apellidos" required>
              <div className="relative">
                <Input
                  value={nombreApellidos}
                  onChange={(e) => {
                    setNombreApellidos(e.target.value);
                    setSuggestionField('nombre');
                  }}
                  onFocus={() => setSuggestionField('nombre')}
                  onBlur={() => setTimeout(() => setSuggestionField(null), 120)}
                  autoComplete="off"
                />
                {suggestionField === 'nombre' ? suggestionDropdown : null}
              </div>
            </Field>
            <Field label="DNI">
              <Input value={dni} onChange={(e) => setDni(e.target.value)} />
            </Field>
            <label className="flex h-[34px] items-center gap-2 text-xs font-semibold text-metro-text">
              <input
                className="h-3.5 w-3.5 accent-metro-red"
                type="checkbox"
                checked={includeContribution}
                onChange={(e) => setIncludeContribution(e.target.checked)}
              />
              Incluir en cotización
            </label>
            <div className="flex gap-1.5">
              <ActionButton
                iconOnly={false}
                size="sm"
                variant="add"
                onClick={() => void savePerson()}
                disabled={!empleado.trim() || !nombreApellidos.trim()}
              >
                {editingId ? 'Guardar cambios' : 'Añadir'}
              </ActionButton>
              <button
                type="button"
                className="rounded-lg border border-metro-border px-2 text-xs text-metro-text"
                onClick={closeForm}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {message ? <p className="mb-2 text-[11px] text-metro-muted">{message}</p> : null}

      {people.length ? (
        <div className="overflow-hidden rounded-lg border border-metro-border">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-metro-border bg-metro-surface/50 px-2.5 py-2">
            <div>
              <p className="text-xs font-bold text-metro-text">Tickets del mes</p>
              <p className="text-[11px] text-metro-muted">Indica los tickets de {monthLabel} y guarda cuando termines.</p>
            </div>
            <ActionButton
              iconOnly={false}
              size="sm"
              variant="save"
              onClick={() => void saveMonthlyValues()}
              disabled={!hasPendingTableChanges}
            >
              Guardar tickets del mes
            </ActionButton>
          </div>
          <table className="w-full text-xs">
            <thead className="bg-metro-surface text-metro-muted">
              <tr>
                <th className="px-2 py-1.5 text-left">Nº empleado</th>
                <th className="px-2 py-1.5 text-left">Persona</th>
                <th className="w-36 px-2 py-1.5 text-right">Tickets {monthLabel}</th>
                <th className="w-36 px-2 py-1.5 text-center">Cotización</th>
                <th className="w-24 px-2 py-1.5 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {people.map((person) => {
                const draft = tableDrafts[person.id] ?? {
                  tickets: String(person.monthlyTickets[key] ?? 0),
                  includeContribution: person.includeContribution,
                };
                return (
                  <tr key={person.id} className="border-t border-metro-border">
                    <td className="px-2 py-1.5 font-semibold text-metro-text">{person.empleado}</td>
                    <td className="px-2 py-1.5 text-metro-text">{person.nombreApellidos}</td>
                    <td className="px-2 py-1 text-right">
                      <input
                        className="w-24 rounded-md border border-metro-border bg-metro-surface px-2 py-1 text-right text-metro-text"
                        min={0}
                        type="number"
                        value={draft.tickets}
                        onChange={(e) =>
                          setTableDrafts((current) => ({
                            ...current,
                            [person.id]: {
                              ...draft,
                              tickets: e.target.value,
                            },
                          }))
                        }
                      />
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <input
                        className="h-3.5 w-3.5 accent-metro-red"
                        type="checkbox"
                        checked={draft.includeContribution}
                        onChange={(e) =>
                          setTableDrafts((current) => ({
                            ...current,
                            [person.id]: {
                              ...draft,
                              includeContribution: e.target.checked,
                            },
                          }))
                        }
                      />
                    </td>
                    <td className="px-2 py-1 text-right">
                      <div className="flex justify-end gap-1">
                        <button
                          className="rounded-md border border-metro-border p-1 text-metro-text hover:border-metro-red"
                          type="button"
                          title="Editar persona"
                          onClick={() => editPerson(person)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          className="rounded-md border border-metro-border p-1 text-metro-text hover:border-metro-red"
                          type="button"
                          title="Quitar desde este mes"
                          onClick={() => void removePerson(person)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-metro-border bg-metro-surface/35 px-3 py-4 text-center text-xs text-metro-muted">
          No hay personas manuales dadas de alta.
        </div>
      )}
    </div>
  );
}
