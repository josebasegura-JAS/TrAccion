# PR490 — Ensayo de dos instancias y resiliencia SQLite/SMB

## Alcance de esta PR (automatizado)

`electron/twoInstanceSqliteReadiness.test.ts` abre **dos conexiones reales de better-sqlite3** (A/B), con gestores de lock de distinto `ownerId`, apuntando al mismo archivo temporal local. Comprueba:

1. A retiene el `.lockdir`; B no puede adquirirlo y no escribe durante ese intervalo.
2. Tras liberar A, B escribe y ambas conexiones observan los dos registros.
3. Dos revisiones sobre el mismo registro: la obsoleta de B produce conflicto OCC y no sobrescribe A; una revisión válida posterior sí se aplica.
4. Fallo inyectado al leer la propiedad de SMB: se aborta ANTES de ejecutar SQL.
5. Una operación cuyo resultado no se ha observado no se retransmite ciegamente como inserción nueva; la semántica OCC rechaza el conflicto.

**Limitación fundamental:** esto prueba colisiones y errores inyectados sobre el sistema de archivos local. No son dos procesos Electron completos, no son dos ordenadores, no se ha interrumpido una conexión SMB real y no se ha activado el escritor detached en la aplicación. La última prueba OCC no sustituye al journal + recibo del nuevo protocolo.

## Protocolo manual: dos instancias Electron (sin tocar datos reales)

**Entorno obligatorio:** una copia desechable y verificada de la base SQLite, aislada físicamente de la base de producción. Identificadores de empleados ficticios, sin datos personales reales. Una instancia A y otra B de la misma versión, configuradas hacia **el mismo archivo** (nunca dos bases distintas). Guardar copia inicial y hash de la base, sin ninguna instancia abierta.

### Preparación
- Registrar versión/commit, Windows, ruta compartida (UNC preferible a unidades mapeadas), red Wi-Fi/cable, equipo/PID de cada instancia y copia de seguridad inicial.
- Activar logs de rendimiento, lock y watchdog disponibles. No activar el nuevo escritor salvo que exista un mecanismo de ensayo explícito seguro y documentado.
- Para ensayos de un único ordenador, usar dos instancias independientes con identidades de usuario distintas, verificando que realmente son dos procesos y usan la misma ruta; los perfiles locales pueden compartir recursos, por lo que **no** sustituye la prueba de dos equipos.
- Verificar arranque, lectura de Tareas, Comité, Paritaria y Ticket Restaurante con ambas instancias.

### Casos de prueba y criterio PASS
| ID | Acción | PASS indispensable |
|---|---|---|
| D1 | A crea una tarea; B recarga | B ve el registro persistido, sin duplicado |
| D2 | A y B abren la misma tarea; A guarda; B guarda revisión antigua | B recibe conflicto explícito; se conserva la versión de A |
| D3 | A adquiere edición de tarea; B intenta editar el mismo registro | B ve bloqueo o denegación coherente, sin sobrescribir |
| D4 | Dos operaciones independientes en Comité/Paritaria | Se conservan ambas; no se mezclan actas ni sesiones |
| D5 | A y B actualizan ausencia/calendario Ticket Restaurante | Sin pérdidas, sin cálculos inconsistentes ni `ok:true` para una escritura rechazada |
| D6 | A inicia guardado; cortar su Wi-Fi/SMB **en el equipo o red de ensayo** antes del ACK | Resultado incierto, sin falso éxito; no hay reenvío automático ni segundo commit |
| D7 | Restablecer red (Wi-Fi → cable o viceversa) | Solo se reanudan escrituras cuando identidad, lock y conectividad se verifican |
| D8 | Terminar forzosamente proceso A durante una escritura | B no elimina un lock ajeno por TTL solamente; datos o commit deben poder conciliarse |
| D9 | Reiniciar Electron con journal `submitted` sin recibo | No se interpreta ausencia de recibo de una ruta legacy como `not-committed` |
| D10 | Recuperar operación con recibo en la copia de ensayo | Se comprueba el estado real por SQLite; no se reintenta una escritura confirmada |
| D11 | Provocar cierre con actividad de backup/lectura independiente | No se reabre SQLite mientras exista trabajo pendiente o estado incierto |
| D12 | Mantener dos instancias durante uso sostenido con alternancia de operaciones | Sin corrupción, doble escritura, cierre inesperado no explicado ni pérdida de datos |

### Evidencias que deben guardarse
- Fecha/hora de cada evento y equipo; acciones en A/B y resultado mostrado en pantalla.
- Ruta/identidad de SQLite, versión de esquema, hashes antes/después y comprobación `PRAGMA quick_check` en copia cerrada al finalizar.
- Extractos de logs `electron-main-watchdog.jsonl`, diagnóstico multiusuario, incidencias de lock, journal local de cada equipo y CI correspondiente, eliminando identificadores personales.
- Conservar operaciones de prueba con `operationId` único para examinar el recibo de SQLite; no compartir bases reales en el repositorio.

### Criterios de STOP / NO-GO
- Escritura perdida o sobrescrita sin conflicto.
- Dos escritores simultáneos sin propiedad exclusiva verificada.
- `ok:true` entregado con commit incierto, o reintento automático de operación incierta.
- Lock SMB ajeno eliminado sin prueba de salida y propiedad.
- Recuperación con base/UUID equivocado, `quick_check` distinto de `ok`, journal corrupto o worker previo vivo.
- Entrada en base de producción o prueba sobre copias sin respaldo verificable.

## Requisitos para la auditoría siguiente

La ejecución local con dos instancias es el **primer nivel**. Para declarar robustez SMB hay que completar también **dos ordenadores Windows físicos** sobre la misma carpeta SMB, con cortes Wi-Fi/cable reales y verificación de todos los casos pertinentes. No afirmar PASS a partir de esta PR; la PR aporta pruebas automáticas locales y un protocolo de aceptación manual. La integración del worker y del supervisor seguro continúa siendo un bloqueo para un GO productivo.
