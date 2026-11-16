# PR444 · Escritor JSON en utilityProcess — primer tramo de la migración

## Implementado
- `electron/detachedJsonWriterCore.ts`: escritor SQL real, transaccional y estricto con OCC para las tablas enumeradas en `ISOLATED_JSON_TABLES`. Soporta altas, revisiones, borrado lógico, restauración exclusiva de personas de Ticket Restaurante, y lote atómico (conflicto => rollback completo).
- `electron/detachedCriteriaWriterWorker.ts`: el mismo utilityProcess que ya escribía Criterios RRLL acepta ahora `detached:save-json-batch` para las tablas permitidas, sin admitir SQL suministrado por el renderer.
- `electron/detachedJsonWriterRunner.ts` y puente Electron: protocolo `ready → open → batch → close → exit(0)`; no reintentos automáticos, salida incierta fail-closed.
- Pruebas con SQLite real y de protocolo: OCC, rollback, tombstones, restauración condicionada, rechazo de tablas/JSON ajenos y finalización supervisada.

## Seguridad: **NO ACTIVADO EN PRODUCCIÓN**
Este cambio **no** conmuta el propietario SQLite. El proceso main continúa haciendo las escrituras habituales. El nuevo escritor solo puede utilizarse tras la cesión explícita del único handle, bloqueo SMB validado y barreras de admisión completas. Ejecutarlo actualmente contra la misma base en uso por main sería un error de arquitectura.

Los repositorios que requieren lógica específica (Tareas, Plantilla, Comité/Paritaria, sorteos, configuración, transacciones de Ticket y de Lotería, presupuestos, bloqueos, migraciones, backups y otras tablas) no están cubiertos por el motor JSON genérico. Tampoco sustituye la preparación/migración por módulos ni la cola distribuida de escrituras.

## Siguientes tramos obligatorios
1. Inventario exhaustivo de **todos** los IPC de lectura/escritura, timers, heartbeats, backups, migraciones, y rutas E/S fuera de la cola; trasladar sus operaciones o implantar una fachada de propietario único.
2. Cesión de la conexión principal con freeze, drain comprobado, cierre del handle, adquisición de propiedad por el worker, y cuarentena ante resultado incierto sin fallback automático. Asegurar que ninguna operación sigue usando `requireDatabase()` en main.
3. Integración con la exclusión SMB, las validaciones de identidad y el journal durable de operación (reconciliación tras corte/red).
4. Pruebas reales Windows con dos instancias y cortes de red; medidas del watchdog, latencias de guardado, recuperación y consistencia antes de activar.

**Criterio de aceptación para activación productiva:** no habilitar por simple variable de entorno ni por módulo suelto; exigir cobertura completa, propiedad única comprobable y recuperación probada.

## Alcance de la PR
Esta PR es **el primer tramo de #444**, no la migración completa. Se ha preferido entregar un componente ejecutable y testeable sin convertir en una supuesta mejora una ruta de escritura mixta potencialmente peligrosa.
