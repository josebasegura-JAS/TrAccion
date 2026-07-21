# Arquitectura de TrAccion

Este documento describe los patrones reales que ya usa el código, verificados contra el repositorio (no un ideal aspiracional). El objetivo es que cualquiera —incluida una sesión de IA sin memoria de conversaciones anteriores— pueda seguir las mismas reglas sin tener que releer miles de líneas primero.

Si un cambio rompe una de estas reglas, es casi seguro un bug, no una variante válida.

## 1. Dónde vive cada cosa

```
electron/
  main.ts              IPC handlers (puente entre frontend y persistencia)
  preload.ts            Puente window.traccion expuesto al renderer
  sqlitePersistence.ts   Toda la lógica de SQLite: schema, migraciones, locks, backups, VACUUM

src/features/<modulo>/
  domain/                Tipos, validación, lógica pura sin efectos secundarios
  store/                 Zustand store + repositorio SQLite del módulo (mismo directorio, no carpetas separadas)
  components/            UI del módulo

src/components/          Módulos que aún no se han movido a src/features/<modulo>/
src/shared/               Código compartido entre módulos (tablas, sesiones, exportación, locks)
src/services/             Capas transversales (persistencia, búsqueda global, estado de BD)
```

**Nota de transición**: algunos módulos (Plantilla, Tareas, Teletrabajo, Ajustes, Comité, Paritaria) todavía viven en `src/components/` en vez de `src/features/<modulo>/`. No es un error, es deuda histórica. Al tocar uno de estos módulos no es necesario moverlo a `features/` salvo que ya se esté haciendo un cambio grande ahí.

El repositorio SQLite de cada módulo vive en un archivo `<modulo>SqliteRepository.ts` dentro de la propia carpeta `store/`, no en una carpeta `repository/` separada. Es el patrón real en los 12+ módulos ya migrados — no inventar uno nuevo.

## 2. Patrón de persistencia (regla central del proyecto)

Cada módulo migrado a SQLite tiene tres piezas, con nombres predecibles:

1. **Lado Electron** (`electron/sqlitePersistence.ts`): un repositorio creado con la factory `createJsonModuleRepository(tableName, legacyKey, moduleLabel, ...)`. El `tableName` es siempre un literal de código fuente, nunca viene de input externo — esa es la protección real contra inyección SQL, no una whitelist en runtime.
2. **Lado frontend, repositorio** (`store/<modulo>SqliteRepository.ts`): funciones `hasXSqliteRepository()`, `loadXRecordsFromSqlite()`, `saveXToSqlite(record, expectedUpdatedAt)`. "Eliminar" no es una función distinta: es `saveXToSqlite` con `deletedAt` poblado (soft-delete).
3. **Lado frontend, store** (`store/useXStore.ts`): expone `xWithConcurrencyCheck` (create/update/remove) a los componentes. Las versiones sin chequeo de concurrencia (`create`, `update`, `remove` sin sufijo) **no deben existir** — si aparecen, son legacy y se eliminan (ver sección 6).

### Control de concurrencia

Todo `update`/`remove` recibe `expectedUpdatedAt: string | null`. Si el valor en BD no coincide, la operación falla con un mensaje claro ("modificado por otro usuario") en vez de sobrescribir a ciegas. **Cualquier componente que llame a una función de guardado sin pasar `expectedUpdatedAt` está incompleto.**

### Lectura nunca escribe

Las funciones de carga (`load`, `reloadFromStorage`, `mirrorX`) solo escriben en `localStorage` como caché de lectura, **nunca** disparan una escritura real a SQLite. Si una función de lectura necesita guardar algo en la base de datos, es un bug — el caso histórico fue Teletrabajo, ya corregido.

### Fallback a localStorage

Cuando `window.traccion?.loadXRecords` no existe (SQLite no disponible), el store cae a `localStorage` vía `writeStorageItem`/`readStorageItem` (capa unificada en `src/services/persistence.ts`). Esto es intencional, no deuda técnica: es la red de seguridad de arranque cuando SQLite aún no está montado. La clave debe estar en `PERSISTED_STORAGE_KEYS` (`src/services/persistenceKeys.ts`) para entrar en esa capa.

Esto cubre el arranque en frío, pero no una caída de conectividad SMB a media sesión: en ese caso `window.traccion.saveXRecordIfUnchanged` sigue existiendo (el puente IPC no ha desaparecido), así que el store nunca activa el fallback de arriba, y hasta julio de 2026 el guardado simplemente fallaba con un mensaje de error, sin más red de seguridad.

### Cola de escrituras pendientes ante caída de conectividad

