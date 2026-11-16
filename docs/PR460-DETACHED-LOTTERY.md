# PR460 — Lotería: campaña, participantes y arqueos en el escritor auxiliar (SIN activar)

## Qué cambia
- La transacción productiva de `saveSnapshotIfUnchanged` pasa a ser `saveLotterySnapshotTransaction`, compartida por el repositorio actual y el futuro `utilityProcess`. Se preservan en **una única transacción** la migración legacy, OCC de campaña y participantes, arqueos/movimientos `append-only`, inserción/actualización/borrado lógico de participantes y actualización del token.
- `detachedLotteryWriterCore.ts`: adaptador con validación de propietario, año, payload, revisiones, formato de participantes, límite de lote y ausencia de IDs repetidos. No admite nombres de tablas ni SQL arbitrario.
- Protocolo `detached:save-lottery` / `detached:lottery-saved`, worker con cola FIFO, runner con confirmación de `exit(0)` y puente no conectado a producción.
- Las operaciones inciertas no se reintentan automáticamente.
- Pruebas con SQLite real de éxito, OCC, inmutabilidad de arqueos, rollback por fallo SQL tras insertar campaña y ejecución del adaptador; además de pruebas de validación de mensajes y supervisión de salida del proceso.

## Condiciones obligatorias antes de activación
El worker **no** adquiere ni renueva el lock SMB, y la función del puente no se llama desde el IPC productivo. Se debe garantizar cesión exclusiva de todas las conexiones, backup posterior a confirmación y conciliación de resultados inciertos.

### Riesgo pendiente detectado
`loadSnapshot` de Lotería ejecuta una **migración legacy con escrituras** al cargar. No basta con migrar únicamente el guardado: antes del handoff productivo hay que eliminar/coordinar esta posibilidad de escritura desde la ruta de lectura main.

## Siguientes tramos
Sorteos, Teletrabajo y Presupuestos especializados; auditoría de todas las rutas que escriben (incluidas migraciones en cargas), propiedad única y lock SMB; pruebas Windows de fallos de red, y activación progresiva.
