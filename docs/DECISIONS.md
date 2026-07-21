# Decisiones de diseño y refactor

Registro de decisiones puntuales tomadas durante sesiones de refactor con
asistencia de IA, con su justificación. A diferencia de `ARCHITECTURE.md`
(reglas generales que debe seguir todo el código), este documento recoge
**casos concretos** donde se decidió no hacer algo, aplazarlo, o hacerlo de
una forma distinta a la obvia — para que una futura sesión no reabra el
mismo debate sin contexto.

## División de archivos grandes (julio 2026)

### `TicketRestaurantePanels.tsx` (2050 líneas) → 6 archivos
Se dividió por subdominio, no por tamaño: `TicketRestauranteCalendarPanels.tsx`,
`TicketRestaurantePeoplePanel.tsx`, `TicketRestauranteConfigModals.tsx`,
`TicketRestauranteCalculationPanel.tsx`, `TicketRestauranteAbsencesTable.tsx`
y un `ticketRestauranteFormat.ts` mínimo para `formatCurrency` (compartido
por 2 grupos, no merecía archivo propio pero tampoco duplicarse).

**Bonus encontrado, no buscado**: `TicketAbsenceDisplayRow` estaba definido
dos veces de forma idéntica (en el panels y en `TicketRestaurantePage.tsx`,
sin importarse entre sí). Se dejó una sola definición, exportada desde
`TicketRestauranteAbsencesTable.tsx`.

### `ActasPage.tsx` (1446 → 929 líneas)
Se extrajeron los 3 modales (`ActasOutlookTemplateModal`,
`ActaTypeManagerModal`, `ActaEditorModal`) como componentes que reciben
todo por props; el estado y los handlers de negocio se quedaron en
`ActasPage.tsx`. **No** se tocó `actasPage.helpers.tsx` (ver más abajo, era
una decisión de una sesión anterior que sigue vigente).

Al tipar explícitamente las props de `ActaEditorModal`, TypeScript señaló
que el objeto de respaldo para un tipo de acta deshabilitado/eliminado no
incluía `deletedAt` (campo requerido por `ActaTypeDefinition`). Se corrigió
como parte del mismo cambio — es el mismo patrón de "el refactor destapa un
bug preexistente" ya visto en `sqlitePersistence.ts`.

### `SessionManagementPage.tsx` (1599 → 847 líneas)
Es el componente genérico compartido por Comité y Paritaria (vía `config`
de tipo `SessionModuleConfig`). Se dividió en 5 piezas: helpers puros
(`sessionManagementPage.helpers.ts`, cero riesgo, sin JSX), las tarjetas ya
independientes (`SessionManagementPageCards.tsx`) y 3 modales
(`SessionImportPreviewModal`, `SessionEditModal`, `SessionCloseModal`). Se
tuvo especial cuidado en no tocar ningún handler de negocio: solo se movió
JSX y funciones puras.

### `TeletrabajoPage.tsx` (1389 líneas) — solo parcialmente dividido
Se migraron sus 3 modales inline restantes a `ModalShell` (ganan cierre con
`Escape` gratis y `aria-labelledby` real), pero el archivo **no** se
dividió en piezas separadas como sí se hizo con los tres anteriores. Sigue
siendo el archivo de componentes más grande del proyecto después de
`TicketRestaurantePage.tsx`. Candidato pendiente si se retoma la limpieza
de archivos grandes.

### `TicketRestaurantePage.tsx` volvió a crecer (1887 líneas)
Tras dividir `TicketRestaurantePanels.tsx`, se añadió el hardening
multiusuario (`withSharedModuleLocks` envolviendo cada handler de
escritura) directamente en `TicketRestaurantePage.tsx`, lo que la hizo
crecer de nuevo hasta ser el archivo de UI más grande del proyecto.
Pendiente: extraer esos wrappers a un hook/módulo de store
(`ticketImportActions.ts`, `ticketCalculationActions.ts` o similar) para
que no vuelvan a acumularse ahí.

## Multiusuario en Ticket Restaurante (julio 2026)

Antes de tocar nada se comprobó el store (`useTicketRestauranteStore.ts`):
la protección OCC por registro (`expectedUpdatedAt` comparado contra
SQLite) **ya existía** para calendarios, personas, ausencias y
configuración. Lo que faltaba de verdad era `withSharedModuleLocks` a
nivel de UI (el mismo patrón que ya usan Sorteos y Especiales), que se
añadió envolviendo todas las escrituras de `TicketRestaurantePage.tsx`.

De paso se corrigió un fallo silencioso real: `onToggleActive` y
`onToggleDay` estaban conectados directamente a las funciones del store
sin comprobar `result.ok` ni mostrar error. Si otro usuario ya había
modificado ese registro, el fallo no se veía por ningún sitio.

