# PR475 — Escrituras inciertas: distinguir kill solicitado y exit confirmado

## Diagnóstico
`saveCriteriaViaDetachedWriter` ya evitaba considerar cancelada una escritura solo por agotarse el timeout: pedía `kill()` y esperaba el evento real `exit` antes de resolver/rechazar. Sin embargo, si `exit` nunca llega, el llamador se queda esperando **sin señal estructurada inmediata** para registrar una sesión incierta. Tampoco existía un callback independiente que confirmara al coordinador la salida real del hijo.

## Modificación
- `onUncertain(event)` opcional: se dispara una sola vez al alcanzar timeout, recibir respuesta inválida, fallar el envío o recibir una salida inesperada. Incluye `operationId`, fase, motivo y `exitConfirmed`.
- `onExitConfirmed(operationId, code)` opcional: se dispara solo tras el evento `exit`, nunca al llamar a `kill()`. La confirmación real de exit por sí sola **no resuelve** una escritura incierta.
- Si el hijo no notifica `exit`, se comunica incertidumbre inmediatamente y la promesa sigue sin completarse. Esto es intencionado para impedir liberar el lock o abrir otro escritor por un timeout externo.
- Los fallos de callbacks de instrumentación no alteran el resultado de SQLite ni se interpretan como confirmación de guardado.
- Se conserva la obligación de `detached:saved` + `detached:close` + `exit(0)` para publicar éxito y se evita reintentar cualquier escritura incierta.

## Pruebas
Cuatro casos adicionales en `detachedCriteriaWriterRunner.test.ts`: timeout sin salida real, salida inesperada durante guardado, error de protocolo con kill pero sin exit aún y éxito completo sin incertidumbre.

## Integración futura (NO-GO mantenido)
Estas señales son puntos de integración para un supervisor que gestione `sqliteWriterOperationLedger` y `sqliteEngineOwnershipFence`. **Todavía no se conectan** al arranque ni al flujo productivo; tampoco solucionan por sí solas la propiedad/renovación del lock SMB del child, la reconciliación persistente de operaciones ni el bloqueo de reinicios que intenten saltarse la cuarentena.

Antes de activar el proceso escritor:
1. Verificar un lease distribuido con identidad/heartbeat robustos y mecanismo seguro tras pérdida de conectividad.
2. Persistir las escrituras inciertas para sobrevivan a un cierre del main; no permitir el retorno automático a main sin reconciliación.
3. Comprobar versiones, identidad y schema; probar en dos Windows reales con SMB, desconexiones y kill sin evento exit.
4. Mantener la opción de abortar una cesión **solo antes** de cerrar el handle main.

No cambia el formato SQLite, las operaciones SQL, los tokens OCC ni el protocolo de backups.
