import { useActasStore } from '../features/actas/store/useActasStore';
import { useCommitteeSessionStore } from '../features/comite/store/useCommitteeSessionStore';
import { useConfiguracionStore } from '../features/configuracion/store/useConfiguracionStore';
import { useCriteriosRrllStore } from '../features/criterios-rrll/store/useCriteriosRrllStore';
import { useEspecialesStore } from '../features/especiales/store/useEspecialesStore';
import { useLicenciasSinSueldoStore } from '../features/licencias-sin-sueldo/store/useLicenciasSinSueldoStore';
import { useParitariaSessionStore } from '../features/paritaria/store/useParitariaSessionStore';
import { useEmployeeStore } from '../features/plantilla/store/useEmployeeStore';
import { usePresupuestosStore } from '../features/presupuestos/store/usePresupuestosStore';
import { useSorteosStore } from '../features/sorteos/store/useSorteosStore';
import { useTaskStore } from '../features/tareas/store/useTaskStore';
import { useTeletrabajoStore } from '../features/teletrabajo/store/useTeletrabajoStore';
import { useTicketRestauranteStore } from '../features/ticket-restaurante/store/useTicketRestauranteStore';
import { useVinculogramaStore } from '../features/vinculograma/store/useVinculogramaStore';
import { registerSyncableStore } from './syncableStoreRegistry';

registerSyncableStore({
  id: 'tareas',
  reloadFromStorage: () => useTaskStore.getState().reloadFromStorage(),
});
registerSyncableStore({
  id: 'teletrabajo',
  reloadFromStorage: () => useTeletrabajoStore.getState().reloadFromStorage(),
});
registerSyncableStore({
  id: 'comite-sesiones',
  reloadFromStorage: () => useCommitteeSessionStore.getState().reloadFromStorage(),
});
registerSyncableStore({
  id: 'paritaria-sesiones',
  reloadFromStorage: () => useParitariaSessionStore.getState().reloadFromStorage(),
});
registerSyncableStore({
  id: 'plantilla',
  reloadFromStorage: () => useEmployeeStore.getState().reloadFromStorage(),
});
registerSyncableStore({
  id: 'actas',
  reloadFromStorage: () => useActasStore.getState().reloadFromStorage(),
});
registerSyncableStore({
  id: 'licencias-sin-sueldo',
  reloadFromStorage: () => useLicenciasSinSueldoStore.getState().reloadFromStorage(),
});
registerSyncableStore({
  id: 'ticket-restaurante',
  reloadFromStorage: () => useTicketRestauranteStore.getState().reloadFromStorage(),
});
registerSyncableStore({
  id: 'sorteos',
  reloadFromStorage: () => useSorteosStore.getState().reloadFromStorage(),
});
registerSyncableStore({
  id: 'especiales',
  reloadFromStorage: () => useEspecialesStore.getState().reloadFromStorage(),
});
registerSyncableStore({
  id: 'criterios-rrll',
  reloadFromStorage: () => useCriteriosRrllStore.getState().reloadFromStorage(),
});
registerSyncableStore({
  id: 'vinculograma',
  reloadFromStorage: () => useVinculogramaStore.getState().reloadFromStorage(),
});
registerSyncableStore({
  id: 'configuracion',
  reloadFromStorage: () => useConfiguracionStore.getState().reloadFromStorage(),
});
registerSyncableStore({
  id: 'presupuestos',
  reloadFromStorage: () => usePresupuestosStore.getState().reloadFromStorage(),
});
