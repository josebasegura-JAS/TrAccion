# PR9D-5E · Pausa reversible y drenaje de heartbeat SMB

## Contexto y cambio
PR9D-5D incorpora un freeze de admisión de E/S instrumentada, pero no podía activarse de forma segura porque el heartbeat del lock SMB continuaría intentando renovar el propietario. Pausar el tracker con un heartbeat todavía activo generaría rechazos artificiales o una operación nativa sin drenar.

Esta PR añade al gestor real `createDatabaseLockManager` dos operaciones:
- `pauseDatabaseLockHeartbeat(timer): Promise<void>`: marca la sesión como pausada **sincrónicamente**, bloquea nuevos ticks, y espera hasta que la renovación SMB en curso se haya resuelto.
- `resumeDatabaseLockHeartbeat(timer): void`: reanuda la misma sesión y el mismo objeto de intervalo; el consumidor conserva su capacidad de `clearInterval(timer)` al terminar la operación.

La fachada `createSqliteLockLifecycle` expone esas funciones sin romper su contrato previo. No se modifica la frecuencia de 10 s, TTL de 30 s, reglas de propiedad del lock, tratamiento de fallo de heartbeat, locks de escritura o política de backups.

Se incorpora además `createSqliteHeartbeatHandoffPreparation`, **no conectado al runtime**, que ensaya el orden `pausar heartbeat → esperar drenaje → congelar y drenar otras operaciones` y, si falla el preflight antes del cierre del handle, reanuda el heartbeat. Si la preparación ya está completada, solo permite abortarla mediante el ticket vigente y antes del cierre, nunca automáticamente después de una cesión incierta.

## Pruebas
- Intervalos sin ticks mientras está pausado, reanudación del mismo timer y pausa posterior.
- No completar `pause()` mientras una renovación SMB siga pendiente.
- Preparación ordenada; rechazo de preparación simultánea y tickets obsoletos.
- Falla el preflight, se reanuda el heartbeat.
- Nunca reanudar automáticamente por el mero hecho de que exista un ticket preparado.

## Riesgos y limitaciones
**Esto no autoriza todavía activar el traspaso del escritor.** Un heartbeat pausado no mantiene por sí solo el lock en SMB. Una cesión que se prolongue más de su TTL puede hacer que otra instancia considere caducado el lock. El siguiente cambio debe asegurar un protocolo de transferencia/renovación correcto con límites temporales y prueba de propiedad antes de escribir; no basta con pausar indefinidamente. Las operaciones de restauración, VACUUM, algunos cambios de ruta y otros accesos directos al handle todavía requieren auditoría/integración con el freeze global.

La instancia no llama todavía a `pauseDatabaseLockHeartbeat` ni a `createSqliteHeartbeatHandoffPreparation` desde la ruta de producción. El escritor sigue en Electron. `getSqliteWriterHandoffReadiness().ready` sigue devolviendo `false` por diseño.

## Siguientes fases
1. **PR9D-5F**: protocolo de cesión que mantenga propiedad de lock durante la transición y cubra los accesos extra-IPC residuales.
2. **PR9D-5G+**: conexión escritora única en utilityProcess, migración de repositorios y comandos de escritura bajo una fachada segura.
3. **PR9E**: conciliación duradera de operaciones indeterminadas y supervisión.
4. **PR9F**: auditoría final y pruebas reales con dos equipos y cortes de red.

No confundir que las pruebas de CI estén en verde con la validación de estabilidad multiusuario durante cortes SMB.