**Manutenciones quedaron fuera de la primera pasada** porque, a diferencia
de las otras 4 entidades, `saveManutenciones`/`removeManutencion` eran
funciones síncronas de tipo `void` ("fire-and-forget"), sin `expectedUpdatedAt`
en absoluto. Se decidió arreglarlo como tarea aparte en vez de forzarlo
dentro del mismo cambio, para no mezclar dos cambios de riesgo distinto en
una misma entrega. Se completó poco después: ambas son ahora `async` y
devuelven `{ok, message?}` real.

**Nomenclatura no unificada a propósito**: las funciones de Ticket
Restaurante no llevan el sufijo `WithConcurrencyCheck` que sí usan
Especiales/Sorteos/Actas, aunque hacen la misma comprobación. Renombrar
tocaría toda la superficie pública del store y de sus ~15 puntos de
llamada sin aportar nada funcional — se documenta la inconsistencia en
`ARCHITECTURE.md` en vez de "corregirla".

## Diagnóstico de integridad de datos (julio 2026)

Se implementó reutilizando módulos ya existentes en vez de crear
infraestructura nueva: `computeHeaviestTables` (de `maintenanceQueries.ts`,
ya usado por el vacuum), `CURRENT_SCHEMA_VERSION` (de `schemaMigrations.ts`)
y `listLocalBackups` (de `localBackupService.ts`).

Las comprobaciones de "referencias cruzadas" (personas de Ticket
Restaurante con calendario inexistente, ausencias sin alta activa) se
limitaron a 2 casos conocidos y bien entendidos, no a una cobertura
exhaustiva de todas las relaciones del sistema — las tablas de TrAccion
guardan documentos JSON (`value_json`), no hay FOREIGN KEY real, así que
cada comprobación nueva exige parsear y cruzar blobs a mano. El diseño
(`findOrphanRecords` genérico) permite añadir más casos sin tocar el resto
del módulo, pero se decidió no intentar cubrir todos los módulos de
entrada.

Es de solo lectura por diseño: nunca corrige automáticamente. Detecta,
informa, y permite exportar el informe en JSON.

## Cola de escrituras pendientes para el patrón por-módulo (julio 2026)

Se detectó que `src/services/persistence.ts` ya tenía una cola de escrituras
pendientes bastante completa (`SQLITE_PENDING_WRITES_KEY`, con reintentos,
límite de 20 intentos, distinción entre conflicto OCC y fallo de
conectividad), pero **solo se alimentaba a sí misma**: `upsertPendingSqliteWrite`
únicamente se llamaba desde dentro del propio `flushPendingSqliteWrites`, en
el `catch` de un reintento fallido — nunca desde el punto donde una escritura
nueva fracasa por primera vez (`writeSharedStorageItemAsync`, que en su
`catch` solo devolvía `{ok:false}` sin encolar nada).

Además, esa cola está atada al camino genérico de `writeStorageItem`, que ya
no es el que usa la mayoría de módulos para guardar de verdad: el patrón
`<modulo>SqliteRepository.ts` (`saveXToSqlite`, documentado en
`ARCHITECTURE.md` §2) es el que protege hoy la mayoría de escrituras reales,
y no tenía ninguna cola. Resultado: si el SMB se caía a media sesión, el
guardado fallaba con un mensaje de error y no había forma de que el cambio
se sincronizara solo al reconectar — el usuario tenía que reintentar a mano
una vez volviera la red, y solo si no cerraba el formulario mientras tanto.

**Decisión**: no tocar la cola existente (sigue protegiendo su camino), sino
añadir una hermana genérica (`src/services/pendingRecordWrites.ts`) para el
patrón por-módulo, con la misma filosofía (localStorage, límite de
intentos, distinción conflicto/conectividad) pero indexada por
`(módulo, recordId)` en vez de por clave plana, porque el patrón por-módulo
guarda registros individuales, no un array serializado completo. Cada
repositorio se registra una vez (`registerPendingWriteReplayer`) y envuelve
su guardado real con `saveRecordWithPendingFallback`; el flush se engancha
en los mismos sitios que ya disparaban la cola antigua (arranque, polling,
reconexión, `beforeunload`), así que no hace falta un ciclo nuevo.

Migrados: Tareas, Licencias sin sueldo, Actas (registros y tipos), Criterios
RRLL, Plantilla (empleados), Vinculograma, Teletrabajo (solicitudes) y las 5
entidades de Ticket Restaurante (calendarios, personas, ausencias, config,
manutenciones) — es decir, todos los módulos con `<modulo>SqliteRepository.ts`
existentes en julio de 2026. Dos matices encontrados al migrar:

