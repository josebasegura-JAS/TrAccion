# PR462 · Sorteos: migración histórica compartida y utilityProcess (NO productivo)

## Alcance
- Extracción de `migrateSorteosLegacyInTransaction`: lógica SQL compartida por main y writer auxiliar para las dos colecciones legacy de Sorteos. Idempotente por tabla y llamada dentro de una transacción explícita.
- `saveDetachedSorteos` utiliza la misma `saveSorteosTransaction` de PR461; ambas colecciones, control OCC y token se confirman conjuntamente.
- Protocolo validado `detached:save-sorteos` → `detached:sorteos-saved` y control del volumen de lotes, duplicados e identificadores.
- Trabajo ejecutado en la cola FIFO del worker; runner espera `close` y el evento real `exit(0)` antes de confirmar éxito. Sin reintentos automáticos si se pierde respuesta.
- Bridge aislado, sin import desde main o los handlers IPC productivos.

## Pruebas
- SQLite real: importación legacy idempotente, guardado conjunto de sorteos y exclusiones, rechazo de revisión OCC desactualizada, fallo SQL durante migración de exclusiones que revierte también la importación de sorteos, validación de protocolo.
- Runner: éxito solo con salida confirmada, muerte inesperada y respuesta de otra operación.

## Advertencias de seguridad
**NO se ha activado la escritura auxiliar en producción** y el worker **NO** posee ni renueva el lock SMB. La ruta `loadSorteosRecordsSnapshot` productiva todavía ejecuta una migración legacy con efecto de escritura: esto se mantiene por compatibilidad, pero requiere bloqueo/fencing durante el handoff y comprobación exhaustiva de las conexiones de lectura/maintenance para evitar doble propietario. El flag `sorteosMigrationDone` es una optimización en main, NO un mecanismo de exclusividad compartida.

## Próximos pasos
Teletrabajo especializado y Presupuestos; después inventario completo de cualquier ruta que escriba, cesión exclusiva, lock SMB, backups, reconciliación ante resultados inciertos y pruebas Windows de desconexión y reconexión.
