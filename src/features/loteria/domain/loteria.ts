export type LotteryPaymentMethod = 'efectivo' | 'bizum';

export interface LotteryContact {
  nombre: string;
  email: string;
  telefono: string;
}

export interface LotteryWorkflow {
  loteroAvisado: boolean;
  encargoConfirmado: boolean;
  avisoPersonasEnviado: boolean;
  excelImportado: boolean;
  seguimientoIniciado: boolean;
  campanaCerrada: boolean;
}

export interface LotteryRequest {
  id: string;
  nombre: string;
  email: string;
  telefono: string;
  decimos: number;
  pagado: boolean;
  fechaPago: string | null;
  formaPago: LotteryPaymentMethod;
  observaciones: string;
  createdAt: string;
  updatedAt: string;
}

export interface LotteryCampaign {
  year: number;
  numero1: string;
  numero2: string;
  precioDecimo: number;
  decimosEncargados: number;
  lotero: LotteryContact;
  emailSubject: string;
  emailBody: string;
  workflow: LotteryWorkflow;
  requests: LotteryRequest[];
}

export const createDefaultLotteryCampaign = (year = new Date().getFullYear()): LotteryCampaign => ({
  year,
  numero1: '',
  numero2: '',
  precioDecimo: 20,
  decimosEncargados: 0,
  lotero: { nombre: '', email: '', telefono: '' },
  emailSubject: `Lotería de Navidad ${year} - Reserva de décimos`,
  emailBody: `Hola,\n\nYa estamos preparando la Lotería de Navidad ${year}. Si quieres participar, indícanos cuántos décimos deseas.\n\nNúmeros: {{numero1}} y {{numero2}}\nPrecio por décimo: {{precio}} €\n\nGracias.`,
  workflow: {
    loteroAvisado: false,
    encargoConfirmado: false,
    avisoPersonasEnviado: false,
    excelImportado: false,
    seguimientoIniciado: false,
    campanaCerrada: false,
  },
  requests: [],
});

export function lotteryRequestedCount(campaign: LotteryCampaign): number {
  return campaign.requests.reduce((total, request) => total + Math.max(0, request.decimos), 0);
}

export function lotteryAvailableCount(campaign: LotteryCampaign): number {
  return campaign.decimosEncargados - lotteryRequestedCount(campaign);
}

export function lotteryRequestAmount(campaign: LotteryCampaign, request: LotteryRequest): number {
  return request.decimos * campaign.precioDecimo;
}

export function lotteryPaidTotal(campaign: LotteryCampaign): number {
  return campaign.requests.reduce(
    (total, request) => total + (request.pagado ? lotteryRequestAmount(campaign, request) : 0),
    0,
  );
}

export function lotteryCashOnHand(campaign: LotteryCampaign): number {
  return campaign.requests.reduce(
    (total, request) => total + (request.pagado && request.formaPago === 'efectivo' ? lotteryRequestAmount(campaign, request) : 0),
    0,
  );
}

export function lotteryBizumTotal(campaign: LotteryCampaign): number {
  return campaign.requests.reduce(
    (total, request) => total + (request.pagado && request.formaPago === 'bizum' ? lotteryRequestAmount(campaign, request) : 0),
    0,
  );
}
