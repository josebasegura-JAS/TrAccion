/**
 * La selección de entorno se fija por argumentos ANTES de cualquier conexión
 * SQLite. Sin parámetro se conserva la conducta histórica: producción.
 *
 * No se emplean variables de entorno ni configuración guardada para decidir
 * qué base está autorizada a abrirse.
 */
export type TraccionEnvironment = 'production' | 'test';

export function parseTraccionEnvironment(argv: readonly string[]): TraccionEnvironment {
  const flags = argv.filter((arg) => arg.startsWith('--traccion-env'));
  if (flags.length === 0) return 'production';
  if (flags.length !== 1 || !/^--traccion-env=(production|test)$/.test(flags[0])) {
    throw new Error('Parámetro de entorno inválido. Usa --traccion-env=production o --traccion-env=test.');
  }
  return flags[0].endsWith('=test') ? 'test' : 'production';
}

export function getTraccionEnvironment(): TraccionEnvironment {
  return parseTraccionEnvironment(process.argv);
}
