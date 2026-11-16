# PR446 · Proteger las consultas SQLite de locks fuera de la cola

## Cambio conectado a producción
Las rutas `getRecordLock` y `listOtherTaskLocks` leen `editing_locks` sin adquirir el lock exclusivo SMB; es correcto para SELECT concurrentes, pero antes esas consultas **no participaban** en el contador de actividad independiente. Una eventual cesión del handle a `utilityProcess` podía decidir cerrar el main mientras otra consulta de locks se ejecutaba.

Se incorpora una dependencia obligatoria `runIndependentRead` a `recordLockService`, conectada en `sqlitePersistence` al `sqliteIndependentActivityTracker`, para:
- reservar la actividad **antes** de realizar el SELECT,
- liberar solamente al finalizar de verdad (resolución/rechazo),
- rechazar acceso nuevo durante `beginFreeze` preservando el contrato de fallo del módulo,
- conservar la lectura sin lock SMB exclusivo, para no empeorar la contención multiusuario.
`getCurrentDatabaseLockInfo` también queda contado mientras consulta el lock de la carpeta compartida.

## Tests
Los tests de orquestación aseguran que la lectura `getRecordLock` usa la barrera y no obtiene lock SMB, que un freeze rechaza lecturas nuevas sin tocar `Database`, y que el drenaje espera hasta finalizar una operación independiente pendiente.

## Límites
**No activa el escritor en producción.** Se ha cerrado una ruta concreta de E/S fuera de cola. Aún falta inventariar y controlar todas las demás, migrar repositorios especializados, backups, arranque y recuperación y comprobar la cesión del propietario sobre Windows SMB. No declarar el sistema listo para activar solo por superar las pruebas de esta PR.
