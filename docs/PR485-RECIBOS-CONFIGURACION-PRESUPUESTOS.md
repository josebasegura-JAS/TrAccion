# PR485 — Configuración y Presupuestos con evidencia de commit

## Objetivo y alcance
Se amplía la fase experimental del escritor SQLite con dos rutas de escritura **síncronas** que reutilizan el mismo core SQL que la aplicación actual:

- `detached:save-configuracion-receipted`
- `detached:save-presupuestos-receipted`

Ambas requieren generación/UUID de la sesión `detached:open-session` realmente abierta. El worker sigue usando su lock SMB por operación y no se conecta a ningún IPC productivo.

## Garantías
- `saveWithDetachedCommitReceipt` envuelve el core síncrono en una transacción SQLite compartida con el marcador `operationId`. En Configuración confirma valor, token y recibo. En Presupuestos confirma las cuatro colecciones, token y recibo.
- Un conflicto OCC genera `ok:false`, hace rollback y **no** produce recibo; una excepción SQL tampoco deja escrituras parciales.
- Reutilizar el mismo `operationId` confirmado se rechaza incluso cuando corresponda a un tipo de escritura distinto.
- El verificador de PR482 distingue `committed` y `not-committed` solamente cuando puede comprobar identidad, esquema, `quick_check` y tabla de recibos. Ante ausencia de tabla o fallos SMB, el estado sigue siendo incierto.

## Pruebas
SQLite real en memoria: alta, conflicto, duplicados transversales, fallo SQL en la cuarta tabla, recibos y validación de petición/respuesta.

## Pendientes obligatorios para habilitar producción
- **Tareas y sesiones**: sus contratos de repositorio exponen `Promise` y no pueden envolverse de forma segura mediante un `db.transaction(() => Promise<...>)`. Hace falta extraer un núcleo transaccional síncrono reutilizable o diseñar una frontera equivalente sin prometer atomicidad falsa.
- Restantes familias: Sorteos, Lotería, Teletrabajo batch, flujos atómicos de sesiones/coordinación, etc.
- Journal tras reinicio: recuperar operaciones huérfanas únicamente con evidencia de commits y sin aceptar `sqliteVerificationReference` arbitraria como prueba.
- Pruebas de cesión, contención y recuperación sobre dos PCs Windows con SMB real, cortes de red y backups.
- Auditoría de seguridad y rendimiento y activación reversible.

**NO-GO:** no activar writer detached en producción. Las rutas legacy sin recibo siguen por compatibilidad de ensayo, pero no pueden amparar una afirmación general de recuperación transaccional.
