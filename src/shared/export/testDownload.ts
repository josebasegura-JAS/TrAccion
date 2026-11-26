/** No recurrir a Chromium si falla el guardado en PRUEBAS. */
export async function saveTestDownloadIfNeeded(blob: Blob, filename: string): Promise<boolean> {
  const api = window.traccion;
  if (!api?.getAppEnvironment) return false;
  const environment = await api.getAppEnvironment();
  if (environment !== 'test') return false;
  if (!api.saveTestExport) throw new Error('Exportación de PRUEBAS no disponible.');
  const result = await api.saveTestExport(await blob.arrayBuffer(), filename);
  if (!result.ok) throw new Error(result.message ?? 'No se pudo guardar en PRUEBAS.');
  if (result.path) window.alert('Exportación guardada en ' + result.path);
  return true;
}
