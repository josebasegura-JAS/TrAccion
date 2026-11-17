# PR486 — Tareas, Comité, Paritaria y Actas con recibo SQLite

## Estrategia transaccional segura

Los repositorios productivos de Tareas y Sesiones devuelven `Promise`, **pero** sus mutaciones se ejecutan de forma síncrona dentro de `transactionWithMigrationReset`. No se pasa una promesa a `db.transaction`. En su lugar, se añadieron dos hooks opcionales a cada repositorio, ejecutados DENTRO de la transacción SQL:

- `beforeSaveTransaction(db)`: valida UUID, crea la tabla de recibos cuando es necesario y rechaza un `operationId` previamente confirmado antes de migraciones y modificaciones.
- `afterSuccessfulSaveTransaction(db)`: escribe el recibo después del dato y token, antes de confirmar la transacción original.

Estos hooks solo se inyectan en los adaptadores de ensayo del worker con `receipt` explícito. Sin ellos, el código de producción sigue utilizando exactamente el contrato y la transacción anteriores.

## Rutas experimentales
- `detached:save-task-receipted`: conserva OCC, `editing_locks` de fila/módulo, migración legacy y señal de refresco.
- `detached:save-session-receipted`: conserva los tres repositorios productivos (Comité, Paritaria, Actas), sus revisiones y migraciones.
- En todas las rutas con recibo, el worker valida que la generación y UUID del mensaje coinciden con la sesión SMB/SQLite realmente abierta.
- Los mensajes legacy continúan para compatibilidad de los ensayos existentes, **sin garantías de recibo**.

## Cobertura de pruebas
1. SQLite real, Tareas + token + recibo de la misma transacción.
2. Conflicto OCC de Tareas sin nuevo recibo; bloqueo ajeno de edición.
3. Tres variantes de sesiones con commit y conflicto verificado.
4. `operationId` repetido entre módulos y rechazo de mensajes con generación/UUID inválidos.
5. No se fuerza activación ni se cambia la UI productiva.

## Riesgos pendientes — NO-GO
- Los procedimientos especializados de cierre de sesión, importación de histórico y coordinación requieren su propia cobertura.
- Faltan Sorteos, Lotería, Teletrabajo batch y otros escritores especializados.
- La recuperación duradera tras reiniciar Electron todavía no reconstruye reconciliaciones de journal huérfano.
- Antes de activar se necesitan pruebas de corrupción, pérdidas SMB, interrupciones, contención de 2–3 PCs Windows, backups y rendimiento.
- Una respuesta `ok:false` puede reflejar un conflicto; **no** equivale a una confirmación de escritura.
- La ruta transaccional de Tareas no sustituye a un supervisor de cesión de todos los handles; el worker sigue desconectado de producción.

## Siguiente orden revisado
PR487: restantes familias de escrituras síncronas; PR488: flujos especiales/restantes; PR489: reconciliación tras reinicio; PR490: pruebas Windows multiusuario; PR491: auditoría y decisión de activación. Añadir más incrementos si resultan necesarios.
