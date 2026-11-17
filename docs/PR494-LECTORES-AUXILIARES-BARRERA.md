# PR494 — Barrera de admisión para lectores auxiliares SQLite

## Problema
Los puentes `taskReadWorkerBridge`, `sessionReadWorkerBridge`, `jsonReadWorkerBridge` y `isolatedSyncTokensBridge` iniciaban procesos Electron `utilityProcess` que abren conexiones SQLite en modo readonly, pero **el propio puente no registraba su ciclo de vida** en la barrera de actividad independiente. Si el repositorio llamante no estaba dentro de otra reserva, una futura cesión del escritor podría encontrar la barrera vacía cuando aún hubiese lectores auxiliares abiertos.

## Modificación
- `runIsolatedSqliteReadUnderHandoffBarrier` comprueba la propiedad local `main`, registra una reserva en `sqliteIndependentActivityTracker` y sólo entonces ejecuta el callback que inicia el worker.
- Los cuatro puentes usan esta admisión antes de invocar sus respectivos runners.
- Los runners ya esperan el evento real de `exit` del hijo para resolver/rechazar. La reserva dura por tanto hasta la confirmación de terminación; un timeout/kill solicitado o un ACK no liberan automáticamente acceso SQLite.
- No se alteran el protocolo readonly, las consultas SQL ni la activación del writer experimental.

## Pruebas
- Verificación de reserva **antes** de invocar el callback de creación del hijo.
- Freeze mientras hay lectura activa: bloquea nuevos lectores y el drenaje espera terminación real.
- Simulación de timeout: la reserva persiste hasta la señal de salida del child.
- Todas las familias (Tareas, sesiones Comité/Paritaria, módulos JSON y tokens) rechazan nuevas entradas durante freeze.
- Control estático adicional en `scripts/classify-sqlite-routes.mjs`: falla CI si alguno de los cuatro puentes invoca `utilityProcess.fork` sin el wrapper de admisión.

## Limitaciones / NO-GO
- Esto demuestra la protección de **los cuatro puentes identificados**, no que todas las conexiones SQLite del proyecto estén cubiertas.
- Un child que no emita `exit` conserva la reserva: la política fail-closed es deliberada; requiere supervisor operativo.
- Siguen pendientes otros posibles accesos indirectos: mantenimiento/migraciones fuera de fachada, exportaciones, temporizadores y lectores nativos adicionales; comprobar el inventario completo de PR468/469 en CI.
- Falta la implementación del supervisor de proceso huérfano, la integración productiva del nuevo writer, ensayos con dos procesos Electron y SMB real.

No activar el writer de escritura hasta completar las condiciones restantes.
