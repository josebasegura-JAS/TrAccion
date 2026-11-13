# PR9D-4C · Lecturas de repositorios JSON compartidos en utilityProcess

## Alcance funcional

Se ha añadido un lector SQLite readonly reutilizable para **12 tablas de dominio** que comparten `createSimpleJsonModuleRepository`, entre ellas Criterios RRLL, Vinculograma, Licencias sin sueldo, Tipos de actas, Ticket Restaurante (personas, calendarios, ausencias, manutenciones), Especiales, Puestos y Grupos de Teletrabajo y traducciones de puestos.

La conexión del worker se abre con `readonly: true` y `fileMustExist: true`, con comprobación de UUID, applicationId, environment y schemaVersion. La tabla se selecciona únicamente por una lista cerrada (`isolatedJsonTables.ts`): no se aceptan consultas SQL ni nombres arbitrarios.

**Desactivado por defecto.** Solo se usa en pruebas con `TRACCION_SQLITE_ISOLATED_JSON_READ=1`. El resto del flujo se conserva sin cambios.

## Compatibilidad con migración, backups y concurrencia

- `createSimpleJsonModuleRepository.loadSnapshot()` ejecuta su migración legacy en el proceso principal *antes* de solicitar la lectura a utilityProcess, preservando `safeDatabaseMigrationOperation`, `editing_locks` y la semántica actual.
- La lectura aislada sigue bajo `safeDatabaseOperation` y `enqueueSqliteIpc`, sin liberar la operación hasta haber recibido `exit` del worker. Un timeout intenta `kill` pero mantiene la operación pendiente si no llega la confirmación.
- Guardados y transacciones permanecen en la conexión principal; no hay segundo escritor.
- No cambian journal, synchronous, esquemas, backups, TTL de locks, ni identidad del propietario del motor.
- El canal de resultados puede transportar datos de módulo necesarios para renderizar; no se escriben en diagnósticos. Los mensajes de error nativos no se envían al proceso principal.
- Un proceso por lectura puede ser costoso: medir su latencia en Windows portable antes de considerar activación por defecto.

## Pruebas de validación

1. TypeScript, ESLint y Vitest en GitHub Actions. Los tests comprueban catálogo de tablas, mensajes rechazados, confirmación de salida, timeout y respuestas tardías.
2. Usar una **base de datos respaldada y de ensayo** para comparar datos de cada módulo, incluido el caso de migración legacy.
3. Probar dos instancias con consultas y guardados concurrentes, observar `sqlite-recovery-diagnostics.jsonl`, registro de colas y watchdog.
4. Verificar en Windows portable que el proceso auxiliar se inicia y cierra correctamente, y que sus costes de arranque no empeoran significativamente las lecturas.
5. Confirmar comportamiento normal sin la variable de entorno.

## Qué falta para el objetivo principal

Esta PR aísla **solo lecturas** de la factoría JSON simple. No migra las lecturas especiales de otros repositorios, ni la conexión escritora, ni el mantenimiento de backups y locks SMB.

Ruta recomendada:
- **PR9D-5A:** diseño de fachada única y traslado atómico del motor escritor con sus locks, inicialización y ciclo de vida, sin caminos de escritura paralelos.
- **PR9D-5B...:** migrar los IPC de cada módulo hacia la fachada; auditar que no queden accesos a `better-sqlite3` en el proceso principal.
- **PR9E:** gestión de resultados indeterminados, cierre/exit confirmado, conciliación e identidad.
- **PR9F:** auditoría residual y ensayo Ethernet/Wi-Fi con dos usuarios.

**No dar por resueltos los bloqueos de Electron hasta que las operaciones nativas de escritura y apertura estén también aisladas.**
