import type { HuelgaResultMetrics } from './huelgasResults';

export const HUELGA_SEGMENT_COLORS = {
  trabajan: '#3299ff',
  serviciosMinimos: '#f5a623',
  huelga: '#f43f4f',
} as const;

export type HuelgaSegment = {
  key: keyof typeof HUELGA_SEGMENT_COLORS;
  label: string;
  value: number;
  percentage: number;
  color: string;
};

export function huelgaDistribution(metrics: HuelgaResultMetrics): HuelgaSegment[] {
  const total = metrics.personasTurno;
  return ([
    ['trabajan', 'Trabajan', metrics.personasTrabajan],
    ['serviciosMinimos', 'SS.MM.', metrics.serviciosMinimos],
    ['huelga', 'Huelga', metrics.personasHuelga],
  ] as const).map(([key, label, value]) => ({
    key, label, value,
    percentage: total > 0 ? (value / total) * 100 : 0,
    color: HUELGA_SEGMENT_COLORS[key],
  }));
}

export function huelgaDonutSvg(metrics: HuelgaResultMetrics): string {
  const parts = huelgaDistribution(metrics);
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  const circles = parts.map((segment) => {
    const length = circumference * segment.percentage / 100;
    const circle = length > 0
      ? `<circle cx="60" cy="60" r="${radius}" fill="none" stroke="${segment.color}" stroke-width="18" stroke-dasharray="${length} ${circumference - length}" stroke-dashoffset="${-offset}" />`
      : '';
    offset += length;
    return circle;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" role="img" aria-label="Distribución: ${parts.map((item) => `${item.label}: ${item.value}`).join(', ')}"><g transform="rotate(-90 60 60)"><circle cx="60" cy="60" r="${radius}" fill="none" stroke="#374151" stroke-width="18"/>${circles}</g><text x="60" y="57" text-anchor="middle" font-size="18" font-weight="700" fill="currentColor">${metrics.personasTurno}</text><text x="60" y="71" text-anchor="middle" font-size="9" fill="currentColor">con turno</text></svg>`;
}

export function huelgaFormatPercent(value: number): string {
  return `${value.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;
}
