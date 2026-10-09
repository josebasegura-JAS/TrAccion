import {
  DEFAULT_HUELGA_MAIL_BODY,
  DEFAULT_HUELGA_MAIL_SUBJECT,
  defaultDeadlineForZone,
} from './huelgasMailTemplates';

export type HuelgaZona = {
  id: string;
  nombre: string;
  responsableNombre: string;
  responsableEmail: string;
  correoCc: string;
  correoActivo: boolean;
  correoAsunto: string;
  correoCuerpoHtml: string;
  correoPlazos: string;
  correoInstruccionesHabituales: string;
  plantillaExcelNombrePatron: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export const DEFAULT_HUELGA_ZONE_NAMES = ['MM Ariz','MM Sopela','GMO y Línea','Instalaciones','OACs','PMC','Jefatura de Operaciones'] as const;

const DEFAULT_ZONE_CONFIG: Record<string, Partial<HuelgaZona>> = {
  'mm ariz': { responsableNombre: 'Izaskun Lindosa · Josu Goicoechea · Aitor Alvarez · José Antonio Fernández', responsableEmail: 'ilindosa@metrobilbao.eus; jgoicoechea@metrobilbao.eus; aalvarezv@metrobilbao.eus; jafernandez@metrobilbao.eus', plantillaExcelNombrePatron: 'MM Ariz - Seguimiento huelga {{FECHA_HUELGA_ARCHIVO}}.xlsx', correoInstruccionesHabituales: 'Supervisores y Técnicos de Mantenimiento de noche y jornada continuada de Ariz. Incluye las excepciones de adscripción que correspondan en las instrucciones específicas de cada convocatoria.' },
  'mm sopela': { responsableNombre: 'Laura Asorey · Ibon Garrido · Unai Uliarte · José Antonio Fernández · Irene Yabar', responsableEmail: 'lasorey@metrobilbao.eus; igarrido@metrobilbao.eus; uuliarte@metrobilbao.eus; jafernandez@metrobilbao.eus; ybalenciaga@metrobilbao.eus', plantillaExcelNombrePatron: 'MM Sopela - Seguimiento huelga {{FECHA_HUELGA_ARCHIVO}}.xlsx', correoInstruccionesHabituales: 'Supervisores y Técnicos de Mantenimiento de noche y jornada partida de Sopela, almacén y personal administrativo. El personal que pertenezca a otro colectivo pero esté ejerciendo en Material Móvil se contabilizará como Material Móvil.' },
  'gmo y linea': { responsableNombre: 'Arkaitz Zenarrutzabeitia', responsableEmail: 'azenarruzabeitia@metrobilbao.eus', plantillaExcelNombrePatron: 'Línea y GMO - Seguimiento huelga {{FECHA_HUELGA_ARCHIVO}}.xlsx', correoInstruccionesHabituales: 'Personal de GMO y Línea: Maquinistas de Tracción Eléctrica, personal USI/SPVE en funciones de Maquinista, Supervisión y Auxiliares de Estaciones y USI. El personal que esté realizando funciones en otro colectivo se contabilizará en el colectivo de las funciones que realice ese día.' },
  instalaciones: { responsableNombre: 'Responsables de Instalaciones', responsableEmail: 'ebardeci@metrobilbao.eus; jfgarcia@metrobilbao.eus; iloizaga@metrobilbao.eus; cflarrea@metrobilbao.eus; iarsuaga@metrobilbao.eus; fjrodriguezm@metrobilbao.eus; ipinero@metrobilbao.eus', plantillaExcelNombrePatron: 'Instalaciones - Seguimiento huelga {{FECHA_HUELGA_ARCHIVO}}.xlsx', correoInstruccionesHabituales: 'Supervisores y Técnicos de Vía; Supervisores y Técnicos de Catenaria; Supervisores de Instalaciones Eléctricas y Personal Técnico SCC; Personal Técnico EEM; Jefaturas de Mantenimiento e Ingeniería de Instalaciones.' },
  oacs: { responsableNombre: 'Ana Isabel López Martínez', responsableEmail: 'ailopez@metrobilbao.eus', plantillaExcelNombrePatron: 'OAC - Seguimiento huelga {{FECHA_HUELGA_ARCHIVO}}.xlsx', correoInstruccionesHabituales: 'Personal de OACs. El personal que pertenezca a otro colectivo pero esté realizando funciones en OACs se contabilizará en el colectivo de las funciones que realice ese día.' },
  pmc: { responsableNombre: 'Arkaitz Zenarrutzabeitia · Aimar Ayarza', responsableEmail: 'azenarruzabeitia@metrobilbao.eus; aayarza@metrobilbao.eus', plantillaExcelNombrePatron: 'PMC-Seguimiento huelga {{FECHA_HUELGA_ARCHIVO}}.xlsx', correoInstruccionesHabituales: 'Personal PMC: Supervisores de PMC, Operadores de Tráfico/Energía y Operadores de Instalaciones y Comunicaciones. El personal que esté realizando funciones en otro colectivo se contabilizará en el colectivo de las funciones que realice ese día.' },
  'jefatura de operaciones': { responsableNombre: 'Jesús María Ulecia · P. Sánchez', responsableEmail: 'jmulecia@metrobilbao.eus; psanchez@metrobilbao.eus', plantillaExcelNombrePatron: 'Jefatura de operaciones y otros - Seguimiento huelga {{FECHA_HUELGA_ARCHIVO}}.xlsx', correoInstruccionesHabituales: 'Personal de San Ignazio: Jefaturas de Operaciones, auxiliares de línea, personal administrativo, auxiliares y personal de formación.' },
};

function normalize(value: string): string { return value.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim(); }
function normalizeKey(value: string): string { return normalize(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-ES'); }
function defaultId(name: string): string { return `zona-${normalizeKey(name).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`; }
export function createZonaId(): string { return `zona-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`; }

export function isHuelgaZona(value: unknown): value is HuelgaZona {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<HuelgaZona>;
  return typeof candidate.id === 'string' && typeof candidate.nombre === 'string' && typeof candidate.responsableNombre === 'string' && typeof candidate.responsableEmail === 'string' && (typeof candidate.correoCc === 'undefined' || typeof candidate.correoCc === 'string') && (typeof candidate.correoActivo === 'undefined' || typeof candidate.correoActivo === 'boolean') && (typeof candidate.correoAsunto === 'undefined' || typeof candidate.correoAsunto === 'string') && (typeof candidate.correoCuerpoHtml === 'undefined' || typeof candidate.correoCuerpoHtml === 'string') && (typeof candidate.correoPlazos === 'undefined' || typeof candidate.correoPlazos === 'string') && (typeof candidate.correoInstruccionesHabituales === 'undefined' || typeof candidate.correoInstruccionesHabituales === 'string') && (typeof candidate.plantillaExcelNombrePatron === 'undefined' || typeof candidate.plantillaExcelNombrePatron === 'string') && typeof candidate.active === 'boolean' && typeof candidate.createdAt === 'string' && typeof candidate.updatedAt === 'string';
}
export function isHuelgaZonas(value: unknown): value is HuelgaZona[] { return Array.isArray(value) && value.every(isHuelgaZona); }
function isLegacyAssignmentMailBody(value: string): boolean { return value.includes('{{COLECTIVOS}}') && value.includes('{{TOTAL_PERSONAS}}') && /Los datos solicitados corresponden/i.test(value); }
function hydrateMailFields(zona: HuelgaZona): HuelgaZona {
  const key = normalizeKey(zona.nombre);
  const defaults = DEFAULT_ZONE_CONFIG[key] ?? {};
  const canonicalName = DEFAULT_HUELGA_ZONE_NAMES.find((name) => normalizeKey(name) === key) ?? normalize(zona.nombre);
  return {
    ...zona,
    nombre: canonicalName,
    responsableNombre: normalize(zona.responsableNombre) || defaults.responsableNombre || '',
    responsableEmail: normalize(zona.responsableEmail) || defaults.responsableEmail || '',
    correoCc: normalize(zona.correoCc || '') || 'RELACIONES_LABORALES@metrobilbao.eus',
    correoActivo: true,
    correoAsunto: normalize(zona.correoAsunto || '') || DEFAULT_HUELGA_MAIL_SUBJECT,
    correoCuerpoHtml: !normalize(zona.correoCuerpoHtml || '') || isLegacyAssignmentMailBody(zona.correoCuerpoHtml) ? DEFAULT_HUELGA_MAIL_BODY : zona.correoCuerpoHtml,
    correoPlazos: normalize(zona.correoPlazos || '') || defaultDeadlineForZone(zona.nombre),
    correoInstruccionesHabituales: normalize(zona.correoInstruccionesHabituales || '') || defaults.correoInstruccionesHabituales || '',
    plantillaExcelNombrePatron: normalize(zona.plantillaExcelNombrePatron || '') || defaults.plantillaExcelNombrePatron || `${zona.nombre} - Seguimiento huelga {{FECHA_HUELGA_ARCHIVO}}.xlsx`,
    active: true,
  };
}

export function ensureDefaultZonas(current: HuelgaZona[]): HuelgaZona[] {
  const now = new Date().toISOString();
  const allowedNames = new Set(DEFAULT_HUELGA_ZONE_NAMES.map((name) => normalizeKey(name)));
  const hydratedCurrent = current.filter((zona) => allowedNames.has(normalizeKey(zona.nombre))).map(hydrateMailFields);
  const existingNames = new Set(hydratedCurrent.map((zona) => normalizeKey(zona.nombre)));
  const missingDefaults = DEFAULT_HUELGA_ZONE_NAMES.filter((nombre) => !existingNames.has(normalizeKey(nombre))).map((nombre) => hydrateMailFields({ id: defaultId(nombre), nombre, responsableNombre: '', responsableEmail: '', correoCc: 'RELACIONES_LABORALES@metrobilbao.eus', correoActivo: true, correoAsunto: DEFAULT_HUELGA_MAIL_SUBJECT, correoCuerpoHtml: DEFAULT_HUELGA_MAIL_BODY, correoPlazos: defaultDeadlineForZone(nombre), correoInstruccionesHabituales: '', plantillaExcelNombrePatron: '', active: true, createdAt: now, updatedAt: now }));
  return [...hydratedCurrent, ...missingDefaults].sort((a, b) => DEFAULT_HUELGA_ZONE_NAMES.indexOf(a.nombre as (typeof DEFAULT_HUELGA_ZONE_NAMES)[number]) - DEFAULT_HUELGA_ZONE_NAMES.indexOf(b.nombre as (typeof DEFAULT_HUELGA_ZONE_NAMES)[number]));
}
export function isZonaCompleta(zona: HuelgaZona): boolean { return Boolean(zona.active && zona.correoActivo && normalize(zona.responsableNombre) && normalize(zona.responsableEmail) && normalize(zona.correoAsunto) && normalize(zona.correoCuerpoHtml)); }
