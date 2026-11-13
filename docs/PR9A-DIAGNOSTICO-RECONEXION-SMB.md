# PR9A · Diagnóstico de cortes Ethernet → Wi-Fi en SQLite/SMB

## Alcance

PR exclusivamente diagnóstica. **No cambia** la clasificación de IPC, los timeouts, los reintentos, `.lockdir`, la recuperación de operaciones indeterminadas, los backups ni la configuración de SQLite.

## Archivo nuevo

En la carpeta local de datos de TrAcción (`app.getPath('userData')`):

`sqlite-recovery-diagnostics.jsonl`

Cada evento JSON contiene fecha ISO, fase, resultado, etapa, duración, indicador `recoveryRequired`, estado de la cola IPC y (si hay error) código/nombre y **mensaje categorizado**. Los mensajes completos no se copian porque pueden incluir rutas UNC, SQL, nombres o información personal.

### Health-check

- Se conservan todos los fallos, resultados omitidos y checks de duración ≥2 s; de los saludables rápidos se muestrea uno de cada 60.
- `stage`: `archivo` / `consulta` / `esquema` / `identidad` / `bloqueo-heartbeat` / `sin-etapa`.
- La duración por etapa continúa disponible mediante métricas `sqlite-stage` de rendimiento. La PR expone además la etapa fallida al diagnóstico.
- `recoveryRequired` permite distinguir un fallo que activa suspensión de uno que no la activa.

### Recuperación

Se registra `started` antes de las fases síncronas susceptibles de bloquearse:
`cierre` → `verificacion` (solo corrupción sospechada) → `reapertura` → `validacion-identidad`.

Un evento `failed` identifica la última fase; un `ok` confirma terminación. Si el proceso queda bloqueado indefinidamente, la última línea `started` sirve de pista, no de prueba de que sea la función culpable.

### Tamaño / rendimiento / privacidad

- Registro local limitado por rotación a 512 KiB por archivo, más `.previous`.
- Se mantienen separados `sqlite-incidents.jsonl` y `electron-main-watchdog.jsonl`, sin cambios semánticos en el primero.
- Escritura síncrona local mínima y sin propagación de errores diagnósticos. El registro puede introducir un coste pequeño; no está garantizado que se escriba si el proceso queda totalmente detenido.

## Protocolo de prueba

1. **Antes de la prueba** copiar los informes previos fuera del directorio de trabajo.
2. Usar datos de ensayo; abrir TrAcción con Ethernet y comprobar estado correcto.
3. Desconectar Ethernet, verificar el paso a Wi-Fi y anotar hora de cada transición.
4. Sin forzar nuevas escrituras inciertas, comprobar si la ventana responde.
5. Copiar `sqlite-recovery-diagnostics.jsonl`, `electron-main-watchdog.jsonl`, `sqlite-incidents.jsonl` y `last-multiuser-performance.json` **antes de reiniciar**.
6. Correlacionar timestamps en UTC y las duraciones `sqlite-stage`. No inferir una causa exclusivamente del último evento.

No realizar la prueba con información no respaldada. Si la aplicación queda bloqueada, priorizar una salida segura y no repetir manualmente guardados de resultado incierto.

## Decisión posterior

- Error no clasificado, operación termina: investigar clasificación/reapertura ligera segura.
- Recuperación bloqueada o llamada síncrona repetitiva: priorizar aislamiento en `utilityProcess`.
- Timeout con operación realmente pendiente: **no** liberar cola ni locks hasta confirmar fin o terminación segura.
