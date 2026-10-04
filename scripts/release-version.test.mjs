import { describe, expect, it } from 'vitest';
import {
  getPortableArtifactName,
  getReleaseLine,
  getUpdatePackageName,
  parseTechnicalVersion,
} from './release-version.mjs';

describe('release-version', () => {
  it('deriva la línea MAJOR.MINOR desde la versión técnica', () => {
    expect(getReleaseLine('1.2.148')).toBe('1.2');
    expect(getReleaseLine('1.3.0')).toBe('1.3');
    expect(getReleaseLine('2.0.7')).toBe('2.0');
  });

  it('genera nombres estables por rama para exe y piz', () => {
    expect(getPortableArtifactName('1.2.148')).toBe('Traccion 1.2.exe');
    expect(getPortableArtifactName('1.3.0')).toBe('Traccion 1.3.exe');
    expect(getPortableArtifactName('2.0.7')).toBe('Traccion 2.0.exe');
    expect(getUpdatePackageName('1.3.42')).toBe('Traccion 1.3.piz');
    expect(getUpdatePackageName('2.0.1')).toBe('Traccion 2.0.piz');
  });

  it('rechaza versiones incompletas o ambiguas', () => {
    expect(() => parseTechnicalVersion('1.2')).toThrow(/MAJOR\.MINOR\.PATCH/);
    expect(() => parseTechnicalVersion('1.2.beta')).toThrow(/MAJOR\.MINOR\.PATCH/);
  });
});