`src/services/pendingRecordWrites.ts` cubre ese hueco para el patrón `<modulo>SqliteRepository.ts`: cada repositorio envuelve su `saveXToSqlite` con `saveRecordWithPendingFallback` y se registra una vez con `registerPendingWriteReplayer(module, replayer)`. Si el guardado falla por un mensaje identificable como problema de conectividad (heartbeat SMB bloqueado, base ocupada, IPC caído — ver `isConnectivityFailureMessage`), el cambio se encola en `localStorage` (`SQLITE_PENDING_RECORD_WRITES_KEY`) en vez de perderse, y se reintenta automáticamente en el siguiente ciclo de polling (`externalDataSync.ts`) o al reconectar. Un conflicto OCC real (otro usuario ya modificó el registro) **no** se encola — se deja pasar tal cual para que el usuario lo vea, igual que hoy.

Es hermana, no sustituta, de la cola más antigua de `persistence.ts` (`SQLITE_PENDING_WRITES_KEY`, atada a `writeStorageItem`): esa protege el camino genérico de clave plana, que hoy usan sobre todo escrituras espejo en `localStorage`, no el guardado real de la mayoría de módulos.

**Migrado a la nueva cola**: todos los módulos con `<modulo>SqliteRepository.ts` — Tareas, Licencias sin sueldo, Actas (registros y tipos), Criterios RRLL, Plantilla (empleados), Vinculograma, Teletrabajo (solicitudes) y las 5 entidades de Ticket Restaurante (calendarios, personas, ausencias, config, manutenciones). Quedan deliberadamente fuera los guardados por lote (`saveXsToSqlite`, usados por importadores masivos): encolar un lote entero complicaría la reconciliación sin aportar nada — si un import falla, el usuario lo repite.

## 3. Importadores masivos

Regla extraída de arreglar el importador de histórico de Teletrabajo (`previewImportHistorico` / `confirmImportHistorico` en `useTeletrabajoStore.ts`):

1. **Leer y calcular en memoria** (función pura en `domain/`, sin efectos secundarios) — produce un resultado con resumen (creados/actualizados/sin cambios/ignorados).
2. **Mostrar resumen al usuario** antes de tocar la base de datos. Nunca escribir en el mismo paso que se lee el archivo.
3. **Confirmar explícitamente** (botón "Confirmar e importar") — solo entonces se persiste, en bloque, no fila a fila.
4. **Conservar campos que el importador no conoce** al actualizar un registro existente (ejemplo: validaciones internas de Teletrabajo no se resetean al reimportar un histórico externo).

Este patrón está implementado en Teletrabajo. Los importadores de Especiales y Criterios RRLL todavía no separan preview de confirmación — son candidatos a alinear, no la referencia a copiar.

## 4. Backups (5 mecanismos, cada uno con un propósito distinto)

| Mecanismo | Dónde | Cuándo | Retención |
|---|---|---|---|
| Backup compartido SMB | misma carpeta que `traccion.sqlite` | cada guardado (debounce 5s) | últimas 3 copias |
| Backup local rotado | `userData/sqlite-local-backup` | cada guardado (debounce 5s) | últimas 5 copias |
| Backup diario local | `userData/sqlite-daily-backup` (configurable) | cada guardado, sobrescribe el archivo del día | 1-7 días, configurable |
| Backup de cierre | `userData/sqlite-local-backup/shutdown` | al cerrar la app | últimas 3 copias |
| Backup manual | igual que el compartido + local | botón "Crear copia ahora" en Ajustes | rota igual que el rotado |

`VACUUM` + `ANALYZE` corren automáticamente al cerrar la app (máximo 1 vez por semana) o a demanda desde el botón "Compactar ahora" en Ajustes. Compactan el archivo activo, no los backups.

## 5. Locks

Dos mecanismos distintos, no intercambiables:

- **Lock de archivo** (`acquireLock`/`releaseLock`, basado en `mkdir`, en `electron/sqlitePersistence.ts`): coordina operaciones de mantenimiento (VACUUM, backups) entre los 2-3 equipos de la red. Tiene heartbeat para operaciones largas.
- **Lock de registro** (`useSharedRecordLock`, por `(module, recordId)`): impide que dos personas editen el mismo registro a la vez desde el editor. No bloquea lectura, solo edición concurrente del mismo ítem.

Un módulo puede (y suele) usar ambos sin conflicto, porque operan sobre claves distintas.

## 6. Qué es legacy y se puede eliminar sin preguntar

- Funciones `create`/`update`/`remove` sin `WithConcurrencyCheck` que ningún componente real invoque. Antes de borrar, confirmar con `grep` que cero componentes las llaman — varias veces estas funciones existen "por si acaso" sin que nadie las use.
- Helpers (`persist`, `persistRecords`) que solo llamaban a las funciones anteriores: si quedan huérfanos tras la limpieza, se eliminan también, junto con el import de `writeStorageItem` si deja de usarse.
- Archivos con el comentario `// Archivo legado no usado` al inicio (`src/features/PlantillaPage.tsx`, `TareasPage.tsx`, `TeletrabajoPage.tsx`, `JobPositionTranslationsModal.tsx`) — no tocar su contenido, son marcadores intencionales de una reorganización anterior, no hace falta "completarlos".

## 7. Cuándo subir la versión de schema

