import { createManagedSessionStore } from '../../../shared/sessions/createSessionStore';
import { PARITARIA_SESSION_CONFIG } from '../domain/paritaria';

export const useParitariaSessionStore = createManagedSessionStore(PARITARIA_SESSION_CONFIG);