- **Plantilla usa `expectedValue`/`currentValue`** en vez de
  `expectedUpdatedAt`/`currentUpdatedAt` (compara el JSON completo, no un
  timestamp). La cola no necesita saberlo — trata ese campo como un token
  opaco — pero el repositorio adapta el nombre al envolver/desenvolver.
- **Presupuestos guarda un snapshot único de 4 colecciones**, no registros
  sueltos, así que a efectos de la cola se trata como un solo "registro" con
  id fijo (`'snapshot'`).

Los guardados por lote (`saveActaTypesToSqlite`, `saveCriteriosRrllToSqlite`,
`saveTeletrabajoSolicitudesToSqlite`, `saveTicketRestaurante*sToSqlite`,
`saveEmployeesToSqlite`) se dejaron fuera a propósito: son importaciones
puntuales (Excel, histórico), no ediciones del día a día — encolar un lote
entero de golpe complicaría la reconciliación al reconectar sin aportar
nada real.

## Extracción de piezas testables de sqlitePersistence.ts (julio 2026)

`electron/sqlitePersistence.ts` importa `electron` (`app`), así que nunca ha
podido correr bajo Vitest normal — de ahí el hueco de tests documentado en
`ARCHITECTURE.md` §10. Se extrajeron dos piezas puras que sí lo permiten,
mismo patrón que `sqliteConnection.ts`/`schemaMigrations.ts`:

- `electron/persistence/sqliteOperationGuard.ts`: clasificación de errores
  SQLite (corrupción, contención de lock, `SQLITE_BUSY`/`SQLITE_LOCKED`) de
  la que depende `safeDatabaseOperation`, la función que envuelve
  literalmente toda lectura/escritura de la base. 12 tests nuevos.
- `electron/persistence/directStoreUpdatedAt.ts`: el mapa de tablas que el
  polling multiusuario consulta cada ~12s para saber si otro usuario cambió
  algo. Al extraerlo se encontró y arregló un bug real (ver más abajo). 5
  tests nuevos, con SQLite real vía `applyMigrations`.

`safeDatabaseOperation` en sí (con estado: apertura/cierre de conexión,
lock de operación) se queda en el monolito — desacoplarlo del estado
module-scoped (`database`, `status`) sería una refactorización mucho mayor,
fuera de alcance de esta sesión.

## Bug real: Licencias sin sueldo y Especiales sin detección de cambios en vivo (julio 2026)

Al extraer `directStoreUpdatedAt.ts` se comprobó qué módulos tienen entrada
en el mapa de polling rápido (`DIRECT_STORE_UPDATED_AT_TABLES`) frente a
cuáles se detectan por el camino alternativo (escritura espejo al layer
genérico `persisted_records`, vía `writeStorageItem` en el store). Ninguno
de los dos cubría Licencias sin sueldo ni Especiales: sus stores no escriben
en `persisted_records` en absoluto, y no tenían entrada en el mapa rápido.
Resultado real: si un usuario creaba una solicitud o un destinatario, el
resto de usuarios con la página abierta no lo veían hasta recargar la app
entera — el polling de `externalDataSync.ts` (cada ~12s) nunca detectaba el
cambio porque no consultaba ninguna fuente que reflejara esos dos módulos.

**Arreglo**: añadir sus tablas reales (`licencia_sin_sueldo_records`,
`especiales_recipient_records`, ya indexadas por `updated_at` desde su
creación) al mapa rápido, en vez de añadir el mirror-write que sí usan otros
módulos (Presupuestos, Criterios RRLL, Ticket Restaurante, Vinculograma,
Actas-tipos). El mapa rápido es la opción más barata (una consulta
`MAX(updated_at)` indexada, sin escritura extra por guardado) y no depende
de que cada store recuerde replicar el mirror-write — que es precisamente
lo que falló aquí. `SessionManagement`/resto de stores registrados como
`syncableStore` no necesitaron ningún cambio: la detección y la recarga ya
estaban conectadas por id, solo faltaba el disparador.

## Bundle: ExcelJS cargado de forma estática en 2 sitios (julio 2026)

`exceljs` pesa 940 KB minificados (271 KB gzip), la dependencia más pesada
del proyecto con diferencia. En 6 de 8 puntos de uso ya se cargaba con
`await import('exceljs')`; `exportDireccion.ts` (usado por
`TeletrabajoPage.tsx`) y `CriteriosRrllPage.tsx` lo importaban de forma
estática, arrastrando el chunk completo en cuanto se abría el módulo,
aunque el usuario nunca exportara a Excel. `CriteriosRrllPage.tsx` ya es
`lazy()` a nivel de ruta, pero eso no evita que un import estático interno
fuerce sus propias dependencias pesadas junto con el resto del chunk.

