# PR 3 — Resúmenes Word seguros en carpetas SMB

## Alcance
Se refuerza exclusivamente la persistencia de los resúmenes Word históricos de Comité y Paritaria. Las funciones que modifican `word/document.xml`, las tablas, la fuente, los nombres de salida, los puntos y la detección de duplicados permanecen sin cambios.

## Medidas
- Los dos módulos utilizan un bloqueo exclusivo propio en la carpeta compartida, creado mediante `mkdir`; cada bloqueo tiene un token UUID. Espera máxima normal de 10 segundos, reintentos de 250 ms, heartbeat de 5 segundos.
- Si el bloqueo supera los 10 minutos sin renovar su mtime, se **rechaza** la publicación y se solicita comprobar manualmente si algún equipo sigue actualizando. No se retira automáticamente: la antigüedad por sí sola no acredita abandono. Los clientes verifican la propiedad antes de publicar.
- Se genera un temporal con UUID **en el directorio de destino** y se verifica su tamaño antes de modificar el original.
- El original se renombra a un respaldo único (no se destruyen respaldos anteriores). Se publica el temporal mediante `rename`. Ante fallo, se intenta restaurar el original. Si falla la restauración por corte SMB, el respaldo queda disponible.
- En un siguiente intento, si el resumen vigente ha desaparecido y existe **un solo** respaldo reconocible, se restaura automáticamente bajo el bloqueo. También se reconocen los respaldos `.traccion-backup` anteriores.
- No se interpreta un fallo de publicación como cierre fallido de sesión: el cierre SQLite ya realizado se conserva, y desde el histórico se puede reintentar el resumen.

## Límites y despliegue
- Las dos operaciones de renombrado del original y del temporal no forman una transacción única. Puede existir una ventana entre ambas; el respaldo y la recuperación reducen las consecuencias de una interrupción.
- Los cambios no coordinan correctamente clientes de versiones anteriores que continúen escribiendo con el mecanismo de bloqueo antiguo. **Actualizar todos los equipos a la misma versión antes de activar el uso multiusuario.**
- En SMB, la fiabilidad de `mkdir`, `rename` y `mtime` depende del servidor y de las condiciones reales de la red. No se puede prometer ausencia absoluta de conflictos durante cortes extremos.
- Si Word mantiene abierto el documento y Windows impide renombrarlo, se devuelve error y se conserva el fichero anterior.
- Si existen varios Word vigentes compatibles o varios backups sin Word vigente, no se elige uno arbitrariamente. Requiere revisión manual.

## Pruebas de aceptación
1. Usar copias de los Word y una carpeta de pruebas, sin tocar originales corporativos.
2. Actualizar desde Comité y luego desde Paritaria; comprobar formato, puntos, fecha y archivos resultantes.
3. Dos PCs: intentar actualizar el mismo Word a la vez. Comprobar serialización y que aparecen ambas sesiones (sin duplicados).
4. Abrir el DOCX con Microsoft Word para forzar bloqueo, intentar actualizar y confirmar que el original sigue disponible.
5. Cortar red durante generación/publicación. Verificar copia recuperable y comportamiento en siguiente intento.
6. Comprobar recuperación de backups legados y rechazar restauración si existen varios candidatos.
7. Repetir en red cableada y Wi-Fi. Comprobar que el cierre SQLite no se deshace si falla el Word.
