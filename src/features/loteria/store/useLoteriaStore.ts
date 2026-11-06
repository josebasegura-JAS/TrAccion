import type { LotteryCashMovement, LotteryCashSnapshot } from '../domain/arqueos';
import { selectCurrentLotteryCampaignYear } from '../domain/loteriaCampaignYear';
import { create } from 'zustand';
import { readStorageItem, writeStorageItem, writeRendererStorageCache } from '../../../services/persistence';
import { publishDatabaseStatus } from '../../../services/databaseStatus';
import { clearPersistenceBusy, emitPersistenceFeedback, publishPersistenceBusy } from '../../../services/persistenceFeedback';
import {
  createDefaultLotteryCampaign,
  type LotteryCampaign,
  type LotteryRequest,
} from '../domain/loteria';

export const LOTTERY_STORAGE_KEY = 'traccion.v1.loteria.campaign';

interface LotteryState {
  campaign: LotteryCampaign;
  campaignUpdatedAt: string | null;
  requestUpdatedAt: Record<string, string | null>;
  load: () => void;
  reloadFromStorage: () => Promise<void>;
  saveCampaign: (campaign: LotteryCampaign) => Promise<{ ok: boolean; message: string }>;
  startNextCampaign: () => Promise<{ ok: boolean; message: string }>;
}

interface LotteryCampaignArchive {
  version: 2;
  campaigns: Record<string, unknown>;
}

