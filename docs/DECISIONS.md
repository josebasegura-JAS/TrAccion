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

> **DECISIÓN SUPERADA.** Se conserva como histórico de la etapa con fallback offline. La infraestructura `pendingRecordWrites` fue eliminada en la limpieza técnica posterior; el guardado vigente está centralizado en `strictSqliteWrites.ts` y no encola ni reproduce escrituras offline.

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

## Bug real: seis módulos sin detección de cambios en vivo (julio 2026)

Al extraer `directStoreUpdatedAt.ts` se comprobó qué módulos tienen entrada
en el mapa de polling rápido (`DIRECT_STORE_UPDATED_AT_TABLES`) frente a
cuáles se detectan por el camino alternativo (escritura espejo al layer
genérico `persisted_records`, vía `writeStorageItem` en el store). Primera
pasada: Licencias sin sueldo y Especiales no cubiertos por ninguno de los
dos caminos — sus stores no escriben en `persisted_records` en absoluto.

Al auditar el resto de módulos que sí parecían tener el mirror-write (por
grep de presencia, no de alcanzabilidad) se encontró un problema más
extendido: en **Criterios RRLL, Ticket Restaurante (las 5 entidades),
Vinculograma, tipos de Acta y Configuración**, la llamada a
`writeStorageItem`/`writeJsonStorageAsync` existe en el fichero, pero solo
dentro de la rama `else` de fallback (cuando `hasXSqliteRepository()` es
`false`). El camino real —`xWithConcurrencyCheck` guardando con éxito contra
SQLite, que es lo que pasa siempre en un despliegue normal— hace
`set(...)` directamente o, como mucho, un `window.localStorage.setItem`
puramente local (sin tocar SQLite), y vuelve (`return`) antes de llegar al
mirror-write. Ese código lleva ahí desde que se migró cada módulo al patrón
`WithConcurrencyCheck`, pero en la práctica nunca se ejecutaba porque el
repositorio SQLite directo casi siempre está disponible.

Confirmado por contraste que sí funciona correctamente en **Presupuestos**
(`commitPresupuestosState` llama a `persist(nextState)` incondicionalmente,
salvo que el guardado SQLite falle explícitamente) y en **Teletrabajo**
puestos/grupos de cobertura (`persistPuestoTeletrabajoRecord`/
`persistGrupoCoberturaRecord` escriben el mirror antes incluso de intentar
el guardado SQLite). La diferencia entre "funciona" y "no funciona" no es
visible con un grep superficial — hay que seguir el flujo de control hasta
el `return` de cada acción.

**Arreglo**: en vez de parchear cada punto de guardado para que el
mirror-write se ejecute también en el camino de éxito (más superficie,
más riesgo de que se repita el mismo despiste en el futuro), se añadieron
las tablas reales de los 6 módulos afectados al mapa rápido
(`DIRECT_STORE_UPDATED_AT_TABLES`), extendiendo su tipo para aceptar varias
tablas por `storeId` (`string | string[]`) donde hace falta:

- Ticket Restaurante: 5 tablas bajo un único storeId (`ticket-restaurante`,
  ya registrado así en `syncableStoreRegistrations.ts`).
- Actas: `acta_type_records` se añadió junto a `acta_records` bajo el mismo
  storeId `actas` — su `reloadFromStorage` ya recarga ambos a la vez
  (`loadActasStateFromSqliteOrStorage`), no hacía falta un storeId nuevo.

No se tocó ningún store ni componente de UI: el fix entero vive en
`electron/persistence/directStoreUpdatedAt.ts`. Test de regresión con
SQLite real cubriendo los 6 módulos y el caso multi-tabla (que el valor más
reciente entre varias tablas del mismo storeId gane, no solo el de la
primera).

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

> **DECISIÓN SUPERADA.** Esta sección conserva el razonamiento histórico de julio de 2026. La arquitectura vigente desde septiembre de 2026 usa SQLite compartida como fuente autoritativa y no permite trabajo funcional offline; véanse las decisiones de consolidación posteriores y `ARCHITECTURE.md`.

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

## Consolidación funcional y operativa (agosto-septiembre 2026)

Esta sección registra decisiones tomadas durante la fase de consolidación de TrAcción 1.2. No sustituye a `FUNCIONAMIENTO.md`: allí se describe qué debe hacer actualmente la aplicación; aquí se conserva el motivo de las decisiones que sería fácil reinterpretar o revertir en un refactor futuro.

### SQLite compartida: no permitir trabajo de negocio en local si la BBDD de red no está disponible

Se decidió que la base SQLite compartida es la fuente autoritativa del trabajo multiusuario. Si la BBDD configurada no está disponible, la aplicación debe avisar y bloquear las operaciones de negocio que podrían crear información únicamente local. La razón es operativa: un dato creado en fallback local no tiene una reconciliación suficientemente segura como para asumir que acabará incorporándose a la BBDD común sin intervención.

Esto no elimina caches o mecanismos locales usados con fines técnicos, pero sí evita presentarlos al usuario como una sesión normal de trabajo. Un futuro cambio no debe convertir silenciosamente una pérdida de conectividad en «modo local» editable.

