import { create } from 'zustand';
import { readStorageItem, writeStorageItem } from '../../../services/persistence';
import {
  createDefaultLotteryCampaign,
  type LotteryCampaign,
  type LotteryRequest,
} from '../domain/loteria';

export const LOTTERY_STORAGE_KEY = 'traccion.v1.loteria.campaign';

interface LotteryState {
  campaign: LotteryCampaign;
  load: () => void;
  reloadFromStorage: () => void;
  saveCampaign: (campaign: LotteryCampaign) => Promise<{ ok: boolean; message: string }>;
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
    formaPago: candidate.formaPago === 'bizum' ? 'bizum' : 'efectivo',
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
      participantesPreparados: typeof storedWorkflow.participantesPreparados === 'boolean'
        ? storedWorkflow.participantesPreparados
        : Boolean(storedWorkflow.excelImportado || requests.length > 0),
    },
    requests,
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
    const currentCampaign = stored.campaigns[String(currentYear)];
    return currentCampaign ? normalizeCampaign(currentCampaign, currentYear) : createDefaultLotteryCampaign(currentYear);
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

export const useLoteriaStore = create<LotteryState>((set) => ({
  campaign: createDefaultLotteryCampaign(),
  load: () => set({ campaign: readCampaign() }),
  reloadFromStorage: () => set({ campaign: readCampaign() }),
  saveCampaign: async (campaign) => {
    const archive = buildArchiveWithCampaign(campaign);
    const result = await writeStorageItem(LOTTERY_STORAGE_KEY, JSON.stringify(archive));
    if (result.ok) set({ campaign });
    return { ok: result.ok, message: result.message };
  },
}));
