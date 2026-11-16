# PR459 — Configuración: core OCC reutilizable y adaptador utilityProcess

## Alcance
- Extraído el guardado de `configuracion_state` con comprobación OCC y token de refresco a `persistence/configuracionWriteCore.ts`. La migración idempotente del valor legacy de `persisted_records` se efectúa **dentro** de la transacción.
- El repositorio productivo conserva `safeDatabaseOperation`, las comprobaciones de estado/heartbeat, el lock SMB y el resto de la carga. El backup se programa solo después de confirmarse el commit y si el resultado es `ok`, no dentro de la transacción.
- `detachedConfiguracionWriterCore.ts` utiliza el mismo core SQL; no existe una segunda implementación de Configuración.
- Protocolo tipado `detached:save-configuracion`/`detached:configuracion-saved`, cola serializada del child, runner con `close` y observación de `exit(0)` y bridge no productivo.
- No se reintentan automáticamente los resultados inciertos.
- Tests SQLite reales: éxito, conflicto de versiones, migración legacy, rollback por error en token y ejecución desde adaptador; tests de protocolo y ciclo de vida del child.

## Límites
**Sin activación del escritor aislado.** El worker todavía no adquiere un lock SMB ni confirma por sí solo la cesión exclusiva. La función del bridge no se invoca desde main ni desde los handlers IPC productivos.
Quedan módulos especializados importantes: Lotería (historial append-only, campañas y participantes), Sorteos (dos colecciones y OCC), Teletrabajo (guardado masivo), Presupuestos (cuatro tablas y token combinado); no tratarlos como escrituras JSON independientes.

## Siguientes pasos
1. Migrar progresivamente las transacciones especializadas pendientes con pruebas de regresión.
2. Auditar exhaustivamente todos los manejadores de E/S que sobreviven a freeze/drain.
3. Implementar propiedad exclusiva SQLite, lock distribuido, heartbeat, control de backups y reconciliación.
4. Ensayar desconexión SMB y cambios Ethernet/Wi-Fi en Windows antes de activar por flag.
