/**
 * Permite únicamente volver a navegar al documento de TrAcción.
 * No basta con autorizar todo file: (archivos locales arbitrarios) ni con
 * startsWith(devServerUrl), que aceptaría hosts de prefijo parecido.
 *
 * Se ignora el hash para permitir anclas dentro de la propia SPA.
 */
export function isAllowedAppNavigation(requested: string, trustedDocument: string): boolean {
  try {
    const next = new URL(requested);
    const trusted = new URL(trustedDocument);
    return next.protocol === trusted.protocol &&
      next.origin === trusted.origin &&
      next.pathname === trusted.pathname &&
      next.search === trusted.search &&
      (trusted.protocol === 'file:' || trusted.protocol === 'http:' || trusted.protocol === 'https:');
  } catch {
    return false;
  }
}
