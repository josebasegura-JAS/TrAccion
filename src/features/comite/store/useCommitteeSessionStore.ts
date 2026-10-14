import { createValidatedManagedSessionStore } from '../../../shared/sessions/createValidatedSessionStore';
import { COMITE_SESSION_CONFIG } from '../domain/comite';

export const useCommitteeSessionStore = createValidatedManagedSessionStore(COMITE_SESSION_CONFIG);