### Ajustes compartidos y rutas de trabajo

Las rutas que afectan al funcionamiento común —BBDD, Excel automáticos, plantillas Word, backups y carpetas funcionales parametrizadas— se tratan como configuración compartida cuando su naturaleza lo requiere. La decisión evita que los tres usuarios tengan comportamientos distintos ante el mismo proceso por haber configurado cada PC de forma independiente.

Las opciones de mantenimiento de SQLite, locks, backups y restauración se mantienen concentradas en Ajustes para no dispersar operaciones potencialmente críticas por módulos funcionales.

### Versionado visible y versionado técnico

Se separó deliberadamente la identidad que ve el usuario de la revisión técnica:

- Producto visible: **TrAcción 1.2**.
- Ejecutable estable: **`Traccion 1.2.exe`**.
- Revisión técnica: **`1.2.xxx`**, utilizada para builds, manifest y diagnóstico.

No se quiere renombrar el ejecutable en cada revisión. La versión de tres componentes sirve para saber qué build está instalado sin convertir el nombre del programa en un dato cambiante para los usuarios.

En textos visibles se usa **TrAcción** con tilde siempre que no afecte a identificadores, rutas, nombres técnicos o compatibilidad.

### Actualizador mediante `.piz` y `version.json`

La red de despliegue no permite distribuir el `.exe` directamente, por lo que se decidió usar un contenedor con extensión **`.piz`**. El pipeline genera el EXE portable, valida que exista y tenga un tamaño razonable, lo copia como `Traccion 1.2.piz` y genera `version.json` con la revisión técnica y hash SHA-256.

Una vez actualizados todos los puestos al nuevo formato se eliminó el puente de compatibilidad con nombres legacy. Los artifacts normales/Lite deben publicar únicamente `Traccion 1.2.piz` y `version.json`; el EXE sigue generándose internamente porque es el contenido real del paquete y debe validarse antes de publicar.

No conservar el ejecutable anterior como copia visible fue una decisión de UX y mantenimiento: el actualizador debe sustituir la instalación utilizada, no dejar varias revisiones aparentemente válidas en el escritorio.

### Build normal y Lite

El build Lite existe para reducir tiempos de entrega durante iteraciones frecuentes. No define un producto funcional distinto: debe producir el mismo formato de actualización y manifest que el build normal. Cualquier divergencia futura entre ambos pipelines debe justificarse expresamente.

### Notificaciones de nuevas tareas

La notificación de una tarea recién asignada debe llamar la atención una vez sin convertirse en un aviso permanente. Se adoptó una campana en el header con contador/estado y acceso a las nuevas tareas, complementada por el aviso inicial cuando procede.

La decisión evita tanto el extremo de no avisar al usuario como el de mantener alertas intrusivas después de que la novedad ya haya sido vista. El refresco de Tareas debe conservar la posición de scroll para no penalizar el trabajo sobre listas largas.

### Coordinación: tres contextos, un patrón común

Dirección, Otras áreas y Sindicatos comparten el concepto de reunión y seguimiento, pero no se forzó un modelo idéntico cuando la casuística no lo era. Se decidió homogeneizar las operaciones comunes —fecha, puntos, tareas, resultados, histórico y exportación— permitiendo particularidades por tipo.

Un punto de reunión no tiene por qué proceder de una tarea existente. Puede ser manual y, cuando tenga sentido, puede originar una tarea nueva. El vínculo tarea ↔ coordinación debe conservar trazabilidad sin obligar a inventar una tarea para poder registrar un asunto.

### Huelgas: Área y Zona son conceptos distintos

Se mantuvo una jerarquía operativa en la que el puesto/residencia ayuda a determinar el **Área**, y el Área se relaciona con una **Zona** usada para responsables, agrupación y comunicaciones. No deben fusionarse ambos conceptos aunque en algunos casos coincidan.

Las asignaciones aprendidas/editadas deben persistir para reducir correcciones en convocatorias posteriores. La generación de comunicaciones se hace por zona y el Excel de apoyo agrupa la información necesaria para la gestión, sin convertir la exportación en la fuente de verdad.

### Ayuda Escolar: el correo es entrada, la persona es la referencia

El `.msg` de Outlook es un mecanismo de entrada documental, no la identidad definitiva del expediente. La persona se contrasta con Plantilla y existe la opción «envía en nombre de otro» precisamente para los casos en los que remitente y beneficiario no coinciden.

En ese caso no debe aprenderse/guardarse el email como si perteneciera a la persona seleccionada. Los adjuntos se archivan en la ruta parametrizada del año y el sistema evita colisiones de nombre mediante sufijos en vez de sobrescribir silenciosamente documentos existentes.

### Ticket Restaurante: separar cálculo, decisión y realidad

Se decidió mantener tres capas explícitamente distintas:

1. **Pedido calculado**: resultado de calendario, ausencias, manutenciones, deuda y demás reglas.
2. **Pedido ajustado**: corrección manual deliberada antes de cursar el pedido, con motivo.
3. **Pedido realizado**: fotografía inmutable de lo que realmente se solicitó.

