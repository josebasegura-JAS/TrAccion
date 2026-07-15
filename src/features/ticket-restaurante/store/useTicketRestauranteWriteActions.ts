import { withSharedModuleLocks } from '../../../services/sharedModuleLock';
import type {
  TicketCalendarDraft,
  TicketPersonDraft,
  TicketRestaurantAbsence,
  TicketRestaurantConfig,
} from '../domain/ticketRestaurante';
import type { TicketPeopleImportDraft } from '../domain/importPeople';
import type { TicketManutencionDraft } from '../domain/importManutenciones';
import { useTicketRestauranteStore } from './useTicketRestauranteStore';

const TICKET_RESTAURANTE_LOCK_TARGET = {
  module: 'ticket-restaurante',
  label: 'Ticket Restaurante',
};

/**
 * Envuelve una acción de escritura del store bajo el lock de módulo
 * compartido de Ticket Restaurante (mismo patrón que Sorteos/Especiales) y
 * normaliza cualquier excepción (p.ej. no se ha podido adquirir el lock) al
 * mismo shape `{ ok: false, message }` que ya devuelven las acciones del
 * store en caso de conflicto OCC. Así el componente solo necesita
 * comprobar `result.ok` sin un try/catch propio en cada handler.
 */
async function runGuarded<T extends { ok: boolean; message?: string }>(
  action: () => Promise<T>,
  fallbackMessage: string,
): Promise<T> {
  try {
    return await withSharedModuleLocks([TICKET_RESTAURANTE_LOCK_TARGET], action);
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : fallbackMessage } as T;
  }
}

export type CreateCalendarResult = { ok: true; id: string } | { ok: false; message: string };

/**
 * Acciones de escritura de Ticket Restaurante, ya protegidas con el lock de
 * módulo compartido. `TicketRestaurantePage.tsx` no debe llamar a las
 * acciones del store directamente para nada que escriba — solo a través de
 * este hook, para que ningún handler nuevo se quede sin el lock por
 * descuido.
 */
export function useTicketRestauranteWriteActions() {
  const createCalendar = useTicketRestauranteStore((state) => state.createCalendar);
  const updateCalendar = useTicketRestauranteStore((state) => state.updateCalendar);
  const toggleCalendarActive = useTicketRestauranteStore((state) => state.toggleCalendarActive);
  const removeCalendar = useTicketRestauranteStore((state) => state.removeCalendar);
  const toggleDay = useTicketRestauranteStore((state) => state.toggleDay);
  const saveAbsences = useTicketRestauranteStore((state) => state.saveAbsences);
  const removeAbsence = useTicketRestauranteStore((state) => state.removeAbsence);
  const upsertPerson = useTicketRestauranteStore((state) => state.upsertPerson);
  const removePerson = useTicketRestauranteStore((state) => state.removePerson);
  const updateConfig = useTicketRestauranteStore((state) => state.updateConfig);
  const saveManutenciones = useTicketRestauranteStore((state) => state.saveManutenciones);
  const removeManutencion = useTicketRestauranteStore((state) => state.removeManutencion);
  const importPeople = useTicketRestauranteStore((state) => state.importPeople);

  return {
    createCalendar: async (draft: TicketCalendarDraft): Promise<CreateCalendarResult> => {
      try {
        const id = await withSharedModuleLocks([TICKET_RESTAURANTE_LOCK_TARGET], () =>
          createCalendar(draft),
        );
        return { ok: true, id };
      } catch (error) {
        return {
          ok: false,
          message: error instanceof Error ? error.message : 'No se ha podido crear el calendario.',
        };
      }
    },
    updateCalendar: (id: string, draft: TicketCalendarDraft) =>
      runGuarded(() => updateCalendar(id, draft), 'No se ha podido guardar el calendario.'),
    toggleCalendarActive: (id: string) =>
      runGuarded(() => toggleCalendarActive(id), 'No se ha podido actualizar el calendario.'),
    removeCalendar: (id: string) =>
      runGuarded(() => removeCalendar(id), 'No se ha podido eliminar el calendario.'),
    toggleDay: (calendarId: string, fecha: string) =>
      runGuarded(
        () => toggleDay(calendarId, fecha),
        'No se ha podido actualizar el día del calendario.',
      ),
    saveAbsences: (absences: TicketRestaurantAbsence[]) =>
      runGuarded(() => saveAbsences(absences), 'No se han podido guardar las ausencias.'),
    removeAbsence: (id: string) =>
      runGuarded(() => removeAbsence(id), 'No se ha podido eliminar la ausencia.'),
    upsertPerson: (draft: TicketPersonDraft) =>
      runGuarded(() => upsertPerson(draft), 'No se ha podido guardar la persona.'),
    removePerson: (empleado: string) =>
      runGuarded(() => removePerson(empleado), 'No se ha podido eliminar la persona.'),
    updateConfig: (config: TicketRestaurantConfig) =>
      runGuarded(() => updateConfig(config), 'No se ha podido guardar la configuración.'),
    saveManutenciones: (drafts: TicketManutencionDraft[]) =>
      runGuarded(() => saveManutenciones(drafts), 'No se han podido guardar las manutenciones.'),
    removeManutencion: (id: string) =>
      runGuarded(() => removeManutencion(id), 'No se ha podido eliminar la manutención.'),
    importPeople: (drafts: TicketPeopleImportDraft[]) =>
      runGuarded(
        () => importPeople(drafts),
        'No se han podido importar las personas. Recarga e inténtalo de nuevo.',
      ),
  };
}