function createId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `loteria-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function toSafeNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeRequest(value: unknown): LotteryRequest | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<LotteryRequest> & {
    decimos?: number;
    telefono?: string;
    observaciones?: string;
  };
  const now = new Date().toISOString();
  const legacyContacto = typeof candidate.telefono === 'string' ? candidate.telefono.trim() : '';
  const contactoObservaciones = typeof candidate.contactoObservaciones === 'string'
    ? candidate.contactoObservaciones
    : legacyContacto;
  const observacionesPago = typeof candidate.observacionesPago === 'string'
    ? candidate.observacionesPago
    : (typeof candidate.observaciones === 'string' ? candidate.observaciones : '');

  return {
    id: typeof candidate.id === 'string' && candidate.id ? candidate.id : createId(),
    nombre: typeof candidate.nombre === 'string' ? candidate.nombre : '',
    email: typeof candidate.email === 'string' ? candidate.email : '',
    empleado: typeof candidate.empleado === 'string' && candidate.empleado.trim() ? candidate.empleado : null,
    externa: typeof candidate.externa === 'boolean' ? candidate.externa : !candidate.empleado,
    contactoObservaciones,
    decimosNumero1: Math.max(0, toSafeNumber(candidate.decimosNumero1, toSafeNumber(candidate.decimos, 0))),
    decimosNumero2: Math.max(0, toSafeNumber(candidate.decimosNumero2, 0)),
    pagado: Boolean(candidate.pagado),
    fechaPago: typeof candidate.fechaPago === 'string' ? candidate.fechaPago : null,
    formaPago: candidate.formaPago === 'bizum' || candidate.formaPago === 'transferencia' ? candidate.formaPago : 'efectivo',
    observacionesPago,
    createdAt: typeof candidate.createdAt === 'string' ? candidate.createdAt : now,
    updatedAt: typeof candidate.updatedAt === 'string' ? candidate.updatedAt : now,
  };
}

type LegacyLotteryWorkflow = Partial<LotteryCampaign['workflow']> & { excelImportado?: boolean };

function normalizeCampaign(value: unknown, fallbackYear = new Date().getFullYear()): LotteryCampaign {
  const fallback = createDefaultLotteryCampaign(fallbackYear);
  if (!value || typeof value !== 'object') return fallback;
  const candidate = value as Omit<Partial<LotteryCampaign>, 'workflow'> & {
    decimosEncargados?: number;
    emailSubject?: string;
    emailBody?: string;
    workflow?: LegacyLotteryWorkflow;
  };

  const requests = Array.isArray(candidate.requests)
    ? candidate.requests.map(normalizeRequest).filter((request): request is LotteryRequest => request !== null)
    : [];
  const storedLoteroBody = typeof candidate.loteroEmailBody === 'string'
    ? candidate.loteroEmailBody
    : (typeof candidate.emailBody === 'string' ? candidate.emailBody : '');
  const hasLegacyLoteroTemplate = storedLoteroBody.trim().startsWith('Hola {{lotero}}')
    || storedLoteroBody.includes('Te confirmamos el encargo de la campaña de Lotería de Navidad');
  const storedLoteroSubject = typeof candidate.loteroEmailSubject === 'string'
    ? candidate.loteroEmailSubject
    : (typeof candidate.emailSubject === 'string' ? candidate.emailSubject : '');
  const hasLegacyLoteroSubject = storedLoteroSubject.startsWith('Encargo Lotería de Navidad');
  const storedWorkflow: LegacyLotteryWorkflow = candidate.workflow ?? {};

  return {
    ...fallback,
    ...candidate,
    year: toSafeNumber(candidate.year, fallback.year),
    precioDecimo: Math.max(0, toSafeNumber(candidate.precioDecimo, fallback.precioDecimo)),
    decimosNumero1: Math.max(0, toSafeNumber(candidate.decimosNumero1, toSafeNumber(candidate.decimosEncargados, fallback.decimosNumero1))),
    decimosNumero2: Math.max(0, toSafeNumber(candidate.decimosNumero2, fallback.decimosNumero2)),
    numero1: typeof candidate.numero1 === 'string' ? candidate.numero1 : fallback.numero1,
    numero2: typeof candidate.numero2 === 'string' ? candidate.numero2 : fallback.numero2,
    lotero: { ...fallback.lotero, ...(candidate.lotero ?? {}) },
    loteroEmailSubject: hasLegacyLoteroSubject || !storedLoteroSubject
      ? fallback.loteroEmailSubject
      : storedLoteroSubject,
    loteroEmailBody: hasLegacyLoteroTemplate || !storedLoteroBody
      ? fallback.loteroEmailBody
      : storedLoteroBody,
    participantesEmailSubject: typeof candidate.participantesEmailSubject === 'string'
      ? candidate.participantesEmailSubject
      : fallback.participantesEmailSubject,
    participantesEmailBody: typeof candidate.participantesEmailBody === 'string'
      ? candidate.participantesEmailBody
      : fallback.participantesEmailBody,
    workflow: {
      ...fallback.workflow,
      ...storedWorkflow,
      seguimientoFinalizado: typeof storedWorkflow.seguimientoFinalizado === 'boolean'
        ? storedWorkflow.seguimientoFinalizado : Boolean(storedWorkflow.campanaCerrada),
      participantesPreparados: typeof storedWorkflow.participantesPreparados === 'boolean'
        ? storedWorkflow.participantesPreparados
        : Boolean(storedWorkflow.excelImportado || requests.length > 0),
    },
    requests,
    cashMovements: Array.isArray(candidate.cashMovements) ? (candidate.cashMovements as LotteryCashMovement[]).filter((m) => typeof m.id === 'string' && typeof m.amount === 'number' && Number.isFinite(m.amount) && typeof m.reason === 'string' && typeof m.at === 'string') : [],
    cashArqueos: Array.isArray(candidate.cashArqueos) ? (candidate.cashArqueos as LotteryCashSnapshot[]).filter((a) => typeof a.id === 'string' && typeof a.counted === 'number' && typeof a.expected === 'number' && typeof a.cashPaid === 'number' && typeof a.movementNet === 'number' && Array.isArray(a.payments) && Array.isArray(a.movements)) : [],
  };
}

function isCampaignArchive(value: unknown): value is LotteryCampaignArchive {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<LotteryCampaignArchive>;
  return candidate.version === 2 && Boolean(candidate.campaigns) && typeof candidate.campaigns === 'object';
}

function readStoredValue(): unknown {
  const stored = readStorageItem(LOTTERY_STORAGE_KEY);
  if (!stored) return null;
  try {
    return JSON.parse(stored);
  } catch {
    return null;
  }
}

function readCampaign(): LotteryCampaign {
  const currentYear = new Date().getFullYear();
  const stored = readStoredValue();
  if (!stored) return createDefaultLotteryCampaign(currentYear);

  if (isCampaignArchive(stored)) {
    const activeYear = selectCurrentLotteryCampaignYear(Object.keys(stored.campaigns), currentYear);
    const activeCampaign = stored.campaigns[String(activeYear)];
    return activeCampaign ? normalizeCampaign(activeCampaign, activeYear) : createDefaultLotteryCampaign(currentYear);
  }

  const legacyCampaign = normalizeCampaign(stored, currentYear);
  return legacyCampaign.year === currentYear ? legacyCampaign : createDefaultLotteryCampaign(currentYear);
}

function buildArchiveWithCampaign(campaign: LotteryCampaign): LotteryCampaignArchive {
  const stored = readStoredValue();
  if (isCampaignArchive(stored)) {
    return {
      version: 2,
      campaigns: {
        ...stored.campaigns,
        [String(campaign.year)]: campaign,
      },
    };
  }

  const campaigns: Record<string, unknown> = {};
  if (stored && typeof stored === 'object') {
    const legacyCampaign = normalizeCampaign(stored);
    campaigns[String(legacyCampaign.year)] = legacyCampaign;
  }
  campaigns[String(campaign.year)] = campaign;
  return { version: 2, campaigns };
}

async function loadCampaignFromSqlite(): Promise<{
  campaign: LotteryCampaign;
  campaignUpdatedAt: string | null;
  requestUpdatedAt: Record<string, string | null>;
} | null> {
  const loadRecords = window.traccion?.loadLoteriaRecords;
  if (!loadRecords) return null;

  const snapshot = await loadRecords();
  publishDatabaseStatus(snapshot.status);
  if (!snapshot.status.ready || snapshot.status.phase !== 'active') return null;

  const currentYear = new Date().getFullYear();
  const selectedYear = selectCurrentLotteryCampaignYear(snapshot.campaigns.map((record) => record.id), currentYear);
  const campaignRecord = snapshot.campaigns.find((record) => record.id === String(selectedYear));
  if (!campaignRecord) {
    return {
      campaign: createDefaultLotteryCampaign(currentYear),
      campaignUpdatedAt: null,
      requestUpdatedAt: {},
    };
  }

  let rawCampaign: unknown;
  try {
    rawCampaign = JSON.parse(campaignRecord.value);
  } catch {
    throw new Error('Lotería: los datos de la campaña en SQLite son ilegibles. No se han sustituido por valores iniciales.');
  }
  if (!rawCampaign || typeof rawCampaign !== 'object' || Array.isArray(rawCampaign)) {
    throw new Error('Lotería: el registro de campaña de SQLite tiene un formato inválido.');
  }
  const currentYearRequests = snapshot.requests.filter((record) => record.campaignYear === selectedYear);
  const requests: LotteryRequest[] = [];
  for (const record of currentYearRequests) {
    let parsed: LotteryRequest | null;
    try {
      parsed = normalizeRequest(JSON.parse(record.value));
    } catch {
      throw new Error(`Lotería: la solicitud ${record.id} no se puede leer. No se ha cargado una lista incompleta.`);
    }
    if (!parsed || parsed.id !== record.id) {
      throw new Error(`Lotería: la solicitud ${record.id} es inválida o su identificador no coincide. No se ha cargado una lista incompleta.`);
    }
    requests.push(parsed);
  }
  const campaign = normalizeCampaign({ ...rawCampaign, requests }, selectedYear);
  return {
    campaign,
    campaignUpdatedAt: campaignRecord.updatedAt,
    requestUpdatedAt: Object.fromEntries(currentYearRequests.map((record) => [record.id, record.updatedAt])),
  };
}

function writeLocalArchiveCache(campaign: LotteryCampaign): void {
  try {
    const archive = buildArchiveWithCampaign(campaign);
    writeRendererStorageCache(LOTTERY_STORAGE_KEY, JSON.stringify(archive), 'sqlite');
  } catch {
    // La caché local es secundaria; SQLite sigue siendo la fuente de verdad.
  }
}

export const useLoteriaStore = create<LotteryState>((set, get) => ({
  campaign: createDefaultLotteryCampaign(),
  campaignUpdatedAt: null,
  requestUpdatedAt: {},
  load: () => {
    set({ campaign: readCampaign() });
    void loadCampaignFromSqlite().then((loaded) => {
      if (loaded) {
        set(loaded);
        writeLocalArchiveCache(loaded.campaign);
      }
    }).catch((error) => {
      emitPersistenceFeedback({ kind: 'error', key: LOTTERY_STORAGE_KEY, updatedAt: new Date().toISOString(), message: error instanceof Error ? error.message : 'No se ha podido cargar Lotería desde SQLite.' });
    });
  },
  reloadFromStorage: async () => {
    try {
      const loaded = await loadCampaignFromSqlite();
      if (loaded) {
        set(loaded);
        writeLocalArchiveCache(loaded.campaign);
      } else {
        set({ campaign: readCampaign(), campaignUpdatedAt: null, requestUpdatedAt: {} });
      }
    } catch (error) {
      // Conservar los datos anteriores y propagar el fallo: la sincronización
      // no puede marcar el token como aplicado si la lectura SQLite falló.
      emitPersistenceFeedback({ kind: 'error', key: LOTTERY_STORAGE_KEY, updatedAt: new Date().toISOString(), message: error instanceof Error ? error.message : 'No se ha podido actualizar Lotería desde SQLite.' });
      throw error;
    }
  },
  startNextCampaign: async () => {
    const previous = get().campaign;
    if (!previous.workflow.campanaCerrada) {
      return { ok: false, message: 'Primero debes cerrar y guardar la campaña actual.' };
    }
    const nextYear = previous.year + 1;
    if (!Number.isInteger(nextYear) || nextYear > new Date().getFullYear() + 1) {
      return { ok: false, message: 'Solo puedes abrir la campaña del año siguiente.' };
    }

    const loadRecords = window.traccion?.loadLoteriaRecords;
    const saveSnapshot = window.traccion?.saveLoteriaSnapshotIfUnchanged;
    if (!loadRecords || !saveSnapshot) {
      return { ok: false, message: 'La apertura de una campaña nueva necesita SQLite compartida en TrAcción de escritorio.' };
    }
    try {
      const snapshot = await loadRecords();
      publishDatabaseStatus(snapshot.status);
      if (!snapshot.status.ready || snapshot.status.phase !== 'active') {
        return { ok: false, message: 'SQLite no está disponible para abrir la nueva campaña.' };
      }
      const existing = snapshot.campaigns.find((record) => record.id === String(nextYear));
      if (existing) {
        return { ok: false, message: `La campaña ${nextYear} ya existe. No se ha sobrescrito ningún dato.` };
      }
      const current = snapshot.campaigns.find((record) => record.id === String(previous.year));
      if (!current) {
        return { ok: false, message: 'La campaña actual debe estar guardada antes de abrir otra.' };
      }
      let currentData: { workflow?: { campanaCerrada?: boolean } };
      try {
        currentData = JSON.parse(current.value) as typeof currentData;
      } catch {
        return { ok: false, message: 'No se puede verificar el cierre de la campaña actual.' };
      }
      if (!currentData.workflow?.campanaCerrada) {
        return { ok: false, message: 'La campaña compartida todavía no está cerrada. Recarga antes de continuar.' };
      }

      const next = createDefaultLotteryCampaign(nextYear);
      // La inserción OCC con expectativa null impide reemplazar otra campaña
      // creada simultáneamente por el segundo equipo.
      publishPersistenceBusy(LOTTERY_STORAGE_KEY, 'Abriendo nueva campaña de Lotería…');
      const result = await saveSnapshot({
        year: nextYear,
        campaignValue: JSON.stringify({ ...next, requests: [] }),
        requests: [],
        expectedCampaignUpdatedAt: null,
        expectedRequestUpdatedAt: {},
      });
      publishDatabaseStatus(result.status);
      if (!result.ok) {
        emitPersistenceFeedback({ kind: 'error', key: LOTTERY_STORAGE_KEY, updatedAt: new Date().toISOString(), message: result.message });
        return { ok: false, message: result.message };
      }
      clearPersistenceBusy(LOTTERY_STORAGE_KEY, 'Nueva campaña de Lotería creada.');
      set({
        campaign: next,
        campaignUpdatedAt: result.campaignUpdatedAt,
        requestUpdatedAt: {},
      });
      writeLocalArchiveCache(next);
      return { ok: true, message: `Campaña ${nextYear} abierta. El histórico de ${previous.year} se conserva.` };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se ha podido abrir la nueva campaña.';
      emitPersistenceFeedback({ kind: 'error', key: LOTTERY_STORAGE_KEY, updatedAt: new Date().toISOString(), message });
      return { ok: false, message };
    }
  },
  saveCampaign: async (campaign) => {
    const saveSnapshot = window.traccion?.saveLoteriaSnapshotIfUnchanged;
    if (saveSnapshot) {
      const campaignWithoutRequests = { ...campaign, requests: [] };
      publishPersistenceBusy(LOTTERY_STORAGE_KEY, 'Guardando campaña de Lotería en SQLite…');
      let result;
      try {
        result = await saveSnapshot({
          year: campaign.year,
          campaignValue: JSON.stringify(campaignWithoutRequests),
          requests: campaign.requests.map((request) => ({ id: request.id, value: JSON.stringify(request) })),
          expectedCampaignUpdatedAt: get().campaignUpdatedAt,
          expectedRequestUpdatedAt: get().requestUpdatedAt,
        });
      } catch (error) {
        emitPersistenceFeedback({ kind: 'error', updatedAt: new Date().toISOString(), key: LOTTERY_STORAGE_KEY, message: error instanceof Error ? error.message : 'No se ha podido guardar la campaña de Lotería.' });
        throw error;
      }
      publishDatabaseStatus(result.status);
      if (result.ok) {
        clearPersistenceBusy(LOTTERY_STORAGE_KEY, 'Campaña de Lotería guardada en SQLite.');
        set({
          campaign,
          campaignUpdatedAt: result.campaignUpdatedAt,
          requestUpdatedAt: result.requestUpdatedAt,
        });
        writeLocalArchiveCache(campaign);
      } else {
        emitPersistenceFeedback({ kind: 'error', updatedAt: new Date().toISOString(), key: LOTTERY_STORAGE_KEY, message: result.message || 'No se ha podido guardar la campaña de Lotería.' });
      }
      return { ok: result.ok, message: result.message };
    }

    // Compatibilidad fuera de Electron / antes de la migración de IPC.
    const archive = buildArchiveWithCampaign(campaign);
    const result = await writeStorageItem(LOTTERY_STORAGE_KEY, JSON.stringify(archive));
    if (result.ok) set({ campaign, campaignUpdatedAt: null, requestUpdatedAt: {} });
    return { ok: result.ok, message: result.message };
  },
}));
