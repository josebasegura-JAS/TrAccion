import { useEffect, useRef } from 'react';
import { useAppDialog } from '../hooks/useAppDialog';

/**
 * Comprueba una vez al arrancar si existe una versión más nueva en la carpeta
 * configurada. El usuario siempre confirma la instalación; el manifiesto
 * puede marcar una versión como obligatoria para destacarla, pero no se
 * instala silenciosamente.
 */
export function AppUpdateChecker() {
  const { alert, confirm, dialogNode } = useAppDialog();
  const hasCheckedRef = useRef(false);

  useEffect(() => {
    if (hasCheckedRef.current) return;
    hasCheckedRef.current = true;

    void (async () => {
      const checker = window.traccion?.checkForAppUpdate;
      if (!checker) return;

      let result: TraccionAppUpdateCheckResult;
      try {
        result = await checker();
      } catch (error) {
        console.warn('No se ha podido comprobar si hay una actualización de TrAccion.', error);
        return;
      }

      if (!result.updateAvailable || !result.latestVersion) return;

      const details = result.notes ? `\n\n${result.notes}` : '';
      const mandatoryText = result.mandatory ? '\n\nEsta actualización está marcada como obligatoria.' : '';
      const wantsToUpdate = await confirm(
        `Hay una versión nueva de TrAccion disponible (V${result.latestVersion}, la tuya es V${result.currentVersion}).` +
          `${details}${mandatoryText}\n\nLa aplicación se cerrará y se reabrirá automáticamente. ¿Actualizar ahora?`,
        {
          title: result.mandatory ? 'Actualización obligatoria' : 'Actualización disponible',
          confirmLabel: 'Actualizar ahora',
          cancelLabel: 'Más tarde',
        },
      );

      if (!wantsToUpdate) return;

      const applier = window.traccion?.applyAppUpdate;
      if (!applier) return;

      const applyResult = await applier();
      if (!applyResult.ok) {
        await alert(`No se ha podido aplicar la actualización: ${applyResult.message}`, { type: 'error' });
      }
    })();
  }, [alert, confirm]);

  return dialogNode;
}