Esta separación es estructural. Un refactor no debe hacer que modificar posteriormente una ausencia reescriba el pedido que ya fue cursado, ni confundir un ajuste previo con un movimiento posterior.

### Ticket Restaurante: movimientos posteriores no son deuda

Después del pedido inicial pueden existir pedidos adicionales o correcciones. Se registran como movimientos positivos o negativos con fecha, persona cuando corresponda y motivo.

Un movimiento de pedido **no genera ni elimina automáticamente deuda**. Describe qué se pidió realmente al proveedor. La deuda pertenece a otra capa funcional y solo debe cambiar por las reglas que la gobiernan.

Se decidió conservar también precio e importe en la fotografía/movimiento para poder reconstruir el coste histórico aunque cambie posteriormente el precio configurado.

### Ticket Restaurante: exclusión mensual por baja

La exclusión se modeló por persona y mes, no como desactivación global. Una persona puede no formar parte del pedido de un mes y reincorporarse después.

Durante una exclusión:

- el pedido del mes es 0;
- la deuda real anterior no desaparece;
- las ausencias del mes excluido no deben crear deuda ficticia por tickets que nunca se entregaron;
- las cuotas manuales que no puedan aplicarse deben desplazarse al siguiente mes disponible sin apilar indebidamente cuotas.

Si durante una baja se cargaron realmente tickets, la cantidad recuperable es la efectivamente entregada. Por ejemplo, si se cargaron 4 tickets durante un mes completo de baja, se recuperan 4; no se transforma automáticamente cada día de ENF/ACC en deuda.

### Ticket Restaurante: ENF/ACC y sugerencias, nunca exclusión automática

ENF y ACC pueden indicar una baja activa y generar una **sugerencia** de exclusión. Se decidió no excluir automáticamente porque los datos importados pueden ser incompletos o requerir interpretación operativa.

Del mismo modo, cuando la importación permite detectar el fin de ENF/ACC, TrAcción puede proponer una posible reincorporación. La sugerencia de tickets debe usar el mismo motor mensual real, simulando únicamente que la persona deja de estar excluida para ese mes. La simulación no modifica previamente la exclusión almacenada.

### Ticket Restaurante: Tipos de ausencia como fuente de verdad

La propiedad «descuenta/no descuenta» pertenece al **tipo de ausencia**, no debería decidirse de nuevo para cada fila importada. Por ello se creó un maestro de Tipos de ausencia que actúa como regla general de cálculo.

**TEX se configura como ausencia que no descuenta tickets.** La regla vigente debe aplicarse también al recalcular históricos; de lo contrario, una TEX importada meses antes con un valor antiguo podría seguir generando deuda aunque el maestro actual diga lo contrario.

La edición individual se conserva para excepciones concretas, pero no debe convertir la importación de cada Excel en una repetición manual de reglas conocidas.

### Ticket Restaurante: mes operativo por defecto

Se decidió que **Cómputo/Pedido y Cotización abran por defecto el mes siguiente**, porque el trabajo habitual a final de mes consiste en preparar el pedido del siguiente. **Ausencias permanece en el mes actual**, ya que son precisamente esas incidencias las que alimentan el cálculo posterior.

El cambio de diciembre a enero debe resolver también el año automáticamente.

### Ticket Restaurante: históricos coherentes con la vigencia de personas

Los cálculos históricos deben considerar las personas que existían/vigían en el mes consultado, no simplemente todas las personas activas hoy. La misma regla debe aplicarse en Cómputo mensual, Cotización y Balance anual para evitar resultados distintos según la pantalla utilizada.

### Ticket Restaurante: terminología de deuda

Se adoptó **«Deuda arrastrada»** para la deuda procedente de meses anteriores. El término «Deuda entrante» resultaba ambiguo porque durante el cálculo pueden incorporarse después cuotas manuales u otros conceptos. La nomenclatura visible debe describir el origen del dato, no sugerir que representa toda la deuda aplicada finalmente ese mes.

### Ayuda integrada, funcionamiento y decisiones son capas distintas

Tras la consolidación de 1.2 se decidió mantener tres niveles documentales:

- **Ayuda integrada**: explica al usuario cómo realizar una operación.
- **`FUNCIONAMIENTO.md`**: contrato funcional de lo que TrAcción debe hacer hoy.
- **`DECISIONS.md`**: conserva el motivo de decisiones no obvias y evita reabrirlas sin contexto.

`ARCHITECTURE.md` queda reservado para patrones técnicos y estructura. Cuando un cambio funcional altere una regla estable, debe revisarse si afecta a estas capas además de al código y a los tests.

### Documentación histórica no equivale a especificación vigente

Auditorías y documentos de migraciones representan una fotografía de una fecha concreta. Se decidió conservarlos por trazabilidad, pero no deben usarse como definición automática del estado actual si contradicen `FUNCIONAMIENTO.md`, la arquitectura vigente o el código probado.
