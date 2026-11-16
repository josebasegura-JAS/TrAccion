# PR470 — Revisión fuerte de Presupuestos y snapshot coherente

## Diagnóstico confirmado
La revisión OCC anterior usaba `MAX(updated_at)` de filas activas sobre cuatro tablas. No detectaba necesariamente la eliminación lógica de una fila antigua si otra tabla conservaba una marca posterior; tampoco distinguía actualizaciones de contenido sin cambio del timestamp.

## Cambios
- `readPresupuestosRevision(db)` calcula SHA-256 determinista sobre las cuatro tablas completas, ordenadas por ID; incluye `id`, `value_json`, `created_at`, `updated_at` y `deleted_at`. No depende del reloj de los clientes ni modifica el esquema.
- Las cuatro cargas legacy se preparan primero como antes; tras la preparación, el repositorio lee las cuatro colecciones activas **y la misma revisión** dentro de una sola transacción de lectura SQLite.
- El cliente usa `snapshot.revision` como token opaco `sqliteUpdatedAt`, pero mantiene el nombre del campo y la compatibilidad de tipos en el IPC para limitar cambios.
- El guardado productivo y detached reutilizan el mismo núcleo SQL; comparan el token dentro de la transacción y publican un nuevo token después de la escritura. Cualquier conflicto conserva el estado anterior.
- Base completamente vacía => revisión `null` (compatibilidad de primera escritura). Si existe alguna fila borrada lógicamente, la revisión **no** es nula.
- Se añaden regresiones para tombstone de fila antigua, contenido editado con timestamp idéntico y rollback. Los tests previos de repositorio y detached se adaptan al token opaco.

## Importante: compatibilidad de clientes
Las versiones anteriores que todavía calculan `expectedUpdatedAt` a partir del timestamp de las filas activas **no entenderán** los tokens `budget-rev:sha256:...`. Ante un presupuesto ya poblado, su guardado será rechazado con conflicto en lugar de sobrescribir datos silenciosamente. **Actualizar todos los equipos a la nueva versión** antes de utilizar Presupuestos en modo multiusuario; no mezclar versiones durante el despliegue.

No se han modificado los timestamps de las filas ni el formato de los valores JSON del dominio. No hay migración de esquema.

## Limitaciones restantes
- La carga previa de migraciones legacy sigue teniendo rutas de escritura; se debe resolver la seguridad de flags de migración tras rollback en la siguiente PR.
- Otros módulos utilizan mecanismos OCC distintos. Este cambio se limita a Presupuestos.
- La nueva versión se calcula con hash del contenido completo de cuatro tablas, lo que añade lecturas SQL; medir con bases reales y verificar que la latencia sigue siendo aceptable.
- El escritor auxiliar sigue desconectado de producción y sin propiedad/heartbeat SMB. Se mantiene el **NO-GO** de PR467.

## Pruebas requeridas antes de fusión
CI completo (TypeScript, ESLint, Vitest y Electron), test de actualización de dos equipos con versión coherente, prueba de lectura de Presupuestos cargado con tombstones y carga real para descartar regresiones de rendimiento.
