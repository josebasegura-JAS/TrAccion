import { createManagedSessionStore } from '../../../shared/sessions/createSessionStore';
import { COMITE_SESSION_CONFIG } from '../domain/comite';

export const useCommitteeSessionStore = createManagedSessionStore(COMITE_SESSION_CONFIG);
