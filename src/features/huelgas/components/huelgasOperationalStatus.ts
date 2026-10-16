import type { HuelgaResponseCollection, HuelgaZoneResponse } from './huelgasResponseCollection';
import { responseHasData } from './huelgasResponseCollection';
import { validateHuelgaCollection, validateHuelgaZoneResponse } from './huelgasResponseValidation';

const INTERNAL_SSGG_ZONE_ID = 'zona-ssgg-interno';

export type HuelgaCollectionProgress = {
  total: number;
  received: number;
  reviewed: number;
};

export type HuelgaOperationalState =
  | 'preparacion'
  | 'recogida'
  | 'incidencias'
  | 'revision'
  | 'validada';

export type HuelgaOperationalStatus = HuelgaCollectionProgress & {
  state: HuelgaOperationalState;
  label: string;
  errors: number;
  warnings: number;
};

function selectedResponses(
  collection: HuelgaResponseCollection | null,
  selectedZoneIds: string[],
): HuelgaZoneResponse[] {
  if (!collection) return [];
  const selected = new Set([...selectedZoneIds, INTERNAL_SSGG_ZONE_ID]);
  return Object.values(collection.responses).filter((response) => selected.has(response.zonaId));
}

export function deriveHuelgaOperationalStatus(
  progress: HuelgaCollectionProgress,
  collection: HuelgaResponseCollection | null,
  selectedZoneIds: string[],
): HuelgaOperationalStatus {
  const responses = selectedResponses(collection, selectedZoneIds);
  const responsesWithData = responses.filter(responseHasData);
  const zoneIssues = responsesWithData.flatMap(validateHuelgaZoneResponse);
  const globalIssues = validateHuelgaCollection(responses).filter((issue) => !issue.zonaId);
  const issues = [...zoneIssues, ...globalIssues];
  const errors = issues.filter((issue) => issue.severity === 'error').length;
  const warnings = issues.filter((issue) => issue.severity === 'warning').length;

  if (errors > 0) {
    return { ...progress, state: 'incidencias', label: 'Con incidencias', errors, warnings };
  }
  if (progress.total === 0 || progress.received === 0) {
    return { ...progress, state: 'preparacion', label: 'Preparación', errors, warnings };
  }
  if (progress.received < progress.total) {
    return { ...progress, state: 'recogida', label: 'En recogida', errors, warnings };
  }
  if (progress.reviewed < progress.total) {
    return { ...progress, state: 'revision', label: 'Pendiente de revisión', errors, warnings };
  }
  return { ...progress, state: 'validada', label: 'Validada', errors, warnings };
}
