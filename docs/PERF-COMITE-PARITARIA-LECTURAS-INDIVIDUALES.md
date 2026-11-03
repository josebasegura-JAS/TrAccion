# PR 1 — Lecturas granulares de Comité y Comisión Paritaria

## Problema
El flujo de edición, reordenación de puntos, cierre/reapertura a través del
store y eliminación consultaba `loadAllSessionRecordsFromSqlite`, descargando
todas las sesiones para operar sobre un único identificador. La creación de
sesiones también hacía una recarga completa inmediatamente después del INSERT.

## Cambios
- Añadida consulta parametrizada `WHERE id = ? AND deleted_at IS NULL`,
  usando la PK de `comite_session_records` o `paritaria_session_records`.
- La consulta individual atraviesa IPC Electron, preload y tipos del
  renderer; los IPC sin filtro conservan la consulta completa.
- Los stores compartidos actualizan solo el registro confirmado (alta,
  edición, eliminación, apertura/cierre ordinarios del store), manteniendo
  las demás sesiones visibles, incluidas las históricas cargadas.
- La carga inicial, la búsqueda del histórico y la importación de varias
  sesiones conservan su lectura completa.
- No se cambian las comprobaciones `expectedUpdatedAt` de concurrencia.
- No se toca el cierre transaccional que modifica simultáneamente sesiones,
  tareas y actas, ni los resúmenes Word, backups o esquema SQLite.

## Verificaciones en copia de base de datos
1. Con dos equipos, editar sesiones distintas de Comité sin perder cambios.
2. Abrir dos veces la misma sesión y confirmar que la segunda escritura con
   versión obsoleta se rechaza.
3. Repetir para Paritaria, reordenación de puntos, borrado y reapertura.
4. Crear una sesión y comprobar que las otras continúan visibles.
5. Activar Históricos y comprobar que no desaparecen sesiones antiguas
   tras editar una sesión presente.
6. Repetir por Wi-Fi, observando tiempos de operación y contención.
7. Cerrar una sesión con puntos y acta: la operación transaccional debe
   conservar su comportamiento anterior.

## Límites
No se afirma una reducción cuantitativa sin benchmark SMB real. La
sincronización y carga de historiales todavía pueden provocar consultas
completas; pertenecen a la siguiente fase de optimización.
