# PR 2 — Históricos de Comité y Paritaria: puntos vinculados bajo demanda

## Antes
Abrir Históricos, iniciar una búsqueda de sesión o visualizar una sesión
abierta que referenciara puntos ausentes ejecutaba
`loadHistoricalTasks()`: un SELECT de todas las tareas cerradas, aunque no
estuvieran vinculadas al Comité o a la Paritaria consultados.

## Ahora
- La lista histórica de **sesiones** se sigue cargando al abrir Históricos o
  buscar por texto, para no cambiar la semántica del listado ni los filtros.
- Solo se consultan los IDs de tareas incluidos en `items` de las sesiones
  relevantes, con `WHERE deleted_at IS NULL AND id IN (?, ...)`.
- Se eliminan IDs duplicados, se descartan los ya presentes en memoria y se
  agrupan hasta 300 por IPC para respetar los límites de parámetros SQLite.
- Los puntos se guardan únicamente en un mapa de la pantalla de sesiones,
  sin activar el histórico general de Tareas ni guardar cambios en SQLite.
- Los puntos obtenidos mantienen la información usada para búsquedas,
  visualización, impresión, exportación y el resumen histórico Word.
- Ante SQLite desconectado no se devuelve una falsa lista vacía y se conservan
  los últimos datos válidos ya leídos.

## No se modifica
La PR 1 de lecturas individuales, los cierres atómicos, la importación
transaccional de sesiones y puntos, la actualización de actas, los resúmenes
Word, las copias de seguridad ni el modelo de bloqueo multiusuario.

## Limitaciones
- Para mostrar/buscar **todas** las sesiones históricas, sigue siendo
  necesario consultar sus registros. No se implementa paginación SQL de
  sesiones ni índices de búsqueda FTS en esta PR.
- Si una sesión histórica referencia muchos puntos, el coste de recuperar
  esos puntos sigue siendo proporcional al número de referencias (no al
  tamaño del histórico total de Tareas).
- Los puntos recuperados son una instantánea de lectura. Para confirmar
  cierres y modificaciones se mantienen los controles de versión existentes.
- La ganancia real sobre Wi-Fi requiere medir la instalación.

## Prueba con copia de datos
1. Abrir Comité y Paritaria en vista activa; comprobar los puntos que remiten
   a tareas antiguas y que las tareas cerradas ajenas no se cargan masivamente.
2. Abrir Históricos y buscar por código, fecha, título y texto de puntos.
3. Imprimir/exportar una sesión histórica con puntos de años anteriores.
4. Cerrar una sesión con Acta y generar su resumen Word.
5. Importar un histórico y comprobar que muestra los puntos importados.
6. Simular desconexión temporal: no deben desaparecer las sesiones ni los
   puntos previamente recuperados; recuperar conexión y volver a consultar.
7. Comparar tiempos de apertura y búsqueda por Wi-Fi antes/después.
