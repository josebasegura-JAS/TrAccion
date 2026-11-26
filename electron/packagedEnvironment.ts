import { existsSync } from 'node:fs';
import path from 'node:path';
import { parseTraccionEnvironment, type TraccionEnvironment } from './persistence/traccionEnvironment.js';

// Marcador empaquetado en asar; renombrar el EXE no cambia su entorno autorizado.
export function isExperimentalPortable(appPath: string): boolean {
  return existsSync(path.join(appPath, 'dist-electron', 'experimental-portable.marker'));
}

export function resolvePackagedEnvironment(argv: readonly string[], experimental: boolean): TraccionEnvironment {
  if (experimental && !argv.some(arg => arg.startsWith('--traccion-env'))) return 'test';
  const environment = parseTraccionEnvironment(argv);
  if (experimental && environment !== 'test') throw new Error('El portable experimental solo permite el entorno de pruebas.');
  return environment;
}
