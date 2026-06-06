import { CalendarDays, Plus, Save, SlidersHorizontal, UsersRound } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useEmployeeStore } from '../../plantilla/store/useEmployeeStore';
import {
  activeTicketCalendars,
  calculateDerechosTicketMes,
  AUSENCIA_TICKET_TIPOS,
  EMPTY_AUSENCIA_TICKET_DRAFT,
  EMPTY_TICKET_CALENDAR_DRAFT,
  normalizeTicketDayRules,
  visibleAusenciasTicket,
  visibleTicketCalendars,
  type AusenciaTicket,
  type AusenciaTicketDraft,
  type DiaTicket,
  type DerechoTicketMes,
  type TicketCalendar,
  type TicketCalendarDraft,
} from '../domain/ticketRestaurante';
import { useTicketRestauranteStore } from '../store/useTicketRestauranteStore';

type TicketSection = 'calendarios' | 'asignaciones' | 'derechos' | 'ausencias';

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function toCalendarDraft(calendar: TicketCalendar): TicketCalendarDraft {
  return {
    nombre: calendar.nombre,
    activo: calendar.activo,
    diasTicket: calendar.diasTicket,
  };
}

function toAusenciaDraft(ausencia: AusenciaTicket): AusenciaTicketDraft {
  return {
    empleado: ausencia.empleado,
    fecha: ausencia.fecha,
    tipo: ausencia.tipo,
    afectaTicket: ausencia.afectaTicket,
    observaciones: ausencia.observaciones,
  };
}

function sortByText<T>(items: T[], pick: (item: T) => string): T[] {
  return [...items].sort((first, second) =>
    pick(first).localeCompare(pick(second), 'es', { numeric: true, sensitivity: 'base' }),
  );
}

