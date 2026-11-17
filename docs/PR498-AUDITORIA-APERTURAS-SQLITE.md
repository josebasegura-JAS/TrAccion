# PR498 — Inventario con bloqueo de regresiones en aperturas nativas SQLite

## Evidencia de partida

Se examinó el artefacto **calidad-calidad** de GitHub Actions, ejecución 44067432210 (PR497), que contiene `audit-results/sqlite-access-inventory.json` y `sqlite-native-open-pending.json`. El inventario registró **14 coincidencias heurísticas de apertura nativa** en **13 archivos** (dos coincidencias en `sqliteConnection.ts`, porque la expresión detecta tanto la declaración de `openSqliteDatabase(` como el constructor). La lista de once archivos «sin clasificar» de la PR anterior no significaba necesariamente once vulnerabilidades: mezclaba procesos hijos, verificadores exclusivos de recuperación y accesos main.

## Cambios de PR498

- `scripts/classify-sqlite-routes.mjs` incorpora un registro **expreso por archivo**, con propietario, admisión exigida, estado y cantidad de coincidencias esperada según la evidencia real de CI.
- El script falla **con exit code 1** si aparece una ruta nueva, cambia el número de coincidencias en un archivo ya revisado o desaparece sin revalidar la clasificación. Ningún acceso nuevo se considera seguro por omisión.
- Emite `audit-results/sqlite-native-open-review.json` con la matriz por línea, desviaciones y `productionHandoffReady:false`.
- Se integran estas rutas en la matriz general; `PROTEGIDA PARCIAL` solo significa que la admisión conocida está instrumentada, no que su cierre real esté demostrado.

### Grupos revisados

| Grupo | Archivos | Estado |
|---|---|---|
| Main: apertura ordinaria, activación, bootstrap y validación de backups | `sqliteConnection`, `databaseActivation`, `databaseIdentity`, `sqliteBackupValidation`, `taskBatchPersistence` | Parcialmente protegido por fence/admisión de PR anteriores |
| Hijos readonly con puentes instrumentados | `isolatedSyncTokensWorker`, `jsonReadWorker`, `sessionReadWorker`, `taskReadWorker` | Contrato de lectura y exit del child; falta ensayo físico |
| Verificación de salud readonly | `sqliteHealthVerification` | **Revisión pendiente:** asegurar que el ciclo de vida de su caller tiene admisión y salida comprobada |
| Verificadores de cuarentena | `sqliteIntegrityVerification`, `detachedWriterCommitReceipt` | **NO-GO:** requieren supervisor, EXIT confirmado y barrera SMB exclusiva de recuperación; no ponerles el fence de main indiscriminadamente |
| Escritor experimental | `detachedCriteriaWriterWorker` | **NO-GO:** no conectado a producción y falta supervisor real |

## Límites importantes

Esta herramienta usa búsquedas de texto sobre archivos versionados. Puede perder aperturas mediante alias, importaciones dinámicas o dependencias externas, y puede contar coincidencias no ejecutables (por ejemplo, una firma de función). Un acceso nuevo que sustituya otro en el mismo archivo podría mantener el recuento y escapar al control: **la revisión de código sigue siendo obligatoria**. No es una certificación de exhaustividad ni de exclusividad SQLite.

**No se ha activado el nuevo escritor.** La PR fortalece el control automático de cambios y la trazabilidad de riesgos sin alterar el funcionamiento normal de producción.

## Próximos bloqueos previos al supervisor

1. Verificar el ciclo de vida del verificador de salud readonly y las llamadas directas fuera de fachada; comprobar que ninguna promesa de E/S se declara finalizada antes de cerrar su handle.
2. Conectar al futuro supervisor una barrera SMB real y verificar los workers huérfanos sin confiar en el TTL de lock.
3. Alinear journal, operación receipted y control de propietario con la integración real, aún desactivada.
4. Ensayos de dos instancias Electron y dos equipos Windows en base ficticia aislada, incluyendo desconexiones.

**Decisión actual: NO-GO para la activación del escritor experimental.**
