# PR465 — Presupuestos: transacción compartida y corrección OCC

## Objetivo
Preparar el guardado conjunto de cuatro tablas para utilityProcess **sin cambiar la ruta de producción** y resolver la ventana de concurrencia existente entre el `loadPresupuestosRecordsSnapshot` y el `db.transaction`.

## Implementación
- `presupuestosWriteCore.ts` concentra la transacción SQL para escenarios, partidas manuales, grupos ticket y reales.
- Mantiene borrado lógico, upsert y actualización del token dentro de la misma transacción.
- Se vuelve a calcular la última revisión de las cuatro tablas **dentro** de la transacción, antes de cualquier escritura. Si cambió desde el snapshot del usuario, se rechaza todo el lote.
- El repositorio productivo mantiene comprobación inicial de snapshot, guardas de heartbeat, `safeDatabaseOperation` y backups tras commit.
- Se validan lotes (límite de 10 000 filas por colección), IDs duplicados y tipos básicos.
- Pruebas con SQLite real para cuatro tablas, conflicto tras la carga, rollback ante fallo en la cuarta tabla, borrado lógico y validación.

## Condicionantes pendientes
- La lectura actual de Presupuestos carga cuatro repositorios JSON independientes; **puede ejecutar migraciones legacy escritoras**, y no constituye necesariamente una foto atómica de las cuatro tablas si hay escritores concurrentes. La comparación OCC dentro de la transacción protege el guardado, pero no convierte la carga en lectura atómica.
- La revisión de la UI sigue calculándose sobre registros activos. Antes de activar el escritor auxiliar, conviene evaluar también los casos de borrado lógico concurrente y el token que se comparte entre las cuatro colecciones.
- El nuevo núcleo **NO está conectado** al proceso auxiliar. No debe activarse hasta tener propiedad exclusiva de SQLite, lock/heartbeat SMB y freeze/drain de escritores fuera de la cola principal.

## Ruta de cierre
1. Adaptador/protocolo/runner auxiliar de Presupuestos, sin activación productiva.
2. Auditoría completa de cualquier ruta de escritura, incluidas cargas con migraciones, backups, batch persistence y exportaciones.
3. Cesión única del propietario SQLite y lock SMB seguro.
4. Pruebas con dos equipos y desconexiones Wi-Fi/Ethernet antes de habilitar.
