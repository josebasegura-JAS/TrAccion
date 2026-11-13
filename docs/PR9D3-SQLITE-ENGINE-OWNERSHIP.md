# PR9D-3 · Barrera de propiedad exclusiva del motor SQLite

## Objetivo y alcance exacto

Preparar el traspaso futuro de la conexión de escritura al proceso auxiliar sin admitir **dos propietarios dentro de una misma instancia** de TrAcción. Esta PR no inicia todavía un worker escritor ni mueve los repositorios; activa una comprobación de propiedad en dos entradas reales del motor actual: `enqueueSqliteIpc()`, `requireDatabase()` y `activateDatabase()`. En condiciones normales la propiedad permanece `main` y no hay cambio de comportamiento.

`sqliteEngineOwnershipFence` es una **barrera de proceso**, no un lock distribuido: el lock SMB entre ordenadores y la serialización IPC siguen vigentes.

## Estados

- `main`: Electron puede admitir operaciones y acceder al handle.
- `draining`: se prohíbe admitir nuevos IPC y nuevos accesos al handle; la cesión solo arranca si la cola está vacía, sin operación activa ni timeout incierto.
- `main-closed`: se ha informado explícitamente el cierre del handle; todavía no hay worker propietario.
- `worker`: solo tras declarar cerrado main, se registra un worker propietario; Electron mantiene la admisión bloqueada.
- `quarantine`: caída o finalización del worker, con escritura potencialmente incierta. No vuelve a main por `exit(0)` ni por timeout. Requiere confirmación de `exit`, cola vacía, identidad validada y conciliación explícita de posibles escrituras.

Los tickets de generación impiden procesar una respuesta o salida tardía de un worker anterior.

## Invariantes y limitaciones

1. Ningún `beginHandoff()` se invoca desde el runtime actual; solo se utiliza en tests. Esto **no constituye aún una migración efectiva del motor**.
2. Antes de habilitar la cesión real hay que asegurar que todos los accesos SQLite, incluido heartbeat, backups, inicialización y cierre, siguen el mismo protocolo; una cola vacía no es suficiente para probarlo si existen rutas no serializadas.
3. La transición `confirmMainHandleClosed` debe conectarse a la confirmación efectiva de `db.close()`, nunca al mero intento de cerrarlo; `confirmWorkerStarted` debe realizarse únicamente después de garantizar que el worker es el único propietario.
4. Si el auxiliar deja una escritura de resultado incierto, nunca reintentar automáticamente. La recuperación requiere confirmación de salida, lectura de identidad y conciliación real de cambios.
5. No se cambian TTL, locks SMB, backups, SQLite journal/synchronous, esquemas ni los repositorios funcionales.
6. Ni la PR9D-3 ni PR9D-2 eliminan todavía el congelamiento causado por la conexión principal en Electron.

## Pruebas

Vitest cubre: entrada normal, cola no vacía, operación activa, timeout, cierre y activación del worker, cancelación anticipada, generación obsoleta, resultado incierto sin salida confirmada, identidad incorrecta y retorno seguro a main.

## Para completar la migración

**9D-4: inventario + fachada de repositorios en el worker**. Unificar en un solo proceso propietario las funciones de persistencia, módulos y el ciclo de vida. Migrar por bloques solo cuando no quede un camino paralelo de escritura en main; para la base de producción se requiere corte de tráfico y migración atómica de propiedad. Mientras tanto, mantener el sistema anterior.

**9E: supervisor y reconciliación**. Detectar worker muerto/congelado, terminarlo, comprobar salida, validar base, considerar operaciones sin respuesta como indeterminadas y NO retransmitir escrituras.

**9F: auditoría funcional/robustez**. Dos usuarios en SMB, desconexiones Ethernet-Wi-Fi y Wi-Fi 60–120 s, backups, cierre, cambios de identidad, render responsive, latencias y auditoría completa de accesos síncronos restantes.

No hay base para afirmar un número exacto de PR hasta terminar el inventario de rutas de E/S.
