import { Pencil, Trash2, UserPlus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ActionButton } from '../../../components/ui/ActionButton';
import { Field, Input } from '../../../components/ui/Field';
import type { TicketManualPerson, TicketPerson, TicketRestaurantConfig } from '../domain/ticketRestaurante';
import { normalizeTicketEmployeeNumber } from '../domain/ticketRestaurante';

function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function TicketRestauranteManualPeoplePanel({
  config,
  month,
  onUpdateConfig,
  regularPeople,
  year,
}: {
  config: TicketRestaurantConfig;
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
  const key = monthKey(year, month);
  const people = useMemo<TicketManualPerson[]>(
    () => [...(config.manualPeople ?? [])].filter((person) => person.activo).sort((a, b) =>
      a.empleado.localeCompare(b.empleado, 'es', { numeric: true, sensitivity: 'base' }),
    ),
    [config.manualPeople],
  );

  const reset = () => {
    setEmpleado('');
    setNombreApellidos('');
    setDni('');
    setIncludeContribution(false);
    setEditingId(null);
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
          ...(people.find((person) => person.id === editingId) as TicketManualPerson),
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
      ? (config.manualPeople ?? []).map((person) => (person.id === editingId ? next : person))
      : [...(config.manualPeople ?? []), next];
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
      manualPeople: (config.manualPeople ?? []).map((item) =>
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
      manualPeople: (config.manualPeople ?? []).map((item) =>
        item.id === person.id ? { ...item, includeContribution: !item.includeContribution, updatedAt: now } : item,
      ),
    });
  };

  const removePerson = async (person: TicketManualPerson) => {
    await onUpdateConfig({
      ...config,
      manualPeople: (config.manualPeople ?? []).filter((item) => item.id !== person.id),
    });
    if (editingId === person.id) reset();
  };

  const editPerson = (person: TicketManualPerson) => {
    setEditingId(person.id);
    setEmpleado(person.empleado);
    setNombreApellidos(person.nombreApellidos);
    setDni(person.dni);
    setIncludeContribution(person.includeContribution);
    setMessage('');
  };

  return (
    <div className="mb-3 rounded-xl border border-metro-border bg-metro-panel p-2.5">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-metro-text">Personas manuales</h3>
          <p className="text-[11px] text-metro-muted">
            Sin calendario. Indica los tickets de este mes; la persona permanece para los meses siguientes.
          </p>
        </div>
        <span className="rounded-full border border-metro-border px-2 py-0.5 text-[10px] font-bold text-metro-muted">
          {people.length}
        </span>
      </div>

      <div className="mb-2 grid gap-2 md:grid-cols-2 xl:grid-cols-[110px_1fr_150px_180px_110px] xl:items-end">
        <Field label="Nº empleado" required><Input value={empleado} onChange={(e) => setEmpleado(e.target.value)} /></Field>
        <Field label="Nombre y apellidos" required><Input value={nombreApellidos} onChange={(e) => setNombreApellidos(e.target.value)} /></Field>
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
                      <button className="rounded-md border border-metro-border p-1 text-metro-text hover:border-metro-red" type="button" title="Eliminar persona" onClick={() => void removePerson(person)}><Trash2 className="h-3.5 w-3.5" /></button>
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
