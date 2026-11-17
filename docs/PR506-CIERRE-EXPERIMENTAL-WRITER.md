# PR506 · Cierre del adaptador Electron del writer experimental

## Alcance verificado por código

Se incorpora `createExperimentalElectronDetachedWriterChild()`, un adaptador
real para `utilityProcess.fork` hacia el supervisor de PR500. No se importa
desde `electron/main.ts`, `electron/startup.ts` ni `electron/sqlitePersistence.ts`.

La prueba de integración ejercita el adaptador Electron mediante un doble
del proceso nativo, el supervisor real y el marcador persistente:
`READY → open-session → session-opened → verifyOwnership → requestStop →
native EXIT → exit-confirmed`. Solicitar `kill()` no equivale a EXIT.

No se abre ninguna SQLite de producción con este adaptador; tampoco se
habilita la ruta de escritura del renderer. La PR no introduce bandera de
activación ni fallback automático.

## NO-GO explícito, incluso con CI verde

- **Proceso huérfano tras crash de main**: sigue sin existir una prueba
  independiente implementada en Windows que demuestre la terminación de
  todos los hijos anteriores, especialmente tras reinicios del padre.
  `assertPreviousWriterTerminated` debe permanecer obligatorio y fallar
  cerrado. PID ausente, TTL, solicitud de `kill`, cierre de parentPort o
  simple recepción de IPC no son pruebas suficientes.
- **Cesión real de la conexión**: el handoff exige cerrar realmente todas
  las conexiones locales y drenar lectores, timers, backups y operaciones
  SQLite independientes antes de crear el hijo. El adaptador no proporciona
  esa cesión por sí mismo.
- **Pruebas físicas**: faltan dos equipos Windows con SQLite desechable
  sobre la misma carpeta SMB; no se debe usar una base con datos personales.
- **Productividad/rendimiento**: no se han demostrado mejoras P50/P95/P99
  respecto al sistema actual en el mismo entorno.

## Protocolo final para una decisión posterior

Consultar la matriz de diez pruebas de
`docs/PR502-AUDITORIA-VALIDACION-FINAL.md`. Recoger logs de ambos PCs y
registro de proceso, comprobar integridad/identidad de la base, evitar
reintentos de operaciones inciertas y verificar restauración de copia.
Hasta superar esos controles, conservar el escritor experimental
**desactivado**. La próxima decisión debería ser GO/NO-GO basada en
evidencia física, no otra serie de PR de instrumentación.

## Criterio de revisión

La PR solamente es fusionable con TypeScript, ESLint y Vitest verdes.
La fusión no significa autorización para activar el writer.
