/** El entorno es fijo durante la sesión. No generar si Electron no confirma el modo. */
export async function isAutomaticExcelEnabled(): Promise<boolean> {
  const getEnvironment = window.traccion?.getAppEnvironment;
  if (!getEnvironment) return true; // compatibilidad web y clientes anteriores
  try { return await getEnvironment() === 'production'; }
  catch { return false; }
}
