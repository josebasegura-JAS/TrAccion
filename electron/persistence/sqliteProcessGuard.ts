/** La selección experimental nunca permite abrir SQLite desde Electron main.
 * Los procesos auxiliares y el modo histórico conservan sus permisos.
 */
export function assertSqliteProcessAccess(): void {
  if (process.env.TRACCION_SQLITE_ENGINE_EXPERIMENT === '1' && !process.parentPort) {
    throw new Error('Acceso SQLite directo prohibido: el propietario es el motor aislado.');
  }
}
