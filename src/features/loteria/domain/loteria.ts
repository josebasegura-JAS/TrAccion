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
  decimosNumero1: number;
  decimosNumero2: number;
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
  decimosNumero1: number;
  decimosNumero2: number;
  lotero: LotteryContact;
  loteroEmailSubject: string;
  loteroEmailBody: string;
  participantesEmailSubject: string;
  participantesEmailBody: string;
  workflow: LotteryWorkflow;
  requests: LotteryRequest[];
}

export const createDefaultLotteryCampaign = (year = new Date().getFullYear()): LotteryCampaign => ({
  year,
  numero1: '',
  numero2: '',
  precioDecimo: 20,
  decimosNumero1: 0,
  decimosNumero2: 0,
  lotero: { nombre: '', email: '', telefono: '' },
  loteroEmailSubject: `Encargo Lotería de Navidad ${year}`,
  loteroEmailBody: [
    'Hola {{lotero}},',
    '',
    'Te confirmamos el encargo de la campaña de Lotería de Navidad {{year}}:',
    '- Número {{numero1}}: {{decimos_numero1}} décimos',
    '- Número {{numero2}}: {{decimos_numero2}} décimos',
    '- Precio por décimo: {{precio}} €',
    '',
    'Quedamos pendientes de tu confirmación.',
    '',
    'Gracias.',
  ].join('\n'),
  participantesEmailSubject: `Lotería de Navidad ${year} - Reserva de décimos`,
  participantesEmailBody: [
    'Hola,',
    '',
    'Ya estamos preparando la Lotería de Navidad {{year}}.',
    'Si quieres participar, indícanos cuántos décimos deseas de cada número.',
    '',
    'Número {{numero1}}',
    'Número {{numero2}}',
    'Precio por décimo: {{precio}} €',
    '',
    'Gracias.',
  ].join('\n'),
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

export function lotteryRequestTotalCount(request: LotteryRequest): number {
  return Math.max(0, request.decimosNumero1) + Math.max(0, request.decimosNumero2);
}

export function lotteryOrderedCount(campaign: LotteryCampaign): number {
  return Math.max(0, campaign.decimosNumero1) + Math.max(0, campaign.decimosNumero2);
}

export function lotteryRequestedCountByNumber(campaign: LotteryCampaign, numberIndex: 1 | 2): number {
  const field = numberIndex === 1 ? 'decimosNumero1' : 'decimosNumero2';
  return campaign.requests.reduce((total, request) => total + Math.max(0, request[field]), 0);
}

export function lotteryRequestedCount(campaign: LotteryCampaign): number {
  return campaign.requests.reduce((total, request) => total + lotteryRequestTotalCount(request), 0);
}

export function lotteryAvailableCountByNumber(campaign: LotteryCampaign, numberIndex: 1 | 2): number {
  return (numberIndex === 1 ? campaign.decimosNumero1 : campaign.decimosNumero2) - lotteryRequestedCountByNumber(campaign, numberIndex);
}

export function lotteryAvailableCount(campaign: LotteryCampaign): number {
  return lotteryOrderedCount(campaign) - lotteryRequestedCount(campaign);
}

export function lotteryRequestAmount(campaign: LotteryCampaign, request: LotteryRequest): number {
  return lotteryRequestTotalCount(request) * campaign.precioDecimo;
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

export function lotteryPendingPaymentAmount(campaign: LotteryCampaign): number {
  return campaign.requests.reduce(
    (total, request) => total + (!request.pagado ? lotteryRequestAmount(campaign, request) : 0),
    0,
  );
}
