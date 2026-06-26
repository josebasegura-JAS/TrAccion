import { useEffect, useRef } from 'react';
import { useAppDialog } from '../hooks/useAppDialog';

/**
 * Al montar, comprueba una sola vez si hay una versión de TrAccion más
 * nueva en la carpeta de actualizaciones configurada (Ajustes >
 * Actualizaciones). Si la hay, pregunta antes de aplicarla: nunca se
 * actualiza sola sin que la persona lo confirme. Si la carpeta no está
 * configurada, o la app no es el ejecutable portable real (desarrollo,
 * otros sistemas operativos), no hace nada y no muestra ningún aviso: la
 * actualización automática es opcional, su ausencia no es un error.
 */
export function AppUpdateChecker() {
  const { alert, confirm, dialogNode } = useAppDialog();
  const hasCheckedRef = useRef(false);

  useEffect(() => {
    if (hasCheckedRef.current) {
      return;
    }
    hasCheckedRef.current = true;

    void (async () => {
      const checker = window.traccion?.checkForAppUpdate;
      if (!checker) {
        return;
      }

      let result;
      try {
        result = await checker();
      } catch (error) {
        console.warn('No se ha podido comprobar si hay una actualización de TrAccion.', error);
        return;
      }

      if (!result.updateAvailable || !result.latestVersion) {
        return;
      }

      const wantsToUpdate = await confirm(
        `Hay una versión nueva de TrAccion disponible (V${result.latestVersion}, la tuya es V${result.currentVersion}). ` +
          'La aplicación se cerrará y se reabrirá automáticamente con la nueva versión. ¿Actualizar ahora?',
        { title: 'Actualización disponible', confirmLabel: 'Actualizar ahora', cancelLabel: 'Más tarde' },
      );

      if (!wantsToUpdate) {
        return;
      }

      const applier = window.traccion?.applyAppUpdate;
      if (!applier) {
        return;
      }

      const applyResult = await applier();
      if (!applyResult.ok) {
        await alert(`No se ha podido aplicar la actualización: ${applyResult.message}`, { type: 'error' });
      }
      // Si applyResult.ok, la app va a cerrarse por su cuenta en segundo
      // plano (app.quit() ya lanzado desde el proceso principal); no hace
      // falta hacer nada más aquí.
    })();
  }, [alert, confirm]);

  return dialogNode;
}
