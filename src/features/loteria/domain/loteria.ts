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
  empleado: string | null;
  externa: boolean;
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
  numero1: '57.565',
  numero2: '57.977',
  precioDecimo: 20,
  decimosNumero1: 0,
  decimosNumero2: 0,
  lotero: { nombre: 'Gustavo/Adelaida', email: '', telefono: '' },
  loteroEmailSubject: `Lotería de Navidad ${year} - Venta al personal de Metro Bilbao`,
  loteroEmailBody: [
    'Kaixo Gustavo/Adelaida,',
    'Tal como hemos hablado por teléfono, te envío el listado del personal de Metro Bilbao para la retirada de lotería. Los números que tenemos abonados son el {{numero1}} y el {{numero2}}.',
    'Como otros años el procedimiento es el mismo, cada empleado podrá retirar únicamente un décimo de cada número como máximo. El plazo de venta que sea por favor desde el 16 de septiembre al 31 de octubre. Si necesitáis modificar las fechas decidme por favor.',
    'El resto se pondrá a la venta a partir del día 2 de noviembre, los mismos importes que el año pasado.',
    'Si tenéis dudas o alguna aclaración estamos a vuestra disposición en este correo: RELACIONES_LABORALES@metrobilbao.eus (detrás de relaciones hay un guion bajo) en el teléfono 944254020 y 944254000. Podéis preguntar por mí, Joseba Andoni Segura o Paco Domínguez.',
    'No os olvidéis que antes de poner el resto a la venta (2 de noviembre) hay de reservar una parte (con los mismos importes del año pasado, aproximadamente) que la gestionaremos nosotros.',
    'Un cordial saludo.',
  ].join('\n\n'),
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
