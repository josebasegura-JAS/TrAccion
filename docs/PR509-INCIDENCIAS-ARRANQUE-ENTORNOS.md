# PR509 · Incidencias de arranque Producción / desconexión Pruebas

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
