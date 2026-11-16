# PR471 — Indicadores de migración y rollback SQLite

## Riesgo observado
En varios repositorios, la migración de datos históricos marca una variable en memoria como `migrationDone=true` **dentro de la transacción**. Si una escritura posterior falla y SQLite revierte esa transacción, el marcador puede seguir indicando que el histórico ya se migró. Una carga posterior puede omitir filas históricas aún no materializadas en la tabla.

Es un problema de **consistencia entre estado de memoria y commit**, distinto del control de versiones OCC de Presupuestos corregido en PR470.

## Corrección
- `migrationRollbackGuard.ts` añade `transactionWithMigrationReset`: no cambia la transacción ni el resultado, pero invalida el flag si la transacción lanza error/rollback. `withMigrationFlagRollback` cubre núcleos compartidos de SQL que ya contienen su propia transacción.
- `simpleJsonModuleRepository.ts`: en rollback se invalidan **ambos** el indicador legacy y el `WeakSet<Database>` de conexiones preparadas. Cubre cargas, guardado individual e importación por lotes. Sin invalidar el WeakSet la siguiente carga no volvería a intentarlo.
- `taskRepository.ts` y `employeeRepository.ts`: cargas y guardados individual/masivo invalidan su indicador si la transacción no confirma.
- `sesionesRepository.ts`: Comité, Paritaria y Actas invalidan su indicador de forma independiente si falla su transacción.
- `sorteosRepository.ts` y `teletrabajoRepository.ts`: cubren la migración de cargas y la ejecución de núcleos compartidos `save...Transaction`, incluidos errores de lotes. El rollback no cambia el flujo de manejo de errores existente.
- **No se cambia** el SQL de migración, el esquema SQLite, los locks SMB, la clasificación read/write de IPC, ni el programa de backups.

## Pruebas
`migrationRollbackGuard.test.ts` emplea `better-sqlite3` para forzar un error **después de migrar datos legacy y antes del commit de un lote**, verificar que SQLite ha revertido la migración y que la carga siguiente recupera realmente el histórico. Incluye un test unitario de rollback/commit y otro del núcleo compartido.

## Límites de la garantía
- Esta PR cubre los repositorios mencionados. Los marcadores fuera de estos repositorios y las operaciones con transacciones externas anidadas requieren auditoría antes de activar la cesión al worker.
- Una transacción que **retorna normalmente un conflicto OCC** no se revierte necesariamente: si la migración ya se confirmó, mantener el marcador es correcto.
- Los indicadores siguen siendo optimizaciones locales, no sustituyen comprobaciones reales en SQLite ni el lock distribuido.
- El escritor `utilityProcess` continúa **sin activación productiva**. El NO-GO de PR467 permanece.

## Validación
Fusionar únicamente tras TypeScript, ESLint, Vitest, pruebas Electron y revisión de los logs. Ensayar posteriormente los escenarios Windows SMB con fallos a mitad de migración.
