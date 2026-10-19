import { describe, expect, it } from 'vitest';
import { huelgaDistribution, huelgaDonutSvg } from './huelgaDonut';
import type { HuelgaResultMetrics } from './huelgasResults';

const metrics: HuelgaResultMetrics = {
  personasTurno: 523, personasComputables: 523,
  personasTrabajan: 360, serviciosMinimos: 105, personasHuelga: 58,
  seguimiento: (58 / 523) * 100,
};

describe('Huelgas — gráficos SVG de resultados e impresión', () => {
  it('distribuye los 523 efectivos en tres categorías excluyentes', () => {
    const segments = huelgaDistribution(metrics);
    expect(segments.map((item) => item.value)).toEqual([360, 105, 58]);
    expect(segments.reduce((sum, item) => sum + item.percentage, 0)).toBeCloseTo(100, 8);
  });

  it('genera SVG autónomo imprimible, con valores numéricos y colores', () => {
    const svg = huelgaDonutSvg(metrics);
    expect(svg).toContain('<svg');
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('523');
    expect(svg).toContain('stroke="#3299ff"');
    expect(svg).toContain('stroke="#f5a623"');
    expect(svg).toContain('stroke="#f43f4f"');
    expect(svg).not.toContain('<canvas');
  });

  it('maneja periodos sin personas sin divisiones por cero', () => {
    const empty = { ...metrics, personasTurno: 0, personasTrabajan: 0, personasHuelga: 0, serviciosMinimos: 0 };
    expect(huelgaDistribution(empty).every((segment) => segment.percentage === 0)).toBe(true);
    expect(huelgaDonutSvg(empty)).not.toContain('NaN');
  });
});