`CURRENT_SCHEMA_VERSION` en `electron/sqlitePersistence.ts` solo sube cuando se añade una `migrateToVersionN()` real que crea/modifica tablas. Nunca subir el número sin la migración correspondiente — si el número sube sin cambios reales de esquema, el guard de seguridad (que impide abrir una BD "más nueva" que el código) deja de proteger nada.

## 8. Convenciones de UI

- Botones de acción: `ActionButton` (`src/components/ui/ActionButton.tsx`), no `<button>` con clases sueltas. Variantes: `save`, `delete`, `secondary`, `add`, `edit`, `approve`, etc.
- Inputs/selects/textareas: `Field`, `Input`, `Select`, `Textarea`, `FieldLabel` (`src/components/ui/Field.tsx`).
- Cabecera de módulo: `PageHeader` (`src/components/ui/PageHeader.tsx`) — eyebrow + título + ayuda + subtítulo + acciones.
- Confirmaciones y alertas: `useAppDialog()` (`alert`, `confirm` + `dialogNode` a renderizar en el JSX), no `window.confirm`/`window.alert` nativos.

Migrado: Especiales, Sorteos, Licencias sin sueldo, Presupuestos, Criterios RRLL, Vinculograma, header de Actas.
Pendiente: Plantilla, Tareas, Teletrabajo, Ajustes, Comité, Paritaria, resto de Actas, Ticket Restaurante.

## 9. Multiusuario: estado real por módulo

Todos los módulos en `src/features/` con repositorio SQLite tienen `expectedUpdatedAt` en sus operaciones de escritura, incluido Ticket Restaurante (calendarios, personas, ausencias, configuración y manutenciones), que se completó en julio de 2026 — antes era la única excepción. Además, todas las escrituras de `TicketRestaurantePage.tsx` están envueltas en `withSharedModuleLocks(['ticket-restaurante'])`, igual que Sorteos y Especiales. Ver `DECISIONS.md` para el detalle de qué se cambió y por qué.

Nota de nomenclatura: las funciones de escritura de Ticket Restaurante (`updateCalendar`, `upsertPerson`, `removeAbsence`, etc.) hacen la comprobación OCC completa pero **no** llevan el sufijo `WithConcurrencyCheck` que sí usan Especiales/Sorteos/Actas. Es una inconsistencia de nombres heredada, no un hueco funcional — no renombrar sin motivo, ya que tocaría toda la superficie pública del store.

**OCC (no pisar cambios ajenos al guardar) y detección en vivo (ver los cambios de otro usuario sin recargar) son cosas distintas** — un módulo puede tener la primera perfecta y carecer de la segunda. En julio de 2026 se encontró que Licencias sin sueldo, Especiales, Criterios RRLL, Ticket Restaurante, Vinculograma, tipos de Acta y Configuración tenían OCC correcto pero ninguna detección en vivo real (el polling de `externalDataSync.ts` nunca se enteraba de sus cambios) — arreglado añadiéndolos a `DIRECT_STORE_UPDATED_AT_TABLES` en `electron/persistence/directStoreUpdatedAt.ts`. Ver `DECISIONS.md` para el detalle. Si añades un módulo nuevo con tabla propia, añádelo ahí explícitamente — no asumas que un mirror-write en el store cubre esto sin comprobar que se ejecuta en el camino de éxito, no solo en el de fallback.

## 10. Tests: huecos conocidos

- `electron/sqlitePersistence.ts` (~1975 líneas a julio de 2026, tras varias rondas de extracción — la nota anterior de ">5.000 líneas" quedó desactualizada) sigue sin tests directos sobre el fichero en sí, porque importa `electron` (`app`) y eso le impide correr con Vitest normal. La lógica pura que sí se pudo extraer sin ese problema (clasificación de errores SQLite: corrupción, contención de lock, `SQLITE_BUSY`/`SQLITE_LOCKED`) vive en `electron/persistence/sqliteOperationGuard.ts` y sí tiene tests directos — mismo patrón que ya se usó para `sqliteConnection.ts` y `schemaMigrations.ts`. Lo que queda sin cubrir es la orquestación con estado (`activateDatabase`, `safeDatabaseOperation`, apertura/cierre de la conexión real): verificado manualmente durante el desarrollo, no como tests del repositorio.
- Comité y Paritaria (`src/shared/sessions/`) **sí tienen tests** (`createSessionStore.test.ts`, `createSessionStore.nativeTable.test.ts`, `session.test.ts`, `sessionSqliteRepository.test.ts` — 35 tests en total): la nota anterior de "no tienen ningún test" quedó desactualizada en algún momento entre julio de 2026 y ahora. Antes de asumir que un área carece de tests, comprobar con `find`/`grep` en vez de fiarse de esta lista — es exactamente el tipo de nota que caduca sin que nadie la borre.

Antes de tocar `sqlitePersistence.ts`, considerar si el cambio justifica extraer la pieza afectada a un módulo sin dependencia de `electron` (como ya se hizo con los repositorios y con `sqliteOperationGuard.ts`) en vez de añadir más código intestable al monolito.
