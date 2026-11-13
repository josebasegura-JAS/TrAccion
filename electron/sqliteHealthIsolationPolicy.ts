/**
 * La comprobación rutinaria de salud debe evitar que SQLite bloqueante
 * monopolice el proceso principal cuando SMB está ocupado.
 * Solo '0' permite el diagnóstico anterior en main (opt-out explícito).
 * No habilita operaciones de escritura ni cambia la recuperación nativa.
 */
export function shouldUseIsolatedSqliteHealth(setting: string | undefined): boolean {
  return setting !== '0';
}
