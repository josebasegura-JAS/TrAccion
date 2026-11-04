# Diagnóstico de rendimiento multiusuario (SQLite + SMB)

Esta fase es **instrumentación**, no una modificación del comportamiento de
guardado, bloqueos de edición, copias de seguridad o sincronización.

## Dónde se registra

Cada instalación escribe, aproximadamente una vez por minuto, un fichero
**local** en el perfil de Windows de la aplicación:

`<directorio userData de TrAcción>/last-multiuser-performance.json`

La ubicación exacta depende de `app.getPath('userData')` de Electron (habitualmente dentro de `%APPDATA%` en Windows).
**No** se guarda en la carpeta compartida ni se transmiten datos.

El fichero se sobrescribe con un resumen de hasta las últimas **3.000**
operaciones medidas. No contiene nombres de empleados, IDs de tareas, nombres
de personas ni contenidos de registros. Solo categorías, nombres fijos de
operación, número de muestras, errores, media, percentil 50, percentil 95 y
máximo. Se reinicia al abrir una nueva sesión de la aplicación.

Categorías:
- `ipc-wait`: espera antes de ejecutar una operación en la cola local Electron.
- `ipc-run`: ejecución real de la operación SQLite, no su timeout de respuesta.
- `smb-lock-wait`: espera de acceso exclusivo al lock SMB.
- `smb-lock-held`: tiempo de exclusividad hasta liberar el lock.
- `record-lock`: tiempo de adquisición, renovación, lectura o liberación de
  reserva de edición; se mide también si falla.
- `backup`: tiempo de copia periódica y espera de adquisición de su bloqueo.

## Protocolo con dos equipos (después de fusionar y actualizar ambos)

1. **Caso A — una persona:** iniciar TrAcción en un equipo, abrir Tareas,
   consultar cinco tareas distintas y guardar dos tareas de prueba.
2. **Caso B — ambos consultan:** abrir TrAcción en los dos equipos; consultar
   tareas distintas durante al menos dos minutos, sin guardar.
3. **Caso C — ambos editan:** guardar alternativamente tareas diferentes
   durante al menos dos minutos y repetir con guardados próximos en el tiempo.
   No modificar la misma tarea desde ambos equipos para esta medición.
4. **Caso D — backup:** repetir la edición durante una ventana suficiente
   para cubrir la copia consolidada (15 minutos desde el primer guardado).

En cada caso conservar el fichero de ambos equipos. El nombre del fichero
incluye el mismo nombre en ambos equipos; renombrar las *copias* con las letras
de caso y PC, sin modificar los originales. No comparar sesiones de
duración/carga distintas como si fueran idénticas.

## Cómo interpretar el informe

- P95 alto en `ipc-wait` y bajo en `ipc-run`: cola local saturada.
- P95 alto en `smb-lock-wait`: contención por acceso exclusivo entre equipos.
- P95 alto en `record-lock`: comprobaciones/heartbeats de reserva costosos.
- P95 alto en `smb-lock-held`: alguna operación retiene demasiado tiempo
  el bloqueo; revisar su tipo de operación.
- P95 alto en `backup`: buscar correlación con las esperas de guardado.

No diagnosticar solo por el máximo ni por grupos con pocas muestras.
La instrumentación no constituye una prueba de seguridad, consistencia ni
causalidad por sí sola.

## Limitaciones

Los resúmenes son por proceso, no un rastreo distribuido: no existe un ID
correlacionado de operación entre los dos equipos. El informe puede perder
hasta el último minuto al producirse un cierre abrupto. Los histogramas
conservan solo las muestras más recientes y el coste del renderizado de React
no está medido en esta primera fase. No se debe interpretar esta PR como
una mejora demostrada de la velocidad.
