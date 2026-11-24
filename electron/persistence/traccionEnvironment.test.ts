import { describe, expect, it } from 'vitest';
import { parseTraccionEnvironment } from './traccionEnvironment.js';

describe('selección de entorno por parámetro antes de SQLite', () => {
  it('sin parámetro conserva producción', () => {
    expect(parseTraccionEnvironment(['Traccion.exe'])).toBe('production');
  });
  it('admite solo producción o pruebas explícitas', () => {
    expect(parseTraccionEnvironment(['Traccion.exe', '--traccion-env=production'])).toBe('production');
    expect(parseTraccionEnvironment(['Traccion.exe', '--traccion-env=test'])).toBe('test');
  });
  it('rechaza selecciones ambiguas o inválidas', () => {
    for (const args of [
      ['--traccion-env=testing'],
      ['--traccion-env'],
      ['--traccion-env=test', '--traccion-env=production'],
      ['--traccion-env=test '],
    ]) expect(() => parseTraccionEnvironment(args)).toThrow('Parámetro de entorno inválido');
  });
  it('no admite dos parámetros de entorno aunque sean idénticos', () => {
    expect(() => parseTraccionEnvironment(['--traccion-env=test', '--traccion-env=test'])).toThrow('Parámetro de entorno inválido');
  });

  it('mantiene el entorno de pruebas con argumentos de actualización y cliente B', () => {
    expect(parseTraccionEnvironment(['Traccion.exe', '--traccion-update-relaunch', '--traccion-env=test', '--traccion-test-user-b'])).toBe('test');
  });

  it('no confunde los argumentos de cliente con la selección de entorno', () => {
    expect(parseTraccionEnvironment(['Traccion.exe', '--traccion-test-user-b'])).toBe('production');
  });
});
