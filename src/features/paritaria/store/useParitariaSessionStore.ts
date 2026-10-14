import { createValidatedManagedSessionStore } from '../../../shared/sessions/createValidatedSessionStore';
import { PARITARIA_SESSION_CONFIG } from '../domain/paritaria';

export const useParitariaSessionStore = createValidatedManagedSessionStore(PARITARIA_SESSION_CONFIG);
