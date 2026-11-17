# PR500 — Supervisor duradero del escritor aislado (bloque funcional)

## Implementación

Esta PR consolida el supervisor del escritor SQLite experimental en **dos componentes acoplados** sin activar ninguna ruta de producción:

1. `detachedWriterProcessStore.ts` crea un **marcador duradero de proceso** en una ruta local persistente por dispositivo/base: reserva inicial mediante `openSync(...,'wx')` antes de permitir `utilityProcess.fork`; graba generación, UUID de SQLite y token de sesión (no SQL ni datos personales); solicita `fsync` y actualiza atómicamente el resultado de salida confirmada.
2. `detachedWriterLifecycleSupervisor.ts` reutiliza `supervisedDetachedWriterSession.ts`, que ejecuta READY, apertura y verificación externa de propiedad del lock SMB. El supervisor crea primero el marcador, inicia la sesión, exige prueba de propietario SMB, admite una orden de parada y expone `waitForConfirmedExit()`, que permanece pendiente hasta el evento **real** de salida del proceso y la persistencia exitosa del marcador.

El supervisor **no** confunde ACK del IPC, expiración del TTL SMB, `kill()` solicitado o timeout con terminación. Una excepción de disco al registrar EXIT obliga a mantener la cuarentena.

## Comportamientos intencionados

- Si el fichero de marcador existe, **aunque contenga `exit-confirmed`**, el siguiente arranque se rechaza. Haber observado EXIT no demuestra por sí solo que el journal esté conciliado ni que SQLite pueda reabrirse.
- El marcador no se borra en esta PR. Una futura fase de recuperación deberá acreditar identidad de SQLite, journal de recibos, terminación previa real y barrera SMB exclusiva antes de permitir su retirada controlada.
- Un marcador ilegible obliga a intervención: no se restaura el estado a limpio por omisión.
- El `onExitConfirmed` del coordinador se invoca después de intentar persistir EXIT, pero la ausencia de confirmación duradera impide considerar la sesión recuperada.
- El marcador debe ubicarse en almacenamiento local persistente, no en `tmp`. El contrato aún no está conectado al runtime ni a ninguna ruta IPC del renderer.

## Pruebas automáticas

- Reclamo atómico y duradero antes de crear el hijo.
- Rechazo de una segunda sesión al reiniciar, tanto con marcador `launching` como con `exit-confirmed`.
- Marcador corrupto y señales de EXIT de otra sesión: fallo cerrado.
- Handshake READY, generación válida y verificación de propiedad SMB.
- Error SMB, generación equivocada, cierre inesperado y parada solicitada: nunca reactivar main ni declarar un kill como EXIT.
- Timeout de configuración inválido: sin crear proceso ni marcador.

## NO-GO que queda para producción

- No hay cierre administrativo automático del marcador: exige conciliación independiente y exclusividad de recuperación.
- Falta coordinación real entre los componentes del supervisor, fence, journal, recibos y rutas IPC de escrituras.
- Verificar garantías de durabilidad de directorios en Windows y reclamaciones de sesión entre procesos en el entorno real.
- No se han ejecutado pruebas de dos Windows sobre una carpeta SMB compartida ni desconexiones reproducibles.

**La versión de producción mantiene la arquitectura anterior y el escritor experimental DESACTIVADO.**
