import { readJsonStorage } from '../../../services/persistence';
import {
  HUELGAS_RESPONSE_STORAGE_KEY,
  isHuelgaResponseCollections,
  responseHasData,
  type HuelgaResponseCollection,
} from './huelgasResponseCollection';
import type { Huelga } from './huelgasPageModel';
import { validateHuelgaCollection } from './huelgasResponseValidation';
import type { HuelgaZona } from './huelgasZones';

const INTERNAL_SSGG_ZONE_ID = 'zona-ssgg-interno';

function expectedCollectionZoneIds(huelga: Huelga, zonas: HuelgaZona[]): Set<string> {
  const configured = huelga.circuitosZonaIds?.length
    ? huelga.circuitosZonaIds
    : zonas.filter((zona) => zona.active && zona.correoActivo).map((zona) => zona.id);
  return new Set([...configured, INTERNAL_SSGG_ZONE_ID]);
}

export function loadHuelgaResultsCollection(huelgaId: string): HuelgaResponseCollection | null {
  const collections = readJsonStorage(HUELGAS_RESPONSE_STORAGE_KEY, {}, isHuelgaResponseCollections);
  return collections[huelgaId] ?? null;
}

export function isHuelgaResultsReady(
  collection: HuelgaResponseCollection | null,
  huelga?: Huelga,
  zonas: HuelgaZona[] = [],
): boolean {
  if (!collection) return false;
  const responses = Object.values(collection.responses);
  if (responses.length === 0) return false;

  if (huelga) {
    const expected = expectedCollectionZoneIds(huelga, zonas);
    const persisted = new Set(Object.keys(collection.responses));
    if (expected.size !== persisted.size || [...expected].some((zoneId) => !persisted.has(zoneId))) return false;
  }

  if (responses.some((response) => !responseHasData(response) || !response.reviewed)) return false;
  return validateHuelgaCollection(responses).every((issue) => issue.severity !== 'error');
}
