import { create } from 'zustand';
import { readStorageItem, writeStorageItem } from '../../../services/persistence';
import { createDefaultLotteryCampaign, type LotteryCampaign, type LotteryRequest } from '../domain/loteria';
import type { ImportedLotteryPerson } from '../domain/importLotteryPeople';

export const LOTTERY_STORAGE_KEY = 'traccion.v1.loteria.campaign';

interface LotteryState {
  campaign: LotteryCampaign;
  load: () => void;
  reloadFromStorage: () => void;
  saveCampaign: (campaign: LotteryCampaign) => Promise<{ ok: boolean; message: string }>;
  importPeople: (people: ImportedLotteryPerson[]) => Promise<{ ok: boolean; message: string }>;
}

function createId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `loteria-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function normalizeCampaign(value: unknown): LotteryCampaign {
  const fallback = createDefaultLotteryCampaign();
  if (!value || typeof value !== 'object') return fallback;
  const candidate = value as Partial<LotteryCampaign>;
  return {
    ...fallback,
    ...candidate,
    lotero: { ...fallback.lotero, ...(candidate.lotero ?? {}) },
    workflow: { ...fallback.workflow, ...(candidate.workflow ?? {}) },
    requests: Array.isArray(candidate.requests) ? candidate.requests : [],
  };
}

function readCampaign(): LotteryCampaign {
  const stored = readStorageItem(LOTTERY_STORAGE_KEY);
  if (!stored) return createDefaultLotteryCampaign();
  try {
    return normalizeCampaign(JSON.parse(stored));
  } catch {
    return createDefaultLotteryCampaign();
  }
}

export const useLoteriaStore = create<LotteryState>((set, get) => ({
  campaign: createDefaultLotteryCampaign(),
  load: () => set({ campaign: readCampaign() }),
  reloadFromStorage: () => set({ campaign: readCampaign() }),
  saveCampaign: async (campaign) => {
    const result = await writeStorageItem(LOTTERY_STORAGE_KEY, JSON.stringify(campaign));
    if (result.ok) set({ campaign });
    return { ok: result.ok, message: result.message };
  },
  importPeople: async (people) => {
    const campaign = get().campaign;
    const now = new Date().toISOString();
    const existingKeys = new Set(campaign.requests.map((request) => `${request.email.trim().toLowerCase()}|${request.nombre.trim().toLowerCase()}`));
    const additions: LotteryRequest[] = people.reduce<LotteryRequest[]>((records, person) => {
      const key = `${person.email.trim().toLowerCase()}|${person.nombre.trim().toLowerCase()}`;
      if (existingKeys.has(key)) return records;
      existingKeys.add(key);
      records.push({
        id: createId(),
        nombre: person.nombre,
        email: person.email,
        telefono: person.telefono,
        decimos: 0,
        pagado: false,
        fechaPago: null,
        formaPago: 'efectivo',
        observaciones: '',
        createdAt: now,
        updatedAt: now,
      });
      return records;
    }, []);
    const next = {
      ...campaign,
      workflow: { ...campaign.workflow, excelImportado: additions.length > 0 || campaign.workflow.excelImportado },
      requests: [...campaign.requests, ...additions],
    };
    const result = await writeStorageItem(LOTTERY_STORAGE_KEY, JSON.stringify(next));
    if (result.ok) set({ campaign: next });
    return { ok: result.ok, message: result.ok ? `Importadas ${additions.length} personas nuevas.` : result.message };
  },
}));
