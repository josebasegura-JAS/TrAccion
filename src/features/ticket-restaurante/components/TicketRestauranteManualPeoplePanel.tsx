import { Pencil, Trash2, UserPlus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ActionButton } from '../../../components/ui/ActionButton';
import { Field, Input } from '../../../components/ui/Field';
import type { Employee } from '../../plantilla/domain/employee';
import type { TicketManualPerson, TicketPerson, TicketRestaurantConfig } from '../domain/ticketRestaurante';
import { normalizeTicketEmployeeNumber } from '../domain/ticketRestaurante';

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
  const key = monthKey(year, month);

  const allManualPeople = config.manualPeople ?? [];
  const people = useMemo<TicketManualPerson[]>(
    () => [...allManualPeople]
      .filter((person) => person.activo && (!person.inactiveFromMonth || key < person.inactiveFromMonth))
      .sort((a, b) => a.empleado.localeCompare(b.empleado, 'es', { numeric: true, sensitivity: 'base' })),
    [allManualPeople, key],
  );

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
    reset();
  };

  const setTickets = async (person: TicketManualPerson, rawValue: string) => {
    const tickets = Math.max(0, Math.trunc(Number(rawValue) || 0));
    const now = new Date().toISOString();
    await onUpdateConfig({
      ...config,
      manualPeople: allManualPeople.map((item) =>
        item.id === person.id
          ? { ...item, monthlyTickets: { ...item.monthlyTickets, [key]: tickets }, updatedAt: now }
          : item,
      ),
    });
  };

  const toggleContribution = async (person: TicketManualPerson) => {
    const now = new Date().toISOString();
    await onUpdateConfig({
      ...config,
      manualPeople: allManualPeople.map((item) =>
        item.id === person.id ? { ...item, includeContribution: !item.includeContribution, updatedAt: now } : item,
      ),
    });
  };

  const removePerson = async (person: TicketManualPerson) => {
    const confirmed = window.confirm(
      `¿Quitar a ${person.nombreApellidos} de Personas manuales desde ${String(month).padStart(2, '0')}/${year}?\n\nLos meses anteriores se conservarán para no alterar el histórico.`,
    );
    if (!confirmed) return;
    const now = new Date().toISOString();
    const hasPreviousHistory = Object.keys(person.monthlyTickets).some((month) => month < key);
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
    if (editingId === person.id) reset();
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
      <div className="mb-2 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-metro-text">Personas manuales</h3>
          <p className="text-[11px] text-metro-muted">
            Sin calendario. Busca por nº de empleado, nombre o apellidos; indica después los tickets de cada mes.
          </p>
        </div>
        <span className="rounded-full border border-metro-border px-2 py-0.5 text-[10px] font-bold text-metro-muted">
          {people.length}
        </span>
      </div>

      <div className="mb-2 grid gap-2 md:grid-cols-2 xl:grid-cols-[110px_1fr_150px_180px_110px] xl:items-end">
        <Field label="Nº empleado" required>
          <div className="relative">
            <Input
              value={empleado}
              onChange={(e) => { setEmpleado(e.target.value); setSuggestionField('empleado'); }}
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
              onChange={(e) => { setNombreApellidos(e.target.value); setSuggestionField('nombre'); }}
              onFocus={() => setSuggestionField('nombre')}
              onBlur={() => setTimeout(() => setSuggestionField(null), 120)}
              autoComplete="off"
            />
            {suggestionField === 'nombre' ? suggestionDropdown : null}
          </div>
        </Field>
        <Field label="DNI"><Input value={dni} onChange={(e) => setDni(e.target.value)} /></Field>
        <label className="flex h-[34px] items-center gap-2 text-xs font-semibold text-metro-text">
          <input className="h-3.5 w-3.5 accent-metro-red" type="checkbox" checked={includeContribution} onChange={(e) => setIncludeContribution(e.target.checked)} />
          Incluir en cotización
        </label>
        <div className="flex gap-1.5">
          <ActionButton iconOnly={false} size="sm" onClick={() => void savePerson()} disabled={!empleado.trim() || !nombreApellidos.trim()}>
            <UserPlus className="h-3.5 w-3.5" /> {editingId ? 'Guardar' : 'Añadir'}
          </ActionButton>
          {editingId ? <button type="button" className="rounded-lg border border-metro-border px-2 text-xs text-metro-text" onClick={reset}>Cancelar</button> : null}
        </div>
      </div>
      {message ? <p className="mb-2 text-[11px] text-metro-muted">{message}</p> : null}

      {people.length ? (
        <div className="overflow-hidden rounded-lg border border-metro-border">
          <table className="w-full text-xs">
            <thead className="bg-metro-surface text-metro-muted">
              <tr>
                <th className="px-2 py-1.5 text-left">Nº empleado</th>
                <th className="px-2 py-1.5 text-left">Persona</th>
                <th className="w-32 px-2 py-1.5 text-right">Tickets mes</th>
                <th className="w-36 px-2 py-1.5 text-center">Cotización</th>
                <th className="w-24 px-2 py-1.5 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {people.map((person) => (
                <tr key={person.id} className="border-t border-metro-border">
                  <td className="px-2 py-1.5 font-semibold text-metro-text">{person.empleado}</td>
                  <td className="px-2 py-1.5 text-metro-text">{person.nombreApellidos}</td>
                  <td className="px-2 py-1 text-right">
                    <input className="w-20 rounded-md border border-metro-border bg-metro-surface px-2 py-1 text-right text-metro-text" min={0} type="number" key={`${person.id}-${key}`} defaultValue={person.monthlyTickets[key] ?? 0} onBlur={(e) => void setTickets(person, e.target.value)} />
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <input className="h-3.5 w-3.5 accent-metro-red" type="checkbox" checked={person.includeContribution} onChange={() => void toggleContribution(person)} />
                  </td>
                  <td className="px-2 py-1 text-right">
                    <div className="flex justify-end gap-1">
                      <button className="rounded-md border border-metro-border p-1 text-metro-text hover:border-metro-red" type="button" title="Editar persona" onClick={() => editPerson(person)}><Pencil className="h-3.5 w-3.5" /></button>
                      <button className="rounded-md border border-metro-border p-1 text-metro-text hover:border-metro-red" type="button" title="Quitar desde este mes" onClick={() => void removePerson(person)}><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
