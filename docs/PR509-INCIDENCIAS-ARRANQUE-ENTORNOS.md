# PR509 · Incidencias de arranque Producción / desconexión Pruebas

## Evidencia recibida el 18/11/2026

El archivo `sqlite-recovery-diagnostics(4).jsonl` contiene tres fallos de
`health` en la etapa `consulta`, a las 06:45:40, 06:46:02 y 06:46:16 UTC.
Sus duraciones son 20.033, 20.020 y 8.418 ms. Todos registran
`recoveryRequired:false`, `queuedOperations:0` y
`errorMessage:"Error sin código normalizado"`. Esta etapa ejecuta
`verifySqliteHealthInUtilityProcess` por defecto. Las dos primeras duraciones
son **compatibles** con el timeout de 20.000 ms del runner aislado, pero
los logs anteriores no permiten demostrarlo porque la excepción no incluía
código. Tampoco muestran el resultado del guardado de la tarea.

El archivo adjunto `electron-main-watchdog(5).jsonl` termina el
**16/11/2026 a las 11:34 UTC**, dos días antes del incidente: no permite
correlacionarlo con la desconexión del 18/11. Nunca atribuir un watchdog
antiguo a la ejecución actual.

PR509 incorpora códigos diagnósticos acotados:
`SQLITE_WORKER_TIMEOUT`, `SQLITE_WORKER_REJECTED`,
`SQLITE_WORKER_SEND_FAILED` y `SQLITE_WORKER_EXIT_UNCONFIRMED`.
Son categorías sanitizadas, sin rutas/SQL/identificadores privados, y no
alteran la política de fallo cerrado ni la confirmación real de EXIT.

**Estado:** causa raíz de la latencia/desconexión no determinada.
Continuar la investigación con registros del mismo intervalo y una nueva
reproducción solo sobre base ficticia. No modificar umbrales, bloquear menos
ni reintentar escrituras mientras siga sin demostrarse el resultado anterior.

## Hecho comprobado en el código
`electron/main.ts` usa un bloqueo de instancia única, compartido por
Producción y Pruebas en el mismo PC. Antes de esta PR, si ya había un proceso
abierto (incluso inmóvil en el splash de reconexión), el segundo proceso
ejecutaba `app.quit()` sin mostrar ninguna explicación. Esto coincide con
el síntoma «Producción no abre» cuando Pruebas sigue en ejecución, **pero no
prueba que sea la causa del caso concreto**.

La corrección muestra un aviso y no abre una segunda conexión SQLite. Para
cambiar de entorno se requiere cierre completo del proceso anterior.

## La desconexión tras guardar una tarea no está diagnosticada
La captura solo acredita que la recuperación SQLite está en curso, no la
causa del fallo (error de E/S, SMB/heartbeat, lock, timeout o integridad).
No cambiar `sqlitePersistence`, reintentos, locks o seguridad de datos sin
el diagnóstico concreto.

Reproducir **solo en Pruebas** y recuperar:
- `sqlite-recovery-diagnostics.jsonl` del perfil local de Pruebas;
- `electron-main-watchdog.jsonl` del mismo perfil;
- Informe de incidencia de TrAcción si está disponible;
- hora del intento de guardar, ruta aproximada de carpeta de ensayo (sin
  identificadores privados), y si es ruta local o SMB.

Estos ficheros de diagnóstico pueden contener información de la máquina:
revisarlos antes de compartirlos. No borrar locks ni marcadores ni copiar la
base productiva para reproducir el fallo.

## Prueba manual que debe pasar antes de activar el nuevo selector
1. Cerrar por completo TrAcción, incluida la instancia de Pruebas.
2. Abrir Producción y confirmar la ruta/UUID esperado sin editar datos.
3. Cerrar Producción por completo.
4. Abrir Pruebas y realizar una única tarea ficticia, guardar y reabrir.
5. Con una instancia abierta, iniciar otra: debe mostrar aviso y no intentar
   conectar a la otra base simultáneamente.

**No es un GO para el escritor SQLite independiente.**