Arreglo: en `exportDireccion.ts`, `import type ExcelJS` (los tipos
`ExcelJS.Cell`/`ExcelJS.Row`/`ExcelJS.Borders` se usan en firmas de función
a lo largo del fichero, así que no se podía quitar el import del todo) más
`await import('exceljs')` dentro de `exportTeletrabajoDireccionToExcel`. En
`CriteriosRrllPage.tsx`, que solo usaba el valor en un sitio, se quitó el
import y se cargó dentro de `downloadCriteriosRrllTemplate`. Verificado en
el build: el chunk `exceljs.min-*.js` pasa a referenciarse solo vía
`import(...)` dinámico en ambos ficheros, cero referencias estáticas ni en
`index.html`.

## CI y control de versiones (julio 2026)

Se detectó que el paso "Reparar package-lock con registry público",
presente en los 5 workflows, llevaba tiempo sin hacer nada: el
`package-lock.json` ya no tiene ninguna referencia al registro interno
(0 coincidencias comprobadas antes de tocar nada). Se eliminó de los 5
workflows en vez de dejarlo "por si acaso", porque un paso que no hace
nada pero parece hacer algo es peor que no tenerlo — genera falsa
confianza sobre qué protege realmente el pipeline.

Se añadió `.nvmrc` y se cambiaron los 5 workflows para leer la versión de
Node desde ahí (antes: `22.13.1` repetido a mano en cada archivo).

Se añadió `npm run typecheck` y se incorporó a `test:all`, pero **no** se
tocó la verificación de tipos ya existente en `tests-completos.yml`
(`node node_modules/typescript/bin/tsc` en vez de `npm run`): ese workflow
ya evita `npm run` a propósito por un problema de bin-links en Windows
documentado en otro workflow (`tests-ci.yml`), y cambiarlo habría
reintroducido ese riesgo sin necesidad.

## Migración a "SQLite autoritativo" — investigado, sin acción (julio 2026)

Se evaluó la propuesta de declarar explícitamente `persistenceMode: 'sqlite-authoritative'`,
`migrationVersion` y `legacyMigrationCompletedAt` por módulo, para que `localStorage`
dejara de poder "competir" con SQLite tras completarse la migración.

Antes de escribir código se comprobó el estado real:

1. **Los 12+ módulos ya tienen su propio `<módulo>SqliteRepository.ts`** (`actaSqliteRepository`,
   `criteriosRrllSqliteRepository`, `licenciaSinSueldoSqliteRepository`,
   `employeeSqliteRepository`, `presupuestosSqliteRepository`,
   `teletrabajoSqliteRepository`, `vinculogramaSqliteRepository`, y el resto ya
   revisados en sesiones anteriores). No queda ningún módulo pendiente de migrar.
2. **`load()` y `reloadFromStorage()` de cada store solo leen `localStorage`
   cuando `hasXSqliteRepository()` es `false`, o en el `catch` si la promesa
   de SQLite falla** (comprobado en Sorteos, extensible al resto por ser el
   mismo patrón documentado en `ARCHITECTURE.md` §2 "Fallback a
   localStorage"). Cuando SQLite está disponible y responde, `localStorage`
   nunca se toca — ni en la carga inicial ni en el polling multiusuario.

Conclusión: el riesgo que motivaba la propuesta (datos de negocio antiguos en
`localStorage` "ganando" a SQLite) no existe en el código actual. Añadir los
campos `persistenceMode`/`migrationVersion` habría formalizado por escrito
algo que el comportamiento ya garantiza, sin cerrar ningún hueco real — y sí
con el riesgo de tocar los ~12 stores para un cambio puramente declarativo.
Se decide no implementarlo. Si en el futuro se detecta un caso concreto
donde `localStorage` sobrescribe SQLite estando este disponible, es un bug
puntual a corregir en ese módulo, no una señal de que falta la
infraestructura general.

Estas ya estaban documentadas en el historial de sesiones antes de este
archivo; se listan aquí para que quede todo en un solo sitio:

- `actasPage.helpers.tsx` se dejó sin tocar en el refactor de `ActasPage.tsx`
  porque contiene cuatro estados de flujo semánticamente distintos que no
  se prestan a una extracción mecánica sin perder claridad.
- El badge de aviso en `TeletrabajoEditorHeader` se dejó igual: es un
  estilo de urgencia intencional, no un descuido de UI pendiente de
  homogeneizar.
- Ticket Restaurante no se usará hasta septiembre de 2026 (información del
  usuario, no verificable desde el código) — motivo original por el que su
  hardening multiusuario se dejó para el final; se completó de todos modos
  antes de esa fecha porque no había motivo técnico para esperar.
