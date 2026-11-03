# Publicación del Excel de Tareas sobre SMB

## Alcance de protección
- ExcelJS sigue generando el libro completo en un archivo temporal en el
  **mismo directorio** del destino, con un UUID para evitar colisiones.
- Solo la publicación toma un bloqueo compartido de carpeta
  `.traccion-tareas-excel.lockdir` mediante `mkdir` exclusivo.
- Mientras posee el bloqueo, el cliente **vuelve a leer** las tareas activas
  desde SQLite (utilizando la cola SQLite únicamente durante esa lectura).
  Compara SHA-256 del contenido íntegro con el snapshot exportado. Si cambió,
  no sustituye el archivo y solicita una nueva exportación automática.
- Se usa `rename` desde el archivo temporal al destino, dentro del mismo
  directorio. Si Windows/SMB rechaza sustituir un Excel abierto, se devuelve
  un error sin truncar el archivo anterior. No hay fallback a `copyFile`.
- La eliminación de espejos anteriores se realiza con el mismo bloqueo.
- El bloqueo se actualiza con heartbeat cada 5 s. Se considera candidato a
  recuperación automática solo si su mtime supera los 10 minutos; se confirma
  de nuevo y se renombra antes de eliminarlo. Se evita publicar ante
  pérdida de propiedad o heartbeat. Espera normal máxima: 12 segundos.

## Límites relevantes
- El sistema de archivos debe soportar `mkdir` exclusivo y `rename`
  consistente entre clientes SMB. No se garantiza atomicidad entre volúmenes:
  por eso ambos archivos residen en la misma carpeta.
- El chequeo de versión y el `rename` no son una transacción con la escritura
  SQLite de otros usuarios. Una modificación concurrente justo después de la
  comprobación podría dejar un Excel desactualizado **temporalmente**, hasta
  que se procese la siguiente actualización automática. La base de datos
  sigue siendo la única fuente de verdad.
- La recuperación de un lock abandonado depende de relojes/mtime SMB fiables.
  No intervenir manualmente en los directorios `.lockdir` mientras haya
  ordenadores usando la aplicación.
- Si la hoja Excel está abierta y bloqueada por Office, puede fallar la
  sustitución; el usuario recibirá aviso y se mantendrá el fichero anterior.
- Una exportación fallida no deshace el guardado de tareas en SQLite.

## Prueba operativa antes de despliegue real
1. Emplear **una copia de la base de datos** y carpeta Excel aislada.
2. Con dos ordenadores, guardar una tarea simultáneamente y comprobar que el
   archivo resultante abre y muestra ambos cambios.
3. Forzar una exportación manual mientras el otro genera el Excel.
4. Abrir el Excel en modo edición desde Office, modificar una tarea y
   comprobar que un error de reemplazo no corrompe el archivo anterior.
5. Cortar la red a un cliente durante la exportación y recuperar conexión.
   Verificar el registro SQLite y volver a actualizar Excel manualmente.
6. Repetir la comprobación por cable y Wi-Fi, midiendo tiempo de guardado
   individual y tiempo total del Excel.
