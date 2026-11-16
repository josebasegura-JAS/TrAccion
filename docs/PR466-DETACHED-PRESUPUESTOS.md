# PR466 — Presupuestos en utilityProcess (sin activación productiva)

## Alcance
Se incorpora un adaptador de Presupuestos al escritor SQLite aislado, reutilizando **sin duplicar SQL** la transacción de cuatro tablas y su control de concurrencia optimista dentro de la transacción, creada en PR465.

- `detachedPresupuestosWriterCore.ts`: validación de `ownerId`, cuatro colecciones obligatorias, límite de 10.000 filas por colección, ids únicos y revisión esperada. Invoca `savePresupuestosTransaction`.
- Protocolo `detached:save-presupuestos` y `detached:presupuestos-saved`, tipado y validado.
- Worker con ejecución FIFO; runner con secuencia ready/open/save/close y confirmación del evento **exit(0)** para dar por terminado el guardado. Nunca reintenta automáticamente un resultado incierto.
- Bridge explícito y **no conectado** a la ruta de producción.
- Actualización del token dentro de la transacción; ninguna operación de backup en el child.

## Pruebas
SQLite real: confirmación de cuatro colecciones más token, conflicto por edición externa, rollback por error en la cuarta tabla, protección de edición obsoleta, validación de los cuatro lotes y respuesta del protocolo. Pruebas adicionales de runner: salida exit(0), cierre inesperado y respuesta de otro operationId.

## Bloqueantes de activación
1. **Propiedad SQLite y lock SMB**: el worker no adquiere ni renueva el lock distribuido. Debe existir handoff exclusivo, fencing verificable, heartbeat y liberación segura.
2. **Lecturas con efectos de escritura**: la carga de Presupuestos utiliza cuatro repositorios que pueden migrar datos antiguos; no basta con congelar el guardado ordinario.
3. **Snapshots parciales**: la carga combinada mediante cuatro promesas no garantiza lectura atómica de cuatro colecciones; la revisión dentro de la transacción preserva el guardado, pero debe auditarse el flujo de la UI.
4. **Rutas autónomas**: `taskBatchPersistence`, backups, exportaciones, migraciones y mantenimiento deben entrar en el inventario y cierre del propietario.
5. **Concurrencia en borrado lógico**: el OCC actual de Presupuestos usa el MAX(updated_at) de registros activos. Hay que auditar los cambios de filas borradas y modificaciones con timestamps iguales, antes de considerar el OCC como garantía completa.
6. **Reconexiones y respuestas inciertas**: no suponer que la ausencia de respuesta significa rollback. Probar en Windows y SMB con dos clientes y cortes de cable/Wi-Fi.

## Próxima fase
**Auditoría de cobertura y diseño de activación**, no más adaptadores a ciegas. Confirmar exhaustivamente las rutas de escritura y los bloqueantes antes de preparar el coordinador de propiedad SQLite y los ensayos Windows.
