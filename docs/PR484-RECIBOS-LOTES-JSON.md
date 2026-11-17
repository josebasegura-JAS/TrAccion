# PR484 — Segunda familia de escrituras con recibo: lotes JSON

## Alcance implementado, SIN activación productiva
- Nuevo protocolo optativo `detached:save-json-batch-receipted` con `operationId`, `generation`, `databaseUuid`, tabla y registros.
- El worker ejecuta `saveDetachedJsonBatch` dentro de `saveWithDetachedCommitReceipt`: las filas, token de refresco y recibo del commit se confirman en la **misma transacción SQLite**.
- Ante conflicto OCC se revierte el lote entero, incluido su token y el recibo. Un `operationId` ya confirmado se rechaza antes de ejecutar SQL.
- **Validación de sesión obligatoria** para las dos rutas con recibo: generación y UUID recibidos deben coincidir con el `detached:open-session` realmente abierto. No se permite esta petición después de un `detached:open` legacy.
- Las tablas JSON siguen sujetas a `ISOLATED_JSON_TABLES`: Vinculograma, Licencias sin sueldo, Criterios RRLL, tipos de acta, calendarios/personas/ausencias/manutenciones de Ticket Restaurante, Especiales, puestos/grupos de Teletrabajo y traducciones de puestos.
- La ruta antigua `detached:save-json-batch` continúa por compatibilidad, **pero no ofrece recibo** y no debe formar parte de una activación con reconciliación automática.

## Pruebas
- Commit real de dos registros JSON, token y recibo.
- Conflicto en la segunda fila que revierte también la primera.
- Rechazo de `operationId` repetido.
- Validación de protocolo, UUID, generación, whitelist y lotes vacíos.

## Limitaciones y NO-GO
- No se ha conectado ningún IPC productivo a los nuevos mensajes.
- El resto de los escritores auxiliares (Tareas, Comité/Paritaria/Actas nativos, flujos atómicos, Teletrabajo batch, Configuración, Lotería, Sorteos, Presupuestos) siguen sin recibo del mismo commit.
- Algunos repositorios emplean operaciones asíncronas o devuelven objetos distintos de `{ok:boolean}`; no envolverlos mecánicamente en una transacción síncrona.
- Las pruebas de integración de dos PC Windows/SMB, pérdida de red y reanudación de journals tras reinicio siguen pendientes.
- PR485/PR486 **no bastan por sí solas** para afirmar preparación productiva si no se completan esas familias de escritura y sus pruebas. Dividir el alcance restante en tantas PR como resulte necesario.
- Se mantienen los criterios de NO-GO para el nuevo motor escritor.

## Impacto
No se alteran guardados, sincronización, backups o locks de TrAcción usados actualmente en producción.
