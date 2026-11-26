import { describe, expect, it } from 'vitest';
import { resolvePackagedEnvironment } from './packagedEnvironment.js';

describe('entorno del portable', () => {
  it('conserva producción por defecto en el EXE oficial y permite pruebas explícitas', () => {
    expect(resolvePackagedEnvironment([], false)).toBe('production');
    expect(resolvePackagedEnvironment(['--traccion-env=test'], false)).toBe('test');
  });
  it('el EXE experimental solo permite pruebas, incluso si se renombra', () => {
    expect(resolvePackagedEnvironment([], true)).toBe('test');
    expect(() => resolvePackagedEnvironment(['--traccion-env=production'], true)).toThrow();
    expect(() => resolvePackagedEnvironment(['--traccion-env=test', '--traccion-env=production'], true)).toThrow();
  });
});
