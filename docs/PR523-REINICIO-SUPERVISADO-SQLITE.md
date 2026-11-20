# PR523 · Reinicio supervisado de TrAcción tras bloqueo SQLite prolongado

## Motivo
El incidente del 20/11/2026 mantuvo el proceso Electron respondiendo a intervalos
entre bloqueos `SQLITE_BUSY`. PR #522 redujo el impacto del health-check, pero
reiniciar solo por tener el IPC desocupado no garantiza que no existan backups
o escrituras de resultado incierto.

## Comportamiento
- Tras **dos minutos sin un health-check satisfactorio**, la interfaz propone
  un reinicio supervisado manual. Tras **cinco minutos**, realiza **una sola
  solicitud automática por episodio de indisponibilidad**.
- El main process la acepta **solo** si: SQLite no está disponible, no hay
  operaciones IPC pendientes, no hay backups activos/encolados ni revisiones
  sin respaldar, el journal no contiene escrituras inciertas, la interfaz
  confirma explícitamente que no hay formularios con cambios y no se ha
  intentado otro reinicio automático en los 30 minutos anteriores.
- El cierre entra en modo `drain` para bloquear nuevas solicitudes IPC SQLite,
  revalida las condiciones y utiliza el cierre ordenado ya existente.
- Si cualquiera de esas condiciones falla, **no se fuerza el cierre** y la
  aplicación continúa bloqueando la edición y comprobando la recuperación.
  La interfaz muestra el motivo del rechazo. El botón de reinicio manual
  se mantiene, pero también pasa por las comprobaciones de seguridad.

## Límites intencionados
- Un proceso principal bloqueado dentro de una llamada nativa no puede
  atender IPC; el watchdog independiente sigue registrando la incidencia
  pero **no mata** el proceso por la fuerza.
- Un backup pendiente, aunque no esté ejecutándose todavía, impide el reinicio
  supervisado. La edición no se reactiva para "resolver" el bloqueo.
- Un fallo/timeout de escritura no se interpreta como operación completada:
  su resultado se debe reconciliar, no reintentar.
- Ningún reinicio automático se solicita dos veces en el mismo episodio.
  La marca local de 30 minutos impide bucles entre nuevos procesos.
- No se modifican `journal_mode`, protocolo SMB, datos, esquema o timeouts SQLite.
- Sigue siendo necesaria una prueba con una **base de ensayo SMB**, sin tocar
  producción: bloqueo prolongado, backup retenido, editor con borrador,
  journal con resultado incierto, reinicio permitido y rechazo por cooldown.
- Un proceso que ignore los timeouts nativos requiere un aislamiento real de
  SQLite mediante `utilityProcess`; no se puede garantizar la disponibilidad
  del event loop solo con estos cambios.

## Validación automática
- `electron/safeRestartPolicy.test.ts`: queue, backups, escrituras inciertas,
  5 minutos y anti-bucle 30 minutos.
- `electron/sqliteIpcQueue.test.ts`: drain rechaza trabajos nuevos y
  no empieza durante una operación en vuelo.
- `src/services/safeRestartPolicy.test.ts`: avisos 2 minutos y reinicio 5.
- `src/services/databaseHealthMonitor.test.ts`: una solicitud por episodio,
  propagación de rechazo y reseteo en recuperación.
- GitHub Actions: TypeScript, ESLint, Vitest, web y Electron.

## Archivos funcionales
`electron/main.ts`, `electron/sqliteIpcQueue.ts`,
`electron/persistence/localBackupService.ts`, `electron/sqlitePersistence.ts`,
`electron/preload.cts`, `src/vite-env.d.ts`, `src/App.tsx`,
`src/services/databaseHealthMonitor.ts` y componentes de aviso.
