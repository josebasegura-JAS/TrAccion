# PR9D-4B · Lecturas Comité y Paritaria en utilityProcess

## Funcionalidad
Se incorpora un segundo lector de sesiones SQLite en `utilityProcess`, con permisos `readonly`, `fileMustExist` y validación de identidad (UUID, aplicación, entorno, esquema) antes de recuperar registros. Las únicas tablas accesibles son `comite_session_records` y `paritaria_session_records`; los módulos se seleccionan con una enumeración cerrada, nunca con SQL entrante.

Las funciones `loadComiteSessionRecordsSnapshot(id?)` y `loadParitariaSessionRecordsSnapshot(id?)` pueden consultar registros fuera del proceso principal, con idéntico filtro por ID, mediante la variable de ensayo `TRACCION_SQLITE_ISOLATED_SESSIONS_READ=1`. Por defecto continúan en su ruta anterior.

## Compatibilidad e invariantes
- La migración heredada desde `traccion.v1.comite.sessions` y `traccion.v1.paritaria.sessions` permanece ejecutándose ANTES del read-only worker y dentro de la cola/lock actuales. No hay escrituras en el nuevo proceso.
- Los guardados, cierres de sesión, actas, bloqueos de registro y backups no cambian.
- Las operaciones mantienen su reserva de `enqueueSqliteIpc` hasta que el hijo haya confirmado `exit`. Timeout solicita `kill`; no se da por terminado el acceso SMB antes de observar la salida.
- El canal de respuesta no transporta mensajes de error nativos, SQL ni rutas UNC a registros.
- Un worker se crea por consulta. Debe medirse su sobrecoste sobre Windows portable antes de activar esta opción por defecto.

## Pruebas
CI TypeScript/ESLint/Vitest. Pruebas unitarias: protocolo limitado, consulta general y puntual, respuesta confirmada por `exit(0)`, timeout con respuesta tardía y salida con código de fallo.

Ensayo controlado con base respaldada y dos instancias:
1. Comparar listas completas de Comité y Paritaria, y consulta por ID, entre modo normal y el flag activado.
2. Verificar migraciones legacy cuando corresponda, con una base de pruebas.
3. Guardar y cerrar sesiones desde otra instancia y confirmar sincronización.
4. Simular corte Ethernet/Wi-Fi y revisar `sqlite-recovery-diagnostics.jsonl` + watchdog de la misma sesión.

## Límites
**No traslada el motor escritor principal ni las operaciones de guardado.** El preflight heredado y parte de los accesos al handle siguen en Electron. Esta PR por sí sola no elimina todos los bloqueos del proceso principal.

## Ruta hasta finalizar
- PR9D-4C: inventario y aislamiento de lecturas de otros repositorios, priorizando operaciones lentas.
- PR9D-5: migración atómica del motor escritor y de operaciones vinculadas (locks, activación, backups, mantenimiento), evitando motores escritores paralelos.
- PR9E: recuperación y conciliación de operaciones de resultado incierto con `exit` confirmado.
- PR9F: auditoría y estrés con dos usuarios, 60–120 segundos sin Wi-Fi y cambios Ethernet/Wi-Fi.

El número final de PR depende del inventario de dependencias; no debe presentarse como una migración completa hasta mover los guardados fuera de main.