export function TicketRestaurantePage() {
  const employeesSource = useEmployeeStore((state) => state.employees);
  const loadEmployees = useEmployeeStore((state) => state.load);
  const calendars = useTicketRestauranteStore((state) => state.calendars);
  const assignments = useTicketRestauranteStore((state) => state.assignments);
  const ausencias = useTicketRestauranteStore((state) => state.ausencias);
  const loadTickets = useTicketRestauranteStore((state) => state.load);
  const createCalendar = useTicketRestauranteStore((state) => state.createCalendar);
  const updateCalendar = useTicketRestauranteStore((state) => state.updateCalendar);
  const deactivateCalendar = useTicketRestauranteStore((state) => state.deactivateCalendar);
  const removeCalendar = useTicketRestauranteStore((state) => state.removeCalendar);
  const assignTicketCalendar = useTicketRestauranteStore((state) => state.assignCalendar);
  const removeAssignment = useTicketRestauranteStore((state) => state.removeAssignment);
  const createAusencia = useTicketRestauranteStore((state) => state.createAusencia);
  const updateAusencia = useTicketRestauranteStore((state) => state.updateAusencia);
  const removeAusencia = useTicketRestauranteStore((state) => state.removeAusencia);
  const [section, setSection] = useState<TicketSection>('calendarios');
  const [calendarDraft, setCalendarDraft] = useState<TicketCalendarDraft>(
    EMPTY_TICKET_CALENDAR_DRAFT,
  );
  const [editingCalendarId, setEditingCalendarId] = useState<string | null>(null);
  const [newRule, setNewRule] = useState<DiaTicket>({ fecha: '', tieneTicket: true });
  const [selectedEmpleado, setSelectedEmpleado] = useState('');
  const [selectedCalendarId, setSelectedCalendarId] = useState('');
  const [month, setMonth] = useState(currentMonth());
  const [ausenciaDraft, setAusenciaDraft] = useState<AusenciaTicketDraft>(
    EMPTY_AUSENCIA_TICKET_DRAFT,
  );
  const [editingAusenciaId, setEditingAusenciaId] = useState<string | null>(null);

  useEffect(() => {
    loadEmployees();
    loadTickets();
  }, [loadEmployees, loadTickets]);

  const employees = useMemo(
    () =>
      sortByText(
        employeesSource.filter((employee) => !employee.deletedAt),
        (employee) => employee.empleado,
      ),
    [employeesSource],
  );
  const visibleCalendars = useMemo(
    () => sortByText(visibleTicketCalendars(calendars), (calendar) => calendar.nombre),
    [calendars],
  );
  const activeCalendars = useMemo(
    () => sortByText(activeTicketCalendars(calendars), (calendar) => calendar.nombre),
    [calendars],
  );
  const sortedAssignments = useMemo(
    () => sortByText(assignments, (assignment) => assignment.empleado),
    [assignments],
  );
  const visibleAusencias = useMemo(
    () => sortByText(visibleAusenciasTicket(ausencias), (ausencia) => ausencia.fecha),
    [ausencias],
  );
  const rights = useMemo(
    () =>
      calculateDerechosTicketMes({
        assignments: assignments,
        calendars: calendars,
        employees,
        month,
        ausencias,
      }),
    [employees, month, assignments, calendars, ausencias],
  );

  const calendarById = useMemo(
    () => new Map(calendars.map((calendar) => [calendar.id, calendar])),
    [calendars],
  );
  const employeeById = useMemo(
    () => new Map(employees.map((employee) => [employee.empleado, employee])),
    [employees],
  );

  const resetCalendarForm = () => {
    setCalendarDraft(EMPTY_TICKET_CALENDAR_DRAFT);
    setEditingCalendarId(null);
    setNewRule({ fecha: '', tieneTicket: true });
  };

  const saveCalendar = () => {
    if (!calendarDraft.nombre.trim()) {
      return;
    }

    const draft = {
      ...calendarDraft,
      diasTicket: normalizeTicketDayRules(calendarDraft.diasTicket),
    };
    if (editingCalendarId) {
      updateCalendar(editingCalendarId, draft);
    } else {
      createCalendar(draft);
    }
    resetCalendarForm();
  };

  const editCalendar = (calendar: TicketCalendar) => {
    setCalendarDraft(toCalendarDraft(calendar));
    setEditingCalendarId(calendar.id);
    setNewRule({ fecha: '', tieneTicket: true });
  };

  const addRule = () => {
    if (!newRule.fecha) {
      return;
    }

    setCalendarDraft((current) => ({
      ...current,
      diasTicket: normalizeTicketDayRules([...current.diasTicket, newRule]),
    }));
    setNewRule({ fecha: '', tieneTicket: true });
  };

  const removeRule = (fecha: string) => {
    setCalendarDraft((current) => ({
      ...current,
      diasTicket: current.diasTicket.filter((rule) => rule.fecha !== fecha),
    }));
  };

  const assignCalendar = () => {
    if (!selectedEmpleado || !selectedCalendarId) {
      return;
    }

    assignTicketCalendar(selectedEmpleado, selectedCalendarId);
    setSelectedEmpleado('');
    setSelectedCalendarId('');
  };

  const resetAusenciaForm = () => {
    setAusenciaDraft(EMPTY_AUSENCIA_TICKET_DRAFT);
    setEditingAusenciaId(null);
  };

  const saveAusencia = () => {
    if (!ausenciaDraft.empleado || !ausenciaDraft.fecha) {
      return;
    }

    if (editingAusenciaId) {
      updateAusencia(editingAusenciaId, ausenciaDraft);
    } else {
      createAusencia(ausenciaDraft);
    }
    resetAusenciaForm();
  };

  const editAusencia = (ausencia: AusenciaTicket) => {
    setAusenciaDraft(toAusenciaDraft(ausencia));
    setEditingAusenciaId(ausencia.id);
  };

  return (
    <section
      className="rounded-2xl border border-metro-border bg-white p-4 shadow-card"
      id="ticket-restaurante"
    >
      <div className="mb-3 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-metro-red">Módulo</p>
          <h2 className="text-2xl font-bold text-metro-text">Ticket Restaurante</h2>
          <p className="mt-0.5 text-base text-metro-muted">
            MVP Fase 2: calendarios, asignación, ausencias y derechos mensuales.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <SectionButton
            active={section === 'calendarios'}
            onClick={() => setSection('calendarios')}
          >
            Calendarios
          </SectionButton>
          <SectionButton
            active={section === 'asignaciones'}
            onClick={() => setSection('asignaciones')}
          >
            Asignaciones
          </SectionButton>
          <SectionButton active={section === 'derechos'} onClick={() => setSection('derechos')}>
            Derechos
          </SectionButton>
          <SectionButton active={section === 'ausencias'} onClick={() => setSection('ausencias')}>
            Ausencias
          </SectionButton>
        </div>
      </div>

      {section === 'calendarios' && (
        <div className="grid gap-4 2xl:grid-cols-[430px_minmax(0,1fr)]">
          <div className="rounded-xl border border-metro-border bg-metro-surface p-3">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-metro-text">
              <CalendarDays size={16} className="text-metro-red" />
              {editingCalendarId ? 'Editar calendario' : 'Crear calendario'}
            </div>
            <div className="space-y-3">
              <label className="block text-xs font-semibold uppercase tracking-wide text-metro-muted">
                Nombre
                <input
                  className="mt-1 w-full rounded-lg border border-metro-border bg-white px-3 py-2 text-sm normal-case text-metro-text outline-none focus:border-metro-red"
                  onChange={(event) =>
                    setCalendarDraft((current) => ({ ...current, nombre: event.target.value }))
                  }
                  placeholder="Calendario base 2026"
                  type="text"
                  value={calendarDraft.nombre}
                />
              </label>
              <label className="flex items-center gap-2 text-sm font-semibold text-metro-text">
                <input
                  checked={calendarDraft.activo}
                  onChange={(event) =>
                    setCalendarDraft((current) => ({ ...current, activo: event.target.checked }))
                  }
                  type="checkbox"
                />
                Calendario activo
              </label>
              <div className="rounded-xl border border-metro-border bg-white p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-metro-muted">
                  Días con derecho
                </p>
                <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
                  <input
                    className="rounded-lg border border-metro-border px-3 py-2 text-sm text-metro-text outline-none focus:border-metro-red"
                    onChange={(event) =>
                      setNewRule((current) => ({ ...current, fecha: event.target.value }))
                    }
                    type="date"
                    value={newRule.fecha}
                  />
                  <label className="flex items-center gap-2 text-sm font-semibold text-metro-text">
                    <input
                      checked={newRule.tieneTicket}
                      onChange={(event) =>
                        setNewRule((current) => ({ ...current, tieneTicket: event.target.checked }))
                      }
                      type="checkbox"
                    />
                    Tiene ticket
                  </label>
                  <button
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-metro-border bg-white px-3 py-2 text-sm font-semibold text-metro-text hover:border-metro-red"
                    onClick={addRule}
                    type="button"
                  >
                    <Plus size={16} /> Añadir
                  </button>
                </div>
                <div className="mt-3 max-h-48 overflow-auto rounded-lg border border-metro-border">
                  <table className="min-w-full table-fixed text-left text-xs">
                    <thead className="sticky top-0 bg-[#F9FAFB] text-[11px] uppercase tracking-wide text-metro-muted">
                      <tr>
                        <th className="px-3 py-2">Fecha</th>
                        <th className="px-3 py-2">Tiene ticket</th>
                        <th className="px-3 py-2 text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-metro-border bg-white">
                      {calendarDraft.diasTicket.map((rule) => (
                        <tr key={rule.fecha}>
                          <td className="px-3 py-1.5 font-semibold text-metro-text">
                            {rule.fecha}
                          </td>
                          <td className="px-3 py-1.5 text-metro-muted">
                            {rule.tieneTicket ? 'Sí' : 'No'}
                          </td>
                          <td className="px-3 py-1.5 text-right">
                            <button
                              className="rounded-lg border border-metro-border px-2.5 py-1 text-xs font-semibold text-metro-text hover:border-metro-red"
                              onClick={() => removeRule(rule.fecha)}
                              type="button"
                            >
                              Quitar
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  className="inline-flex items-center gap-2 rounded-xl bg-metro-red px-3 py-2 text-sm font-semibold text-white hover:bg-metro-dark"
                  onClick={saveCalendar}
                  type="button"
                >
                  <Save size={16} /> Guardar
                </button>
                <button
                  className="rounded-xl border border-metro-border bg-white px-3 py-2 text-sm font-semibold text-metro-text hover:border-metro-red"
                  onClick={resetCalendarForm}
                  type="button"
                >
                  Limpiar
                </button>
              </div>
            </div>
          </div>
          <CalendarsTable
            calendars={visibleCalendars}
            onDeactivate={deactivateCalendar}
            onEdit={editCalendar}
            onRemove={removeCalendar}
          />
        </div>
      )}

      {section === 'asignaciones' && (
        <div className="space-y-3">
          <div className="grid gap-2 rounded-xl border border-metro-border bg-metro-surface p-2 lg:grid-cols-[minmax(220px,1fr)_minmax(220px,1fr)_auto]">
            <SelectBox label="Persona" onChange={setSelectedEmpleado} value={selectedEmpleado}>
              {employees.map((employee) => (
                <option key={employee.empleado} value={employee.empleado}>
                  {employee.empleado} · {employee.nombreApellidos}
                </option>
              ))}
            </SelectBox>
            <SelectBox
              label="Calendario"
              onChange={setSelectedCalendarId}
              value={selectedCalendarId}
            >
              {activeCalendars.map((calendar) => (
                <option key={calendar.id} value={calendar.id}>
                  {calendar.nombre}
                </option>
              ))}
            </SelectBox>
            <button
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-metro-red px-3 py-2 text-sm font-semibold text-white hover:bg-metro-dark"
              onClick={assignCalendar}
              type="button"
            >
              <UsersRound size={16} /> Asignar
            </button>
          </div>
          <AssignmentsTable
            assignments={sortedAssignments}
            calendarName={(calendarId) => calendarById.get(calendarId)?.nombre ?? '—'}
            employeeName={(empleado) => employeeById.get(empleado)?.nombreApellidos ?? '—'}
            onRemove={removeAssignment}
          />
        </div>
      )}

      {section === 'derechos' && (
        <div className="space-y-3">
          <div className="grid gap-2 rounded-xl border border-metro-border bg-metro-surface p-2 lg:grid-cols-[220px_1fr]">
            <label className="block text-xs font-semibold uppercase tracking-wide text-metro-muted">
              Mes
              <input
                className="mt-1 w-full rounded-lg border border-metro-border bg-white px-3 py-2 text-sm normal-case text-metro-text outline-none focus:border-metro-red"
                onChange={(event) => setMonth(event.target.value)}
                type="month"
                value={month}
              />
            </label>
          </div>
          <RightsTable rights={rights} />
        </div>
      )}

      {section === 'ausencias' && (
        <div className="space-y-3">
          <button
            className="inline-flex items-center gap-2 rounded-xl bg-metro-red px-3 py-2 text-sm font-semibold text-white hover:bg-metro-dark"
            onClick={resetAusenciaForm}
            type="button"
          >
            <Plus size={16} /> Nueva ausencia
          </button>
          <div className="grid gap-4 2xl:grid-cols-[430px_minmax(0,1fr)]">
            <div className="rounded-xl border border-metro-border bg-metro-surface p-3">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-metro-text">
                <CalendarDays size={16} className="text-metro-red" />
                {editingAusenciaId ? 'Editar ausencia' : 'Nueva ausencia'}
              </div>
              <div className="space-y-3">
                <SelectBox
                  label="Persona"
                  onChange={(empleado) => setAusenciaDraft((current) => ({ ...current, empleado }))}
                  value={ausenciaDraft.empleado}
                >
                  {employees.map((employee) => (
                    <option key={employee.empleado} value={employee.empleado}>
                      {employee.empleado} · {employee.nombreApellidos}
                    </option>
                  ))}
                </SelectBox>
                <input
                  className="w-full rounded-lg border border-metro-border bg-white px-3 py-2 text-sm text-metro-text outline-none focus:border-metro-red"
                  onChange={(event) =>
                    setAusenciaDraft((current) => ({ ...current, fecha: event.target.value }))
                  }
                  type="date"
                  value={ausenciaDraft.fecha}
                />
                <SelectBox
                  label="Tipo"
                  onChange={(tipo) =>
                    setAusenciaDraft((current) => ({
                      ...current,
                      tipo: AUSENCIA_TICKET_TIPOS.find((candidate) => candidate === tipo) ?? 'OTRO',
                    }))
                  }
                  value={ausenciaDraft.tipo}
                >
                  {AUSENCIA_TICKET_TIPOS.map((tipo) => (
                    <option key={tipo} value={tipo}>
                      {tipo}
                    </option>
                  ))}
                </SelectBox>
                <label className="flex items-center gap-2 text-sm font-semibold text-metro-text">
                  <input
                    checked={ausenciaDraft.afectaTicket}
                    onChange={(event) =>
                      setAusenciaDraft((current) => ({
                        ...current,
                        afectaTicket: event.target.checked,
                      }))
                    }
                    type="checkbox"
                  />
                  Afecta ticket
                </label>
                <textarea
                  className="min-h-20 w-full rounded-lg border border-metro-border bg-white px-3 py-2 text-sm text-metro-text outline-none focus:border-metro-red"
                  onChange={(event) =>
                    setAusenciaDraft((current) => ({
                      ...current,
                      observaciones: event.target.value,
                    }))
                  }
                  placeholder="Observaciones"
                  value={ausenciaDraft.observaciones}
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    className="inline-flex items-center gap-2 rounded-xl bg-metro-red px-3 py-2 text-sm font-semibold text-white hover:bg-metro-dark"
                    onClick={saveAusencia}
                    type="button"
                  >
                    <Save size={16} /> Guardar
                  </button>
                  <button
                    className="rounded-xl border border-metro-border bg-white px-3 py-2 text-sm font-semibold text-metro-text hover:border-metro-red"
                    onClick={resetAusenciaForm}
                    type="button"
                  >
                    Limpiar
                  </button>
                </div>
              </div>
            </div>
            <AusenciasTable
              ausencias={visibleAusencias}
              employeeName={(empleado) => employeeById.get(empleado)?.nombreApellidos ?? '—'}
              onEdit={editAusencia}
              onRemove={removeAusencia}
            />
          </div>
        </div>
      )}
    </section>
  );
}

function SectionButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: string;
  onClick: () => void;
}) {
  return (
    <button
      className={
        active
          ? 'rounded-xl bg-metro-red px-3 py-2 text-sm font-semibold text-white hover:bg-metro-dark'
          : 'rounded-xl border border-metro-border bg-white px-3 py-2 text-sm font-semibold text-metro-text hover:border-metro-red'
      }
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

function SelectBox({
  children,
  label,
  onChange,
  value,
}: {
  children: ReactNode;
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <select
      aria-label={label}
      className="rounded-lg border border-metro-border bg-white px-3 py-2 text-sm text-metro-text outline-none focus:border-metro-red"
      onChange={(event) => onChange(event.target.value)}
      value={value}
    >
      <option value="">{label}</option>
      {children}
    </select>
  );
}

function CalendarsTable({
  calendars,
  onDeactivate,
  onEdit,
  onRemove,
}: {
  calendars: TicketCalendar[];
  onDeactivate: (id: string) => void;
  onEdit: (calendar: TicketCalendar) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-metro-border">
      <TableHeader count={calendars.length} icon="calendarios" title="Calendarios" />
      <div className="max-h-[520px] overflow-auto">
        <table className="min-w-[760px] table-fixed text-left text-xs">
          <thead className="sticky top-0 z-10 bg-[#F9FAFB] text-[11px] uppercase tracking-wide text-metro-muted">
            <tr>
              <th className="w-[240px] px-3 py-2">Nombre</th>
              <th className="w-[95px] px-3 py-2">Activo</th>
              <th className="w-[130px] px-3 py-2">Días ticket</th>
              <th className="w-[170px] px-3 py-2">Actualizado</th>
              <th className="w-[220px] px-3 py-2 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-metro-border bg-white">
            {calendars.map((calendar) => (
              <tr className="hover:bg-red-50/50" key={calendar.id}>
                <td
                  className="truncate px-3 py-1.5 font-semibold text-metro-text"
                  title={calendar.nombre}
                >
                  {calendar.nombre}
                </td>
                <td className="px-3 py-1.5 text-metro-muted">{calendar.activo ? 'Sí' : 'No'}</td>
                <td className="px-3 py-1.5 text-metro-muted">{calendar.diasTicket.length}</td>
                <td className="px-3 py-1.5 text-metro-muted">
                  {formatDateTime(calendar.updatedAt)}
                </td>
                <td className="whitespace-nowrap px-3 py-1.5 text-right">
                  <button
                    className="mr-1 rounded-lg bg-metro-red px-2.5 py-1 text-xs font-semibold text-white hover:bg-metro-dark"
                    onClick={() => onEdit(calendar)}
                    type="button"
                  >
                    Editar
                  </button>
                  <button
                    className="mr-1 rounded-lg border border-metro-border px-2.5 py-1 text-xs font-semibold text-metro-text hover:border-metro-red"
                    onClick={() => onDeactivate(calendar.id)}
                    type="button"
                  >
                    Desactivar
                  </button>
                  <button
                    className="rounded-lg border border-metro-border px-2.5 py-1 text-xs font-semibold text-metro-text hover:border-metro-red"
                    onClick={() => onRemove(calendar.id)}
                    type="button"
                  >
                    Borrar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AssignmentsTable({
  assignments,
  calendarName,
  employeeName,
  onRemove,
}: {
  assignments: Array<{ empleado: string; calendarId: string }>;
  calendarName: (calendarId: string) => string;
  employeeName: (empleado: string) => string;
  onRemove: (empleado: string) => void;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-metro-border">
      <TableHeader
        count={assignments.length}
        icon="asignaciones"
        title="Asignaciones persona-calendario"
      />
      <div className="max-h-[460px] overflow-auto">
        <table className="min-w-[760px] table-fixed text-left text-xs">
          <thead className="sticky top-0 z-10 bg-[#F9FAFB] text-[11px] uppercase tracking-wide text-metro-muted">
            <tr>
              <th className="w-[130px] px-3 py-2">Empleado</th>
              <th className="w-[320px] px-3 py-2">Nombre y apellidos</th>
              <th className="w-[220px] px-3 py-2">Calendario</th>
              <th className="w-[100px] px-3 py-2 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-metro-border bg-white">
            {assignments.map((assignment) => (
              <tr className="hover:bg-red-50/50" key={assignment.empleado}>
                <td className="truncate px-3 py-1.5 font-semibold text-metro-text">
                  {assignment.empleado}
                </td>
                <td className="truncate px-3 py-1.5 text-metro-text">
                  {employeeName(assignment.empleado)}
                </td>
                <td className="truncate px-3 py-1.5 text-metro-muted">
                  {calendarName(assignment.calendarId)}
                </td>
                <td className="px-3 py-1.5 text-right">
                  <button
                    className="rounded-lg border border-metro-border px-2.5 py-1 text-xs font-semibold text-metro-text hover:border-metro-red"
                    onClick={() => onRemove(assignment.empleado)}
                    type="button"
                  >
                    Eliminar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AusenciasTable({
  ausencias,
  employeeName,
  onEdit,
  onRemove,
}: {
  ausencias: AusenciaTicket[];
  employeeName: (empleado: string) => string;
  onEdit: (ausencia: AusenciaTicket) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-metro-border">
      <TableHeader count={ausencias.length} icon="ausencias" title="Ausencias" />
      <div className="max-h-[520px] overflow-auto">
        <table className="min-w-[820px] table-fixed text-left text-xs">
          <thead className="sticky top-0 z-10 bg-[#F9FAFB] text-[11px] uppercase tracking-wide text-metro-muted">
            <tr>
              <th className="w-[120px] px-3 py-2">Empleado</th>
              <th className="w-[260px] px-3 py-2">Nombre y apellidos</th>
              <th className="w-[120px] px-3 py-2">Fecha</th>
              <th className="w-[100px] px-3 py-2">Tipo</th>
              <th className="w-[120px] px-3 py-2">Afecta ticket</th>
              <th className="w-[160px] px-3 py-2 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-metro-border bg-white">
            {ausencias.map((ausencia) => (
              <tr className="hover:bg-red-50/50" key={ausencia.id}>
                <td className="truncate px-3 py-1.5 font-semibold text-metro-text">
                  {ausencia.empleado}
                </td>
                <td className="truncate px-3 py-1.5 text-metro-text">
                  {employeeName(ausencia.empleado)}
                </td>
                <td className="px-3 py-1.5 text-metro-muted">{ausencia.fecha}</td>
                <td className="px-3 py-1.5 text-metro-muted">{ausencia.tipo}</td>
                <td className="px-3 py-1.5 text-metro-muted">
                  {ausencia.afectaTicket ? 'Sí' : 'No'}
                </td>
                <td className="whitespace-nowrap px-3 py-1.5 text-right">
                  <button
                    className="mr-1 rounded-lg bg-metro-red px-2.5 py-1 text-xs font-semibold text-white hover:bg-metro-dark"
                    onClick={() => onEdit(ausencia)}
                    type="button"
                  >
                    Editar
                  </button>
                  <button
                    className="rounded-lg border border-metro-border px-2.5 py-1 text-xs font-semibold text-metro-text hover:border-metro-red"
                    onClick={() => onRemove(ausencia.id)}
                    type="button"
                  >
                    Borrar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RightsTable({ rights }: { rights: DerechoTicketMes[] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-metro-border">
      <TableHeader count={rights.length} icon="derechos" title="Derechos mensuales" />
      <div className="max-h-[460px] overflow-auto">
        <table className="min-w-[760px] table-fixed text-left text-xs">
          <thead className="sticky top-0 z-10 bg-[#F9FAFB] text-[11px] uppercase tracking-wide text-metro-muted">
            <tr>
              <th className="w-[130px] px-3 py-2">Empleado</th>
              <th className="w-[320px] px-3 py-2">Nombre y apellidos</th>
              <th className="w-[220px] px-3 py-2">Calendario</th>
              <th className="w-[130px] px-3 py-2 text-right">Días ticket mes</th>
              <th className="w-[160px] px-3 py-2 text-right">Ausencias descontadas</th>
              <th className="w-[130px] px-3 py-2 text-right">Tickets finales</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-metro-border bg-white">
            {rights.map((right) => (
              <tr className="hover:bg-red-50/50" key={right.empleado}>
                <td className="truncate px-3 py-1.5 font-semibold text-metro-text">
                  {right.empleado}
                </td>
                <td className="truncate px-3 py-1.5 text-metro-text">{right.nombreApellidos}</td>
                <td className="truncate px-3 py-1.5 text-metro-muted">{right.calendario}</td>
                <td className="px-3 py-1.5 text-right font-semibold text-metro-text">
                  {right.diasTicketMes}
                </td>
                <td className="px-3 py-1.5 text-right font-semibold text-metro-text">
                  {right.ausenciasDescontadas}
                </td>
                <td className="px-3 py-1.5 text-right font-semibold text-metro-text">
                  {right.ticketsFinales}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TableHeader({ count, icon, title }: { count: number; icon: string; title: string }) {
  return (
    <div className="flex items-center justify-between border-b border-metro-border bg-white px-3 py-2">
      <div className="flex items-center gap-2 text-sm font-semibold text-metro-text">
        {icon === 'calendarios' && <CalendarDays size={16} className="text-metro-red" />}
        {icon === 'asignaciones' && <UsersRound size={16} className="text-metro-red" />}
        {icon === 'derechos' && <SlidersHorizontal size={16} className="text-metro-red" />}
        {icon === 'ausencias' && <CalendarDays size={16} className="text-metro-red" />}
        {title}
      </div>
      <span className="rounded-full bg-metro-red/10 px-3 py-1 text-xs font-bold text-metro-dark">
        {count} registros
      </span>
    </div>
  );
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}
