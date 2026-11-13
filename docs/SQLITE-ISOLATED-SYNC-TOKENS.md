# Migración SQLite · Lectura de sincronización fuera de Electron main

## Cambio de producción
`database:get-persisted-records-token` (polling multiusuario) deja de ejecutar la cadena de lecturas síncronas `better-sqlite3` en el proceso principal, siempre que exista una base compartida activa. Se conserva exactamente el mismo contrato del snapshot: `refreshToken`, `latestUpdatedAt`, `taskRecordsUpdatedAt`, `sorteosDrawsUpdatedAt`, `sorteosExclusionsUpdatedAt` y las marcas de todos los módulos declarados en `DIRECT_STORE_UPDATED_AT_TABLES` (Tareas, Comité, Paritaria, Ticket Restaurante, etc.).

La consulta se realiza dentro de **una transacción de solo lectura** sobre la base compartida, con nueva conexión SQLite nativa en `utilityProcess`, comprobación de identidad y esquema y finalización confirmada del proceso antes de publicar resultado.

El controlador mantiene pendiente el IPC si no recibe `exit`; ante timeout solicita `kill` sin dar por terminada la operación ni habilitar un fallback nativo que pudiera bloquear main. Nunca devuelve tokens vacíos como resultado exitoso de un error de worker. Si el cliente no tiene una base activa, sigue el camino de estado anterior (sin lectura de SQLite) y no altera los mensajes de ausencia de base.

La variable diagnóstica `TRACCION_SQLITE_ISOLATED_SYNC_TOKENS=0` permite desactivar temporalmente el aislamiento. Por defecto está activado.

## Evidencia
Los logs de noviembre identifican `database:get-persisted-records-token` entre las operaciones activas durante paradas del event loop. No se afirma causalidad única ni que este cambio resuelva recuperación y escritores. El polling anteriormente consultaba marcas de numerosas tablas, cada una mediante sentencias sincronizadas en main.

## Pruebas y límites
Tests: lectura real SQLite de las marcas de todas las tablas; rechazo de protocolos inválidos; respuesta solo tras `exit(0)` y rechazo tras salida anormal. Deben pasar además TypeScript, lint, suite completa y E2E dos usuarios.

Aún pendientes para el objetivo global: escritor único en utilityProcess para todos los repositorios, cierre de conexión principal, cesión de locks y heartbeat SMB, backups, recuperación nativa, idempotencia duradera y E2E Windows con cortes de red. Esta PR **sí cambia el polling real de producción**, pero **no mueve todavía las escrituras**.
