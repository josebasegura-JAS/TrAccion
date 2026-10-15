import { readJsonStorage } from '../../../services/persistence';
import {
  HUELGAS_RESPONSE_STORAGE_KEY,
  isHuelgaResponseCollections,
  responseHasData,
  type HuelgaResponseCollection,
} from './huelgasResponseCollection';
import { validateHuelgaCollection } from './huelgasResponseValidation';

export function loadHuelgaResultsCollection(huelgaId: string): HuelgaResponseCollection | null {
  const collections = readJsonStorage(HUELGAS_RESPONSE_STORAGE_KEY, {}, isHuelgaResponseCollections);
  return collections[huelgaId] ?? null;
}

export function isHuelgaResultsReady(collection: HuelgaResponseCollection | null): boolean {
  if (!collection) return false;
  const responses = Object.values(collection.responses);
  if (responses.length === 0) return false;
  if (responses.some((response) => !responseHasData(response) || !response.reviewed)) return false;
  return validateHuelgaCollection(responses).every((issue) => issue.severity !== 'error');
}
