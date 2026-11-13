# PR9D-2 · Health-check SQLite nativo fuera de Electron

## Alcance implementado

Esta fase traslada una ruta real y frecuente de lectura nativa — `SELECT 1`, versión de esquema y validación de identidad — al `utilityProcess` readonly introducido en PR9D-1, bajo **activación explícita** mediante `TRACCION_SQLITE_ISOLATED_HEALTH=1`. Se reutilizan el handshake, timeout de 20 s, salida confirmada y semántica fail-closed del proceso auxiliar de verificación. En modo normal, el comportamiento permanece intacto.

El proceso auxiliar abre SQLite con `readonly: true` y `fileMustExist: true`; no ejecuta `quick_check` en el health-check rutinario, no migra y no realiza escrituras. La comprobación de fichero `stat()` se mantiene asíncrona en main. Tras resultado positivo y salida confirmada del worker, main verifica el estado del heartbeat exactamente como antes. El IPC del health-check permanece en la cola serializada existente.

## Cómo probar (solo entorno de ensayo)

1. Validar GitHub Actions: TypeScript Electron/test, ESLint y Vitest.
2. Ejecutar una copia de TrAcción en entorno controlado con `TRACCION_SQLITE_ISOLATED_HEALTH=1` y base respaldada.
3. Comprobar salud y cambios de red con dos instancias, comparando `sqlite-recovery-diagnostics.jsonl`, `electron-main-watchdog.jsonl` y registros de rendimiento de la **misma sesión**.
4. Confirmar identidad, escrituras y bloqueo de edición en caso de verificación fallida. Si el worker queda bloqueado y no llega `exit`, NO permitir reapertura ni nuevas escrituras.
5. Repetir sin flag como control. No habilitar para producción hasta validar latencia de creación del proceso y funcionamiento en el portable Windows.

## Seguridad

- Ningún cambio en conexión principal, propietarios de bloqueo, exclusión de escrituras, TTL, `editing_locks`, backup, migraciones, PR9B o `synchronous`.
- Un health-check fallido no reintenta escrituras. Un timeout de IPC no libera la operación que aún pudiera estar en curso.
- Las rutas UNC solo se transmiten en memoria del proceso principal al hijo; los mensajes de error del hijo no contienen la ruta ni SQL.
- La fase es opt-in y permite comparar resultados sin alterar el uso habitual.

## Lo que aún NO soluciona

**La conexión principal de `better-sqlite3` sigue perteneciendo a Electron.** Apertura/cierre, guardados, tareas, Comité, Paritaria y el resto de los módulos continúan con accesos síncronos en main, y por tanto pueden bloquearlo en SMB. Esta fase no debe presentarse como migración del motor principal ni como solución definitiva de congelamientos.

## Secuencia posterior recomendada

- **PR9D-3**: inventario y contratos de repositorios/IPC; mantener un único propietario de la conexión, aislar apertura/activación y reads/writes con idempotencia y serialización.
- **PR9D-4+**: traslado gradual de módulos por repositorio, sin abrir simultáneamente un segundo motor escritor en la misma instancia.
- **PR9E**: ciclo de vida y recuperación del trabajador con operaciones inciertas, terminación confirmada, identidad y reconciliación.
- **PR9F**: auditoría de llamadas SQLite/SMB restantes y pruebas con dos usuarios, cambios Ethernet/Wi-Fi, desconexión 60–120 s y corrupción simulada en copia de prueba.

El número exacto de PR depende del inventario de operaciones; no es razonable fijar una cifra sin medir su volumen.
